// Karta analizy zapytania (następca zakładki "Opinia o zapytaniu" z dotychczasowego arkusza wyceny): podsumowanie przedmiotu, wymagania
// kosztotwórcze z cytatami, usługi do zapytań, pytania do klienta, niespójności, segregacja dokumentów
// i ocena działów. Część czysta - testy w repo na danych fikcyjnych.
import type { PozycjaZapytania } from './zapytaniaDostawcow'
import { t } from '@/i18n'

/** Checklista wymagań kosztotwórczych (§7.2) - zawsze na karcie, nawet gdy dokumenty o nich milczą. */
export const CHECKLISTA: { kod: string; nazwa: string; podpowiedz: string }[] = [
  { kod: 'material', nazwa: t('Materiał specjalny / udarność / pochodzenie'), podpowiedz: t('gatunki, udarność −45 °C / −29 °C, producent z UE, „odpowiedniki”') },
  { kod: 'atesty', nazwa: t('Atesty 3.1 / PED / UDT producenta'), podpowiedz: t('atest 3.1, PED, uprawnienia UDT wytwórcy materiału') },
  { kod: 'ped', nazwa: t('Kategoria PED / moduł / JN / CE'), podpowiedz: t('kategoria, moduł oceny zgodności, Jednostka Notyfikowana, znak CE') },
  { kod: 'udt', nazwa: t('UDT (dokumentacja koncesyjna, odbiory)'), podpowiedz: t('dozór, dokumentacja do uzgodnienia, odbiory UDT') },
  { kod: 'ndt', nazwa: t('NDT (zakres %)'), podpowiedz: t('RT, UT, PT, MT, NFT - zakres procentowy') },
  { kod: 'proba', nazwa: t('Próba ciśnieniowa'), podpowiedz: t('hydrauliczna / pneumatyczna, ciśnienie, medium') },
  { kod: 'pwht', nazwa: t('PWHT (obróbka cieplna)'), podpowiedz: t('wyżarzanie odprężające, transport do pieca') },
  { kod: 'sekafenowanie', nazwa: t('Sekafenowanie'), podpowiedz: t('system, grubość powłoki, zakres (wkład, głowica)') },
  { kod: 'antykorozja', nazwa: t('Antykorozja (system i grubości)'), podpowiedz: t('przygotowanie powierzchni, systemy malarskie, grubości') },
  { kod: 'izolacja', nazwa: t('Izolacja'), podpowiedz: t('materiał, grubość, płaszcz') },
  { kod: 'transport', nazwa: t('Transport ponadgabarytowy'), podpowiedz: t('wymiary, masa, warunki dostawy (DDP)') },
  { kod: 'wizja', nazwa: t('Wizja lokalna'), podpowiedz: t('obowiązkowa / zalecana, termin') },
  { kod: 'montaz', nazwa: t('Demontaż / montaż, prace podczas postoju'), podpowiedz: t('zakres na obiekcie, termin postoju') },
  { kod: 'prawa_autorskie', nazwa: t('Prawa autorskie do dokumentacji'), podpowiedz: t('przeniesienie praw, dokumentacja w edytowalnej formie') },
  { kod: 'kary', nazwa: t('Kary i terminy'), podpowiedz: t('kary umowne, termin realizacji, gwarancja') },
  { kod: 'odpowiedniki', nazwa: t('„Odpowiedniki, nie zamienniki”'), podpowiedz: t('zgoda na materiały równoważne') },
]

export type StanWymagania = 'wymagane' | 'nie' | 'do_wyjasnienia' | 'brak_informacji'
export const ETYKIETY_STANU: Record<StanWymagania, string> = {
  wymagane: t('wymagane'), nie: t('nie dotyczy'), do_wyjasnienia: t('do wyjaśnienia'), brak_informacji: t('brak informacji'),
}
export type Wplyw = 'wysoki' | 'sredni' | 'niski'

export interface WymaganieAnalizy {
  kod: string
  nazwa: string
  stan: StanWymagania
  wplyw: Wplyw | null
  opis: string
  /** Dosłowny fragment dokumentu. */
  cytat: string
  /** Dokument i strona, np. "Specyfikacja.docx, str. 3". */
  zrodlo: string
}

