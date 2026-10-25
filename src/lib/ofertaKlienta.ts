// Oferta dla klienta jako lista sekcji (accordion): każda sekcja ma tytuł, tekst z prostym formatowaniem
// (linie "- " = punkty, **pogrubienie**), może być ukryta w wydruku, a kolejność sekcji ustala się przeciąganiem.
// Część czysta - bez Reacta i bazy (testy w ofertaKlienta.test.ts). Zapis: wyceny.oferta (jsonb).
import { tj, type Jezyk } from '@/i18n'

export type Kategoria = 'obejmuje' | 'nie_obejmuje' | 'uwagi'
export type RodzajSekcji = 'dane' | 'przedmiot' | 'zakres' | 'warunki' | 'uwagi' | 'cena' | 'zalaczniki' | 'wlasna'

export interface SekcjaOferty {
  id: string
  rodzaj: RodzajSekcji
  /** Własny tytuł; pusty = tytuł domyślny rodzaju w języku oferty. */
  tytul: string
  /** Dodatkowy tekst sekcji (formatowanie: "- " punkt, **pogrubienie**, {zmienna}). */
  tekst: string
  /** false = sekcja ukryta w wydruku (zostaje w edytorze). */
  widoczna: boolean
}

export interface WersjaOferty { czas: string; kto: string; opis: string; oferta: Omit<OfertaWyceny, 'wersje'> }

export interface OfertaWyceny {
  jezyk: Jezyk
  numer_oferty: string
  data: string
  osoba_kontaktowa: string
  nazwa_projektu: string
  przedmiot: string
  sekcje: SekcjaOferty[]
  obejmuje: string[]
  nie_obejmuje: string[]
  uwagi: string[]
  zmienne: Record<string, string>
  termin_realizacji: string
  gwarancja_mies: number
  waznosc_dni: number
  platnosc: string
  incoterms: string
  miejsce_dostawy: string
  kary: string
  zaliczki: string
  waluta: 'PLN' | 'EUR'
  pokaz_wariant: boolean
  opis_wariantu: string
  zalaczniki: string[]
  podpis: string
  /** Zapisane wersje treści oferty (najnowsza na końcu). */
  wersje: WersjaOferty[]
}

export const RODZAJE_SEKCJI: RodzajSekcji[] = ['dane', 'przedmiot', 'zakres', 'warunki', 'uwagi', 'cena', 'zalaczniki']

export function tytulSekcji(s: Pick<SekcjaOferty, 'rodzaj' | 'tytul'>, j: Jezyk): string {
  if (s.tytul.trim()) return s.tytul
  switch (s.rodzaj) {
    case 'dane': return tj(j, 'Dane oferty')
    case 'przedmiot': return tj(j, 'Przedmiot oferty')
    case 'zakres': return tj(j, 'Zakres oferty')
    case 'warunki': return tj(j, 'Warunki techniczne i handlowe')
    case 'uwagi': return tj(j, 'Uwagi i zastrzeżenia')
    case 'cena': return tj(j, 'Cena')
    case 'zalaczniki': return tj(j, 'Załączniki')
    default: return tj(j, 'Sekcja')
  }
}

let licznik = 0
export const idSekcji = () => `s${Date.now().toString(36)}${++licznik}`

export const domyslneSekcje = (): SekcjaOferty[] => RODZAJE_SEKCJI.map((rodzaj) => ({ id: rodzaj, rodzaj, tytul: '', tekst: '', widoczna: true }))

export interface DomyslneOferty { gwarancja_mies: number; waznosc_dni: number; platnosc: string }

/**
 * Oferta z bazy (także w starym układzie bez sekcji) -> pełna struktura. Sekcje, których brakuje, dochodzą na końcu
 * w kolejności domyślnej; zapisane listy klauzul, zmienne i warunki zostają.
 */
