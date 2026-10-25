// Formularz oferty dostawcy: przejście z wyniku AI do formularza, ceny znormalizowane, zapis.
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { komunikatPL } from './config'
import { gestoscGatunku } from './slowniki'
import { normalizujCene, uzupelnijMase } from './normalizacjaOfert'
import type { OfertaAi, WymaganiaOferty } from './ai'
import type { Gatunek, KategoriaMaterialu, RodzajStali } from './types'
import { t } from '@/i18n'

export interface Doplata { opis: string; kwota: number; za: 'oferta' | 'szt' | 'm' | 'kg' }

export interface PozycjaFormularza {
  klucz: string
  id?: number
  lp: number
  kategoria_materialu: string | null
  kategoria_uslugi: string | null
  opis: string
  gatunek: string | null
  norma: string | null
  d_zew: number | null; d_wew: number | null; grubosc: number | null; szerokosc: number | null; dlugosc: number | null
  dn: string | null; pn: string | null; klasa: string | null; sch: string | null
  ilosc: number
  jm: string
  cena_jedn: number
  wartosc: number | null
  masa_jedn: number | null
  masa_calk: number | null
  wielkosc_odniesienia: number | null
  jednostka_odniesienia: string | null
  termin_dni: number | null
  uwagi: string | null
  pewnosc: number | null
}

export interface FormularzOferty {
  id?: string
  dostawca_id: string | null
  dostawca_nowy: { nazwa: string; nip: string; osoba: string; email: string; telefon: string } | null
  zapytanie_id: string | null
  nr_zo: string
  numer_oferty: string
  data_oferty: string
  waluta: string
  kurs: number
  kurs_data: string | null
  kurs_zrodlo: string | null
  warunki_dostawy: string
  miejsce_dostawy: string
  platnosc: string
  waznosc_do: string
  waznosc_opis: string
  termin_realizacji: string
  termin_dni: number | null
  doplaty: Doplata[]
  wymagania: Partial<WymaganiaOferty>
  zrodlo: 'mail' | 'pdf' | 'skan' | 'reczne' | 'skrzynka'
  czy_zakupiono: boolean
  uwagi: string
  ekstrakcja_ai: unknown
  dokument_id: string | null
  pozycje: PozycjaFormularza[]
}

let licznik = 0
export const nowyKlucz = () => `p${Date.now().toString(36)}${++licznik}`

export function pustaPozycja(lp: number): PozycjaFormularza {
  return {
    klucz: nowyKlucz(), lp, kategoria_materialu: null, kategoria_uslugi: null, opis: '', gatunek: null, norma: null,
    d_zew: null, d_wew: null, grubosc: null, szerokosc: null, dlugosc: null, dn: null, pn: null, klasa: null, sch: null,
    ilosc: 1, jm: 'szt', cena_jedn: 0, wartosc: null, masa_jedn: null, masa_calk: null, wielkosc_odniesienia: null,
    jednostka_odniesienia: null, termin_dni: null, uwagi: null, pewnosc: null,
  }
}

export function pustyFormularz(): FormularzOferty {
  return {
    dostawca_id: null, dostawca_nowy: null, zapytanie_id: null, nr_zo: '', numer_oferty: '',
    data_oferty: new Date().toISOString().slice(0, 10), waluta: 'PLN', kurs: 1, kurs_data: null, kurs_zrodlo: null,
    warunki_dostawy: '', miejsce_dostawy: '', platnosc: '', waznosc_do: '', waznosc_opis: '', termin_realizacji: '',
    termin_dni: null, doplaty: [], wymagania: {}, zrodlo: 'reczne', czy_zakupiono: false, uwagi: '', ekstrakcja_ai: null,
    dokument_id: null, pozycje: [pustaPozycja(1)],
  }
}

const normalizujNazweFirmy = (n: string) => n.toLowerCase().replace(/sp\.?\s*z\s*o\.?\s*o\.?|s\.a\.|spółka.*$|sp\.\s*k\.?|[^a-ząćęłńóśźż0-9]/gi, '')

/** Dopasowanie dostawcy po nazwie albo aliasie (różne zapisy: "ACME-STAL S.A." / "Acme-Stal"). */
export function znajdzDostawce(nazwa: string | null, dostawcy: { id: string; nazwa: string; aliasy: string[] }[]) {
  if (!nazwa) return null
  const k = normalizujNazweFirmy(nazwa)
  if (!k) return null
  return dostawcy.find((d) => [d.nazwa, ...d.aliasy].some((n) => {
    const kn = normalizujNazweFirmy(n)
    return kn && (kn === k || kn.includes(k) || k.includes(kn))
  })) ?? null
}

