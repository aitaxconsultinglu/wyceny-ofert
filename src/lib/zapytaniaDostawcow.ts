// Generator zapytań do dostawców i kooperantów (bez AI): pozycje z wyceny albo z odczytu rysunku,
// grupowanie według kategorii, treść wzorowana na zapytaniach działu handlowego, mailto: i status
// odpowiedzi. Część czysta - testy w repo na danych fikcyjnych.
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { komunikatPL } from './config'
import { dataPL, liczba } from './format'
import type { WynikRysunku } from './rysunki'
import type { StanWyceny } from './wyceny'
import type { UstawieniaZapytan, WymaganieZapytania } from './types'
import { t } from '@/i18n'

export type RodzajZapytania = 'material' | 'usluga'

export interface PozycjaZapytania {
  /** Klucz do zaznaczania w siatce (źródło + indeks). */
  klucz: string
  opis: string
  ilosc: number | null
  jm: string
  masa_kg: number | null
  kategoria: string
  rodzaj: RodzajZapytania
  /** Pozycja ma już cenę z oferty / zakupu - zwykle nie trzeba o nią pytać. */
  ma_cene: boolean
  zrodlo: string
}

const czysc = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** "Kołnierz DN100 PN16" + gatunek + norma bez powtórzeń (gatunek bywa już w nazwie). */
export function opisPozycji(p: { nazwa: string; gatunek?: string | null; norma?: string | null; wymiary?: string | null }) {
  const czesci = [czysc(p.nazwa)]
  const zawiera = (s: string) => czesci.join(' ').toUpperCase().replace(/[\s.-]/g, '').includes(s.toUpperCase().replace(/[\s.-]/g, ''))
  for (const d of [p.wymiary, p.gatunek, p.norma]) {
    const t = czysc(d)
    if (t && !zawiera(t)) czesci.push(t)
  }
  return czesci.filter(Boolean).join(' ')
}

/**
 * Materiały i kooperacja z wyceny. Ilość = ilość na 1 szt. aparatu × liczba aparatów
 * (o tyle pytamy dostawcę). Pozycje z dwóch aparatów zostają osobno - różne wymiary i przeznaczenie.
 */
export function pozycjeZWyceny(stan: StanWyceny): PozycjaZapytania[] {
  return stan.aparaty.flatMap((a, ia) => a.pozycje
    .filter((p) => (p.zakladka === 'materialy' || p.zakladka === 'kooperacja') && czysc(p.nazwa))
    .map((p, ip): PozycjaZapytania => {
      const ilosc = Number(p.ilosc) * Number(a.ilosc || 1)
      const masaJedn = p.masa_jedn ?? null
      return {
        klucz: `w${ia}-${ip}`,
        opis: opisPozycji({ nazwa: p.nazwa, gatunek: p.gatunek, norma: null }),
        ilosc: ilosc || null,
        jm: p.jm || 'szt',
        masa_kg: masaJedn !== null && ilosc ? Number(masaJedn) * ilosc : null,
        kategoria: p.sekcja || 'inne',
        rodzaj: p.zakladka === 'kooperacja' ? 'usluga' : 'material',
        ma_cene: p.zrodlo_ceny === 'oferta' || p.zrodlo_ceny === 'zakup',
        zrodlo: stan.aparaty.length > 1 ? a.nazwa : '',
      }
    }))
}

export function pozycjeZOdczytu(w: WynikRysunku): PozycjaZapytania[] {
  return w.pozycje.filter((p) => czysc(p.nazwa)).map((p, i) => ({
    klucz: `r${i}`,
    opis: opisPozycji({ nazwa: p.nazwa, gatunek: p.material?.replace(/\s*\(\?\)/, ''), norma: p.norma, wymiary: p.wymiary }),
    ilosc: p.ilosc,
    jm: p.jm || 'szt',
    masa_kg: p.masa_calk ?? (p.masa_jedn !== null && p.ilosc !== null ? p.masa_jedn * p.ilosc : null),
    kategoria: p.sekcja || 'inne',
    rodzaj: 'material',
    ma_cene: false,
    zrodlo: p.poz ? `poz. ${p.poz}` : '',
  }))
}

/** Grupy {kategoria, rodzaj} w kolejności pierwszego wystąpienia. */
export function grupujWgKategorii(pozycje: PozycjaZapytania[]) {
  const m = new Map<string, { kategoria: string; rodzaj: RodzajZapytania; pozycje: PozycjaZapytania[] }>()
  for (const p of pozycje) {
    const k = `${p.rodzaj}:${p.kategoria}`
    if (!m.has(k)) m.set(k, { kategoria: p.kategoria, rodzaj: p.rodzaj, pozycje: [] })
    m.get(k)!.pozycje.push(p)
  }
  return [...m.values()]
}

/** Wymagania z biblioteki zaznaczone domyślnie dla kategorii. */
export function wymaganiaDomyslne(kategoria: string, rodzaj: RodzajZapytania, biblioteka: WymaganieZapytania[]): string[] {
  return biblioteka.filter((w) => w.kategorie.includes(kategoria) || w.kategorie.includes(`*${rodzaj}`)).map((w) => w.kod)
}

