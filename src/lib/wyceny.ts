// Wycena w przeglądarce: wczytanie wersji, zapis, parametry obliczeń.
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { komunikatPL } from './config'
import { gestoscGatunku } from './slowniki'
import type { AparatKalk, ParametryKalk, PozycjaKalk, WynikWyceny } from './kalkulacja'
import type { Gatunek, KategoriaMaterialu, RodzajStali } from './types'
import type { RodzajAparatu, ZakresWymiennika } from './zapytania'
import { t } from '@/i18n'

export type StatusWyceny = 'robocza' | 'do_zatwierdzenia' | 'zwrocona' | 'zatwierdzona'

export const ETYKIETY_STATUSU_WYCENY: Record<StatusWyceny, string> = {
  robocza: t('robocza'), do_zatwierdzenia: t('do zatwierdzenia'), zwrocona: t('zwrócona do poprawy'), zatwierdzona: t('zatwierdzona'),
}
export const KOLORY_STATUSU_WYCENY: Record<StatusWyceny, string> = {
  robocza: 'bg-slate-100 text-slate-700 ring-slate-300',
  do_zatwierdzenia: 'bg-blekit-jasny text-blekit-ciemny ring-blekit',
  zwrocona: 'bg-amber-50 text-amber-800 ring-amber-400',
  zatwierdzona: 'bg-limonka-jasna text-limonka-ciemna ring-limonka',
}

export interface Wycena {
  id: string
  zapytanie_id: string
  wersja: number
  nazwa: string | null
  status: StatusWyceny
  narzut_zakupowy_proc: number
  narzut_kooperacja_proc: number
  kurs_eur: number | null
  kurs_eur_data: string | null
  kurs_eur_zrodlo: string | null
  termin_realizacji_tyg: number | null
  montaz_tyg: number | null
  uwagi: string | null
  komentarz_prezesa: string | null
  oferta: Record<string, unknown>
  podsumowanie: Record<string, unknown> | null
  skopiowana_z: string | null
  utworzono: string
  zmodyfikowano: string
  zatwierdzono: string | null
}

export interface Marze {
  wycena_id: string
  narzut_zysk_proc: number
  zaokraglenie: number
  korekta_prezesa_kwota: number
  korekta_prezesa_proc: number
  koszt_calkowity: number | null
  cena: number | null
  cena_koncowa: number | null
  cena_bez_opcji: number | null
}

export interface PozycjaWyceny extends PozycjaKalk {
  id?: number
  klucz: string
  lp: number
  rodzaj?: string | null
  dn?: string | null
  pn?: string | null
  klasa?: string | null
  sch?: string | null
  mpk?: string | null
  stawka_id?: number | null
  zrodlo_opis?: string | null
  zrodlo_dostawca?: string | null
  zrodlo_id?: string | null
  uwagi?: string | null
  pewnosc?: number | null
}

export interface Aparat extends Omit<AparatKalk, 'pozycje'> {
  id?: string
  klucz: string
  lp: number
  typ: string | null
  tema: string | null
  srednica_mm: number | null
  wysokosc_mm: number | null
  dlugosc_mm: number | null
  szerokosc_mm: number | null
  material_wiodacy: string | null
  uwagi: string | null
  pozycje: PozycjaWyceny[]
}

export interface StanWyceny {
  wycena: Wycena
  marze: Marze | null
  aparaty: Aparat[]
  zapytanie: { id: string; numer: string; przedmiot: string; klient: string | null; rodzaj_aparatu: RodzajAparatu | null; zakres_wymiennika: ZakresWymiennika | null; zakres_opis: string | null }
}

let licznik = 0
export const klucz = () => `k${Date.now().toString(36)}${++licznik}`

export function nowyAparat(lp: number, nazwa = `Aparat ${lp}`): Aparat {
  return {
    klucz: klucz(), lp, nazwa, typ: null, tema: null, ilosc: 1, masa_netto_kg: null, srednica_mm: null, wysokosc_mm: null,
    dlugosc_mm: null, szerokosc_mm: null, material_wiodacy: null, metoda_robocizny: 'wskaznikowa', wskaznik_rbh_t: null,
    stawka_wskaznikowa: null, liczba_osob: 8, naddatki: {}, uwagi: null, pozycje: [],
  }
}

