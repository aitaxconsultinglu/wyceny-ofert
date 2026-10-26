// Prośby o oferty (kooperacja, badania, transport) i oferty z maila bez AI. Część czysta - testy w prosby.test.ts.
// Ceny usług w wycenie pochodzą z ofert zebranych pod zapytanie; pozycja wyceny pamięta prośbę (dodatkowe.prosba_id).
import type { KartaAnalizy } from './analiza'
import type { PozycjaWyceny } from './wyceny'
import { t } from '@/i18n'

export type StatusProsby = 'nowa' | 'przyjeta' | 'wyslana' | 'oferta_otrzymana' | 'zamknieta' | 'anulowana'
export const ETYKIETY_STATUSU_PROSBY: Record<StatusProsby, string> = {
  nowa: t('nowa'), przyjeta: t('przyjęta'), wyslana: t('zapytania wysłane'), oferta_otrzymana: t('oferta otrzymana'), zamknieta: t('zamknięta'), anulowana: t('anulowana'),
}

export interface ProsbaOOferte {
  id: string
  zapytanie_id: string
  wycena_id: string | null
  zakladka: 'kooperacja' | 'badania' | 'transport' | 'projekt' | 'inne'
  kategoria_uslugi: string | null
  opis: string
  parametry: Record<string, string>
  status: StatusProsby
  termin: string | null
  zlecajacy: string | null
  odpowiedzialny: string | null
  oferta_id: string | null
  uwagi: string | null
  utworzono: string
  zmodyfikowano: string
}

/** Stan pozycji usługi w wycenie względem ofert z rynku. */
export type StanOfertyPozycji = 'brak_oferty' | 'prosba_wyslana' | 'oferta_otrzymana' | 'wybrana'
export const ETYKIETY_STANU_OFERTY: Record<StanOfertyPozycji, string> = {
  brak_oferty: t('brak oferty'), prosba_wyslana: t('prośba wysłana'), oferta_otrzymana: t('oferta otrzymana'), wybrana: t('wybrana'),
}
export const prosbaPozycji = (p: Pick<PozycjaWyceny, 'dodatkowe'>) => ((p.dodatkowe ?? {}) as { prosba_id?: string }).prosba_id ?? null

export function stanOfertyPozycji(p: Pick<PozycjaWyceny, 'dodatkowe' | 'zrodlo_ceny'> & { zrodlo_id?: string | null }, prosba: ProsbaOOferte | null, ofertIdProsby: string[]): StanOfertyPozycji {
  if (p.zrodlo_ceny === 'oferta' && p.zrodlo_id && (ofertIdProsby.includes(p.zrodlo_id) || prosba?.oferta_id === p.zrodlo_id)) return 'wybrana'
  if (ofertIdProsby.length) return 'oferta_otrzymana'
  if (prosba && prosba.status !== 'anulowana') return 'prosba_wyslana'
  return p.zrodlo_ceny === 'oferta' ? 'wybrana' : 'brak_oferty'
}

