// Cennik roboczogodzin: stanowiska × przedziały czasu albo stawka stała, wersje stawek (wazna_od). Wycena dostaje migawkę
// cennika w chwili utworzenia (wyceny.stawki_cennika) - pozycje robocizny biorą stawkę z migawki, a zmiana cennika nie
// zmienia istniejących wycen. Część czysta - testy w cennikRobocizny.test.ts.

export interface PrzedzialCennika { kod: string; nazwa: string; nazwa_en?: string | null; kolejnosc: number; aktywny?: boolean }
export interface StanowiskoCennika {
  id: number; nazwa: string; nazwa_en?: string | null; tryb: 'przedzialy' | 'stala'; mpk_kod: string | null; srednia: boolean
  do_weryfikacji: boolean; aktywne: boolean; kolejnosc: number; uwagi: string | null
}
export interface StawkaCennika { id: number; stanowisko_id: number; przedzial_kod: string | null; stawka: number; wazna_od: string }

/** Pozycja migawki cennika zapisanej w wycenie. */
export interface StawkaMigawki { stanowisko_id: number; nazwa: string; tryb: 'przedzialy' | 'stala'; przedzial: string | null; stawka: number; srednia: boolean; mpk: string | null }

/** Stawka obowiązująca w dniu: najnowsza wersja nie późniejsza niż dzień (dla stanowiska i przedziału). */
export function stawkaWDniu(stawki: StawkaCennika[], stanowiskoId: number, przedzial: string | null, dzien: string): StawkaCennika | null {
  return stawki.filter((s) => s.stanowisko_id === stanowiskoId && s.przedzial_kod === przedzial && s.wazna_od <= dzien)
    .sort((a, b) => b.wazna_od.localeCompare(a.wazna_od))[0] ?? null
}

/** Stawka pozycji robocizny z migawki wyceny (stanowisko stałe - bez przedziału). */
export function stawkaZMigawki(migawka: StawkaMigawki[] | null | undefined, stanowiskoId: number | null | undefined, przedzial: string | null | undefined): number | null {
  if (!migawka || !stanowiskoId) return null
  const st = migawka.filter((x) => x.stanowisko_id === stanowiskoId)
  if (!st.length) return null
  if (st[0].tryb === 'stala') return Number(st.find((x) => x.przedzial === null)?.stawka ?? null)
  const s = st.find((x) => x.przedzial === (przedzial ?? null))
  return s ? Number(s.stawka) : null
}

/** Stanowiska z migawki (lista wyboru w zakładce Robocizna). */
export function stanowiskaMigawki(migawka: StawkaMigawki[] | null | undefined): { id: number; nazwa: string; tryb: 'przedzialy' | 'stala'; mpk: string | null; srednia: boolean }[] {
  const m = new Map<number, { id: number; nazwa: string; tryb: 'przedzialy' | 'stala'; mpk: string | null; srednia: boolean }>()
  for (const x of migawka ?? []) if (!m.has(x.stanowisko_id)) m.set(x.stanowisko_id, { id: x.stanowisko_id, nazwa: x.nazwa, tryb: x.tryb, mpk: x.mpk, srednia: x.srednia })
  return [...m.values()]
}

/** Stawka średnia warsztatu (metoda wskaźnikowa) z migawki - stanowisko oznaczone jako średnia. */
export const stawkaSredniaZMigawki = (migawka: StawkaMigawki[] | null | undefined) => {
  const s = (migawka ?? []).find((x) => x.srednia)
  return s ? Number(s.stawka) : null
}

export interface WierszWklejki { nazwa: string; stala?: number; stawki?: Record<string, number> }

/** "1 234,50" / "98" / "98,00 zł" -> liczba; tekst bez liczby -> null. */
const liczbaWklejki = (s: string) => {
  const x = s.replace(/zł|pln|\s/gi, '').replace(',', '.')
  return /^\d+(\.\d+)?$/.test(x) ? Number(x) : null
}

/**
 * Wiersze wklejone ze schowka (Excel, Word - kolumny rozdzielone tabulatorem albo średnikiem): nazwa stanowiska i stawki.
 * Jedna liczba (albo słowo "stała") = stawka stała; kilka liczb = przedziały w kolejności z cennika. Nagłówek jest pomijany.
 */
export function parsujWklejke(tekst: string, przedzialy: PrzedzialCennika[]): WierszWklejki[] {
  const kody = [...przedzialy].sort((a, b) => a.kolejnosc - b.kolejnosc).map((p) => p.kod)
  const wynik: WierszWklejki[] = []
  for (const linia of tekst.replace(/\r/g, '').split('\n')) {
    const k = linia.split(/\t|;/).map((x) => x.trim())
    const nazwa = k[0]
    const liczby = k.slice(1).map(liczbaWklejki).filter((x): x is number => x !== null)
    if (!nazwa || !liczby.length) continue
    if (liczby.length === 1 || k.slice(1).some((x) => /stała|stala|fixed|flat/i.test(x))) wynik.push({ nazwa, stala: liczby[liczby.length - 1] })
    else wynik.push({ nazwa, stawki: Object.fromEntries(liczby.slice(0, kody.length).map((v, i) => [kody[i], v])) })
  }
  return wynik
}