export interface AparatAnalizy {
  nazwa: string
  typ: string | null
  ilosc: number
  masa_kg: number | null
  srednica_mm: number | null
  dlugosc_mm: number | null
  wysokosc_mm: number | null
  material: string | null
  /** Pliki rysunków / kart danych tego aparatu (z analizy AI) - do przypisania list materiałów z rysunków. */
  rysunki?: string[]
}

export interface PodsumowanieAnalizy {
  przedmiot: string
  /** Zamawiający (firma klienta) - przy imporcie z maila uzupełnia kartę zapytania. */
  klient: string
  nr_zapytania_klienta: string
  ilosc_szt: number | null
  masa_kg: number | null
  wymiary: string
  miejsce_dostawy: string
  termin_oferty: string
  /** RRRR-MM-DD, gdy termin składania oferty da się odczytać jako datę. */
  termin_oferty_data: string | null
  termin_realizacji: string
  postoj: string
  warunki_dostawy: string
  waznosc_oferty: string
  gwarancja: string
  platnosc: string
  dokumenty_oferty: string
}

export interface UslugaAnalizy { kategoria: string | null; opis: string; ilosc: number | null; jm: string; uwagi: string }
export interface PytanieAnalizy { tresc: string; zrodlo: string; odpowiedz: string }
export interface NiespojnoscAnalizy { opis: string; zrodla: string }
export interface DokumentAnalizy { nazwa: string; istotny: boolean; uzasadnienie: string }

/** Ocena działów - pola z zakładki "Opinia o zapytaniu" dotychczasowego arkusza wyceny. */
export interface OcenaAnalizy {
  kompletnosc: { arkusz_danych: boolean; dokumentacja_wykonawcza: boolean; dokumentacja_koncesyjna: boolean; szkic: boolean }
  technologiczna: 'pozytywna' | 'negatywna' | null
  uwagi_technologiczne: string
  spawalnicza: string
  terminy_materialow: { grupa: string; termin: string }[]
  plan_jakosci: boolean
  zmiana_terminu: boolean
  uwagi: string
  /** Istotne problemy i ich wpływ na termin (wyżarzanie, transport ponadgabarytowy...). */
  problemy: string
  /** Zatwierdzenia bloków oceny ("data i podpis"): kto i kiedy - bez podpisu elektronicznego. */
  podpisy: Partial<Record<BlokOceny, { kto: string; kiedy: string }>>
}

export type BlokOceny = 'kompletnosc' | 'technologiczna' | 'spawalnicza' | 'terminy'

/** Punkt do sprawdzenia przez pracownika po automatycznym przygotowaniu. */
export interface PunktWeryfikacji {
  rodzaj: 'cena' | 'stara_cena' | 'cena_przyblizona' | 'odczyt' | 'masa' | 'robocizna' | 'wymaganie' | 'niespojnosc' | 'pytanie' | 'dane'
  opis: string
  /** Gdzie poprawić: "wycena", "rysunki", "karta". */
  gdzie: 'wycena' | 'rysunki' | 'karta'
}

export interface KrokPrzygotowania { nazwa: string; stan: 'ok' | 'pominiety' | 'blad'; opis: string }

/** Raport ostatniego automatycznego przygotowania (zapisany w karcie analizy). */
export interface RaportPrzygotowania {
  data: string
  wycena_id: string | null
  wersja: number | null
  koszt_pln: number
  kroki: KrokPrzygotowania[]
  weryfikacja: PunktWeryfikacji[]
}

export interface KartaAnalizy {
  /** Ostatnie automatyczne przygotowanie (analiza, listy, wstępna wycena, oferta). */
  przygotowanie?: RaportPrzygotowania | null
  podsumowanie: PodsumowanieAnalizy
  aparaty: AparatAnalizy[]
  wymagania: WymaganieAnalizy[]
  uslugi: UslugaAnalizy[]
  pytania: PytanieAnalizy[]
  niespojnosci: NiespojnoscAnalizy[]
  dokumenty: DokumentAnalizy[]
  ocena: OcenaAnalizy
  uwagi: string
}

export const GRUPY_TERMINOW = ['Blachy', 'Odkuwki', 'Rury', 'Elementy złączne, pręty', 'Dokumentacja']

