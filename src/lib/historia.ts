// Cofnij / Ponów bez limitu kroków - jedna warstwa dla całej aplikacji.
//  - Edytory z przyciskiem "Zapisz" (wycena, odczyt rysunku, karta analizy): krok to różnica stanu edytora (tylko zmienione
//    ścieżki - kompresja zamiast pełnych kopii); cofnięcie przywraca stan edytora, do bazy trafia przy Zapisz.
//  - Ekrany zapisujące od razu (cennik, klasyfikacja zakupów, typy dokumentów, kosz): krok to komenda bazodanowa z operacją
//    odwrotną; cofnięcie zapisuje do bazy (nowa zmiana w audycie) po sprawdzeniu, czy nikt inny nie zmienił rekordu.
// Stosy per zakres (np. "wycena:<id>", "cennik") w pamięci i w IndexedDB - przetrwają odświeżenie karty.
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { komunikatPL } from './config'

// --- Różnice stanów ---------------------------------------------------------------------------------------

export type Sciezka = (string | number)[]
export interface Zmiana { s: Sciezka; przed: unknown; po: unknown }

/** Pola pomijane w różnicach (klucze techniczne odtwarzane przy każdym wczytaniu). */
const POMIJANE = new Set(['klucz'])
const obiekt = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Różnica dwóch stanów jako lista zmienionych ścieżek (tablice o różnej długości - w całości). */
export function roznica(a: unknown, b: unknown, s: Sciezka = []): Zmiana[] {
  if (a === b) return []
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) return a.flatMap((x, i) => roznica(x, b[i], [...s, i]))
  if (obiekt(a) && obiekt(b)) {
    const klucze = new Set([...Object.keys(a), ...Object.keys(b)])
    return [...klucze].filter((k) => !POMIJANE.has(k)).flatMap((k) => roznica(a[k], b[k], [...s, k]))
  }
  if (Number.isNaN(a) && Number.isNaN(b)) return []
  return [{ s, przed: a, po: b }]
}

function ustawSciezke<T>(stan: T, s: Sciezka, v: unknown): T {
  if (!s.length) return v as T
  const [g, ...reszta] = s
  if (Array.isArray(stan)) { const kopia = [...stan]; kopia[g as number] = ustawSciezke(kopia[g as number], reszta, v); return kopia as T }
  const o = (stan ?? {}) as Record<string, unknown>
  const nowa = { ...o, [g]: ustawSciezke(o[g as string], reszta, v) }
  if (v === undefined && !reszta.length) delete (nowa as Record<string, unknown>)[g as string]
  return nowa as T
}

/** Zastosowanie zmian: kierunek "wstecz" przywraca wartości sprzed, "naprzod" - wartości po zmianie. */
export function zastosuj<T>(stan: T, zmiany: Zmiana[], kierunek: 'wstecz' | 'naprzod'): T {
  const lista = kierunek === 'wstecz' ? [...zmiany].reverse() : zmiany
  return lista.reduce((st, z) => ustawSciezke(st, z.s, kierunek === 'wstecz' ? z.przed : z.po), stan)
}

// --- Stos -------------------------------------------------------------------------------------------------

export interface KomendaBazy {
  tabela: string
  /** Kolumna klucza (zwykle id). */
  kolumna: string
  id: string | number
  /** Rekord przed zmianą (null = rekord dodany) i po zmianie (null = usunięty) - tylko zmieniane pola + zmodyfikowano. */
  przed: Record<string, unknown> | null
  po: Record<string, unknown> | null
}

/** Przeniesienie do kosza: cofnięcie przywraca z kosza, ponowienie przenosi ponownie (nowy wpis kosza). */
export interface KomendaKosza { rodzaj: string; id: string; koszId: string }

export interface Krok {
  opis: string
  czas: number
  zmiany?: Zmiana[]
  komendy?: KomendaBazy[]
  kosz?: KomendaKosza[]
}

export interface Stos { kroki: Krok[]; wskaznik: number }   // wskaznik = liczba wykonanych (nie cofniętych) kroków

