// Lista materiałowa zapytania - jedna, kompletna lista (pozycje, króćce, dane projektowe) złożona z dokumentów:
// listy materiałowej (PDF, skan, arkusz) albo rysunku złożeniowego (wykaz części, tabela króćców, tabela U-rur...).
// Zapisana jako odczyt rysunku o rodzaju "lista_materialowa" (jedna na zapytanie) - ta sama siatka, kosz, audyt
// i przeniesienie do wyceny co pozostałe odczyty. Tu logika bez przeglądarki (testowana).
import type { SupabaseClient } from '@supabase/supabase-js'
import { PUSTY_WYNIK, klasyfikuj, type PozycjaRysunku, type WynikRysunku } from './rysunki'
import type { WierszListy } from './importListy'

export const RODZAJ_LISTY = 'lista_materialowa'

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const pusty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && !v.trim())

/** Kolejność numerów pozycji: "2" < "9.4" < "10" < "10.1"; bez numeru - na końcu w kolejności odczytu. */
export function porownajPoz(a: string, b: string): number {
  const x = a.trim() ? a.split(/[.,/]/).map((v) => Number.parseFloat(v) || 0) : [Infinity]
  const y = b.trim() ? b.split(/[.,/]/).map((v) => Number.parseFloat(v) || 0) : [Infinity]
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
  return 0
}

/**
 * Pozycje o tym samym numerze to ta sama pozycja (np. wykaz części i tabela U-rur z długością i masą, albo kolejne
 * strony / kafle) - pola uzupełniane wzajemnie, przy sprzeczności zostaje pewniejszy odczyt. Pozycje bez numeru:
 * duplikat = ta sama nazwa, wymiary i materiał.
 */
function scalPozycje(lista: PozycjaRysunku[]): PozycjaRysunku[] {
  const m = new Map<string, PozycjaRysunku>()
  const kolejnosc: string[] = []
  for (const p of lista) {
    const k = p.poz.trim() ? `#${norm(p.poz)}` : `${norm(p.nazwa)}|${norm(p.wymiary)}|${norm(p.material)}`
    const b = m.get(k)
    if (!b) { m.set(k, { ...p }); kolejnosc.push(k); continue }
    const [lepszy, gorszy] = p.pewnosc > b.pewnosc ? [p, b] : [b, p]
    const wynik = { ...lepszy }
    for (const pole of ['nazwa', 'ilosc', 'material', 'norma', 'wymiary', 'masa_jedn', 'masa_calk', 'uwagi', 'nazwa_pl', 'nazwa_en', 'obszar_zrodlowy'] as const) {
      if (pusty(wynik[pole]) && !pusty(gorszy[pole])) (wynik as Record<string, unknown>)[pole] = gorszy[pole]
    }
    // Uwagi z obu źródeł (np. długość z tabeli U-rur), bez powtórzeń.
    const uwagi = [...new Set([lepszy.uwagi, gorszy.uwagi].filter((u): u is string => !!u?.trim()))]
    wynik.uwagi = uwagi.length ? uwagi.join('; ') : null
    if (wynik.sekcja === 'inne' && gorszy.sekcja !== 'inne') wynik.sekcja = gorszy.sekcja
    m.set(k, wynik)
  }
  return kolejnosc.map((k) => m.get(k)!).map((p, i) => ({ p, i }))
    .sort((a, b) => porownajPoz(a.p.poz, b.p.poz) || a.i - b.i).map((x) => x.p)
}

/**
 * Lista materiałowa z wyników (strony dokumentu, kafle, kilka dokumentów, zaznaczone tabele): pozycje scalone po numerze
 * i uporządkowane, króćce po oznaczeniu, dane projektowe po nazwie i przestrzeni, uwagi bez powtórzeń, własne tabele obok.
 */
