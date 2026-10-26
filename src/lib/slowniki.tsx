import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { komunikatPL } from './config'
import type {
  Gatunek, KategoriaMaterialu, KategoriaUslugi, KursWaluty, Mpk, RodzajStali, RodzajTabeli, StawkaRobocizny, Ustawienia,
} from './types'
import { nazwaWJezyku, t } from '@/i18n'

interface Slowniki {
  gotowe: boolean
  blad: string | null
  ustawienia: Ustawienia
  mpk: Mpk[]
  stawki: StawkaRobocizny[]
  rodzajeStali: RodzajStali[]
  gatunki: Gatunek[]
  kategorieMaterialow: KategoriaMaterialu[]
  kategorieUslug: KategoriaUslugi[]
  /** Rodzaje tabel do zaznaczania na rysunkach (wg rodzaju aparatu). */
  rodzajeTabel: RodzajTabeli[]
  /** Najnowszy kurs każdej waluty. */
  kursy: Record<string, KursWaluty>
  odswiez: () => Promise<void>
}

const PUSTE_USTAWIENIA = {
  narzut_zakupowy_proc: 5,
  narzut_kooperacja_proc: 0,
  wiek_ceny_ostrzezenie_mies: 6,
  waznosc_oferty_dostawcy_ryzyko_dni: 7,
  wspolczynnik_ilosci_materialu: 1.1,
  oferta_domyslne: { gwarancja_mies: 24, waznosc_dni: 30, platnosc: 'DH', vat_proc: 23 },
  firma: { nazwa: '', adres: '', krs: '', nip: '', regon: '', oddzialy: [], zarzad: [], email: '', telefon: '', www: '' },
  limity_planu: { baza_mb: 500, storage_mb: 1024, plik_mb: 50, ostrzezenie_proc: 80 },
  zapytania_dostawcow: {
    dw: '', dni_bez_odpowiedzi: 5, dni_na_odpowiedz: 5, powitanie: 'Dzień dobry,', wstep_material: 'Proszę o ofertę na materiał jak poniżej',
    wstep_usluga: 'Proszę o ofertę na usługę jak poniżej', zakonczenie: '', podpis: 'Z poważaniem', wymagania: [],
  },
} satisfies Ustawienia

const Kontekst = createContext<Slowniki | null>(null)

export function DostawcaSlownikow({ children }: { children: ReactNode }) {
  const [stan, setStan] = useState<Omit<Slowniki, 'odswiez'>>({
    gotowe: false, blad: null, ustawienia: PUSTE_USTAWIENIA, mpk: [], stawki: [], rodzajeStali: [],
    gatunki: [], kategorieMaterialow: [], kategorieUslug: [], rodzajeTabel: [], kursy: {},
  })

  const odswiez = useCallback(async () => {
    const [ust, mpk, stawki, rodzaje, gatunki, kmat, kusl, kursy, rtab] = await Promise.all([
      supabase.from('ustawienia').select('klucz, wartosc'),
      supabase.from('mpk').select('*').order('kod'),
      supabase.from('stawki_robocizny').select('*').order('kolejnosc').order('id'),
      supabase.from('rodzaje_stali').select('*').order('kod'),
      supabase.from('gatunki').select('*').order('grupa').order('kod'),
      supabase.from('kategorie_materialow').select('*').order('kolejnosc'),
      supabase.from('kategorie_uslug').select('*').order('kolejnosc'),
      supabase.from('kursy_walut').select('*').order('data', { ascending: false }).limit(20),
      supabase.from('rodzaje_tabel').select('*').eq('aktywny', true).order('kolejnosc'),
    ])
    const blad = [ust, mpk, stawki, rodzaje, gatunki, kmat, kusl, kursy, rtab].find((r) => r.error)?.error
    if (blad) {
      setStan((s) => ({ ...s, blad: komunikatPL(blad.message) }))
      return
    }
    const ustawienia = { ...PUSTE_USTAWIENIA } as Ustawienia
    for (const w of ust.data ?? []) ustawienia[w.klucz] = w.wartosc
    const najnowsze: Record<string, KursWaluty> = {}
    for (const k of (kursy.data ?? []) as KursWaluty[]) if (!najnowsze[k.waluta]) najnowsze[k.waluta] = k
    setStan({
      gotowe: true,
      blad: null,
      ustawienia,
      mpk: (mpk.data ?? []) as Mpk[],
      stawki: (stawki.data ?? []) as StawkaRobocizny[],
      rodzajeStali: wJezyku((rodzaje.data ?? []) as RodzajStali[]),
      gatunki: (gatunki.data ?? []) as Gatunek[],
      kategorieMaterialow: wJezyku((kmat.data ?? []) as KategoriaMaterialu[]),
      kategorieUslug: wJezyku((kusl.data ?? []) as KategoriaUslugi[]),
      rodzajeTabel: wJezyku((rtab.data ?? []) as RodzajTabeli[]),
      kursy: najnowsze,
    })
  }, [])

  useEffect(() => { void odswiez() }, [odswiez])

  const wartosc = useMemo(() => ({ ...stan, odswiez }), [stan, odswiez])
  return <Kontekst.Provider value={wartosc}>{children}</Kontekst.Provider>
}