/** Typy aparatów z dawnych wycen - nowe aparaty dziedziczą typ z rodzaju zapytania (zbiornik / wymiennik ciepła). */
export const TYPY_APARATOW = [
  'zbiornik pionowy', 'zbiornik poziomy', 'wymiennik płaszczowo-rurowy', 'wkład rurowy', 'reaktor', 'separator', 'kolumna', 'inne',
]

const liczbowe = ['d_zew', 'd_wew', 'grubosc', 'szerokosc', 'dlugosc', 'ilosc', 'masa_jedn', 'cena_jedn', 'wartosc_reczna', 'pewnosc'] as const

export async function wczytajWycene(id: string, db: SupabaseClient = supabase): Promise<StanWyceny> {
  const { data: w, error } = await db.from('wyceny').select('*, zapytania(id, numer, przedmiot, rodzaj_aparatu, zakres_wymiennika, zakres_opis, klienci(nazwa))').eq('id', id).single()
  if (error || !w) throw new Error(komunikatPL(error?.message ?? 'Nie znaleziono wyceny.'))
  const [{ data: m }, { data: ap }] = await Promise.all([
    db.from('wyceny_marze').select('*').eq('wycena_id', id).maybeSingle(),
    db.from('aparaty').select('*, pozycje_wyceny(*)').eq('wycena_id', id).order('lp'),
  ])
  const zap = (w as unknown as { zapytania: { id: string; numer: string; przedmiot: string; rodzaj_aparatu: RodzajAparatu | null; zakres_wymiennika: ZakresWymiennika | null; zakres_opis: string | null; klienci: { nazwa: string } | null } }).zapytania
  return {
    wycena: w as unknown as Wycena,
    marze: (m as Marze | null) ?? null,
    zapytanie: { id: zap.id, numer: zap.numer, przedmiot: zap.przedmiot, klient: zap.klienci?.nazwa ?? null, rodzaj_aparatu: zap.rodzaj_aparatu, zakres_wymiennika: zap.zakres_wymiennika, zakres_opis: zap.zakres_opis },
    aparaty: ((ap ?? []) as (Aparat & { pozycje_wyceny: PozycjaWyceny[] })[]).map(({ pozycje_wyceny, ...a }) => ({
      ...a, klucz: klucz(),
      ilosc: Number(a.ilosc), masa_netto_kg: a.masa_netto_kg === null ? null : Number(a.masa_netto_kg),
      pozycje: [...pozycje_wyceny].sort((x, y) => x.lp - y.lp || (x.id ?? 0) - (y.id ?? 0)).map((p) => {
        const z: PozycjaWyceny = { ...p, klucz: klucz() }
        for (const k of liczbowe) if (z[k] !== null && z[k] !== undefined) (z as unknown as Record<string, number>)[k] = Number(z[k])
        return z
      }),
    })),
  }
}