/** Nowy krok: ucina gałąź ponowień (redo) i dokłada krok - bez limitu głębokości. */
export function dodajKrok(st: Stos, k: Krok): Stos {
  return { kroki: [...st.kroki.slice(0, st.wskaznik), k], wskaznik: st.wskaznik + 1 }
}
/** Łączenie szybkich zmian tego samego pola (pisanie) w jeden krok. */
export function polaczZOstatnim(st: Stos, k: Krok, oknoMs = 800): Stos {
  const ost = st.kroki[st.wskaznik - 1]
  const tePolePisane = ost?.zmiany && k.zmiany && st.wskaznik === st.kroki.length && k.czas - ost.czas < oknoMs
    && ost.zmiany.length === 1 && k.zmiany.length === 1 && JSON.stringify(ost.zmiany[0].s) === JSON.stringify(k.zmiany[0].s)
  if (!tePolePisane) return dodajKrok(st, k)
  const polaczony: Krok = { ...ost, czas: k.czas, zmiany: [{ s: ost.zmiany![0].s, przed: ost.zmiany![0].przed, po: k.zmiany![0].po }] }
  return { kroki: [...st.kroki.slice(0, st.wskaznik - 1), polaczony], wskaznik: st.wskaznik }
}

// --- Magazyn stosów (pamięć + IndexedDB) i aktywny zakres -------------------------------------------------

const BAZA = 'wyceny-historia'
const stosy = new Map<string, Stos>()
interface Zarejestrowany { zakres: string; zastosujStan?: (zmiany: Zmiana[], kierunek: 'wstecz' | 'naprzod') => void }
/** Zakresy zamontowanych ekranów - aktywny jest ostatnio zamontowany (np. odczyt rysunku wewnątrz karty zapytania). */
const zarejestrowane: Zarejestrowany[] = []
let aktywny: Zarejestrowany | null = null
const ustalAktywny = () => { aktywny = zarejestrowane.at(-1) ?? null }
const sluchacze = new Set<() => void>()
/** Ekrany, które po cofnięciu kroku bazodanowego muszą wczytać dane od nowa. */
const odswiezacze = new Set<() => void>()
export function useOdswiezPoHistorii(f: () => void) {
  const ref = useRef(f)
  ref.current = f
  useEffect(() => { const g = () => ref.current(); odswiezacze.add(g); return () => { odswiezacze.delete(g) } }, [])
}
let wersja = 0
const powiadom = () => { wersja++; sluchacze.forEach((f) => f()) }

function bazaIdb(): Promise<IDBDatabase | null> {
  return new Promise((ok) => {
    try {
      const r = indexedDB.open(BAZA, 1)
      r.onupgradeneeded = () => r.result.createObjectStore('stosy')
      r.onsuccess = () => ok(r.result)
      r.onerror = () => ok(null)
    } catch { ok(null) }
  })
}
async function zapiszIdb(zakres: string, st: Stos) {
  const db = await bazaIdb()
  if (!db) return
  try { db.transaction('stosy', 'readwrite').objectStore('stosy').put(st, zakres) } catch { /* bez trwałej historii */ }
}
async function wczytajIdb(zakres: string): Promise<Stos | null> {
  const db = await bazaIdb()
  if (!db) return null
  return new Promise((ok) => {
    try {
      const r = db.transaction('stosy', 'readonly').objectStore('stosy').get(zakres)
      r.onsuccess = () => ok((r.result as Stos | undefined) ?? null)
      r.onerror = () => ok(null)
    } catch { ok(null) }
  })
}

export const stosZakresu = (zakres: string): Stos => stosy.get(zakres) ?? { kroki: [], wskaznik: 0 }
function ustawStos(zakres: string, st: Stos) { stosy.set(zakres, st); void zapiszIdb(zakres, st); powiadom() }

/** Zapis kroku do stosu zakresu (wołają hooki edytorów i komendy bazodanowe). */
export function zapiszKrok(zakres: string, k: Krok, laczPisanie = false) {
  const st = stosZakresu(zakres)
  ustawStos(zakres, laczPisanie ? polaczZOstatnim(st, k) : dodajKrok(st, k))
}

export function wyczyscHistorie(zakres: string) { ustawStos(zakres, { kroki: [], wskaznik: 0 }) }

// --- Komendy bazodanowe -----------------------------------------------------------------------------------

/** Sprawdza, czy rekord w bazie wygląda tak, jak po naszym kroku; inaczej pyta, czy nadpisać zmianę innej osoby. */
async function sprawdzKonflikt(k: KomendaBazy, oczekiwany: Record<string, unknown> | null): Promise<boolean> {
  const { data } = await supabase.from(k.tabela).select('*').eq(k.kolumna, k.id).maybeSingle()
  const biezacy = data as Record<string, unknown> | null
  if (!oczekiwany) return !biezacy || window.confirm('Rekord, który ma zostać przywrócony, już istnieje (ktoś go dodał). Nadpisać?')
  if (!biezacy) return window.confirm('Ktoś inny usunął ten rekord w międzyczasie. Odtworzyć go?')
  const zmienione = Object.keys(oczekiwany).filter((p) => p !== 'zmodyfikowano' && JSON.stringify(biezacy[p]) !== JSON.stringify(oczekiwany[p]))
  return !zmienione.length || window.confirm(`Ktoś inny zmienił ten rekord po Twojej zmianie (${zmienione.join(', ')}). Nadpisać jego zmianę?`)
}