export function zlozListe(...wyniki: WynikRysunku[]): WynikRysunku {
  const unikalne = <T extends { pewnosc: number }>(l: T[], klucz: (x: T) => string) => {
    const m = new Map<string, T>()
    let i = 0
    for (const x of l) {
      const k = klucz(x) || `#${i++}`
      const b = m.get(k)
      if (!b || x.pewnosc > b.pewnosc) m.set(k, x)
    }
    return [...m.values()]
  }
  return {
    pozycje: scalPozycje(wyniki.flatMap((w) => w.pozycje)),
    krocce: unikalne(wyniki.flatMap((w) => w.krocce), (k) => norm(k.oznaczenie)),
    parametry: unikalne(wyniki.flatMap((w) => w.parametry), (p) => `${norm(p.nazwa)}|${norm(p.przestrzen)}`),
    uwagi: [...new Set(wyniki.flatMap((w) => w.uwagi))],
    tabele: wyniki.flatMap((w) => w.tabele ?? []),
  }
}

/** Ile nowych pozycji / króćców wnosi wynik do listy (komunikat po dopisaniu). */
export function przyrost(lista: WynikRysunku, nowa: WynikRysunku) {
  return { pozycji: nowa.pozycje.length - lista.pozycje.length, krocow: nowa.krocce.length - lista.krocce.length }
}

const liczbaTxt = (n: number | null) => (n === null ? '' : String(n).replace('.', ','))

/** Wiersze listy z arkusza (Excel / CSV - rozpoznane kolumny) -> pozycje listy materiałowej. */
export function pozycjeZArkusza(wiersze: WierszListy[]): WynikRysunku {
  const pozycje = wiersze.map((w): PozycjaRysunku => {
    const wymiary = w.dn
      ? [w.dn, w.pn].filter(Boolean).join(' ')
      : [w.d_zew !== null ? `Ø${liczbaTxt(w.d_zew)}` : null, w.grubosc, w.szerokosc, w.dlugosc].filter((x) => x !== null && x !== undefined && x !== '').map((x) => (typeof x === 'number' ? liczbaTxt(x) : x)).join('x')
    return {
      poz: String(w.lp), nazwa: w.nazwa, ilosc: w.ilosc, jm: w.jm || 'szt', material: w.gatunek, norma: w.norma, wymiary: wymiary || null,
      masa_jedn: w.masa_jedn, masa_calk: w.masa_jedn !== null ? Math.round(w.masa_jedn * w.ilosc * 100) / 100 : null, uwagi: w.uwagi,
      pewnosc: w.pewnosc, sekcja: w.sekcja || klasyfikuj(w.nazwa, wymiary, w.gatunek).sekcja, obszar_zrodlowy: null,
    }
  })
  return { ...PUSTY_WYNIK, pozycje: scalPozycje(pozycje) }
}

/** Opis obszaru dla AI przy odczycie całego dokumentu jako listy materiałowej (tryb wyciagnij_liste_z_rysunku). */
export const OBSZAR_LISTY = 'cała lista materiałowa'

/**
 * Lista materiałowa zapytania z odczytów automatycznych (wycena automatyczna, odczyt wszystkich dokumentów): tworzona,
 * gdy zapytanie jej nie ma - istniejącej listy (poprawionej przez technologa) automat nie zmienia. Zwraca, czy zapisano.
 */
export async function utworzListeGdyBrak(db: SupabaseClient, zapytanieId: string, wynik: WynikRysunku, zrodlo: { pliki: string[]; rodzaj: 'tekst' | 'ai'; dokument_id: string | null }) {
  if (!wynik.pozycje.length && !wynik.krocce.length) return false
  const { data } = await db.from('odczyty_rysunkow').select('id').eq('zapytanie_id', zapytanieId).eq('rodzaj_tabeli', RODZAJ_LISTY).limit(1)
  if (data?.length) return false
  const { error } = await db.from('odczyty_rysunkow').insert({
    zapytanie_id: zapytanieId, dokument_id: zrodlo.dokument_id, nazwa_pliku: [...new Set(zrodlo.pliki)].join(' + ') || 'lista materiałowa', strona: 1, obszary: [],
    nazwa: 'Lista materiałowa', rodzaj_tabeli: RODZAJ_LISTY, wynik, zrodlo: zrodlo.rodzaj, model: 'automatycznie', sprawdzony: false,
  })
  return !error
}