/** Temat jak w dotychczasowych zapytaniach: "ZO/123/2026 – Odkuwki". Numer ZO pozwala przypisać odpowiedź. */
export const tematZapytania = (numerZO: string, nazwaKategorii: string) => `${numerZO} – ${nazwaKategorii}`

export function liniaPozycji(p: Pick<PozycjaZapytania, 'opis' | 'ilosc' | 'jm' | 'masa_kg' | 'rodzaj'>) {
  const ilosc = p.ilosc !== null && !(p.rodzaj === 'usluga' && p.jm === 'kpl' && p.ilosc === 1) ? ` – ${liczba(p.ilosc)} ${p.jm}` : ''
  const masa = p.masa_kg && p.rodzaj === 'material' ? ` (ok. ${liczba(p.masa_kg, p.masa_kg < 10 ? 1 : 0)} kg)` : ''
  return `${p.opis}${ilosc}${masa}`
}

export interface DaneTresci {
  numerZO: string
  rodzaj: RodzajZapytania
  pozycje: Pick<PozycjaZapytania, 'opis' | 'ilosc' | 'jm' | 'masa_kg' | 'rodzaj'>[]
  wymagania: string[]
  terminOdpowiedzi: string | null
  /** Dodatkowe uwagi wpisane przy tym zapytaniu (np. rysunek w załączniku). */
  uwagi: string
}

/** Treść zapytania: powitanie, wstęp z wymaganiami "w nagłówku", pozycje, numerowane uwagi, termin, podpis. */
export function trescZapytania(d: DaneTresci, u: UstawieniaZapytan): string {
  const wybrane = u.wymagania.filter((w) => d.wymagania.includes(w.kod))
  const naglowek = wybrane.filter((w) => w.w_naglowku).map((w) => w.tekst.trim())
  const uwagi = [...wybrane.filter((w) => !w.w_naglowku).map((w) => w.tekst.trim()), ...d.uwagi.split('\n').map(czysc).filter(Boolean)]
  const wstep = (d.rodzaj === 'usluga' ? u.wstep_usluga : u.wstep_material).trim()
  const linie: string[] = []
  if (u.powitanie.trim()) linie.push(u.powitanie.trim(), '')
  linie.push(`${wstep}${naglowek.length ? ` ${naglowek.join(', ')}` : ''}:`, '')
  for (const p of d.pozycje) linie.push(liniaPozycji(p))
  if (uwagi.length) {
    linie.push('', 'Uwagi:')
    uwagi.forEach((t, i) => linie.push(`${i + 1}. ${t}`))
  }
  linie.push('')
  if (d.terminOdpowiedzi) linie.push(`Ofertę prosimy przesłać do ${dataPL(d.terminOdpowiedzi)}.`)
  linie.push(`W odpowiedzi prosimy zachować w temacie numer zapytania ${d.numerZO}.`)
  if (u.zakonczenie.trim()) linie.push(u.zakonczenie.trim())
  if (u.podpis.trim()) linie.push('', u.podpis.trim())
  return linie.join('\n')
}

/** Najdłuższy adres mailto:, który Outlook / Windows otwierają bez obcinania treści. */
export const MAKS_MAILTO = 1900

/**
 * Link mailto: z tematem, treścią i DW. Gdy treść jest za długa na adres, `pelny` = false - treść
 * trzeba wkleić ze schowka (w linku zostaje krótka informacja).
 */
export function linkMailto(o: { do: string[]; dw?: string; temat: string; tresc: string }): { url: string; pelny: boolean } {
  const zbuduj = (tresc: string) => {
    const parametry = [`subject=${encodeURIComponent(o.temat)}`, ...(o.dw?.trim() ? [`cc=${encodeURIComponent(o.dw.trim())}`] : []), `body=${encodeURIComponent(tresc)}`]
    return `mailto:${o.do.map((a) => encodeURIComponent(a.trim())).join(',')}?${parametry.join('&')}`
  }
  const url = zbuduj(o.tresc)
  if (url.length <= MAKS_MAILTO) return { url, pelny: true }
  return { url: zbuduj('[Treść zapytania jest w schowku - wklej ją tutaj (Ctrl+V).]'), pelny: false }
}

export const poprawnyEmail = (s: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s.trim())

// --- Status odpowiedzi ---------------------------------------------------------------------

export type StatusOdbiorcy = 'przygotowane' | 'wyslane' | 'brak_odpowiedzi' | 'oferta' | 'odmowa'

