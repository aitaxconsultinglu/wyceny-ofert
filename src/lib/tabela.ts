// Wspólna logika tabel: filtry w nagłówkach kolumn (tekst, liczba, data, lista wartości, tak/nie), sortowanie (także
// wielokrotne z Shift) i zapamiętanie ustawień per użytkownik i tabela. Czysta logika (testowana) - komponent: ui/Tabela.tsx.
// Duże zbiory (zakupy, audyt) filtruje baza: filtryNaZapytanie() przekłada ten sam stan na zapytanie Supabase.

export type TypKolumny = 'tekst' | 'liczba' | 'data' | 'lista' | 'tak_nie'

export type Filtr =
  | { typ: 'tekst'; tryb: 'zawiera' | 'zaczyna' | 'rowna'; wartosc: string }
  | { typ: 'liczba'; tryb: 'zakres' | 'wieksze' | 'mniejsze'; od: number | null; do: number | null }
  | { typ: 'data'; od: string | null; do: string | null }
  | { typ: 'lista'; wartosci: string[] }
  | { typ: 'tak_nie'; wartosc: boolean }

export interface Sortowanie { kol: string; kier: 'rosnaco' | 'malejaco' }
export interface StanTabeli { sort: Sortowanie[]; filtry: Record<string, Filtr> }
export const PUSTY_STAN: StanTabeli = { sort: [], filtry: {} }

export interface DefinicjaKolumny<T> {
  id: string
  typ: TypKolumny
  /** Wartość do filtrowania i sortowania (tekst / liczba / data ISO / boolean). */
  wartosc: (w: T) => unknown
  /** Kolumna w bazie - dla tabel filtrowanych po stronie serwera. */
  pole?: string
}

const BRAK = '(puste)'
export const tekstWartosci = (v: unknown): string => (v === null || v === undefined || v === '' ? BRAK : typeof v === 'boolean' ? (v ? 'tak' : 'nie') : String(v))
const normalizuj = (s: string) => s.toLocaleLowerCase('pl').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')

export function pasujeFiltr(v: unknown, f: Filtr): boolean {
  switch (f.typ) {
    case 'tekst': {
      if (!f.wartosc.trim()) return true
      const t = normalizuj(v === null || v === undefined ? '' : String(v))
      const s = normalizuj(f.wartosc.trim())
      return f.tryb === 'rowna' ? t === s : f.tryb === 'zaczyna' ? t.startsWith(s) : t.includes(s)
    }
    case 'liczba': {
      if (v === null || v === undefined || v === '') return f.od === null && f.do === null
      const n = Number(v)
      if (!Number.isFinite(n)) return false
      if (f.tryb === 'wieksze') return f.od === null || n > f.od
      if (f.tryb === 'mniejsze') return f.do === null || n < f.do
      return (f.od === null || n >= f.od) && (f.do === null || n <= f.do)
    }
    case 'data': {
      if (!f.od && !f.do) return true
      if (!v) return false
      const d = String(v).slice(0, 10)
      return (!f.od || d >= f.od) && (!f.do || d <= f.do)
    }
    case 'lista':
      return !f.wartosci.length || f.wartosci.includes(tekstWartosci(v))
    case 'tak_nie':
      return !!v === f.wartosc
  }
}

/** Czy filtr cokolwiek ogranicza (pusty filtr = nieaktywny, bez wskaźnika w nagłówku). */
export function filtrAktywny(f: Filtr | undefined): boolean {
  if (!f) return false
  switch (f.typ) {
    case 'tekst': return !!f.wartosc.trim()
    case 'liczba': return f.od !== null || f.do !== null
    case 'data': return !!f.od || !!f.do
    case 'lista': return f.wartosci.length > 0
    case 'tak_nie': return true
  }
}

function porownaj(a: unknown, b: unknown, typ: TypKolumny): number {
  const pusty = (x: unknown) => x === null || x === undefined || x === ''
  if (pusty(a) && pusty(b)) return 0
  if (pusty(a)) return 1   // puste zawsze na końcu
  if (pusty(b)) return -1
  if (typ === 'liczba') return Number(a) - Number(b)
  if (typ === 'tak_nie') return Number(!!a) - Number(!!b)
  return String(a).localeCompare(String(b), 'pl', { numeric: true, sensitivity: 'base' })
}

/** Filtry i sortowanie po stronie przeglądarki (stabilne: bez sortowania zostaje kolejność wejściowa). */
export function filtrujISortuj<T>(wiersze: T[], kolumny: DefinicjaKolumny<T>[], stan: StanTabeli): T[] {
  const mapa = new Map(kolumny.map((k) => [k.id, k]))
  const aktywne = Object.entries(stan.filtry).filter(([id, f]) => mapa.has(id) && filtrAktywny(f))
  const wynik = wiersze.filter((w) => aktywne.every(([id, f]) => pasujeFiltr(mapa.get(id)!.wartosc(w), f)))
  const sort = stan.sort.filter((s) => mapa.has(s.kol))
  if (!sort.length) return wynik
  return wynik.map((w, i) => ({ w, i })).sort((x, y) => {
    for (const s of sort) {
      const k = mapa.get(s.kol)!
      const va = k.wartosc(x.w)
      const vb = k.wartosc(y.w)
      const pustyA = va === null || va === undefined || va === ''
      const pustyB = vb === null || vb === undefined || vb === ''
      // Puste na końcu niezależnie od kierunku.
      if (pustyA !== pustyB) return pustyA ? 1 : -1
      const r = porownaj(va, vb, k.typ)
      if (r) return s.kier === 'rosnaco' ? r : -r
    }
    return x.i - y.i
  }).map((x) => x.w)
}