const PUSTE_PODSUMOWANIE: PodsumowanieAnalizy = {
  przedmiot: '', klient: '', nr_zapytania_klienta: '', ilosc_szt: null, masa_kg: null, wymiary: '', miejsce_dostawy: '', termin_oferty: '',
  termin_oferty_data: null, termin_realizacji: '', postoj: '', warunki_dostawy: '', waznosc_oferty: '', gwarancja: '', platnosc: '', dokumenty_oferty: '',
}

const pusteWymaganie = (kod: string, nazwa: string): WymaganieAnalizy => ({ kod, nazwa, stan: 'brak_informacji', wplyw: null, opis: '', cytat: '', zrodlo: '' })

export function pustaKarta(): KartaAnalizy {
  return {
    podsumowanie: { ...PUSTE_PODSUMOWANIE },
    aparaty: [],
    wymagania: CHECKLISTA.map((c) => pusteWymaganie(c.kod, c.nazwa)),
    uslugi: [], pytania: [], niespojnosci: [], dokumenty: [],
    ocena: {
      kompletnosc: { arkusz_danych: false, dokumentacja_wykonawcza: false, dokumentacja_koncesyjna: false, szkic: false },
      technologiczna: null, uwagi_technologiczne: '', spawalnicza: '',
      terminy_materialow: GRUPY_TERMINOW.map((grupa) => ({ grupa, termin: '' })), plan_jakosci: false, zmiana_terminu: false, uwagi: '',
      problemy: '', podpisy: {},
    },
    uwagi: '',
  }
}

/** Karta z bazy (może być starsza / niepełna) -> pełna struktura; checklista zawsze w komplecie i na początku. */
export function uzupelnijKarte(dane: Partial<KartaAnalizy> | null | undefined): KartaAnalizy {
  const p = pustaKarta()
  if (!dane) return p
  const zapisane = dane.wymagania ?? []
  const wymagania = [
    ...CHECKLISTA.map((c) => ({ ...pusteWymaganie(c.kod, c.nazwa), ...zapisane.find((w) => w.kod === c.kod), nazwa: c.nazwa })),
    ...zapisane.filter((w) => !CHECKLISTA.some((c) => c.kod === w.kod)),
  ]
  return {
    ...p, ...dane,
    podsumowanie: { ...p.podsumowanie, ...dane.podsumowanie },
    ocena: { ...p.ocena, ...dane.ocena, kompletnosc: { ...p.ocena.kompletnosc, ...dane.ocena?.kompletnosc } },
    wymagania,
  }
}

// --- Odpowiedź AI ------------------------------------------------------------------------------

export interface AnalizaAi {
  podsumowanie: Omit<PodsumowanieAnalizy, 'termin_oferty_data'> & { termin_oferty_data: string | null }
  aparaty: AparatAnalizy[]
  wymagania: { kod: string; nazwa: string; stan: Exclude<StanWymagania, 'brak_informacji'>; wplyw: Wplyw; opis: string; cytat: string; dokument: string | null; strona: number | null }[]
  uslugi: { kategoria: string | null; opis: string; ilosc: number | null; jm: string | null; uwagi: string | null }[]
  pytania: { tresc: string; dokument: string | null; strona: number | null }[]
  niespojnosci: { opis: string; dokumenty: string }[]
  dokumenty: DokumentAnalizy[]
  uwagi_analizy: string
}

export const zrodloTekst = (dokument: string | null | undefined, strona: number | null | undefined) =>
  [dokument?.trim(), strona ? `str. ${strona}` : ''].filter(Boolean).join(', ')

const klucz = (s: string) => s.toLowerCase().replace(/[^a-ząćęłńóśźż0-9]/g, '')
const pustyTekst = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && !v.trim())
const slowa = (s: string) => new Set(s.toLowerCase().match(/[a-ząćęłńóśźż0-9]{3,}/g) ?? [])

/**
 * Ta sama rzecz innymi słowami (ponowna analiza AI formułuje usługi, pytania i niespójności inaczej):
 * co najmniej 60% słów krótszego tekstu występuje w dłuższym.
 */
export function podobnyTekst(a: string, b: string): boolean {
  if (klucz(a) === klucz(b)) return true
  const [x, y] = [slowa(a), slowa(b)]
  if (!x.size || !y.size) return false
  let wspolne = 0
  for (const s of x) if (y.has(s)) wspolne++
  return wspolne / Math.min(x.size, y.size) >= 0.6
}