/** Zapis całej wersji (nagłówek, marże, aparaty, pozycje). Zwraca nowe zmodyfikowano. */
export async function zapiszWycene(s: StanWyceny, widziMarze: boolean, db: SupabaseClient = supabase): Promise<void> {
  const w = s.wycena
  const { data: biezaca } = await db.from('wyceny').select('zmodyfikowano, status').eq('id', w.id).single()
  if (biezaca && biezaca.zmodyfikowano > w.zmodyfikowano) {
    throw new Error(t('Ktoś inny zapisał tę wycenę w międzyczasie. Odśwież stronę - Twoje zmiany trzeba będzie wprowadzić ponownie.'))
  }
  const { error: e1 } = await db.from('wyceny').update({
    nazwa: w.nazwa, narzut_zakupowy_proc: w.narzut_zakupowy_proc, narzut_kooperacja_proc: w.narzut_kooperacja_proc,
    kurs_eur: w.kurs_eur, kurs_eur_data: w.kurs_eur_data, kurs_eur_zrodlo: w.kurs_eur_zrodlo,
    termin_realizacji_tyg: w.termin_realizacji_tyg, montaz_tyg: w.montaz_tyg, uwagi: w.uwagi, oferta: w.oferta,
  }).eq('id', w.id)
  if (e1) throw new Error(komunikatPL(e1.message))

  if (widziMarze && s.marze) {
    const m = s.marze
    const { error } = await db.from('wyceny_marze').update({
      narzut_zysk_proc: m.narzut_zysk_proc, zaokraglenie: m.zaokraglenie,
      korekta_prezesa_kwota: m.korekta_prezesa_kwota, korekta_prezesa_proc: m.korekta_prezesa_proc,
    }).eq('wycena_id', w.id)
    if (error) throw new Error(komunikatPL(error.message))
  }

  const { data: istniejace } = await db.from('aparaty').select('id').eq('wycena_id', w.id)
  const zostaja = new Set(s.aparaty.map((a) => a.id).filter(Boolean))
  for (const a of istniejace ?? []) {
    if (!zostaja.has(a.id)) {
      const { error } = await db.from('aparaty').delete().eq('id', a.id)
      if (error) throw new Error(komunikatPL(error.message))
    }
  }
  for (const [i, a] of s.aparaty.entries()) {
    const dane = {
      wycena_id: w.id, lp: i + 1, nazwa: a.nazwa, typ: a.typ, tema: a.tema, ilosc: a.ilosc, masa_netto_kg: a.masa_netto_kg,
      srednica_mm: a.srednica_mm, wysokosc_mm: a.wysokosc_mm, dlugosc_mm: a.dlugosc_mm, szerokosc_mm: a.szerokosc_mm,
      material_wiodacy: a.material_wiodacy, metoda_robocizny: a.metoda_robocizny, wskaznik_rbh_t: a.wskaznik_rbh_t,
      stawka_wskaznikowa: a.stawka_wskaznikowa, liczba_osob: a.liczba_osob, naddatki: a.naddatki, uwagi: a.uwagi,
    }
    if (a.id) {
      const { error } = await db.from('aparaty').update(dane).eq('id', a.id)
      if (error) throw new Error(komunikatPL(error.message))
    } else {
      const { data, error } = await db.from('aparaty').insert(dane).select('id').single()
      if (error) throw new Error(komunikatPL(error.message))
      a.id = data.id as string
    }
    const pozycje = a.pozycje.map((p, j) => {
      const { klucz: _k, ...reszta } = p
      void _k
      return { ...reszta, lp: j + 1, dodatkowe: p.dodatkowe ?? {} }
    })
    const { error } = await db.rpc('zapisz_pozycje_aparatu_sprawdzone', { p_aparat: a.id, p_pozycje: pozycje })
    if (error) throw new Error(komunikatPL(error.message))
  }
}

export interface SlownikiKalk {
  kategorieMaterialow: KategoriaMaterialu[]
  gatunki: Gatunek[]
  rodzajeStali: RodzajStali[]
}

export function parametry(w: Wycena, m: Marze | null, s: SlownikiKalk): ParametryKalk {
  return {
    narzut_zakupowy_proc: Number(w.narzut_zakupowy_proc),
    narzut_kooperacja_proc: Number(w.narzut_kooperacja_proc),
    narzut_zysk_proc: m ? Number(m.narzut_zysk_proc) : null,
    zaokraglenie: m ? Number(m.zaokraglenie) : null,
    korekta_prezesa_kwota: m ? Number(m.korekta_prezesa_kwota) : null,
    korekta_prezesa_proc: m ? Number(m.korekta_prezesa_proc) : null,
    kurs_eur: w.kurs_eur ? Number(w.kurs_eur) : null,
    sposobMasy: (sekcja) => s.kategorieMaterialow.find((k) => k.kod === sekcja)?.sposob_masy ?? 'brak',
    gestosc: (g) => gestoscGatunku(g?.split('/')[0], s.gatunki, s.rodzajeStali),
    naddatekDomyslny: (sekcja) => Number(s.kategorieMaterialow.find((k) => k.kod === sekcja)?.naddatek_proc ?? 0),
  }
}

/** Podsumowanie kosztów (bez marż) do zapisania przy złożeniu / zatwierdzeniu. */
export function podsumowanieKosztow(wynik: WynikWyceny) {
  return {
    robocizna: wynik.robocizna.koszt, materialy: wynik.materialy.koszt, kooperacja: wynik.kooperacja.koszt,
    badania: wynik.badania.koszt, koszty: wynik.koszty.koszt, masa_kg: wynik.masa_kg,
    aparaty: wynik.aparaty.map((a) => ({ nazwa: a.nazwa, ilosc: a.ilosc, koszt_szt: a.koszt_szt, masa_netto_kg: a.masa_netto_kg, rbh: a.robocizna.rbh, rbh_na_t: a.robocizna.rbh_na_t })),
  }
}