export function normalizujOferte(zapis: Partial<OfertaWyceny> | null | undefined, d: DomyslneOferty & {
  przedmiot: string; termin_tyg: number | null; numer: string; ma_opcje: boolean; dzis?: string
}): OfertaWyceny {
  const z = zapis ?? {}
  const j: Jezyk = z.jezyk === 'en' ? 'en' : 'pl'
  const sekcje = [...(z.sekcje ?? [])].filter((s) => s && s.id && s.rodzaj)
  for (const s of domyslneSekcje()) if (!sekcje.some((x) => x.rodzaj === s.rodzaj)) sekcje.push(s)
  return {
    jezyk: j,
    numer_oferty: z.numer_oferty ?? d.numer,
    data: z.data ?? d.dzis ?? new Date().toISOString().slice(0, 10),
    osoba_kontaktowa: z.osoba_kontaktowa ?? '',
    nazwa_projektu: z.nazwa_projektu ?? '',
    przedmiot: z.przedmiot ?? d.przedmiot,
    sekcje,
    obejmuje: z.obejmuje ?? [], nie_obejmuje: z.nie_obejmuje ?? [], uwagi: z.uwagi ?? [],
    zmienne: z.zmienne ?? {},
    termin_realizacji: z.termin_realizacji ?? (d.termin_tyg ? tj(j, '{0} tygodni od daty otrzymania zamówienia', d.termin_tyg) : ''),
    gwarancja_mies: z.gwarancja_mies ?? d.gwarancja_mies,
    waznosc_dni: z.waznosc_dni ?? d.waznosc_dni,
    platnosc: z.platnosc ?? d.platnosc,
    incoterms: z.incoterms ?? '', miejsce_dostawy: z.miejsce_dostawy ?? '', kary: z.kary ?? '', zaliczki: z.zaliczki ?? '',
    waluta: z.waluta === 'EUR' ? 'EUR' : 'PLN',
    pokaz_wariant: z.pokaz_wariant ?? d.ma_opcje,
    opis_wariantu: z.opis_wariantu ?? tj(j, 'bez pozycji opcjonalnych'),
    zalaczniki: z.zalaczniki ?? [],
    podpis: z.podpis ?? '',
    wersje: z.wersje ?? [],
  }
}

/** Przesuwa sekcję z pozycji `z` na pozycję `na` (przeciąganie albo strzałki). */
export function przesunSekcje(sekcje: SekcjaOferty[], z: number, na: number): SekcjaOferty[] {
  if (z === na || z < 0 || na < 0 || z >= sekcje.length || na >= sekcje.length) return sekcje
  const l = [...sekcje]
  const [s] = l.splice(z, 1)
  l.splice(na, 0, s)
  return l
}

/** Podstawia {zmienne}; brakująca zmienna zostaje widoczna jako [nazwa]. */
export function podstaw(tekst: string, zmienne: Record<string, string>) {
  return tekst.replace(/\{(\w+)\}/g, (_, n: string) => (zmienne[n]?.trim() ? zmienne[n] : `[${n}]`))
}

/** Zmienne użyte w tekstach, które nie mają wartości. */
export function brakujaceZmienne(teksty: string[], zmienne: Record<string, string>): string[] {
  const uzyte = new Set(teksty.flatMap((t) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))
  return [...uzyte].filter((n) => !zmienne[n]?.trim())
}

/** Zmienne użyte w tekstach (do pól edycji wartości). */
export const zmienneWTekstach = (teksty: string[]) => [...new Set(teksty.flatMap((t) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))]

export interface FragmentTekstu { tekst: string; pogrubiony: boolean }
export interface LiniaTekstu { punkt: boolean; fragmenty: FragmentTekstu[] }

/** Prosty zapis formatowania -> linie (punkty) i fragmenty (pogrubienia) - wspólne dla podglądu i eksportu Word. */
export function rozbierzTekst(tekst: string): LiniaTekstu[] {
  return tekst.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const punkt = /^\s*[-•*]\s+/.test(l)
    const tresc = l.replace(/^\s*[-•*]\s+/, '')
    const fragmenty: FragmentTekstu[] = []
    tresc.split(/(\*\*[^*]+\*\*)/).filter(Boolean).forEach((f) => {
      const b = /^\*\*([^*]+)\*\*$/.exec(f)
      fragmenty.push({ tekst: b ? b[1] : f, pogrubiony: !!b })
    })
    return { punkt, fragmenty }
  })
}

/** Klauzula z biblioteki w języku oferty (tekst_en, gdy jest); tekst spoza biblioteki - bez zmian. */
export function klauzulaWJezyku(tekst: string, j: Jezyk, biblioteka: { tekst: string; tekst_en?: string | null }[]): string {
  if (j !== 'en') return tekst
  return biblioteka.find((k) => k.tekst === tekst)?.tekst_en?.trim() || tekst
}

/** Zapis wersji treści oferty (bez historii wersji w środku; najwyżej `limit` ostatnich). */
export function dodajWersje(o: OfertaWyceny, kto: string, opis: string, limit = 20, czas = new Date().toISOString()): OfertaWyceny {
  const { wersje, ...tresc } = o
  return { ...o, wersje: [...wersje, { czas, kto, opis, oferta: JSON.parse(JSON.stringify(tresc)) }].slice(-limit) }
}

/** Przywraca treść z zapisanej wersji (historia wersji zostaje). */
export const przywrocWersje = (o: OfertaWyceny, w: WersjaOferty): OfertaWyceny => ({ ...JSON.parse(JSON.stringify(w.oferta)), wersje: o.wersje })
