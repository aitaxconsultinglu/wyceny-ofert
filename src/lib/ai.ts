// Klient funkcji brzegowej "ai". Klucz Claude API nigdy nie trafia do przeglądarki.
import { wywolajFunkcje } from './supabase'

export type TrybAi = 'klasyfikuj_mail' | 'wyciagnij_oferte' | 'analizuj_zapytanie' | 'wyciagnij_liste_z_rysunku' | 'normalizuj_pozycje' | 'zaproponuj_klauzule'
  | 'odczytaj_dokument' | 'przetlumacz_dokument'

export interface DaneAi {
  tekst?: string
  obrazy?: { media_type: 'image/jpeg' | 'image/png'; dane: string; opis?: string }[]
  metadane?: Record<string, unknown>
  zapytanie_id?: string | null
  dokument_id?: string | null
  plik_id?: string | null
  model?: 'tani' | 'standard' | 'najlepszy'
}

export interface SzacunekAi {
  model: string
  tokeny_wejscie: number
  tokeny_wyjscie_szac: number
  koszt_usd: number
  koszt_pln: number
  pozostalo_miesiac_pln: number
}

export interface WynikAi<T> {
  wynik: T
  model: string
  koszt_pln: number
}

export async function szacujAi(tryb: TrybAi, dane: DaneAi) {
  const { dane: d, blad } = await wywolajFunkcje<SzacunekAi>('ai', { tryb, szacuj: true, ...dane })
  return { szacunek: d, blad }
}

export async function wywolajAi<T>(tryb: TrybAi, dane: DaneAi) {
  const { dane: d, blad } = await wywolajFunkcje<WynikAi<T>>('ai', { tryb, ...dane })
  return { odp: d, blad }
}

// --- Typy wyników ----------------------------------------------------------------------------
export interface KlasyfikacjaMaila {
  typ: 'oferta_dostawcy' | 'zapytanie_klienta' | 'zapytanie_wlasne_do_dostawcy' | 'korespondencja' | 'inne'
  dostawca_nazwa: string | null
  nr_zo: string | null
  czego_dotyczy: string
  pewnosc: number
}

export interface WymaganiaOferty {
  atest_31: boolean | null
  ped: boolean | null
  udarnosc_temp: number | null
  ut: boolean | null
  nft: boolean | null
  pochodzenie_ue: boolean | null
  udt: boolean | null
}

export interface PozycjaOfertyAi {
  lp: number
  opis: string
  rodzaj: 'material' | 'usluga'
  kategoria_materialu: string | null
  kategoria_uslugi: string | null
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
  pewnosc: number
}

export interface OfertaAi {
  czy_oferta: boolean
  dostawca: { nazwa: string | null; nip: string | null; osoba: string | null; email: string | null; telefon: string | null }
  oferta: {
    numer_oferty: string | null
    data_oferty: string | null
    nr_zo: string | null
    waluta: string
    warunki_dostawy: string | null
    miejsce_dostawy: string | null
    platnosc: string | null
    waznosc_do: string | null
    waznosc_opis: string | null
    termin_realizacji: string | null
    termin_dni: number | null
    doplaty: { opis: string; kwota: number; za: 'oferta' | 'szt' | 'm' | 'kg' }[]
    wymagania: WymaganiaOferty
    uwagi: string | null
  }
  pozycje: PozycjaOfertyAi[]
  uwagi_ekstrakcji: string
}

export interface RysunekAi {
  czy_rysunek: boolean
  pozycje: {
    poz: string; nazwa: string; ilosc: number | null; jm: string | null; material: string | null; norma: string | null
    wymiary: string | null; masa_jedn: number | null; masa_calk: number | null; uwagi: string | null
    kategoria: string | null; pewnosc: number; kafel: number | null
  }[]
  krocce: {
    oznaczenie: string; ilosc: number | null; dn: string | null; pn: string | null; przylacze: string | null
    przeznaczenie: string | null; uwagi: string | null; pewnosc: number; kafel: number | null
  }[]
  parametry: { nazwa: string; przestrzen: string | null; wartosc: string; jednostka: string | null; pewnosc: number }[]
  dane_projektowe: Record<'kod_projektowy' | 'cisnienie_obliczeniowe' | 'temperatura_obliczeniowa' | 'mdmt' | 'naddatek_korozyjny'
    | 'pwht' | 'badania_ndt' | 'kategoria_ped' | 'dozor_udt' | 'masa_pusta', string | null>
  uwagi_do_wyceny: string[]
  uwagi_odczytu: string
}