/** Parametry prośby zależne od kategorii usługi (klucz, etykieta) - pozostałe kategorie: ilość, termin, miejsce. */
export function parametryKategorii(kategoria: string | null): [string, string][] {
  const wspolne: [string, string][] = [['ilosc', t('Ilość / liczba sztuk')], ['termin', t('Termin wykonania')], ['miejsce', t('Miejsce (odbiór / dostawa)')]]
  const wg: Record<string, [string, string][]> = {
    sekafenowanie: [['powierzchnia_m2', t('Powierzchnia [m²]')], ['system', t('System powłokowy / grubość')], ['norma', t('Norma / standard')]],
    malowanie: [['powierzchnia_m2', t('Powierzchnia [m²]')], ['system', t('System powłokowy / grubość')], ['przygotowanie', t('Przygotowanie powierzchni (Sa)')]],
    trawienie: [['powierzchnia_m2', t('Powierzchnia [m²]')], ['gatunek', t('Gatunek stali')], ['wymiary', t('Wymiary / gabaryt')]],
    pwht: [['masa_kg', t('Masa [kg]')], ['wymiary', t('Wymiary / gabaryt')], ['temperatura', t('Temperatura i czas wygrzewania')], ['norma', t('Norma / standard')]],
    transport: [['trasa', t('Trasa (skąd - dokąd)')], ['masa_kg', t('Masa [kg]')], ['gabaryt', t('Gabaryt (dł. × szer. × wys.)')]],
    dzwig: [['masa_kg', t('Masa [kg]')], ['wysokosc', t('Wysokość / wysięg')], ['miejsce', t('Miejsce')]],
    ndt: [['metoda', t('Metoda (RT / UT / PT / MT)')], ['zakres', t('Zakres [%] / długość spoin [m]')], ['norma', t('Norma / klasa jakości')]],
    nft: [['ilosc_rurek', t('Liczba rurek')], ['wymiary', t('Wymiary rurek')], ['norma', t('Norma / kryteria')]],
    proba: [['cisnienie', t('Ciśnienie próbne')], ['medium', t('Medium')], ['pojemnosc', t('Pojemność')]],
    odbiory: [['jednostka', t('Jednostka (UDT / JN)')], ['zakres', t('Zakres odbioru')]],
    zwijanie: [['wymiary', t('Wymiary (średnica, długość)')], ['grubosc', t('Grubość')], ['gatunek', t('Gatunek')]],
    giecie_rur: [['wymiary', t('Rura (średnica × grubość)')], ['promien', t('Promień gięcia')], ['gatunek', t('Gatunek')]],
    ciecie: [['wymiary', t('Grubość / wymiary')], ['gatunek', t('Gatunek')], ['rysunek', t('Rysunek / opis')]],
    obrobka: [['rysunek', t('Rysunek / opis obróbki')], ['gatunek', t('Gatunek')], ['tolerancje', t('Tolerancje')]],
    izolacja: [['powierzchnia_m2', t('Powierzchnia [m²]')], ['grubosc', t('Grubość / materiał')], ['plaszcz', t('Płaszcz osłonowy')]],
    projekt: [['zakres', t('Zakres dokumentacji')], ['norma', t('Kod obliczeniowy / norma')]],
    montaz: [['zakres', t('Zakres prac')], ['miejsce', t('Miejsce / obiekt')], ['postoj', t('Postój / okno czasowe')]],
    pakowanie: [['gabaryt', t('Gabaryt')], ['masa_kg', t('Masa [kg]')], ['transport', t('Rodzaj transportu')]],
  }
  const szczegolne = wg[kategoria ?? ''] ?? []
  return [...szczegolne, ...wspolne.filter(([k]) => !szczegolne.some(([s]) => s === k))]
}

export interface PropozycjaPozycji { zakladka: PozycjaWyceny['zakladka']; sekcja: string; nazwa: string; ilosc: number; jm: string; uwagi: string }

/** Wymaganie kosztotwórcze z karty analizy -> kategoria usługi. */
const WYMAGANIE_NA_KATEGORIE: Record<string, string> = {
  udt: 'odbiory', ndt: 'ndt', proba: 'proba', pwht: 'pwht', sekafenowanie: 'sekafenowanie', antykorozja: 'malowanie',
  izolacja: 'izolacja', transport: 'transport', montaz: 'montaz',
}

/**
 * Wymagane pozycje kooperacji / badań / transportu z karty analizy: usługi z karty i wymagania „wymagane” (PWHT, NDT,
 * UDT, próba, sekafenowanie, antykorozja, izolacja, transport ponadgabarytowy, montaż). Pomija kategorie, które już są w aparacie.
 */