export function formularzZAi(ai: OfertaAi, dostawcy: { id: string; nazwa: string; aliasy: string[] }[], zrodlo: FormularzOferty['zrodlo']): FormularzOferty {
  const dop = znajdzDostawce(ai.dostawca.nazwa, dostawcy)
  return {
    ...pustyFormularz(),
    dostawca_id: dop?.id ?? null,
    dostawca_nowy: dop ? null : { nazwa: ai.dostawca.nazwa ?? '', nip: ai.dostawca.nip ?? '', osoba: ai.dostawca.osoba ?? '', email: ai.dostawca.email ?? '', telefon: ai.dostawca.telefon ?? '' },
    nr_zo: ai.oferta.nr_zo ?? '',
    numer_oferty: ai.oferta.numer_oferty ?? '',
    data_oferty: ai.oferta.data_oferty ?? new Date().toISOString().slice(0, 10),
    waluta: (ai.oferta.waluta || 'PLN').toUpperCase(),
    warunki_dostawy: ai.oferta.warunki_dostawy ?? '',
    miejsce_dostawy: ai.oferta.miejsce_dostawy ?? '',
    platnosc: ai.oferta.platnosc ?? '',
    waznosc_do: ai.oferta.waznosc_do ?? '',
    waznosc_opis: ai.oferta.waznosc_opis ?? '',
    termin_realizacji: ai.oferta.termin_realizacji ?? '',
    termin_dni: ai.oferta.termin_dni,
    doplaty: ai.oferta.doplaty ?? [],
    wymagania: ai.oferta.wymagania ?? {},
    uwagi: [ai.oferta.uwagi, ai.uwagi_ekstrakcji].filter(Boolean).join('\n'),
    zrodlo,
    ekstrakcja_ai: ai,
    pozycje: ai.pozycje.length
      ? ai.pozycje.map((p, i) => ({
        klucz: nowyKlucz(), lp: p.lp || i + 1,
        kategoria_materialu: p.rodzaj === 'material' ? p.kategoria_materialu : null,
        kategoria_uslugi: p.rodzaj === 'usluga' ? p.kategoria_uslugi : null,
        opis: p.opis, gatunek: p.gatunek, norma: p.norma,
        d_zew: p.d_zew, d_wew: p.d_wew, grubosc: p.grubosc, szerokosc: p.szerokosc, dlugosc: p.dlugosc,
        dn: p.dn, pn: p.pn, klasa: p.klasa, sch: p.sch,
        ilosc: p.ilosc, jm: p.jm, cena_jedn: p.cena_jedn, wartosc: p.wartosc,
        masa_jedn: p.masa_jedn, masa_calk: p.masa_calk,
        wielkosc_odniesienia: p.wielkosc_odniesienia, jednostka_odniesienia: p.jednostka_odniesienia,
        termin_dni: p.termin_dni, uwagi: p.uwagi, pewnosc: p.pewnosc,
      }))
      : [pustaPozycja(1)],
  }
}

export interface Slowniki {
  kategorieMaterialow: KategoriaMaterialu[]
  gatunki: Gatunek[]
  rodzajeStali: RodzajStali[]
}

/** Masa (z wymiarów, gdy brak) i ceny PLN pozycji - to samo liczy podgląd formularza i zapis. */
export function przeliczPozycje(p: PozycjaFormularza, kurs: number, s: Slowniki) {
  const kat = s.kategorieMaterialow.find((k) => k.kod === p.kategoria_materialu)
  const masa = p.kategoria_materialu
    ? uzupelnijMase(p, kat?.sposob_masy ?? 'brak', gestoscGatunku(p.gatunek?.split('/')[0], s.gatunki, s.rodzajeStali))
    : { masa_jedn: p.masa_jedn, masa_calk: p.masa_calk, wyliczona: false }
  const ceny = normalizujCene({ ...p, masa_jedn: masa.masa_jedn, masa_calk: masa.masa_calk }, kurs)
  return { masa, ceny }
}

export async function kursNaDzien(waluta: string, data: string, db: SupabaseClient = supabase): Promise<{ kurs: number; data: string; tabela: string | null } | null> {
  if (waluta === 'PLN') return { kurs: 1, data, tabela: null }
  const czytaj = async () => {
    const { data: wynik } = await db.rpc('kurs_na_dzien', { p_waluta: waluta, p_data: data })
    const w = (wynik as { kurs: number; data: string; tabela: string | null }[] | null)?.[0]
    return w ? { kurs: Number(w.kurs), data: w.data, tabela: w.tabela } : null
  }
  const w = await czytaj()
  if (Number.isNaN(Date.parse(data))) return w
  // W bazie są kursy z ostatnich dni (cron). Dla starszej daty (np. oferta sprzed miesięcy) funkcja dociąga z NBP
  // kursy z tamtego okresu - inaczej kursem byłby ostatni zapisany przed datą, sprzed nawet roku.
  // W dzień roboczy kurs ma być z tego dnia; w weekend - ostatni opublikowany przed nim (piątkowy).
  const tydzienWczesniej = new Date(Date.parse(data) - 7 * 86_400_000).toISOString().slice(0, 10)
  const weekend = [0, 6].includes(new Date(`${data}T12:00:00Z`).getUTCDay())
  if (w && (w.data === data || (weekend && w.data >= tydzienWczesniej))) return w
  const { error } = await db.functions.invoke('kursy-walut', { body: { data } })
  return error ? w : czytaj()
}