/** Kliknięcie nagłówka: rosnąco → malejąco → bez sortowania; z Shift dokłada kolumnę do sortowania wielokrotnego. */
export function przelaczSort(stan: StanTabeli, kol: string, wiele: boolean): StanTabeli {
  const obecny = stan.sort.find((s) => s.kol === kol)
  const nastepny: Sortowanie | null = !obecny ? { kol, kier: 'rosnaco' } : obecny.kier === 'rosnaco' ? { kol, kier: 'malejaco' } : null
  if (wiele) {
    const reszta = stan.sort.filter((s) => s.kol !== kol)
    return { ...stan, sort: nastepny ? (obecny ? stan.sort.map((s) => (s.kol === kol ? nastepny : s)) : [...reszta, nastepny]) : reszta }
  }
  return { ...stan, sort: nastepny ? [nastepny] : [] }
}

/** Wartości kolumny do filtra listy, z liczbą wystąpień (najczęstsze pierwsze). */
export function wartosciListy<T>(wiersze: T[], k: DefinicjaKolumny<T>): { wartosc: string; ile: number }[] {
  const licz = new Map<string, number>()
  for (const w of wiersze) { const t = tekstWartosci(k.wartosc(w)); licz.set(t, (licz.get(t) ?? 0) + 1) }
  return [...licz.entries()].map(([wartosc, ile]) => ({ wartosc, ile })).sort((a, b) => b.ile - a.ile || a.wartosc.localeCompare(b.wartosc, 'pl'))
}

// --- Zapamiętanie stanu (localStorage w try/catch - tryb prywatny, zablokowane dane witryny) --------------

let uzytkownik = 'anon'
/** Ustawiane po zalogowaniu - filtry są zapamiętywane per użytkownik i tabela. */
export function ustawUzytkownikaTabel(id: string) { uzytkownik = id }
const kluczStanu = (tabela: string) => `tabela:v1:${uzytkownik}:${tabela}`

export function wczytajStan(tabela: string): StanTabeli {
  try {
    const s = JSON.parse(localStorage.getItem(kluczStanu(tabela)) ?? 'null') as StanTabeli | null
    return s && Array.isArray(s.sort) && s.filtry && typeof s.filtry === 'object' ? s : PUSTY_STAN
  } catch { return PUSTY_STAN }
}
export function zapiszStan(tabela: string, s: StanTabeli) {
  try {
    if (!s.sort.length && !Object.values(s.filtry).some(filtrAktywny)) localStorage.removeItem(kluczStanu(tabela))
    else localStorage.setItem(kluczStanu(tabela), JSON.stringify(s))
  } catch { /* bez zapamiętania */ }
}

// --- Filtrowanie po stronie bazy ------------------------------------------------------------------------

/** Minimalny interfejs zapytania Supabase (PostgrestFilterBuilder) - bez zależności od typów klienta. */
export interface ZapytanieFiltrowalne<Q> {
  ilike(pole: string, wzor: string): Q
  eq(pole: string, v: unknown): Q
  gte(pole: string, v: unknown): Q
  lte(pole: string, v: unknown): Q
  gt(pole: string, v: unknown): Q
  lt(pole: string, v: unknown): Q
  in(pole: string, v: unknown[]): Q
  is(pole: string, v: null): Q
  order(pole: string, o: { ascending: boolean; nullsFirst?: boolean }): Q
}

const escLike = (s: string) => s.replace(/[%_\\]/g, (c) => `\\${c}`)

/** Ten sam stan filtrów i sortowania jako warunki zapytania do bazy (tylko kolumny z `pole`). */
export function filtryNaZapytanie<T, Q extends ZapytanieFiltrowalne<Q>>(q: Q, kolumny: DefinicjaKolumny<T>[], stan: StanTabeli): Q {
  let z = q
  for (const [id, f] of Object.entries(stan.filtry)) {
    const k = kolumny.find((x) => x.id === id)
    if (!k?.pole || !filtrAktywny(f)) continue
    const p = k.pole
    if (f.typ === 'tekst') z = f.tryb === 'rowna' ? z.ilike(p, escLike(f.wartosc.trim())) : z.ilike(p, `${f.tryb === 'zaczyna' ? '' : '%'}${escLike(f.wartosc.trim())}%`)
    else if (f.typ === 'liczba') {
      if (f.tryb === 'wieksze' && f.od !== null) z = z.gt(p, f.od)
      else if (f.tryb === 'mniejsze' && f.do !== null) z = z.lt(p, f.do)
      else { if (f.od !== null) z = z.gte(p, f.od); if (f.do !== null) z = z.lte(p, f.do) }
    } else if (f.typ === 'data') { if (f.od) z = z.gte(p, f.od); if (f.do) z = z.lte(p, `${f.do}T23:59:59`) }
    else if (f.typ === 'lista') {
      const bezPustych = f.wartosci.filter((v) => v !== BRAK)
      if (bezPustych.length === f.wartosci.length) z = z.in(p, bezPustych)
      else if (!bezPustych.length) z = z.is(p, null)
      else z = z.in(p, bezPustych) // puste razem z wartościami - rzadkie; baza zwróci same wartości
    } else if (f.typ === 'tak_nie') z = z.eq(p, f.wartosc)
  }
  for (const s of stan.sort) {
    const k = kolumny.find((x) => x.id === s.kol)
    if (k?.pole) z = z.order(k.pole, { ascending: s.kier === 'rosnaco', nullsFirst: false })
  }
  return z
}