export function wymaganePozycje(karta: KartaAnalizy | null, istniejace: Pick<PozycjaWyceny, 'zakladka' | 'sekcja' | 'nazwa'>[], kategorie: { kod: string; nazwa: string; zakladka: string }[]): PropozycjaPozycji[] {
  if (!karta) return []
  const sa = new Set(istniejace.filter((p) => p.zakladka !== 'materialy' && p.zakladka !== 'robocizna').map((p) => p.sekcja ?? ''))
  const wynik: PropozycjaPozycji[] = []
  const dodaj = (kod: string, nazwa: string, ilosc: number | null, jm: string, uwagi: string) => {
    const kat = kategorie.find((k) => k.kod === kod)
    if (!kat || sa.has(kod)) return
    sa.add(kod)
    wynik.push({ zakladka: kat.zakladka as PozycjaWyceny['zakladka'], sekcja: kod, nazwa: nazwa || kat.nazwa, ilosc: ilosc ?? 1, jm: jm || 'kpl', uwagi })
  }
  for (const u of karta.uslugi.filter((x) => x.kategoria && x.opis.trim())) dodaj(u.kategoria!, u.opis.trim(), u.ilosc, u.jm, [u.uwagi, t('z karty analizy')].filter(Boolean).join('; '))
  for (const w of karta.wymagania.filter((x) => x.stan === 'wymagane' && WYMAGANIE_NA_KATEGORIE[x.kod])) {
    dodaj(WYMAGANIE_NA_KATEGORIE[w.kod], [w.nazwa, w.opis].filter(Boolean).join(': '), null, 'kpl', t('wymaganie z karty analizy'))
  }
  return wynik
}

// --- Oferta z maila bez AI ------------------------------------------------------------------------

export interface OfertaZTekstu {
  waluta: string
  pozycje: { opis: string; ilosc: number; jm: string; cena_jedn: number; wartosc: number | null }[]
  termin_realizacji: string
  termin_dni: number | null
  waznosc_do: string | null
  waznosc_opis: string
  warunki_dostawy: string
  /** Czy odczyt wystarcza (jest co najmniej jedna cena) - inaczej proponujemy AI. */
  wystarczy: boolean
}