/**
 * Wynik AI wpisany do karty. Zasada: poprawki człowieka mają pierwszeństwo - AI wypełnia tylko puste pola
 * podsumowania i wymagania bez informacji, a listy (usługi, pytania, niespójności) uzupełnia o nowe pozycje.
 * Segregacja dokumentów to propozycja AI - zastępuje poprzednią. Oceny działów AI nie zmienia.
 */
export function zWynikuAnalizyAi(ai: AnalizaAi, obecna: KartaAnalizy): KartaAnalizy {
  const podsumowanie = { ...obecna.podsumowanie }
  for (const [k, v] of Object.entries(ai.podsumowanie) as [keyof PodsumowanieAnalizy, never][]) {
    if (pustyTekst(podsumowanie[k]) && !pustyTekst(v)) (podsumowanie as Record<string, unknown>)[k] = v
  }
  const wymagania = obecna.wymagania.map((w) => {
    const z = ai.wymagania.find((a) => a.kod === w.kod)
    if (!z || w.stan !== 'brak_informacji' || w.opis.trim()) return w
    return { ...w, stan: z.stan, wplyw: z.wplyw, opis: z.opis, cytat: z.cytat, zrodlo: zrodloTekst(z.dokument, z.strona) }
  })
  for (const z of ai.wymagania.filter((a) => !CHECKLISTA.some((c) => c.kod === a.kod))) {
    if (wymagania.some((w) => klucz(w.nazwa) === klucz(z.nazwa))) continue
    wymagania.push({ kod: `inne-${wymagania.length + 1}`, nazwa: z.nazwa, stan: z.stan, wplyw: z.wplyw, opis: z.opis, cytat: z.cytat, zrodlo: zrodloTekst(z.dokument, z.strona) })
  }
  const dopisz = <T,>(l: T[], nowe: T[], k: (x: T) => string) => [...l, ...nowe.filter((n) => !l.some((x) => podobnyTekst(k(x), k(n))))]
  // Aparaty wpisane wcześniej zostają; puste pola (wymiary, masa, rysunki) uzupełnia AI dla aparatu o tej samej nazwie.
  const aparaty = obecna.aparaty.length
    ? obecna.aparaty.map((a) => {
      const z = ai.aparaty.find((x) => klucz(x.nazwa) === klucz(a.nazwa))
      if (!z) return a
      const u = { ...a }
      for (const k of ['typ', 'masa_kg', 'srednica_mm', 'dlugosc_mm', 'wysokosc_mm', 'material'] as const) if (pustyTekst(u[k]) && !pustyTekst(z[k])) (u as Record<string, unknown>)[k] = z[k]
      if (!u.rysunki?.length && z.rysunki?.length) u.rysunki = z.rysunki
      return u
    })
    : ai.aparaty
  return {
    ...obecna,
    podsumowanie,
    aparaty,
    wymagania,
    uslugi: dopisz(obecna.uslugi, ai.uslugi.map((u) => ({ kategoria: u.kategoria, opis: u.opis, ilosc: u.ilosc, jm: u.jm ?? '', uwagi: u.uwagi ?? '' })), (u) => u.opis),
    pytania: dopisz(obecna.pytania, ai.pytania.map((p) => ({ tresc: p.tresc, zrodlo: zrodloTekst(p.dokument, p.strona), odpowiedz: '' })), (p) => p.tresc),
    niespojnosci: dopisz(obecna.niespojnosci, ai.niespojnosci.map((n) => ({ opis: n.opis, zrodla: n.dokumenty })), (n) => n.opis),
    dokumenty: ai.dokumenty.length ? ai.dokumenty : obecna.dokumenty,
    uwagi: obecna.uwagi.trim() ? obecna.uwagi : ai.uwagi_analizy,
  }
}

/**
 * Termin składania oferty z karty jako wartość pola karty zapytania (ISO). Godzina z tekstu
 * ("30.10.2026 godz. 12:00"), domyślnie 12:00 czasu lokalnego. null, gdy brak daty.
 */