async function wykonajKomende(k: KomendaBazy, kierunek: 'wstecz' | 'naprzod') {
  const cel = kierunek === 'wstecz' ? k.przed : k.po
  const obecny = kierunek === 'wstecz' ? k.po : k.przed
  if (!(await sprawdzKonflikt(k, obecny))) throw new Error('Anulowano.')
  const bezZnacznika = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).filter(([p]) => p !== 'zmodyfikowano'))
  const { error } = !cel
    ? await supabase.from(k.tabela).delete().eq(k.kolumna, k.id)
    : !obecny
      ? await supabase.from(k.tabela).insert({ ...bezZnacznika(cel), [k.kolumna]: k.id })
      : await supabase.from(k.tabela).update(bezZnacznika(cel)).eq(k.kolumna, k.id)
  if (error) throw new Error(komunikatPL(error.message))
}

/**
 * Zmiana rekordu z zapisem kroku: odczytuje bieżące wartości zmienianych pól, zapisuje i odkłada krok do cofnięcia.
 * Dla wielu rekordów naraz (zmiana hurtowa) - jedna komenda na rekord, jeden krok.
 */
export async function zmienRekordy(zakres: string, opis: string, tabela: string, ids: (string | number)[], zmiany: Record<string, unknown>, kolumna = 'id') {
  const pola = [...new Set([...Object.keys(zmiany), 'zmodyfikowano'])]
  const { data: przed, error: e1 } = await supabase.from(tabela).select([kolumna, ...pola].join(', ')).in(kolumna, ids)
  if (e1) throw new Error(komunikatPL(e1.message))
  const { data: po, error } = await supabase.from(tabela).update(zmiany).in(kolumna, ids).select([kolumna, ...pola].join(', '))
  if (error) throw new Error(komunikatPL(error.message))
  const wgId = new Map(((po ?? []) as unknown as Record<string, unknown>[]).map((r) => [String(r[kolumna]), r]))
  const komendy = ((przed ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    tabela, kolumna, id: r[kolumna] as string | number,
    przed: Object.fromEntries(pola.map((p) => [p, r[p]]).filter(([p]) => p !== 'zmodyfikowano' || r[p as string] !== undefined)),
    po: Object.fromEntries(pola.map((p) => [p, wgId.get(String(r[kolumna]))?.[p]])),
  }))
  if (komendy.length) zapiszKrok(zakres, { opis, czas: Date.now(), komendy })
}

/** Dodanie rekordu z krokiem (cofnięcie usuwa rekord). Zwraca wstawiony wiersz. */
export async function dodajRekord<T extends Record<string, unknown>>(zakres: string, opis: string, tabela: string, dane: Record<string, unknown>, kolumna = 'id'): Promise<T> {
  const { data, error } = await supabase.from(tabela).insert(dane).select('*').single()
  if (error) throw new Error(komunikatPL(error.message))
  const r = data as T
  zapiszKrok(zakres, { opis, czas: Date.now(), komendy: [{ tabela, kolumna, id: r[kolumna] as string | number, przed: null, po: r }] })
  return r
}

/** Usunięcie rekordów z krokiem (cofnięcie odtwarza je z tymi samymi id). */
export async function usunRekordy(zakres: string, opis: string, tabela: string, ids: (string | number)[], kolumna = 'id') {
  const { data: przed, error: e1 } = await supabase.from(tabela).select('*').in(kolumna, ids)
  if (e1) throw new Error(komunikatPL(e1.message))
  const { error } = await supabase.from(tabela).delete().in(kolumna, ids)
  if (error) throw new Error(komunikatPL(error.message))
  const komendy = ((przed ?? []) as Record<string, unknown>[]).map((r) => ({ tabela, kolumna, id: r[kolumna] as string | number, przed: r, po: null }))
  if (komendy.length) zapiszKrok(zakres, { opis, czas: Date.now(), komendy })
}

// --- Cofnij / Ponów ---------------------------------------------------------------------------------------