/** "12 500,00" / "12.500,00" / "12,500.00" / "1 250" -> liczba. */
export function kwota(s: string): number | null {
  const x = s.replace(/[\s ']/g, '')
  if (!/\d/.test(x)) return null
  const p = x.lastIndexOf(','), k = x.lastIndexOf('.')
  let n: string
  if (p >= 0 && k >= 0) n = p > k ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '')
  else if (p >= 0) n = /,\d{3}$/.test(x) && x.split(',').length > 2 ? x.replace(/,/g, '') : x.replace(',', '.')
  else n = /\.\d{3}$/.test(x) && x.split('.').length > 2 ? x.replace(/\./g, '') : x
  const v = Number(n)
  return Number.isFinite(v) ? v : null
}

const WALUTA = '(zł|pln|eur|euro|€|usd|\\$)'
const LICZBA = '(\\d{1,3}(?:[\\s\\u00a0.,]\\d{3})*(?:[.,]\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)'
const normWaluta = (w: string) => (/eur|€/i.test(w) ? 'EUR' : /usd|\$/i.test(w) ? 'USD' : 'PLN')
const JM = '(?:\\/|za|per)\\s*(m2|m²|m|mb|kg|t|szt\\.?|pcs|kpl|godz\\.?|h|kurs|km|rbh)'

/**
 * Cena i warunki z treści maila / PDF z warstwą tekstową (PL i EN): kwoty z walutą (także "cena jedn. ... zł/m²"),
 * termin realizacji (dni / tygodnie), ważność oferty, warunki dostawy (Incoterms). Wynik do sprawdzenia w formularzu.
 */
export function ofertaZTekstu(tekst: string): OfertaZTekstu {
  const t1 = tekst.replace(/\r/g, '')
  const pozycje: OfertaZTekstu['pozycje'] = []
  let waluta = 'PLN'
  for (const linia of t1.split('\n')) {
    const l = linia.trim()
    if (!l || /vat\s*\d|brutto|gross|razem z vat|total incl/i.test(l)) continue
    // "Sekafenowanie wkładu: 145 m2 x 120,00 zł/m2 = 17 400,00 zł" / "PWHT ... cena: 8 500,00 PLN netto" / "Price: EUR 3,450.00"
    const zIloscia = new RegExp(`^(.*?)[:\\-–]?\\s*${LICZBA}\\s*(m2|m²|m|mb|kg|t|szt\\.?|pcs|kpl|h|godz\\.?|kurs(?:ów|y)?|km)\\s*[x×*]\\s*${LICZBA}\\s*${WALUTA}?`, 'i').exec(l)
    if (zIloscia) {
      const ilosc = kwota(zIloscia[2])!
      const cena = kwota(zIloscia[4])!
      if (zIloscia[5]) waluta = normWaluta(zIloscia[5])
      pozycje.push({ opis: zIloscia[1].trim() || l, ilosc, jm: zIloscia[3].replace('²', '2').replace('.', ''), cena_jedn: cena, wartosc: Math.round(ilosc * cena * 100) / 100 })
      continue
    }
    const zJm = new RegExp(`${LICZBA}\\s*${WALUTA}\\s*${JM}`, 'i').exec(l) ?? new RegExp(`${WALUTA}\\s*${LICZBA}\\s*${JM}`, 'i').exec(l)
    if (zJm) {
      const [a, b] = /^\d/.test(zJm[1]) ? [zJm[1], zJm[2]] : [zJm[2], zJm[1]]
      waluta = normWaluta(b)
      const opis = l.slice(0, zJm.index).replace(/(cena|price|stawka|rate)\s*(jedn\.?|jednostkowa|unit)?\s*[:\-–]?\s*$/i, '').trim()
      pozycje.push({ opis: opis || l, ilosc: 1, jm: zJm[3].replace('²', '2').replace('.', ''), cena_jedn: kwota(a)!, wartosc: null })
      continue
    }
    const proste = new RegExp(`(cen[aęy]|price|koszt|cost|warto[śs][ćc]|amount|total|kwot[aę]|stawk[aę])[^\\d€$]{0,40}?(?:${WALUTA}\\s*)?${LICZBA}\\s*${WALUTA}?`, 'i').exec(l)
    if (proste && (proste[2] || proste[4])) {
      const v = kwota(proste[3])
      if (v && v >= 1) {
        waluta = normWaluta(proste[2] ?? proste[4])
        const opis = l.slice(0, proste.index).replace(/[:\-–]\s*$/, '').trim()
        pozycje.push({ opis: opis || l, ilosc: 1, jm: 'kpl', cena_jedn: v, wartosc: v })
      }
    }
  }
  const termin = /(termin\w*\s+(?:realizacji|wykonania|dostawy)|czas realizacji|lead time|delivery time)[^\d\n]{0,30}(\d{1,3})\s*(?:-\s*\d{1,3}\s*)?(dni|dni roboczych|days|tyg\w*|weeks?)/i.exec(t1)
  const terminDni = termin ? Number(termin[2]) * (/tyg|week/i.test(termin[3]) ? 7 : 1) : null
  const waznosc = /(ważn\w*|valid\w*)[^\n\d]{0,30}(?:do|until|till)?\s*(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/i.exec(t1)
  const waznoscDni = /(ważn\w*|valid\w*)[^\n\d]{0,30}(\d{1,3})\s*(dni|days)/i.exec(t1)
  const incoterms = /\b(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b[^\n]{0,40}/.exec(t1)
  return {
    waluta,
    pozycje,
    termin_realizacji: termin ? termin[0].trim() : '',
    termin_dni: terminDni,
    waznosc_do: waznosc ? `${waznosc[4]}-${waznosc[3].padStart(2, '0')}-${waznosc[2].padStart(2, '0')}` : null,
    waznosc_opis: waznoscDni ? waznoscDni[0].trim() : waznosc ? waznosc[0].trim() : '',
    warunki_dostawy: incoterms ? incoterms[0].trim() : '',
    wystarczy: pozycje.length > 0,
  }
}

export interface OfertaDoPorownania { id: string; dostawca: string; cena_pln: number; termin_dni: number | null; waznosc_do: string | null }

/** Najtańsza i najszybsza oferta (do podświetlenia w porównaniu). */
export function najlepszeOferty(oferty: OfertaDoPorownania[]): { najtansza: string | null; najszybsza: string | null } {
  const ceny = oferty.filter((o) => o.cena_pln > 0).sort((a, b) => a.cena_pln - b.cena_pln)
  const terminy = oferty.filter((o) => o.termin_dni !== null).sort((a, b) => a.termin_dni! - b.termin_dni!)
  return { najtansza: ceny[0]?.id ?? null, najszybsza: terminy[0]?.id ?? null }
}