export function terminOfertyISO(p: Pick<PodsumowanieAnalizy, 'termin_oferty' | 'termin_oferty_data'>): string | null {
  if (!p.termin_oferty_data || !/^\d{4}-\d{2}-\d{2}$/.test(p.termin_oferty_data)) return null
  const g = /(\d{1,2})[:.](\d{2})/.exec(p.termin_oferty.replace(/\d{1,2}\.\d{1,2}\.\d{2,4}/g, ''))
  const [r, m, d] = p.termin_oferty_data.split('-').map(Number)
  const data = new Date(r, m - 1, d, g ? Number(g[1]) : 12, g ? Number(g[2]) : 0)
  return Number.isNaN(data.getTime()) ? null : data.toISOString()
}

// --- Tekst dokumentów do analizy ---------------------------------------------------------------

export interface DokumentDoAnalizy { nazwa: string; typ: string; tekst: string | null; skan: boolean }

/** Kolejność: najpierw to, co zwykle zawiera wymagania; standardy klienta na końcu. */
const PRIORYTET: Record<string, number> = {
  specyfikacja: 0, formularz_wymagan: 1, karta_danych: 2, korespondencja: 3, rysunek: 4, obliczenia: 5, inne: 6, standard_klienta: 9,
}

/**
 * Teksty istotnych dokumentów w jednym bloku dla modelu (z nazwą i typem dokumentu - model cytuje je
 * jako źródło). Powyżej limitu dokument jest ucinany, a kolejne pomijane - lista wraca do pokazania.
 */
export function tekstDoAnalizy(dokumenty: DokumentDoAnalizy[], limitZnakow = 300_000): { tekst: string; pominiete: string[]; uciete: string[] } {
  const posortowane = [...dokumenty].filter((d) => d.tekst?.trim()).sort((a, b) => (PRIORYTET[a.typ] ?? 6) - (PRIORYTET[b.typ] ?? 6))
  const czesci: string[] = []
  const pominiete: string[] = []
  const uciete: string[] = []
  let razem = 0
  // Ta sama treść w kilku plikach (np. rysunek z różnymi zaznaczeniami) - wysyłamy raz.
  const wyslane = new Map<string, string>()
  for (const d of posortowane) {
    const naglowek = `<plik nazwa="${d.nazwa.replace(/"/g, "'")}" typ="${d.typ}">\n`
    const pierwszy = wyslane.get(d.tekst!.trim())
    if (pierwszy) {
      czesci.push(`${naglowek}(treść taka sama jak w pliku „${pierwszy}”)\n</plik>`)
      continue
    }
    wyslane.set(d.tekst!.trim(), d.nazwa)
    const zostalo = limitZnakow - razem - naglowek.length - 10
    if (zostalo < 2000) { pominiete.push(d.nazwa); continue }
    let t = d.tekst!.trim()
    if (t.length > zostalo) { t = `${t.slice(0, zostalo)}\n[... dalsza część dokumentu pominięta - limit długości]`; uciete.push(d.nazwa) }
    czesci.push(`${naglowek}${t}\n</plik>`)
    razem += naglowek.length + t.length + 10
  }
  return { tekst: czesci.join('\n\n'), pominiete, uciete }
}

// --- Powiązania z innymi modułami --------------------------------------------------------------

/** Usługi z karty jako pozycje generatora zapytań do kooperantów. */
export function uslugiDoZapytan(k: KartaAnalizy): PozycjaZapytania[] {
  return k.uslugi.filter((u) => u.opis.trim()).map((u, i) => ({
    klucz: `a${i}`,
    opis: [u.opis.trim(), u.uwagi.trim()].filter(Boolean).join(' - '),
    ilosc: u.ilosc,
    jm: u.jm || (u.ilosc ? 'szt' : 'kpl'),
    masa_kg: null,
    kategoria: u.kategoria || 'inne',
    rodzaj: 'usluga',
    ma_cene: false,
    zrodlo: 'karta analizy',
  }))
}

/** Stan wypełnienia karty - do znaczników w nagłówku i na liście zapytań. */
export function postepKarty(k: KartaAnalizy) {
  const checklista = k.wymagania.filter((w) => CHECKLISTA.some((c) => c.kod === w.kod))
  return {
    sprawdzone: checklista.filter((w) => w.stan !== 'brak_informacji').length,
    razem: checklista.length,
    wymagane: k.wymagania.filter((w) => w.stan === 'wymagane').length,
    doWyjasnienia: k.wymagania.filter((w) => w.stan === 'do_wyjasnienia').length + k.pytania.filter((p) => !p.odpowiedz.trim()).length,
    niespojnosci: k.niespojnosci.length,
  }
}
