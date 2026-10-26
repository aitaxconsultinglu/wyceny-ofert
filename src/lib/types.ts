import { t } from '@/i18n'
export type Rola = 'technolog' | 'handlowy' | 'prezes' | 'administrator'

export const ETYKIETY_ROLI: Record<Rola, string> = {
  technolog: t('Dział technologów'),
  handlowy: t('Dział handlowy'),
  prezes: t('Prezes'),
  administrator: t('Administrator'),
}

export const OPISY_ROLI: Record<Rola, string> = {
  technolog: t('zapytania, analiza, listy materiałowe, wyceny (bez zatwierdzania)'),
  handlowy: t('zapytania, baza ofert, importy z Optimy, zapytania do dostawców, ceny i kooperacja w wycenie'),
  prezes: t('wszystko + zatwierdzanie wycen i korekta prezesa'),
  administrator: t('wszystko + użytkownicy, ustawienia, budżet AI'),
}

export interface Profil {
  id: string
  email: string
  nazwa: string | null
  rola: Rola
  widzi_marze: boolean
  wymaga_zmiany_hasla: boolean
  /** Język interfejsu zapamiętany w profilu (pl / en). */
  jezyk?: 'pl' | 'en'
}

/** Co wolno zalogowanemu użytkownikowi. Interfejs tylko ukrywa - reguły pilnuje baza (RLS). */
export interface Uprawnienia {
  widziMarze: boolean
  ustawienia: boolean
  uzytkownicy: boolean
  zatwierdzanie: boolean
  bazaOfert: boolean
  importy: boolean
}

export function uprawnienia(p: Profil): Uprawnienia {
  const admin = p.rola === 'administrator'
  return {
    widziMarze: p.widzi_marze || p.rola === 'prezes' || admin,
    ustawienia: admin,
    uzytkownicy: admin,
    zatwierdzanie: p.rola === 'prezes',
    bazaOfert: p.rola !== 'technolog',
    importy: p.rola !== 'technolog',
  }
}

// --- Słowniki ---------------------------------------------------------------------
export interface Mpk {
  kod: string
  opis: string | null
  aktywne: boolean
}

export interface StawkaRobocizny {
  id: number
  rodzaj_pracy: string
  mpk_kod: string | null
  stawka: number
  wazna_od: string
  aktywna: boolean
  do_weryfikacji: boolean
  domyslna: boolean
  uwagi: string | null
  kolejnosc: number
}

export interface RodzajStali {
  kod: string
  nazwa: string
  nazwa_en?: string | null
  nazwa_pl?: string
  gestosc: number
}

export interface Gatunek {
  kod: string
  grupa: string
  rodzaj_stali: string
  norma: string | null
  uwagi: string | null
}

export type SposobMasy = 'blacha' | 'krazek' | 'rura' | 'pret' | 'brak'

export interface KategoriaMaterialu {
  kod: string
  nazwa: string
  nazwa_en?: string | null
  nazwa_pl?: string
  naddatek_proc: number
  sposob_masy: SposobMasy
  jm_domyslna: string
  do_porownan: boolean
  dodatkowa: boolean
  kolejnosc: number
}

export type ZakladkaUslugi = 'kooperacja' | 'projekt' | 'badania' | 'transport' | 'inne'

export interface KategoriaUslugi {
  kod: string
  nazwa: string
  nazwa_en?: string | null
  nazwa_pl?: string
  jednostka_odniesienia: string
  zakladka: ZakladkaUslugi
  kolejnosc: number
}

/** Rodzaj tabeli na rysunku (słownik rodzaje_tabel) - lista do zaznaczania zależy od rodzaju aparatu zapytania. */
export interface RodzajTabeli {
  id: number
  rodzaj_aparatu: 'zbiornik' | 'wymiennik'
  kod: string
  nazwa: string
  nazwa_en?: string | null
  nazwa_pl?: string
  struktura: 'czesci' | 'krocce' | 'parametry' | 'tabliczka' | 'uwagi' | 'wlasna'
  kolumny: string[]
  element_szablonu: string | null
  do_materialow: boolean
  kolejnosc: number
}

/** Typ dokumentu (słownik typy_dokumentow): nazwa PL/EN i grupa w zakładce Dokumenty. */
export interface TypDokumentuSlownik {
  kod: string
  nazwa: string
  nazwa_en?: string | null
  nazwa_pl?: string
  grupa: string
  istotny_domyslnie: boolean
  kolejnosc: number
}

export interface KursWaluty {
  waluta: string
  data: string
  kurs: number
  tabela: string | null
  zrodlo: string
  pobrano: string
}

/**
 * Dane firmy-użytkownika aplikacji. Żyją tylko w bazie (ustawienie "firma") - repozytorium jest publiczne
 * i nie zawiera nazwy firmy, logo ani danych rejestrowych.
 */
export interface DaneFirmy {
  nazwa: string
  adres: string
  krs: string
  nip: string
  regon: string
  oddzialy: string[]
  zarzad: string[]
  email: string
  telefon: string
  www: string
  /** Miejscowość w dacie oferty ("<miejscowość>, 19.10.2026"). */
  miejscowosc?: string
  /** Logo do nagłówka aplikacji, oferty i kalkulacji - data URL (PNG), wgrywa administrator. */
  logo?: string
  /** Domeny poczty firmy - mail przekazany dalej przez pracownika ma nadawcę z tych domen. */
  domeny?: string[]
  /** Czym zajmuje się firma (1-3 zdania) - kontekst dla AI, bez danych klientów. */
  opis_dzialalnosci?: string
}

export interface OfertaDomyslne {
  gwarancja_mies: number
  waznosc_dni: number
  platnosc: string
  vat_proc: number
}

export interface LimityPlanu {
  baza_mb: number
  storage_mb: number
  plik_mb: number
  ostrzezenie_proc: number
}

/** Wymaganie z biblioteki generatora zapytań do dostawców. */
export interface WymaganieZapytania {
  kod: string
  tekst: string
  /** Kody kategorii albo '*material' / '*usluga' - dla nich wymaganie jest domyślnie zaznaczone. */
  kategorie: string[]
  /** Dopisywane do zdania wstępu zamiast na listę uwag. */
  w_naglowku: boolean
}

export interface UstawieniaZapytan {
  /** Dedykowana skrzynka w DW - odpowiedzi dostawców trafiają też tam. */
  dw: string
  dni_bez_odpowiedzi: number
  dni_na_odpowiedz: number
  powitanie: string
  wstep_material: string
  wstep_usluga: string
  zakonczenie: string
  podpis: string
  wymagania: WymaganieZapytania[]
}

/** Ustawienia z tabeli `ustawienia`. Pola poufne (zysk, zaokrąglenie) są undefined bez uprawnienia. */
export interface Ustawienia {
  narzut_zakupowy_proc: number
  narzut_kooperacja_proc: number
  narzut_zysk_proc?: number
  zaokraglenie_ceny?: number
  wiek_ceny_ostrzezenie_mies: number
  waznosc_oferty_dostawcy_ryzyko_dni: number
  wspolczynnik_ilosci_materialu: number
  /** Zakupy kooperacji i badań jako orientacyjne ceny usług (nie źródło ceny) - domyślnie wyłączone. */
  cena_historyczna_uslug?: boolean
  oferta_domyslne: OfertaDomyslne
  firma: DaneFirmy
  limity_planu: LimityPlanu
  zapytania_dostawcow: UstawieniaZapytan
  [klucz: string]: unknown
}