/** Cofa (albo ponawia) kroki aktywnego zakresu aż do wskazanej pozycji stosu. */
export async function przejdzDo(cel: number): Promise<string | null> {
  if (!aktywny) return null
  const zakres = aktywny.zakres
  let st = stosZakresu(zakres)
  cel = Math.max(0, Math.min(st.kroki.length, cel))
  try {
    while (st.wskaznik !== cel) {
      const wstecz = st.wskaznik > cel
      const k = st.kroki[wstecz ? st.wskaznik - 1 : st.wskaznik]
      const kierunek = wstecz ? 'wstecz' : 'naprzod'
      if (k.zmiany) aktywny?.zastosujStan?.(k.zmiany, kierunek)
      for (const kom of (wstecz ? [...(k.komendy ?? [])].reverse() : k.komendy ?? [])) await wykonajKomende(kom, kierunek)
      for (const ko of (wstecz ? [...(k.kosz ?? [])].reverse() : k.kosz ?? [])) {
        if (wstecz) {
          const { error } = await supabase.rpc('przywroc_z_kosza', { p_kosz: ko.koszId })
          if (error) throw new Error(komunikatPL(error.message))
        } else {
          const { data, error } = await supabase.rpc('przenies_do_kosza', { p_rodzaj: ko.rodzaj, p_id: ko.id })
          if (error) throw new Error(komunikatPL(error.message))
          ko.koszId = data as string
        }
      }
      odswiezacze.forEach((f) => f())
      st = { ...st, wskaznik: st.wskaznik + (wstecz ? -1 : 1) }
      ustawStos(zakres, st)
    }
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}
export const cofnij = () => przejdzDo(stosZakresu(aktywny?.zakres ?? '').wskaznik - 1)
export const ponow = () => przejdzDo(stosZakresu(aktywny?.zakres ?? '').wskaznik + 1)

/** Stan dla nagłówka (przyciski Cofnij/Ponów i panel historii). */
export function useStanHistorii() {
  useSyncExternalStore((f) => { sluchacze.add(f); return () => sluchacze.delete(f) }, () => wersja)
  const zakres = aktywny?.zakres ?? null
  const st = zakres ? stosZakresu(zakres) : { kroki: [], wskaznik: 0 }
  return {
    zakres, kroki: st.kroki, wskaznik: st.wskaznik,
    doCofniecia: st.wskaznik > 0 ? st.kroki[st.wskaznik - 1] : null,
    doPonowienia: st.wskaznik < st.kroki.length ? st.kroki[st.wskaznik] : null,
  }
}

/**
 * Rejestruje zakres jako aktywny (przyciski w nagłówku i Ctrl+Z działają na nim) i wczytuje jego stos z IndexedDB.
 * `zastosujStan` - dla edytorów: przywrócenie stanu edytora z różnic.
 */
export function useZakresHistorii(zakres: string | null, zastosujStan?: (zmiany: Zmiana[], kierunek: 'wstecz' | 'naprzod') => void) {
  const fn = useRef(zastosujStan)
  fn.current = zastosujStan
  useEffect(() => {
    if (!zakres) return
    const wpis: Zarejestrowany = { zakres, zastosujStan: (z, k) => fn.current?.(z, k) }
    zarejestrowane.push(wpis)
    ustalAktywny()
    if (!stosy.has(zakres)) void wczytajIdb(zakres).then((st) => { if (st && !stosy.has(zakres)) { stosy.set(zakres, st); powiadom() } })
    powiadom()
    return () => {
      const i = zarejestrowane.indexOf(wpis)
      if (i >= 0) zarejestrowane.splice(i, 1)
      ustalAktywny(); powiadom()
    }
  }, [zakres])
}

/**
 * Edytor ze stanem w pamięci: zwraca funkcję zmiany stanu, która odkłada krok (różnicę) do historii zakresu.
 * Szybkie zmiany jednego pola (pisanie) łączą się w jeden krok.
 */
export function useHistoriaStanu<T>(zakres: string | null, ustaw: (f: (s: T) => T) => void) {
  const zastosujStan = useCallback((zmiany: Zmiana[], kierunek: 'wstecz' | 'naprzod') => ustaw((s) => zastosuj(s, zmiany, kierunek)), [ustaw])
  useZakresHistorii(zakres, zastosujStan)
  return useCallback((przed: T, po: T, opis: string) => {
    if (!zakres) return
    const zmiany = roznica(przed, po)
    if (zmiany.length) zapiszKrok(zakres, { opis, czas: Date.now(), zmiany }, true)
  }, [zakres])
}

/** Opis zmiany z ścieżki (np. "aparaty.0.pozycje.11.ilosc" -> "zmiana: ilosc w pozycji 12"). */
export function opisZmiany(zmiany: Zmiana[], domyslny = 'zmiana'): string {
  if (zmiany.length !== 1) return domyslny
  const s = zmiany[0].s
  const i = s.indexOf('pozycje')
  const pole = String(s[s.length - 1])
  return i >= 0 && typeof s[i + 1] === 'number' ? `zmiana: ${pole} w pozycji ${(s[i + 1] as number) + 1}` : `zmiana: ${pole}`
}
