// Odczyt całego rysunku / dokumentu przez AI: każda strona jako jeden obszar (warstwa tekstowa PDF - tanio, albo
// kafle ~300 DPI dla skanów), wynik strony rozdzielony na osobne odczyty wg rodzaju tabeli (wykaz części, króćce,
// dane projektowe, uwagi, tabele własne - badania, izolacja...), każdy do sprawdzenia przez technologa.
// Ta sama budowa zadań strony służy automatycznemu przygotowaniu zapytania (przygotowanieAuto.ts).
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { DaneAi } from './ai'
import {
  kafelNaStronie, kafliOdmiana, opisKafla, ulozWTabele, PUSTY_WYNIK,
  type Obszar, type ObszarZrodlowy, type RodzajObszaru, type WynikRysunku,
} from './rysunki'
import { infoStrony, kafleObszaru, natywneDpi, tekstStrony } from './rysunkiPdf'
import type { RodzajTabeli } from './types'
import { t } from '@/i18n'

export const KAFLE_NA_WYWOLANIE = 12
/** Strona z co najmniej tyloma elementami tekstu idzie do AI jako tekst (rysunek z CAD), inaczej jako obrazy. */
export const MIN_ELEMENTOW_TEKSTU = 30
/** Najwięcej stron jednego dokumentu w odczycie całości (koszt) - resztę czyta się zaznaczeniami. */
export const MAKS_STRON_DOKUMENTU = 10

export interface ZadanieStrony {
  opis: string
  dane: DaneAi
  strona: number
  kafleNaStronie: ObszarZrodlowy[]
  /** Treść strony (tekst) - do pominięcia tej samej strony w kopii rysunku. */
  tresc: string | null
}

/** Opis rodzajów tabel dla modelu: tabele spoza wykazu części / króćców / danych projektowych wracają jako tabele_wlasne. */
export function opisRodzajowDlaAi(rodzaje: Pick<RodzajTabeli, 'nazwa_pl' | 'nazwa' | 'struktura'>[]): string {
  const wlasne = rodzaje.filter((r) => r.struktura === 'wlasna').map((r) => r.nazwa_pl ?? r.nazwa).filter((n) => !/^własna tabela$/i.test(n))
  return wlasne.length ? `cały arkusz; tabele inne niż wykaz części, króćce i dane projektowe zwróć jako tabele_wlasne o nazwach: ${wlasne.join(', ')}` : 'cały arkusz'
}

/** Zadania AI jednej strony: cała warstwa tekstowa albo kafle całej strony (po KAFLE_NA_WYWOLANIE w wywołaniu). */
export async function zadaniaStrony(pdf: PDFDocumentProxy, nr: number, wspolne: Omit<DaneAi, 'tekst' | 'obrazy'>, plik: string, opisObszaru = 'cały arkusz'): Promise<ZadanieStrony[]> {
  const info = await infoStrony(pdf, nr)
  const dane = { ...wspolne, metadane: { ...(wspolne.metadane ?? {}), plik, strona: nr, obszar: opisObszaru } }
  if (info.elementowTekstu >= MIN_ELEMENTOW_TEKSTU) {
    const tab = ulozWTabele(await tekstStrony(pdf, nr))
    const wiersze = tab.wiersze.map((r) => r.filter(Boolean).join(' | ')).join('\n')
    const tekst = `Rysunek ${plik}, strona ${nr} - ${opisObszaru}; cała warstwa tekstowa (komórki rozdzielone " | ")\n${wiersze}`.slice(0, 60_000)
    return [{ opis: t('{0}, str. {1}: tekst PDF', plik, nr), dane: { ...dane, tekst }, strona: nr, kafleNaStronie: [], tresc: wiersze }]
  }
  const obszar = { x: 0, y: 0, w: 1, h: 1 }
  const k = await kafleObszaru(pdf, nr, obszar, { natywne: await natywneDpi(pdf, nr) })
  const prost = k.kafle.map((x) => x.prostokat)
  const obrazy = k.kafle.map((x, i) => ({ media_type: 'image/jpeg' as const, dane: x.base64, opis: opisKafla(i + 1, 'czesci', x.prostokat, prost, opisObszaru) }))
  const naStronie = prost.map((p) => kafelNaStronie(p, obszar, k.szer, k.wys, nr))
  const zadania: ZadanieStrony[] = []
  for (let od = 0; od < obrazy.length; od += KAFLE_NA_WYWOLANIE) {
    const paczka = obrazy.slice(od, od + KAFLE_NA_WYWOLANIE)
    zadania.push({ opis: t('{0}, str. {1}: {2} ({3} DPI)', plik, nr, kafliOdmiana(paczka.length), k.dpi), dane: { ...dane, obrazy: paczka }, strona: nr, kafleNaStronie: naStronie, tresc: null })
  }
  return zadania
}