export const ETYKIETY_STATUSU_ODBIORCY: Record<StatusOdbiorcy, string> = {
  przygotowane: t('nie wysłane'), wyslane: t('wysłane'), brak_odpowiedzi: t('brak odpowiedzi'), oferta: t('jest oferta'), odmowa: t('odmowa'),
}
export const KOLORY_STATUSU_ODBIORCY: Record<StatusOdbiorcy, string> = {
  przygotowane: 'bg-slate-100 text-slate-600', wyslane: 'bg-sky-100 text-sky-800', brak_odpowiedzi: 'bg-amber-100 text-amber-800',
  oferta: 'bg-emerald-100 text-emerald-800', odmowa: 'bg-slate-200 text-slate-700',
}

/** Status odbiorcy: oferta w bazie > odmowa > nie wysłane > brak odpowiedzi po X dniach > wysłane. */
export function statusOdbiorcy(o: { wyslano: string | null; oferta: string | null; odmowa: boolean }, dniBezOdpowiedzi: number, teraz = new Date()): StatusOdbiorcy {
  if (o.oferta) return 'oferta'
  if (o.odmowa) return 'odmowa'
  if (!o.wyslano) return 'przygotowane'
  const dni = (teraz.getTime() - new Date(o.wyslano).getTime()) / 86_400_000
  return dni > dniBezOdpowiedzi ? 'brak_odpowiedzi' : 'wyslane'
}

// --- Baza ------------------------------------------------------------------------------------

export interface NoweZapytanieDostawcy {
  zapytanie_id: string
  wycena_id: string | null
  odczyt_id: string | null
  /** Pozycje z listy usług karty analizy. */
  analiza?: boolean
  rodzaj: RodzajZapytania
  kategoria: string
  temat: string
  tresc: string
  pozycje: Pick<PozycjaZapytania, 'opis' | 'ilosc' | 'jm' | 'masa_kg'>[]
  wymagania: string[]
  termin_odpowiedzi: string | null
}

export interface Odbiorca { dostawca_id: string | null; nazwa: string; email: string }

/** Zapis zapytania i odbiorców (jeszcze nie wysłane - wysłanie oznacza się przy otwarciu maila). */
export async function zapiszZapytanieDostawcy(z: NoweZapytanieDostawcy, odbiorcy: Odbiorca[], db: SupabaseClient = supabase): Promise<string> {
  const { data, error } = await db.from('zapytania_dostawcow').insert(z).select('id').single()
  if (error) throw new Error(komunikatPL(error.message))
  if (odbiorcy.length) {
    const { error: e2 } = await db.from('zapytania_dostawcow_odbiorcy').insert(odbiorcy.map((o) => ({ ...o, zapytanie_dostawcy_id: data.id })))
    if (e2) {
      await db.from('zapytania_dostawcow').delete().eq('id', data.id)
      throw new Error(komunikatPL(e2.message))
    }
  }
  return data.id as string
}

/** wyslano: true = teraz (z autorem), false = cofnięcie. */
export async function oznaczOdbiorce(id: string, zmiana: { wyslano?: boolean; odmowa?: boolean; uwagi?: string | null }, db: SupabaseClient = supabase) {
  const dane: Record<string, unknown> = {}
  if (zmiana.wyslano !== undefined) {
    dane.wyslano = zmiana.wyslano ? new Date().toISOString() : null
    dane.wyslal = zmiana.wyslano ? (await db.auth.getUser()).data.user?.id ?? null : null
  }
  if (zmiana.odmowa !== undefined) dane.odmowa = zmiana.odmowa
  if (zmiana.uwagi !== undefined) dane.uwagi = zmiana.uwagi
  const { error } = await db.from('zapytania_dostawcow_odbiorcy').update(dane).eq('id', id)
  if (error) throw new Error(komunikatPL(error.message))
}

export interface OdbiorcaStan {
  id: string; zapytanie_dostawcy_id: string; dostawca_id: string | null; nazwa: string; email: string | null
  wyslano: string | null; oferta_id: string | null; odmowa: boolean; uwagi: string | null
  zapytanie_id: string; temat: string; kategoria: string; rodzaj: RodzajZapytania; termin_odpowiedzi: string | null; utworzono: string
  /** Oferta powiązana ręcznie albo znaleziona w bazie (ten dostawca, to samo ZO). */
  oferta: string | null
}

export async function wczytajOdbiorcow(zapytanieId: string | null, db: SupabaseClient = supabase): Promise<OdbiorcaStan[]> {
  let q = db.from('zapytania_dostawcow_stan').select('*').order('utworzono', { ascending: false }).order('nazwa')
  if (zapytanieId) q = q.eq('zapytanie_id', zapytanieId)
  const { data, error } = await q.limit(1000)
  if (error) throw new Error(komunikatPL(error.message))
  return (data ?? []) as OdbiorcaStan[]
}

/** Termin odpowiedzi: dziś + N dni roboczych (bez sobót i niedziel), RRRR-MM-DD. */
export function terminRoboczy(dni: number, od = new Date()): string {
  const d = new Date(od.getFullYear(), od.getMonth(), od.getDate())
  let n = 0
  while (n < dni) {
    d.setDate(d.getDate() + 1)
    if (d.getDay() !== 0 && d.getDay() !== 6) n++
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