/** Zapis (nowej albo poprawionej) oferty z pozycjami. Zwraca id oferty. */
export async function zapiszOferte(f: FormularzOferty, s: Slowniki, status: 'zatwierdzona' | 'do_przejrzenia', db: SupabaseClient = supabase): Promise<string> {
  let dostawcaId = f.dostawca_id
  if (!dostawcaId) {
    const nowy = f.dostawca_nowy
    if (!nowy?.nazwa.trim()) throw new Error(t('Wybierz dostawcę z listy albo wpisz nazwę nowego.'))
    const kontakty = nowy.osoba || nowy.email || nowy.telefon ? [{ osoba: nowy.osoba, email: nowy.email, telefon: nowy.telefon }] : []
    const kategorie = [...new Set(f.pozycje.map((p) => p.kategoria_materialu ?? p.kategoria_uslugi).filter(Boolean))] as string[]
    const { data, error } = await db.from('dostawcy')
      .insert({ nazwa: nowy.nazwa.trim(), nip: nowy.nip || null, kontakty, kategorie }).select('id').single()
    if (error) throw new Error(komunikatPL(error.message))
    dostawcaId = data.id
  }

  let zapytanieId = f.zapytanie_id
  if (!zapytanieId && f.nr_zo.trim()) {
    const { data } = await db.rpc('znajdz_zapytanie_po_tekscie', { p_tekst: f.nr_zo })
    zapytanieId = (data as string | null) ?? null
  }

  const naglowek = {
    dostawca_id: dostawcaId, zapytanie_id: zapytanieId, nr_zo: f.nr_zo || null,
    numer_oferty: f.numer_oferty || null, data_oferty: f.data_oferty || null,
    waluta: f.waluta, kurs: f.kurs, kurs_data: f.kurs_data, kurs_zrodlo: f.kurs_zrodlo,
    warunki_dostawy: f.warunki_dostawy || null, miejsce_dostawy: f.miejsce_dostawy || null, platnosc: f.platnosc || null,
    waznosc_do: f.waznosc_do || null, waznosc_opis: f.waznosc_opis || null,
    termin_realizacji: f.termin_realizacji || null, termin_dni: f.termin_dni,
    doplaty: f.doplaty, wymagania: f.wymagania, zrodlo: f.zrodlo, status, czy_zakupiono: f.czy_zakupiono,
    uwagi: f.uwagi || null, dokument_id: f.dokument_id,
    ...(f.ekstrakcja_ai ? { ekstrakcja_ai: f.ekstrakcja_ai } : {}),
  }

  let ofertaId = f.id
  if (ofertaId) {
    const { error } = await db.from('oferty_dostawcow').update(naglowek).eq('id', ofertaId)
    if (error) throw new Error(komunikatPL(error.message))
    await db.from('pozycje_ofert').delete().eq('oferta_id', ofertaId)
  } else {
    const { data: u } = await db.auth.getUser().catch(() => ({ data: { user: null } }))
    const { data, error } = await db.from('oferty_dostawcow')
      .insert({ ...naglowek, zatwierdzil: status === 'zatwierdzona' ? u.user?.id : null }).select('id').single()
    if (error) throw new Error(komunikatPL(error.message))
    ofertaId = data.id as string
  }

  const pozycje = f.pozycje.filter((p) => p.opis.trim()).map((p, i) => {
    const { masa, ceny } = przeliczPozycje(p, f.kurs, s)
    return {
      oferta_id: ofertaId, lp: p.lp || i + 1,
      kategoria_materialu: p.kategoria_materialu, kategoria_uslugi: p.kategoria_uslugi,
      opis: p.opis.trim(), gatunek: p.gatunek, norma: p.norma,
      d_zew: p.d_zew, d_wew: p.d_wew, grubosc: p.grubosc, szerokosc: p.szerokosc, dlugosc: p.dlugosc,
      dn: p.dn, pn: p.pn, klasa: p.klasa, sch: p.sch,
      ilosc: p.ilosc, jm: p.jm, cena_jedn: p.cena_jedn, wartosc: p.wartosc ?? p.ilosc * p.cena_jedn,
      masa_jedn: masa.masa_jedn, masa_calk: masa.masa_calk, masa_wyliczona: masa.wyliczona,
      wielkosc_odniesienia: p.wielkosc_odniesienia, jednostka_odniesienia: p.jednostka_odniesienia,
      cena_pln_jedn: ceny.cena_pln_jedn, cena_pln_kg: ceny.cena_pln_kg, cena_pln_m: ceny.cena_pln_m,
      cena_pln_szt: ceny.cena_pln_szt, cena_pln_odniesienia: ceny.cena_pln_odniesienia,
      wymagania: f.wymagania, termin_dni: p.termin_dni ?? f.termin_dni, uwagi: p.uwagi,
    }
  })
  if (pozycje.length) {
    const { error } = await db.from('pozycje_ofert').insert(pozycje)
    if (error) throw new Error(komunikatPL(error.message))
  }
  if (f.dokument_id) await db.from('dokumenty').update({ oferta_id: ofertaId }).eq('id', f.dokument_id)
  return ofertaId
}