export interface OdczytDoZapisu { nazwa: string; rodzaj_tabeli: string | null; obszary: Obszar[]; wynik: WynikRysunku }

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Wynik strony -> osobne odczyty wg rodzaju tabeli aparatu: wykaz części, króćce, dane projektowe (wymiennik: warunki
 * pracy), uwagi do wyceny i każda tabela własna (rodzaj po nazwie z listy, inaczej "własna tabela"). Puste struktury pomija.
 */
export function rozdzielNaOdczyty(w: WynikRysunku, strona: number, rodzaje: RodzajTabeli[]): OdczytDoZapisu[] {
  const pierwszy = (st: RodzajObszaru, kody: string[] = []) => kody.map((k) => rodzaje.find((r) => r.kod === k)).find(Boolean) ?? rodzaje.find((r) => r.struktura === st) ?? null
  const odczyt = (st: RodzajObszaru, r: RodzajTabeli | null, wynik: WynikRysunku, nazwa?: string): OdczytDoZapisu => {
    const n = nazwa ?? r?.nazwa ?? st
    return {
      nazwa: t('{0} (str. {1})', n, strona), rodzaj_tabeli: r?.kod ?? null, wynik,
      obszary: [{ id: crypto.randomUUID(), rodzaj: st, rodzaj_tabeli: r?.kod ?? null, nazwa: n, element: r?.element_szablonu ?? null, x: 0, y: 0, w: 1, h: 1 }],
    }
  }
  const wynik: OdczytDoZapisu[] = []
  if (w.pozycje.length) wynik.push(odczyt('czesci', pierwszy('czesci', ['wykaz_czesci']), { ...PUSTY_WYNIK, pozycje: w.pozycje }))
  if (w.krocce.length) wynik.push(odczyt('krocce', pierwszy('krocce', ['krocce']), { ...PUSTY_WYNIK, krocce: w.krocce }))
  if (w.parametry.length) wynik.push(odczyt('parametry', pierwszy('parametry', ['dane_projektowe', 'warunki_pracy']), { ...PUSTY_WYNIK, parametry: w.parametry }))
  if (w.uwagi.length) wynik.push(odczyt('uwagi', pierwszy('uwagi', ['uwagi']), { ...PUSTY_WYNIK, uwagi: w.uwagi }))
  for (const tb of w.tabele ?? []) {
    const r = rodzaje.find((x) => x.struktura === 'wlasna' && [x.nazwa, x.nazwa_pl ?? ''].some((n) => n && norm(n) === norm(tb.nazwa)))
      ?? rodzaje.find((x) => x.kod === 'wlasna') ?? null
    const o = odczyt('wlasna', r, { ...PUSTY_WYNIK, tabele: [{ ...tb, obszar_id: null }] }, tb.nazwa)
    o.obszary[0].kolumny = tb.kolumny
    o.wynik.tabele![0].obszar_id = o.obszary[0].id
    wynik.push(o)
  }
  return wynik
}