/** Nazwy słowników w języku interfejsu: nazwa = nazwa_en (gdy jest) po angielsku; polska zostaje w nazwa_pl (eksporty). */
function wJezyku<T extends { nazwa: string; nazwa_en?: string | null }>(lista: T[]): (T & { nazwa_pl: string })[] {
  return lista.map((x) => ({ ...x, nazwa_pl: x.nazwa, nazwa: nazwaWJezyku(x) }))
}

export function useSlowniki() {
  const s = useContext(Kontekst)
  if (!s) throw new Error(t('useSlowniki poza DostawcaSlownikow'))
  return s
}

/** Normalizuje zapis gatunku do porównań: "a350 lf-2" i "A350LF2" to to samo. */
export function kluczGatunku(tekst: string) {
  return tekst.toUpperCase().replace(/[\s.\-_/]/g, '').replace(/^ASTM|^ASME/, '')
}

/**
 * Wpis słownika dla zapisu gatunku: dokładnie, a gdy go nie ma - najdłuższy kod będący początkiem zapisu
 * (rysunki dopisują gatunkowi odmianę i normę: "SA106GRB" -> SA106, "Fe37 B UNI 7070" -> Fe37).
 */
export function gatunekZeSlownika(gatunek: string, gatunki: Gatunek[]): Gatunek | null {
  const k = kluczGatunku(gatunek)
  const dokladny = gatunki.find((g) => kluczGatunku(g.kod) === k || kluczGatunku(g.grupa) === k)
  if (dokladny || k.length < 4) return dokladny ?? null
  return gatunki
    .filter((g) => kluczGatunku(g.kod).length >= 4 && k.startsWith(kluczGatunku(g.kod)))
    .sort((a, b) => kluczGatunku(b.kod).length - kluczGatunku(a.kod).length)[0] ?? null
}

/** Gatunki równoważne (ta sama grupa w słowniku). Nieznany gatunek = tylko on sam. */
export function rownowazniki(gatunek: string, gatunki: Gatunek[]): string[] {
  const trafiony = gatunekZeSlownika(gatunek, gatunki)
  if (!trafiony) return [gatunek]
  return gatunki.filter((g) => g.grupa === trafiony.grupa).map((g) => g.kod)
}

/** Rodzaj stali gatunku (słownik, potem oznaczenie: 1.4xxx / 3xx / A2-A4 - nierdzewna, S/P/Fe/St/SA/A + liczba - węglowa); nieznany - null. */
export function rodzajGatunku(gatunek: string | null | undefined, gatunki: Gatunek[]): string | null {
  const zapis = (gatunek ?? '').split('/')[0].trim()
  if (!zapis) return null
  const g = gatunekZeSlownika(zapis, gatunki)
  if (g) return g.rodzaj_stali
  const k = kluczGatunku(zapis)
  if (/^14\d{3}|^(SA|A)?3[0-2]\d|^A[24](\d\d)?$/.test(k)) return 'nierdzewna'
  if (/^(S|P)\d{3}|^S?A\d{3}|^FE\d|^ST\d|^10\d{3}/.test(k)) return 'weglowa'
  return null
}

/** Gęstość [kg/dm³] gatunku ze słownika; nieznany gatunek - stal węglowa albo nierdzewna z nazwy. */
export function gestoscGatunku(gatunek: string | null | undefined, gatunki: Gatunek[], rodzaje: RodzajStali[]): number {
  const domyslna = (kod: string) => rodzaje.find((r) => r.kod === kod)?.gestosc ?? (kod === 'nierdzewna' ? 7.93 : 7.85)
  if (!gatunek) return domyslna('weglowa')
  const k = kluczGatunku(gatunek)
  const g = gatunki.find((x) => kluczGatunku(x.kod) === k || kluczGatunku(x.grupa) === k)
  if (g) return domyslna(g.rodzaj_stali)
  // 1.4xxx i 3xx (304, 316L, 321) to nierdzewne.
  return /^1\.4\d{3}|^(30|31|32)\d/.test(gatunek.trim().replace(/^(SA|A)/i, '')) ? domyslna('nierdzewna') : domyslna('weglowa')
}
