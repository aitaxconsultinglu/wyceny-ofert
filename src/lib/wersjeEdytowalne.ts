// Moduł "Wersje edytowalne": pliki spoza zapytań i wycen (PDF, skany, zdjęcia, DOCX, arkusze, DXF) przerabiane na wersję
// edytowalną - listę bloków (nagłówki, akapity, listy, tabele) z formatowaniem, z której powstaje dokument Word.
// Ta sama struktura bloków przychodzi z odczytu bez AI (warstwa tekstowa PDF, struktura pliku) i z AI (tryb odczytaj_dokument).
// Tu tylko logika bez przeglądarki (testowana); pliki i render: wersjeEdytowalnePliki.ts, Word: wersjeEdytowalneWord.ts.
import { linieTekstu } from './odczytTekstowy'
import { elementyWObszarze, ulozWTabele, type ElementTekstu, type Prostokat } from './rysunki'
import { t } from '@/i18n'

export type TypBloku = 'naglowek' | 'akapit' | 'lista' | 'tabela' | 'podpis' | 'obraz'
export type Wyrownanie = 'lewo' | 'srodek' | 'prawo' | 'wyjustowane'

/** Położenie bloku na stronie oryginału - współrzędne względne 0..1 (od lewego górnego rogu). */
export interface Ramka { x: number; y: number; w: number; h: number }

export interface BlokDokumentu {
  typ: TypBloku
  /** 1-3 dla nagłówków, 0 dla pozostałych. */
  poziom: number
  tekst: string
  pogrubiony: boolean
  kursywa: boolean
  wyrownanie: Wyrownanie
  /** Rozmiar czcionki w pt (0 = domyślny). */
  rozmiar: number
  elementy: string[]
  wiersze: string[][]
  naglowek_tabeli: boolean
  // Układ strony (odczyty od wersji z układem; starsze odczyty go nie mają - Word składa je jako zwykły tekst).
  ramka?: Ramka | null
  /** Rodzina czcionki oryginału (np. "Arial"). */
  czcionka?: string | null
  /** Odstęp między liniami w pt (0 = domyślny). */
  interlinia?: number
  /** Szerokości kolumn tabeli - udziały szerokości tabeli (suma 1). */
  kolumny?: number[]
  /** Tabela z liniami siatki w oryginale. */
  obramowanie?: boolean
  /** Styl komórek tabeli (litery): "b" - pogrubiona, "i" - kursywa, "c" - wyśrodkowana, "r" - do prawej; "" - zwykła. */
  style_komorek?: string[][]
  /** Tekst podkreślony w całości. */
  podkreslony?: boolean
  /** Odstęp między znakami w pt (ujemny - ciaśniej): wiersze w Wordzie łamią się tam, gdzie w oryginale. */
  odstep_znakow?: number
  /** Wcięcie pierwszego wiersza w pt: dodatnie - akapit z wcięciem, ujemne - wcięcie wiszące (punkt „1)”, „a)” przed tekstem). */
  wciecie?: number
  /** Tłumaczenie dłuższe niż oryginał: zmniejszenie czcionki w układzie dokładnym (pole ma stały rozmiar). */
  skala_czcionki?: number
  /** Tłumaczenie: liczba znaków bloku oryginału - Word dopasowuje czcionkę strony, żeby zachować podział stron. */
  dl_oryginalu?: number
  /** Formatowanie wewnątrz akapitu (pogrubione / pochylone słowa) - fragmenty składające się na "tekst". */
  fragmenty?: FragmentTekstu[]
}

export interface FragmentTekstu { tekst: string; b: boolean; i: boolean }

export interface WymiaryStrony { szerPt: number; wysPt: number }
/**
 * Układ strony w Wordzie: "plynny" - akapity, tabele i obrazy jeden pod drugim z wcięciami i odstępami oryginału
 * (dokument do dalszej pracy); "dokladny" - tekst w polach dokładnie w miejscach oryginału na tle strony z liniami
 * i grafiką (formularze, karty danych z gęstą siatką).
 */
export type UkladStrony = 'plynny' | 'dokladny'
export interface StronaTresci { bloki: BlokDokumentu[]; zrodlo: 'tekst' | 'ai'; jezyk: string | null; wymiary?: WymiaryStrony | null; uklad?: UkladStrony }

/**
 * Skan: strona bez warstwy tekstowej albo z kilkoma napisami na obrazie zajmującym większość strony. Strona z tekstem
 * (nawet krótkim - spis treści, podpisy rysunków) czytana jest bez AI.
 */
export const jestSkanem = (el: unknown[], g: GrafikaStrony, szerPt: number, wysPt: number) =>
  el.length === 0 || (el.length < 15 && g.obrazy.some((o) => o.w * o.h > 0.6 * szerPt * wysPt))

/** Strona-formularz (gęsta siatka linii) - w trybie automatycznym dostaje układ dokładny. */
export const jestFormularzem = (g: GrafikaStrony) => g.linie.length >= 60
export interface TrescPliku {
  strony: Record<string, StronaTresci>
  tlumaczenie: Record<string, { bloki: BlokDokumentu[] }>
}
export const PUSTA_TRESC: TrescPliku = { strony: {}, tlumaczenie: {} }

export type RodzajPliku = 'pdf' | 'obraz' | 'docx' | 'arkusz' | 'tekst' | 'cad' | 'inny'
export type RodzajObszaruTekstu = 'tekst' | 'tabela'
export const ETYKIETY_OBSZARU_TEKSTU: Record<RodzajObszaruTekstu, string> = { tekst: t('Tekst'), tabela: t('Tabela') }
export const KOLORY_OBSZARU_TEKSTU: Record<RodzajObszaruTekstu, string> = { tekst: '#2563eb', tabela: '#16a34a' }
export interface ObszarTekstu extends Prostokat { id: string; rodzaj: RodzajObszaruTekstu }

export const blok = (z: Partial<BlokDokumentu> & { typ: TypBloku }): BlokDokumentu => ({
  poziom: 0, tekst: '', pogrubiony: false, kursywa: false, wyrownanie: 'lewo', rozmiar: 0, elementy: [], wiersze: [], naglowek_tabeli: false, ...z,
})

const rozszerzenie = (n: string) => n.toLowerCase().split('.').pop() ?? ''

/** Rodzaj pliku z nazwy: co da się odczytać i jak (PDF / obraz - podgląd z zaznaczaniem; reszta - struktura pliku). */
export function rodzajPliku(nazwa: string): RodzajPliku {
  const e = rozszerzenie(nazwa)
  if (e === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'webp'].includes(e)) return 'obraz'
  if (e === 'docx') return 'docx'
  if (['xlsx', 'xls', 'xlsm', 'csv'].includes(e)) return 'arkusz'
  if (['txt', 'md'].includes(e)) return 'tekst'
  if (['dxf', 'dwg', 'step', 'stp', 'iges', 'igs'].includes(e)) return 'cad'
  return 'inny'
}

// --- Język bez AI --------------------------------------------------------------------------------------

export const NAZWY_JEZYKOW: Record<string, string> = {
  pl: t('polski'), en: t('angielski'), de: t('niemiecki'), fr: t('francuski'), it: t('włoski'), es: t('hiszpański'), cs: t('czeski'),
  sk: t('słowacki'), nl: t('niderlandzki'), sv: t('szwedzki'), ru: t('rosyjski'), uk: t('ukraiński'), pt: t('portugalski'),
}

// Najczęstsze krótkie słowa języka - wystarczają do rozpoznania strony tekstu (rysunki i tabele mają ich mało).
const SLOWA: Record<string, string[]> = {
  pl: ['i', 'w', 'na', 'z', 'do', 'się', 'nie', 'jest', 'oraz', 'dla', 'od', 'po', 'przez', 'że', 'lub', 'są', 'jako', 'przy', 'być', 'który', 'która', 'zgodnie', 'wg'],
  en: ['the', 'and', 'of', 'to', 'in', 'is', 'for', 'with', 'on', 'be', 'by', 'are', 'as', 'or', 'shall', 'this', 'that', 'from', 'at', 'all', 'not', 'which', 'an'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'von', 'für', 'auf', 'den', 'dem', 'zu', 'ein', 'eine', 'sind', 'werden', 'oder', 'bei', 'nach', 'des', 'im', 'wird'],
  fr: ['le', 'la', 'les', 'et', 'des', 'du', 'un', 'une', 'est', 'pour', 'dans', 'par', 'sur', 'au', 'aux', 'avec', 'sont', 'ou', 'que', 'qui', 'en', 'ne', 'pas'],
  it: ['il', 'di', 'che', 'e', 'la', 'per', 'un', 'del', 'della', 'con', 'non', 'sono', 'le', 'gli', 'al', 'dei', 'da', 'una', 'nel', 'alla', 'deve', 'essere'],
  es: ['el', 'la', 'de', 'que', 'y', 'en', 'los', 'del', 'las', 'por', 'un', 'para', 'con', 'una', 'es', 'se', 'al', 'como', 'más', 'o', 'debe', 'son'],
  cs: ['a', 'v', 'na', 'je', 'se', 's', 'z', 'do', 'pro', 'k', 'že', 'jako', 'nebo', 'podle', 'být', 'které', 'který', 'jsou', 'při', 'od'],
  nl: ['de', 'het', 'een', 'en', 'van', 'is', 'in', 'op', 'te', 'met', 'voor', 'zijn', 'niet', 'dat', 'aan', 'door', 'worden', 'bij', 'of', 'moet'],
  sv: ['och', 'att', 'det', 'som', 'en', 'på', 'är', 'av', 'för', 'med', 'till', 'den', 'har', 'de', 'inte', 'om', 'ett', 'ska', 'eller'],
  pt: ['de', 'que', 'e', 'o', 'a', 'do', 'da', 'em', 'um', 'para', 'com', 'não', 'uma', 'os', 'no', 'se', 'na', 'por', 'mais', 'deve'],
}
const ZNAKI: Record<string, RegExp> = {
  pl: /[ąęłńśźżĄĘŁŃŚŹŻ]/g, de: /[äöüßÄÖÜ]/g, cs: /[ěřůčšžťďňĚŘŮČŠŽŤĎŇ]/g, fr: /[éèêàçùœÉÈÊÀÇ]/g,
  es: /[ñ¿¡ÑáíóúÁÍÓÚ]/g, sv: /[åÅ]/g, pt: /[ãõâôçÃÕÂÔ]/g, it: /[àèìòùÀÈÌÒÙ]/g,
}

export interface WykrytyJezyk { kod: string | null; nazwa: string; pewnosc: number }

/** Język tekstu bez AI: alfabet (cyrylica), częste słowa i znaki diakrytyczne. Za mało tekstu - kod null. */
export function wykryjJezyk(tekst: string): WykrytyJezyk {
  const t = tekst.slice(0, 20_000)
  const cyrylica = (t.match(/[Ѐ-ӿ]/g) ?? []).length
  const lacinskie = (t.match(/[A-Za-zÀ-ſ]/g) ?? []).length
  if (cyrylica > 20 && cyrylica > lacinskie) {
    const kod = /[іїєґІЇЄҐ]/.test(t) ? 'uk' : 'ru'
    return { kod, nazwa: NAZWY_JEZYKOW[kod], pewnosc: 0.9 }
  }
  const slowa = t.toLowerCase().match(/[a-zÀ-ſ]+/g) ?? []
  if (slowa.length < 5) return { kod: null, nazwa: 'nie rozpoznano (za mało tekstu)', pewnosc: 0 }
  const wyniki = Object.entries(SLOWA).map(([kod, lista]) => {
    const zbior = new Set(lista)
    const trafienia = slowa.filter((s) => zbior.has(s)).length
    const znaki = (t.match(ZNAKI[kod] ?? /$^/g) ?? []).length
    return { kod, punkty: trafienia / slowa.length + Math.min(0.3, (znaki / Math.max(1, lacinskie)) * 8) }
  }).sort((a, b) => b.punkty - a.punkty)
  const [pierwszy, drugi] = wyniki
  if (pierwszy.punkty < 0.04) return { kod: null, nazwa: 'nie rozpoznano', pewnosc: 0 }
  const pewnosc = Math.min(1, (pierwszy.punkty - (drugi?.punkty ?? 0)) / pierwszy.punkty + 0.3)
  return { kod: pierwszy.kod, nazwa: NAZWY_JEZYKOW[pierwszy.kod], pewnosc: Math.round(pewnosc * 100) / 100 }
}

/** Cały tekst bloków (do wykrycia języka i szacunku kosztu tłumaczenia). */
export function tekstBlokow(bloki: BlokDokumentu[]): string {
  return bloki.map((b) => [b.tekst, ...b.elementy, ...b.wiersze.map((w) => w.join(' | '))].filter(Boolean).join('\n')).join('\n')
}

/** Najczęstszy język stron pliku. */
export function jezykPliku(tresc: TrescPliku): string | null {
  const licz: Record<string, number> = {}
  for (const s of Object.values(tresc.strony)) if (s.jezyk) licz[s.jezyk] = (licz[s.jezyk] ?? 0) + tekstBlokow(s.bloki).length
  return Object.entries(licz).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

// --- Bloki z warstwy tekstowej PDF ---------------------------------------------------------------------

/** Element warstwy tekstowej z informacją o czcionce (pogrubienie, kursywa i rodzina - z nazwy fontu). */
export interface ElementZCzcionka extends ElementTekstu {
  pogrubiony?: boolean; kursywa?: boolean; czcionka?: string | null
  /** Font PDF (id w dokumencie) - pogrubienie z renderu liczone dla całego fontu. */
  font?: string
  /** Pogrubienie / kursywa wynikają z nazwy fontu (np. "Arial-BoldMT"); fonty bez nazwy (CIDFont+F1) - z renderu. */
  styl_z_nazwy?: boolean
  /** Różnica szerokości znaku względem tej czcionki w systemie (pt na znak) - ciaśniej / luźniej złożony tekst. */
  odstep?: number
  /** Jasność tła pod tekstem (0-255) z renderu - jasny tekst na ciemnym pasku to tekst na tle, nie rysunek. */
  tlo?: number
}

/**
 * Grafika strony (w pt, od lewego górnego rogu): linie (odcinki i krawędzie prostokątów) i obrazy z listy operatorów PDF
 * oraz plamy - narysowane miejsca bez tekstu (logo wektorowe, stopki z krzywych, podpisy) z renderu strony.
 */
export interface GrafikaStrony { linie: Prostokat[]; obrazy: Prostokat[]; plamy?: PlamaGrafiki[]; /** Drobne znaki grafiki (punktory rysowane jako kształt). */ kropki?: Prostokat[] }
/** Plama grafiki: prostokąt (pt) i wiersze kratek (co krok pt od góry plamy) - czy w wierszu jest tusz. */
export interface PlamaGrafiki extends Prostokat { krok: number; wiersze: boolean[]; kratek?: number }

/** Plamy grafiki do obrazu (logo, stopka z krzywych, podpis) i kropki (punktory) - drobiazgi typu "°" pominięte. */
export function podzielPlamy(wszystkie: PlamaGrafiki[]): { plamy: PlamaGrafiki[]; kropki: Prostokat[] } {
  return {
    plamy: wszystkie.filter((p) => p.w >= 15 && p.h >= 8 && (p.kratek ?? 99) >= 6),
    kropki: wszystkie.filter((p) => p.w <= 10 && p.h <= 10 && p.w >= 1.5 && p.h >= 1.5),
  }
}

/** Render strony do analizy: jasność i nasycenie pikseli, skala = piksele na pt. */
export interface RenderStrony { szer: number; wys: number; skala: number; jasnosc: Uint8Array; nasycenie: Uint8Array }

/**
 * Tekst widoczny na renderze: w prostokącie elementu piksele różnią się od tła. Biały tekst na białym, tekst przykryty
 * białym prostokątem (np. zamazane dane) - niewidoczny, więc nie trafia do wersji edytowalnej (jak w oryginale).
 */
export function widocznyTekst(r: RenderStrony, e: ElementTekstu): boolean {
  return analizaElementu(r, e).widoczny
}

/** Piksele elementu na renderze: widoczność, jasność tła i gęstość tuszu (udział pikseli innych niż tło). */
function analizaElementu(r: RenderStrony, e: ElementTekstu) {
  const x0 = Math.max(0, Math.floor(e.x * r.skala))
  const x1 = Math.min(r.szer, Math.ceil((e.x + e.w) * r.skala))
  const y0 = Math.max(0, Math.floor((e.y - e.h * 0.8) * r.skala))
  const y1 = Math.min(r.wys, Math.ceil((e.y + e.h * 0.15) * r.skala))
  if (x1 <= x0 || y1 <= y0) return { widoczny: true, tlo: 255, gestosc: 0 }
  const wartosci: number[] = []
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) wartosci.push(r.jasnosc[y * r.szer + x])
  const tlo = mediana(wartosci)
  const tusz = wartosci.filter((v) => Math.abs(v - tlo) > 50).length
  return { widoczny: tusz >= Math.max(2, 0.01 * wartosci.length), tlo, gestosc: tusz / wartosci.length }
}

/**
 * Tekst do wersji edytowalnej tak, jak go widać: elementy niewidoczne pominięte, a w elemencie widocznym tylko częściowo
 * (np. nazwisko przykryte białym prostokątem) - tylko widoczne słowa. Pogrubienie fontów bez nazwy (CIDFont+F1) -
 * z gęstości tuszu: font o wyraźnie grubszej kresce niż font treści jest pogrubiony. Tło pod tekstem zapisane w "tlo".
 */
export function tekstJakWidac(r: RenderStrony, el: ElementZCzcionka[]): ElementZCzcionka[] {
  const wynik: (ElementZCzcionka & { gestosc: number })[] = []
  for (const e of el) {
    const a = analizaElementu(r, e)
    const slowa = e.str.split(/(?<=\s)(?=\S)/)
    if (a.widoczny && slowa.length > 1) {
      // Słowo po słowie (szerokość proporcjonalna do liczby znaków).
      let x = e.x
      const czesci = slowa.map((sl) => { const w = (e.w * sl.length) / e.str.length; const c = { ...e, str: sl, x, w }; x += w; return c })
      const widoczne = czesci.filter((c) => analizaElementu(r, { ...c, w: c.w * (c.str.trimEnd().length / c.str.length) }).widoczny)
      if (widoczne.length < czesci.length) {
        for (const c of widoczne) wynik.push({ ...c, str: c.str.trimEnd(), w: c.w * (c.str.trimEnd().length / c.str.length), tlo: a.tlo, gestosc: a.gestosc })
        continue
      }
    }
    if (a.widoczny) wynik.push({ ...e, tlo: a.tlo, gestosc: a.gestosc })
  }
  // Pogrubienie z renderu dla fontów bez stylu w nazwie: gęstość tuszu fontu względem najcieńszego fontu podobnej
  // wielkości (+-30%, co najmniej 10 znaków) - mały druk ma inną gęstość niż duży, więc porównujemy podobne rozmiary.
  // Font bywa ten sam dla zwykłego i "sztucznie" pogrubionego tekstu (obrys), więc decyduje element: gęstość elementu
  // (krótkie - gęstość jego fontu) względem kwartyla dolnego najcieńszego fontu podobnej wielkości.
  const fonty = new Map<string, { el: { g: number; n: number }[]; h: number; znaki: number }>()
  for (const e of wynik) {
    if (!e.font) continue
    const f = fonty.get(e.font) ?? { el: [], h: 0, znaki: 0 }
    f.el.push({ g: e.gestosc, n: e.str.trim().length }); f.h += e.h * e.str.length; f.znaki += e.str.length
    fonty.set(e.font, f)
  }
  const kwartyl = (l: { g: number; n: number }[], q: number) => {
    const s2 = [...l].sort((a, b) => a.g - b.g)
    const suma = s2.reduce((x, y) => x + y.n, 0)
    let acc = 0
    for (const x of s2) { acc += x.n; if (acc >= q * suma) return x.g }
    return s2[s2.length - 1]?.g ?? 0
  }
  const wysFontu = (f: { h: number; znaki: number }) => f.h / Math.max(1, f.znaki)
  const odniesienie = new Map<string, number>()
  const gestoscFontu = new Map<string, number>()
  for (const [id, f] of fonty) {
    const h = wysFontu(f)
    const wzor = [...fonty.values()].filter((x) => x.znaki >= 10 && Math.abs(wysFontu(x) - h) <= 0.3 * h).map((x) => kwartyl(x.el, 0.25))
    odniesienie.set(id, wzor.length ? Math.min(...wzor) : 0)
    gestoscFontu.set(id, kwartyl(f.el, 0.5))
  }
  return wynik.map(({ gestosc, ...e }) => {
    if (e.styl_z_nazwy || !e.font) return e
    const ref = odniesienie.get(e.font) ?? 0
    const g = e.str.trim().length >= 3 ? gestosc : gestoscFontu.get(e.font) ?? gestosc
    return { ...e, pogrubiony: ref > 0 && g >= 1.25 * ref }
  })
}

/**
 * Plamy grafiki: tusz (ciemne albo kolorowe piksele) poza tekstem, liniami i obrazami, zebrany w kratki ~3 pt
 * i połączony z sąsiadami do ~6 pt. Wynik w pt; drobiazgi (punktory, kropki) i tło całej strony pominięte.
 */
export function plamyGrafiki(r: RenderStrony, wyklucz: Prostokat[]): PlamaGrafiki[] {
  const maska = new Uint8Array(r.szer * r.wys)
  for (const o of wyklucz) {
    const x0 = Math.max(0, Math.floor((o.x - 1) * r.skala)), x1 = Math.min(r.szer, Math.ceil((o.x + o.w + 1) * r.skala))
    const y0 = Math.max(0, Math.floor((o.y - 1) * r.skala)), y1 = Math.min(r.wys, Math.ceil((o.y + o.h + 1) * r.skala))
    for (let y = y0; y < y1; y++) maska.fill(1, y * r.szer + x0, y * r.szer + Math.max(x0, x1))
  }
  const k = Math.max(1, Math.round(3 * r.skala))
  const gw = Math.ceil(r.szer / k), gh = Math.ceil(r.wys / k)
  const tusz = new Uint16Array(gw * gh)
  for (let y = 0; y < r.wys; y++) {
    for (let x = 0; x < r.szer; x++) {
      const i = y * r.szer + x
      if (!maska[i] && (r.jasnosc[i] < 200 || r.nasycenie[i] > 60)) tusz[Math.floor(y / k) * gw + Math.floor(x / k)]++
    }
  }
  const prog = Math.max(2, Math.round(k * k * 0.05))
  const odwiedzone = new Uint8Array(gw * gh)
  const wynik: PlamaGrafiki[] = []
  for (let s = 0; s < gw * gh; s++) {
    if (odwiedzone[s] || tusz[s] < prog) continue
    let gx0 = gw, gx1 = 0, gy0 = gh, gy1 = 0, kratek = 0
    const kolejka = [s]
    odwiedzone[s] = 1
    while (kolejka.length) {
      const c = kolejka.pop()!
      const cx = c % gw, cy = Math.floor(c / gw)
      gx0 = Math.min(gx0, cx); gx1 = Math.max(gx1, cx); gy0 = Math.min(gy0, cy); gy1 = Math.max(gy1, cy); kratek++
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = cx + dx, ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
          const n = ny * gw + nx
          if (!odwiedzone[n] && tusz[n] >= prog) { odwiedzone[n] = 1; kolejka.push(n) }
        }
      }
    }
    const wiersze = Array.from({ length: gy1 + 1 - gy0 }, (_, i) => {
      for (let cx = gx0; cx <= gx1; cx++) if (tusz[(gy0 + i) * gw + cx] >= prog) return true
      return false
    })
    const p = { x: (gx0 * k) / r.skala, y: (gy0 * k) / r.skala, w: ((gx1 + 1 - gx0) * k) / r.skala, h: ((gy1 + 1 - gy0) * k) / r.skala, krok: k / r.skala, wiersze }
    const szerPt = r.szer / r.skala, wysPt = r.wys / r.skala
    if ((p.w * p.h) / (szerPt * wysPt) < 0.4) wynik.push({ ...p, kratek } as PlamaGrafiki)
  }
  return wynik
}

const RODZINY: [RegExp, string][] = [
  [/arial|helvetica|liberation ?sans|arimo|nimbus ?sans/i, 'Arial'], [/times|liberation ?serif|tinos|nimbus ?rom/i, 'Times New Roman'],
  [/courier|liberation ?mono|cousine|nimbus ?mono/i, 'Courier New'], [/calibri|carlito/i, 'Calibri'], [/cambria|caladea/i, 'Cambria'],
  [/verdana/i, 'Verdana'], [/tahoma/i, 'Tahoma'], [/segoe ?ui/i, 'Segoe UI'], [/georgia/i, 'Georgia'], [/garamond/i, 'Garamond'],
  [/century ?gothic/i, 'Century Gothic'], [/trebuchet/i, 'Trebuchet MS'], [/dejavu ?sans/i, 'DejaVu Sans'],
  [/franklin ?gothic/i, 'Franklin Gothic Book'], [/bookman/i, 'Bookman Old Style'], [/palatino|book ?antiqua/i, 'Palatino Linotype'],
  // Nazwy ogólne (PDF z czcionką bez nazwy, np. CIDFont+F1) - najczęstsza czcionka danego rodzaju.
  [/^sans|sans-serif/i, 'Arial'], [/^serif/i, 'Times New Roman'], [/^mono/i, 'Courier New'],
]

/** Czcionki standardowe Windows / Office - tylko ich szerokość można wiarygodnie zmierzyć w przeglądarce. */
export const CZCIONKI_SYSTEMOWE = new Set(['Arial', 'Times New Roman', 'Courier New', 'Calibri', 'Cambria', 'Verdana', 'Tahoma', 'Segoe UI', 'Georgia', 'Garamond', 'Century Gothic', 'Trebuchet MS', 'Franklin Gothic Book', 'Bookman Old Style', 'Palatino Linotype'])

/** Rodzina czcionki z nazwy fontu PDF ("ABCDEF+Arial-BoldMT" -> "Arial"); nierozpoznana - oczyszczona nazwa albo null. */
export function rodzinaCzcionki(nazwa: string | null | undefined): string | null {
  // Czcionki symboli (znaki jak °, ±) - tekst jest w Unicode, więc zostaje czcionka otoczenia.
  if (!nazwa || /symbol|wingding|dingbat/i.test(nazwa)) return null
  const bez = nazwa.replace(/^[A-Z]{6}\+/, '').replace(/([a-z])([A-Z])/g, '$1 $2')
  for (const [w, r] of RODZINY) if (w.test(bez)) return r
  const n = bez.split(/[-,]/)[0].replace(/\b(MT|PS|PSMT|Std|Pro|LT)\b/g, '').replace(/\s+/g, ' ').trim()
  return /^[A-Za-z][A-Za-z ]{2,30}$/.test(n) && !/^(g_d|f\d|t\d|font|cid)/i.test(n) ? n : null
}

const mediana = (l: number[]) => {
  const s = [...l].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}
const najczestszy = <T,>(l: T[]): T | null => {
  const licz = new Map<T, number>()
  for (const x of l) if (x !== null && x !== undefined) licz.set(x, (licz.get(x) ?? 0) + 1)
  return [...licz.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
const PUNKTOR = /^\s*([•●▪■◦○·\-–—*]|\(?\d{1,2}[.)]|\(?[a-z][.)])\s+/
/** Punktor graficzny (lista punktowana w Wordzie); numeracja "1.", "a)" zostaje tekstem - jak w oryginale. */
const PUNKTOR_ZNAK = /^\s*[•●▪■◦○·\-–—*]\s+/
const NUMERACJA = /^\s*(\(?\d{1,2}(\.\d{1,2})*[.)]|\(?[a-z][.)])\s+/

interface Linia {
  tekst: string; x0: number; x1: number; y: number; h: number; gora: number; dol: number
  pogrubiony: boolean; kursywa: boolean; czcionka: string | null; el: ElementZCzcionka[]
  fragmenty: FragmentTekstu[]; podkreslony?: boolean
}

/** Fragmenty: sąsiednie o tym samym stylu sklejone, białe znaki jak w tekście linii (pojedyncze spacje, bez brzegów). */
function uporzadkujFragmenty(f: FragmentTekstu[]): FragmentTekstu[] {
  const wynik: FragmentTekstu[] = []
  for (const x of f) {
    let t = x.tekst.replace(/\s+/g, ' ')
    const ost = wynik[wynik.length - 1]
    if (ost && ost.tekst.endsWith(' ') && t.startsWith(' ')) t = t.slice(1)
    if (!wynik.length) t = t.trimStart()
    if (!t) continue
    if (ost && ost.b === x.b && ost.i === x.i) ost.tekst += t
    else wynik.push({ tekst: t, b: x.b, i: x.i })
  }
  const ost = wynik[wynik.length - 1]
  if (ost) { ost.tekst = ost.tekst.trimEnd(); if (!ost.tekst) wynik.pop() }
  return wynik
}

/** Indeksy górne i dolne (m³, H₂O) - mniejsze elementy tuż nad / pod linią - dołączone do tej linii. */
function zIndeksami(linie: ElementTekstu[][]): ElementTekstu[][] {
  const h = (l: ElementTekstu[]) => mediana(l.map((e) => e.h))
  const wynik = linie.map((l) => [...l])
  for (let i = 0; i < wynik.length; i++) {
    const l = wynik[i]
    if (!l.length) continue
    for (const j of [i - 1, i + 1]) {
      const n = wynik[j]
      if (!n?.length || h(l) >= 0.8 * h(n)) continue
      const yN = mediana(n.map((e) => e.y))
      const yL = mediana(l.map((e) => e.y))
      if (yL < yN - 0.75 * h(n) || yL > yN + 0.35 * h(n)) continue
      n.push(...l); n.sort((a, b) => a.x - b.x)
      wynik[i] = []
      break
    }
  }
  return wynik.filter((l) => l.length)
}

function linieZElementow(el: ElementZCzcionka[]): Linia[] {
  return zIndeksami(linieTekstu(el)).map((l) => {
    const e0 = l as ElementZCzcionka[]
    const fragmenty: FragmentTekstu[] = []
    let koniec = -Infinity
    for (const e of e0) {
      const odstep = e.x - koniec
      const spacja = fragmenty.length && odstep > Math.max(1, e.h * 0.2) && !fragmenty[fragmenty.length - 1].tekst.endsWith(' ') && !e.str.startsWith(' ')
      fragmenty.push({ tekst: spacja ? ` ${e.str}` : e.str, b: !!e.pogrubiony, i: !!e.kursywa })
      koniec = e.x + e.w
    }
    const uporz = uporzadkujFragmenty(fragmenty)
    const znaki = l.reduce((s, e) => s + e.str.length, 0) || 1
    const pogrubione = e0.filter((e) => e.pogrubiony).reduce((s, e) => s + e.str.length, 0)
    const kursywa = e0.filter((e) => e.kursywa).reduce((s, e) => s + e.str.length, 0)
    const glowne = e0.filter((e) => e.h >= 0.8 * mediana(l.map((x) => x.h)))
    return {
      tekst: uporz.map((f) => f.tekst).join(''), fragmenty: uporz, x0: Math.min(...l.map((e) => e.x)), x1: Math.max(...l.map((e) => e.x + e.w)),
      y: mediana(glowne.map((e) => e.y)), h: mediana(l.map((e) => e.h)), gora: Math.min(...l.map((e) => e.y - e.h * 0.8)), dol: Math.max(...l.map((e) => e.y + e.h * 0.22)),
      pogrubiony: pogrubione / znaki > 0.6, kursywa: kursywa / znaki > 0.6, czcionka: najczestszy(e0.map((e) => e.czcionka ?? null)), el: e0,
    }
  }).filter((l) => l.tekst)
}

/** Wyrównanie pojedynczej linii: wyśrodkowana na środku strony albo treści (do 5 pt), do prawej przy prawym brzegu. */
function wyrownanieLinii(l: Linia, szer: number, srodekTresci = szer / 2): Wyrownanie {
  const srodek = (l.x0 + l.x1) / 2
  const dlugosc = l.x1 - l.x0
  if (dlugosc < 0.7 * szer && Math.min(Math.abs(srodek - szer / 2), Math.abs(srodek - srodekTresci)) < 5 && l.x0 > 0.15 * szer) return 'srodek'
  if (l.x1 > 0.85 * szer && l.x0 > 0.55 * szer) return 'prawo'
  return 'lewo'
}

/** Prostokąt w pt -> ramka względna strony (bez wysokości strony - brak ramki). */
const ramkaWzgledna = (x0: number, gora: number, x1: number, dol: number, szer: number, wys?: number): Ramka | null =>
  wys ? { x: x0 / szer, y: gora / wys, w: (x1 - x0) / szer, h: (dol - gora) / wys } : null

/** Układ bloku z jego linii: ramka, interlinia, czcionka; akapit z równym prawym brzegiem - wyjustowany. */
function ukladBloku(b: BlokDokumentu, linie: Linia[], szer: number, wys?: number) {
  const x0 = Math.min(...linie.map((l) => l.x0))
  const x1 = Math.max(...linie.map((l) => l.x1))
  b.ramka = ramkaWzgledna(x0, Math.min(...linie.map((l) => l.gora)), x1, Math.max(...linie.map((l) => l.dol)), szer, wys)
  b.czcionka = najczestszy(linie.map((l) => l.czcionka))
  // Odstęp znaków: wiersze wyjustowane są rozciągnięte, więc liczy się najciaśniejsza ćwiartka wierszy (np. ostatni).
  const odstepy = linie.map((l) => l.el.filter((e) => e.odstep !== undefined && e.str.trim().length >= 4)).filter((x) => x.length)
    .map((el) => mediana(el.flatMap((e) => Array<number>(Math.min(50, e.str.length)).fill(e.odstep!))))
  if (odstepy.length) b.odstep_znakow = Math.round([...odstepy].sort((a, c) => a - c)[Math.floor((odstepy.length - 1) / 4)] * 100) / 100
  b.interlinia = linie.length > 1 ? Math.round(mediana(linie.slice(1).map((l, i) => l.y - linie[i].y)) * 10) / 10 : 0
  if (linie.length > 1 && b.typ !== 'lista') {
    // Wyrównanie z całego akapitu: wspólny lewy brzeg kolejnych wierszy - do lewej (pierwszy wiersz może mieć wcięcie
    // albo wysunięty numer), wspólny środek - wyśrodkowany, wspólny prawy brzeg - do prawej.
    const reszta = linie.slice(1)
    const lewy = reszta.every((l) => Math.abs(l.x0 - reszta[0].x0) <= 3)
    const srodek = linie.every((l) => Math.abs((l.x0 + l.x1) / 2 - (linie[0].x0 + linie[0].x1) / 2) <= 4)
    const prawy = linie.every((l) => Math.abs(l.x1 - linie[0].x1) <= 4)
    b.wyrownanie = lewy ? 'lewo' : srodek ? 'srodek' : prawy ? 'prawo' : 'lewo'
    if (lewy && Math.abs(linie[0].x0 - reszta[0].x0) > 3) b.wciecie = Math.round((linie[0].x0 - reszta[0].x0) * 10) / 10
  }
  if (b.typ === 'akapit' && b.wyrownanie === 'lewo' && linie.length >= 2
    && linie.slice(0, -1).every((l) => x1 - l.x1 < 0.015 * szer) && (linie.length >= 3 || x1 - linie[linie.length - 1].x1 > 0.05 * szer)
    && x1 - linie[linie.length - 1].x1 > 0.02 * szer) b.wyrownanie = 'wyjustowane'
}

/**
 * Kolejna linia pasuje do akapitu, gdy leży w tej samej kolumnie: lewy brzeg jak w akapicie (z tolerancją na wcięcie
 * pierwszego wiersza albo wysunięty numer), wspólny środek (tekst wyśrodkowany) albo wspólny prawy brzeg.
 */
function wTejSamejKolumnie(linie: Linia[], l: Linia): boolean {
  const ost = linie[linie.length - 1]
  const lewy = linie.length > 1 ? Math.abs(l.x0 - ost.x0) <= 3 : Math.abs(l.x0 - ost.x0) <= 30
  const srodek = Math.abs((l.x0 + l.x1) / 2 - (ost.x0 + ost.x1) / 2) <= 4
  const prawy = Math.abs(l.x1 - ost.x1) <= 4 && l.x0 > ost.x0 + 3
  return lewy || srodek || prawy
}

/** Czcionka treści: rozmiar, którym napisano najwięcej znaków (nagłówki są krótkie, więc nie przesuwają wyniku). */
function rozmiarTresci(linie: Linia[]): number {
  const znaki: Record<number, number> = {}
  for (const l of linie) znaki[Math.round(l.h * 2) / 2] = (znaki[Math.round(l.h * 2) / 2] ?? 0) + l.tekst.length
  return Number(Object.entries(znaki).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0)
}

/**
 * Akapity, nagłówki i listy z linii tekstu: linie o tej samej czcionce i z małym odstępem łączą się w akapit; większa
 * czcionka albo krótka pogrubiona linia to nagłówek; linia z punktorem / numeracją - lista. szer, wys = wymiary strony
 * w pt (z wysokością bloki dostają ramkę - położenie na stronie); trescPt - rozmiar czcionki treści całej strony.
 */
export function blokiZTekstu(el: ElementZCzcionka[], szer: number, opcje: { wys?: number; trescPt?: number } = {}): BlokDokumentu[] {
  return blokiZLinii(linieZElementow(el), szer, opcje)
}

function blokiZLinii(linie: Linia[], szer: number, opcje: { wys?: number; trescPt?: number; srodekTresci?: number }): BlokDokumentu[] {
  if (!linie.length) return []
  const tresc = opcje.trescPt || rozmiarTresci(linie)
  const srodekTresci = opcje.srodekTresci ?? (Math.min(...linie.map((x) => x.x0)) + Math.max(...linie.map((x) => x.x1))) / 2
  const wynik: BlokDokumentu[] = []
  let biezacy: { b: BlokDokumentu; ostatnia: Linia; linie: Linia[] } | null = null
  const zamknij = () => {
    const c = biezacy as { b: BlokDokumentu; linie: Linia[] } | null
    if (c) {
      ukladBloku(c.b, c.linie, szer, opcje.wys)
      // Akapit zawija się na pełnej szerokości - wiersz przed ostatnim wyraźnie krótszy to twarde złamanie w oryginale.
      // Gdy takich wierszy jest co najmniej połowa (adres, nagłówek pisma) - każdy wiersz osobno; inaczej złamanie tylko
      // po krótkim wierszu (dłuższe tłumaczenie zawija się wtedy normalnie, bez „poszarpanych” wierszy).
      const maks = Math.max(...c.linie.map((l) => l.x1 - l.x0))
      const krotkie = c.linie.slice(0, -1).map((l) => l.x1 - l.x0 < 0.85 * maks)
      if (c.b.typ === 'akapit' && krotkie.some(Boolean)) {
        const wszystkie = krotkie.filter(Boolean).length >= krotkie.length / 2
        const sep = (i: number) => (wszystkie || krotkie[i - 1] ? '\n' : ' ')
        c.b.tekst = c.linie.map((l, i) => (i ? sep(i) : '') + l.tekst).join('')
        if (c.b.fragmenty) c.b.fragmenty = c.linie.flatMap((l, i) => [...(i ? [{ tekst: sep(i), b: false, i: false }] : []), ...l.fragmenty.map((f) => ({ ...f }))])
      }
      c.b.podkreslony = c.linie.every((l) => l.podkreslony) || undefined
      if (c.b.typ === 'akapit') c.b.pogrubiony = c.linie.filter((l) => l.pogrubiony).reduce((x, l) => x + l.tekst.length, 0) > 0.6 * c.b.tekst.length
      // Formatowanie wewnątrz akapitu tylko, gdy jest mieszane (inaczej wystarczy pogrubienie / kursywa bloku).
      const f = c.b.fragmenty ?? []
      if (!(f.some((x) => x.b) && f.some((x) => !x.b)) && !(f.some((x) => x.i) && f.some((x) => !x.i))) delete c.b.fragmenty
      wynik.push(c.b)
    }
    biezacy = null
  }
  for (const l of linie) {
    const stosunek = l.h / (tresc || 1)
    const naglowek = stosunek >= 1.18 || (l.pogrubiony && l.tekst.length <= 90 && !/[.,;:]$/.test(l.tekst) && stosunek >= 0.95)
    const punktor = PUNKTOR_ZNAK.exec(l.tekst)
    const cur = biezacy as { b: BlokDokumentu; ostatnia: Linia; linie: Linia[] } | null
    const odstep: number = cur ? l.y - cur.ostatnia.y : Infinity
    const rozmiar = Math.round(l.h)
    const wyrownanie = wyrownanieLinii(l, szer, srodekTresci)
    if (punktor && !naglowek) {
      const tekst = l.tekst.slice(punktor[0].length).trim()
      if (cur && cur.b.typ === 'lista' && odstep < 2.2 * l.h) { cur.b.elementy.push(tekst); cur.ostatnia = l; cur.linie.push(l); continue }
      zamknij()
      biezacy = { b: blok({ typ: 'lista', elementy: [tekst], rozmiar }), ostatnia: l, linie: [l] }
      continue
    }
    if (cur && cur.b.typ === 'lista' && !naglowek && odstep < 1.8 * l.h && l.x0 > cur.ostatnia.x0 + 2) {
      // Zawinięta linia punktu listy.
      cur.b.elementy[cur.b.elementy.length - 1] += ` ${l.tekst}`; cur.ostatnia = l; cur.linie.push(l); continue
    }
    const pasuje = cur && !NUMERACJA.test(l.tekst) && cur.b.typ === (naglowek ? 'naglowek' : 'akapit') && odstep < 1.8 * Math.max(l.h, cur.ostatnia.h)
      && Math.abs(cur.ostatnia.h - l.h) < 0.15 * l.h && (cur.b.typ === 'akapit' || cur.ostatnia.pogrubiony === l.pogrubiony) && wTejSamejKolumnie(cur.linie, l)
    if (pasuje && cur) {
      // Linia urwana wcześniej, niż wymagała szerokość akapitu (pierwsze słowo następnej by się zmieściło) - twarde
      // złamanie linii w oryginale (adres, nagłówek pisma); inaczej zwykłe zawinięcie.
      const szerZnaku = (l.x1 - l.x0) / Math.max(1, l.tekst.length)
      const pierwsze = (l.tekst.split(' ')[0]?.length ?? 0) * szerZnaku
      const maks = Math.max(l.x1 - l.x0, ...cur.linie.map((x) => x.x1 - x.x0))
      const twarde = (cur.ostatnia.x1 - cur.ostatnia.x0) + szerZnaku + pierwsze < maks - 2
      const dzielenie = !twarde && cur.b.tekst.endsWith('-') && /^[a-ząęłńóśźż]/.test(l.tekst)
      const laczenie = twarde ? `${cur.b.tekst}\n` : dzielenie ? cur.b.tekst.slice(0, -1) : `${cur.b.tekst} `
      cur.b.tekst = laczenie + l.tekst
      if (cur.b.fragmenty) {
        const ost = cur.b.fragmenty[cur.b.fragmenty.length - 1]
        ost.tekst = dzielenie ? ost.tekst.slice(0, -1) : `${ost.tekst}${twarde ? '\n' : ' '}`
        cur.b.fragmenty.push(...l.fragmenty.map((x) => ({ ...x })))
      }
      cur.ostatnia = l
      cur.linie.push(l)
      continue
    }
    zamknij()
    biezacy = {
      b: blok({
        typ: naglowek ? 'naglowek' : 'akapit', poziom: naglowek ? (stosunek >= 1.6 ? 1 : stosunek >= 1.3 ? 2 : 3) : 0,
        tekst: l.tekst, pogrubiony: l.pogrubiony, kursywa: l.kursywa, wyrownanie, rozmiar, fragmenty: l.fragmenty.map((x) => ({ ...x })),
      }),
      ostatnia: l,
      linie: [l],
    }
  }
  zamknij()
  return wynik
}

/** Tabela z elementów warstwy tekstowej (te same kolumny co odczyt tabel rysunków) z szerokościami kolumn i położeniem. */
export function tabelaZTekstu(el: ElementZCzcionka[], opcje: { szer?: number; wys?: number; obszar?: Prostokat; obramowanie?: boolean; pionowe?: Prostokat[] } = {}): BlokDokumentu | null {
  const t = ulozWTabele(el)
  const wiersze = t.wiersze.filter((w) => w.some((k) => k.trim()))
  if (!wiersze.length) return null
  const x0 = Math.min(opcje.obszar?.x ?? Infinity, ...el.map((e) => e.x))
  const x1 = Math.max(opcje.obszar ? opcje.obszar.x + opcje.obszar.w : -Infinity, ...el.map((e) => e.x + e.w))
  const gora = opcje.obszar?.y ?? Math.min(...el.map((e) => e.y - e.h * 0.8))
  const dol = opcje.obszar ? opcje.obszar.y + opcje.obszar.h : Math.max(...el.map((e) => e.y + e.h * 0.22))
  // Granica kolumn w połowie przerwy między nimi - albo na pionowych liniach siatki, gdy jest ich tyle, ile granic.
  const k = t.kolumny ?? []
  let granice = [x0, ...k.slice(1).map((c, i) => (k[i][1] + c[0]) / 2), x1]
  const xs: number[] = []
  for (const l of opcje.pionowe ?? []) {
    const x = l.x + l.w / 2
    if (x > x0 + 3 && x < x1 - 3 && Math.min(l.y + l.h, dol) - Math.max(l.y, gora) > 0 && !xs.some((v) => Math.abs(v - x) < 3)) xs.push(x)
  }
  if (k.length > 1 && xs.length === k.length - 1) granice = [x0, ...xs.sort((a, b) => a - b), x1]
  const kolumny = k.length === wiersze[0].length && x1 > x0 ? granice.slice(1).map((g, i) => Math.max(0.02, (g - granice[i]) / (x1 - x0))) : []
  const suma = kolumny.reduce((s, x) => s + x, 0) || 1
  // Styl komórek: wiersze wg linii bazowej (jak w ulozWTabele), kolumna wg granic; komórka pogrubiona / kursywą,
  // gdy tak są zapisane wszystkie jej elementy.
  const h = mediana(el.map((e) => e.h)) || 8
  const rzedy: ElementZCzcionka[][] = []
  for (const e of [...el].filter((x) => x.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const ost = rzedy[rzedy.length - 1]
    if (ost && Math.abs(e.y - ost.reduce((s2, x) => s2 + x.y, 0) / ost.length) <= 0.45 * h) ost.push(e)
    else rzedy.push([e])
  }
  const kolumnaX = (x: number) => { let j = 0; granice.slice(1, -1).forEach((g, n) => { if (x >= g) j = n + 1 }); return j }
  const style_komorek = rzedy.length === wiersze.length && kolumny.length
    ? rzedy.map((r, i) => wiersze[i].map((_, c) => {
      const w = r.filter((e) => kolumnaX(e.x + e.w / 2) === c)
      if (!w.length) return ''
      // Wyrównanie w komórce tabeli z siatką: tekst na środku kolumny albo przy jej prawej krawędzi.
      let wyr = ''
      if (opcje.obramowanie) {
        const a = granice[c], b = granice[c + 1], sz = b - a
        const t0 = Math.min(...w.map((e) => e.x)), t1 = Math.max(...w.map((e) => e.x + e.w))
        if (t1 - t0 < 0.85 * sz && Math.abs((t0 + t1) / 2 - (a + b) / 2) < 0.08 * sz && t0 - a > 0.1 * sz) wyr = 'c'
        else if (b - t1 < 0.08 * sz && t0 - a > 0.25 * sz) wyr = 'r'
      }
      return `${w.every((e) => e.pogrubiony) ? 'b' : ''}${w.every((e) => e.kursywa) ? 'i' : ''}${wyr}`
    }))
    : undefined
  const naglowek = wiersze.length > 1 && (style_komorek ? style_komorek[0].every((x, c) => x.includes('b') || !wiersze[0][c]) : !!opcje.obramowanie)
  return blok({
    style_komorek,
    typ: 'tabela', wiersze, naglowek_tabeli: naglowek, rozmiar: Math.round(mediana(el.map((e) => e.h))),
    ramka: opcje.szer ? ramkaWzgledna(x0, gora, x1, dol, opcje.szer, opcje.wys) : null,
    kolumny: kolumny.map((x) => Math.round((x / suma) * 1000) / 1000), obramowanie: !!opcje.obramowanie,
    czcionka: najczestszy(el.map((e) => e.czcionka ?? null)),
  })
}

/** Odcinki linii: elementy rozdzielone przerwą większą niż ~1,5 wysokości znaku (kolumny tabeli, tekst obok siebie). */
function odcinkiLinii(l: Linia): { start: number; przerwa: number }[] {
  const wynik: { start: number; przerwa: number }[] = []
  let koniec = -Infinity
  for (const e of l.el) {
    const przerwa = e.x - koniec
    if (przerwa > Math.max(1.0 * e.h, 6)) wynik.push({ start: e.x, przerwa })
    koniec = Math.max(koniec, e.x + e.w)
  }
  return wynik
}

/**
 * Ciąg linii z odcinkami to tabela, gdy kolumny się powtarzają: co najmniej dwa początki odcinków wspólne dla połowy
 * linii (np. wyśrodkowana stopka z kilkoma przerwami nie jest tabelą). Jedna linia - przy wyraźnej przerwie (>= 2,5 znaku).
 */
function ciagJestTabela(g: Linia[]): boolean {
  const odc = g.map(odcinkiLinii)
  if (g.length === 1) return odc[0].slice(1).some((o) => o.przerwa >= 2.5 * g[0].h)
  const starty = odc.flat().map((o) => o.start)
  const wspolne = [...new Set(starty.map((x) => Math.round(x / 4)))].filter((x) => odc.filter((l) => l.some((o) => Math.abs(o.start / 4 - x) <= 1)).length >= Math.max(2, g.length / 2))
  return wspolne.length >= 2
}

/** Siatki tabel z linii grafiki: >= 3 poziome linie o tym samym zakresie X, jedna pod drugą. */
export function siatkiTabel(linie: Prostokat[]): Prostokat[] {
  const poziome = linie.filter((l) => l.h <= 2 && l.w >= 40).sort((a, b) => a.y - b.y)
  const siatki: Prostokat[][] = []
  for (const l of poziome) {
    const s = siatki.find((g) => {
      const o = g[g.length - 1]
      return Math.abs(o.x - l.x) < 6 && Math.abs(o.x + o.w - l.x - l.w) < 6 && l.y - o.y < 90 && l.y - o.y > 2
    })
    if (s) s.push(l)
    else siatki.push([l])
  }
  return siatki.filter((g) => g.length >= 3).map((g) => ({ x: g[0].x, y: g[0].y, w: g[0].w, h: g[g.length - 1].y - g[0].y }))
}

/** Tabela ma obramowanie, gdy w jej obszarze są co najmniej dwie poziome linie na połowę jej szerokości. */
const maObramowanie = (o: Prostokat, linie: Prostokat[]) =>
  linie.filter((l) => l.h <= 2 && l.y >= o.y - 4 && l.y <= o.y + o.h + 4 && Math.min(l.x + l.w, o.x + o.w) - Math.max(l.x, o.x) >= 0.5 * o.w).length >= 2

/**
 * Strona PDF z warstwą tekstową -> bloki z położeniem na stronie. Bez obszarów: tabele wykryte automatycznie (siatka linii
 * albo kolejne linie z tekstem w kolumnach), reszta jako akapity / nagłówki / listy, obrazy (logo, rysunki) jako bloki
 * "obraz". Z obszarami: w kolejności od góry, obszar "tabela" jako tabela, "tekst" jako akapity. Wymiary i obszary w pt.
 */
export function blokiStrony(
  el: ElementZCzcionka[], szerPt: number, obszary: (Prostokat & { rodzaj: RodzajObszaruTekstu })[] = [],
  opcje: { wysPt?: number; grafika?: GrafikaStrony } = {},
): BlokDokumentu[] {
  const wys = opcje.wysPt
  const linieGrafiki = opcje.grafika?.linie ?? []
  if (obszary.length) {
    return [...obszary].sort((a, b) => a.y - b.y || a.x - b.x).flatMap((o) => {
      const wObszarze = elementyWObszarze(el, o) as ElementZCzcionka[]
      if (o.rodzaj === 'tabela') {
        const t = tabelaZTekstu(wObszarze, { szer: szerPt, wys, obszar: o, obramowanie: maObramowanie(o, linieGrafiki), pionowe: linieGrafiki.filter((l) => l.w <= 2) })
        return t ? [t] : []
      }
      return blokiZTekstu(wObszarze, szerPt, { wys })
    })
  }
  const wszystkie = linieZElementow(el)
  const trescPt = rozmiarTresci(wszystkie)
  // Punktor narysowany jako kształt (kropka tuż przed początkiem linii) - dopisany jako znak listy.
  for (const k of opcje.grafika?.kropki ?? []) {
    const l = wszystkie.find((x) => k.y + k.h / 2 >= x.gora && k.y + k.h / 2 <= x.dol && x.x0 - (k.x + k.w) >= 2 && x.x0 - (k.x + k.w) <= 40 && !PUNKTOR_ZNAK.test(x.tekst))
    if (l) { l.tekst = `• ${l.tekst}`; l.fragmenty.unshift({ tekst: '• ', b: false, i: false }); l.x0 = k.x }
  }
  // Podkreślenie: pozioma linia tuż pod linią bazową na prawie całej szerokości tekstu.
  for (const l of wszystkie) {
    // (linia dużo dłuższa od tekstu to krawędź komórki albo separator, nie podkreślenie)
    l.podkreslony = linieGrafiki.some((g) => g.h <= 2 && g.w <= 1.3 * (l.x1 - l.x0) + 4 && g.y >= l.y - 0.5 && g.y <= l.y + 0.35 * l.h + 1.5 && Math.min(g.x + g.w, l.x1) - Math.max(g.x, l.x0) >= 0.8 * (l.x1 - l.x0))
  }
  // 0. Plamy grafiki (logo wektorowe, stopka z krzywych, podpis) idą do Worda jako obraz w swoim miejscu - pasami
  //    wierszy z tuszem. Linia tekstu w wierszu z tuszem jest częścią rysunku (np. stopka, z której tylko kawałki są
  //    tekstem) - inaczej byłaby dwa razy; linia w wierszu bez tuszu zostaje tekstem. Tekst na ciemnym tle (kolorowy
  //    pasek z nagłówkiem) zostaje tekstem, a pasek jest tłem - pomijany.
  const wPlamie = (l: Linia, o: Prostokat) => (l.x0 + l.x1) / 2 >= o.x - 2 && (l.x0 + l.x1) / 2 <= o.x + o.w + 2 && l.y - l.h / 2 >= o.y - 2 && l.y - l.h / 2 <= o.y + o.h + 2
  const tuszWLinii = (l: Linia, o: PlamaGrafiki) => {
    const a = Math.max(0, Math.floor((l.gora - o.y) / o.krok))
    const b = Math.min(o.wiersze.length - 1, Math.floor((l.dol - o.y) / o.krok))
    for (let i = a; i <= b; i++) if (o.wiersze[i]) return true
    return false
  }
  const naTle = (l: Linia) => mediana(l.el.map((e) => e.tlo ?? 255)) < 128
  const pasyPlam: Prostokat[] = []
  const wRysunku = new Set<Linia>()
  for (const o of opcje.grafika?.plamy ?? []) {
    const przyLinii = wszystkie.some((l) => Math.min(l.dol, o.y + o.h) - Math.max(l.gora, o.y) > 0 && o.h <= 1.6 * l.h && o.w < 40
      && (Math.abs(o.x - l.x1) < 5 || Math.abs(o.x + o.w - l.x0) < 5))
    if (przyLinii) continue
    const wewnatrz = wszystkie.filter((l) => wPlamie(l, o))
    if (wewnatrz.some(naTle)) continue
    // Znaki w środku linii tekstu (indeksy, symbole narysowane krzywymi) - to nie rysunek, tekst zostaje.
    const wLinii = wszystkie.some((l) => l.x0 < o.x - 2 && l.x1 > o.x + o.w + 2 && Math.min(l.dol, o.y + o.h) - Math.max(l.gora, o.y) > 0)
    if (wLinii) continue
    wewnatrz.filter((l) => tuszWLinii(l, o)).forEach((l) => wRysunku.add(l))
    // Pasy: ciągłe wiersze z tuszem (przerwa do 2 wierszy w pasie).
    let start = -1
    let pusto = 0
    o.wiersze.forEach((w, i) => {
      if (w) { if (start < 0) start = i; pusto = 0 } else if (start >= 0 && ++pusto > 2) { pasyPlam.push({ x: o.x, y: o.y + start * o.krok, w: o.w, h: (i - pusto + 1 - start) * o.krok }); start = -1 }
    })
    if (start >= 0) pasyPlam.push({ x: o.x, y: o.y + start * o.krok, w: o.w, h: (o.wiersze.length - pusto - start) * o.krok })
  }
  // Linia tekstu w tym samym wierszu co pas rysunku i tuż obok niego (np. reszta zdania, którego początek jest
  // narysowany) - też do obrazu, inaczej rysunek i tekst rozjechałyby się w Wordzie. Pas obejmuje wchłonięte linie.
  for (let zmiana = true; zmiana;) {
    zmiana = false
    for (const p of pasyPlam) {
      for (const l of wszystkie) {
        const pion = Math.min(l.dol, p.y + p.h) - Math.max(l.gora, p.y)
        const odstep = Math.max(l.x0 - (p.x + p.w), p.x - l.x1)
        const wchlonieta = wRysunku.has(l) && pion > 0
        if (!wchlonieta && (wRysunku.has(l) || naTle(l) || pion < 0.5 * (l.dol - l.gora) || odstep > 2 * l.h)) continue
        wRysunku.add(l)
        const x0 = Math.min(p.x, l.x0), x1 = Math.max(p.x + p.w, l.x1), y0 = Math.min(p.y, l.gora), y1 = Math.max(p.y + p.h, l.dol)
        if (x0 < p.x - 0.5 || x1 > p.x + p.w + 0.5 || y0 < p.y - 0.5 || y1 > p.y + p.h + 0.5) { Object.assign(p, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); zmiana = true }
      }
    }
  }
  const linie = wszystkie.filter((l) => !wRysunku.has(l))
  // 1. Tabele: siatki z linii, potem ciągi linii z tekstem w kolumnach.
  const siatki = siatkiTabel(linieGrafiki)
  const wTabeli = new Map<Linia, number>()
  const grupy: Linia[][] = []
  siatki.forEach((s) => {
    const g = linie.filter((l) => !wTabeli.has(l) && l.y - l.h / 2 >= s.y - 2 && l.y - l.h / 2 <= s.y + s.h + 2 && (l.x0 + l.x1) / 2 >= s.x && (l.x0 + l.x1) / 2 <= s.x + s.w)
    if (g.length) { g.forEach((l) => wTabeli.set(l, grupy.length)); grupy.push(g) }
  })
  let ciag: Linia[] = []
  const zamknijCiag = () => { if (ciag.length && ciagJestTabela(ciag)) { ciag.forEach((l) => wTabeli.set(l, grupy.length)); grupy.push(ciag) } ciag = [] }
  for (const l of linie) {
    if (wTabeli.has(l)) { zamknijCiag(); continue }
    const kolumny = odcinkiLinii(l).length >= 2 && !PUNKTOR_ZNAK.test(l.tekst)
    const ost = ciag[ciag.length - 1]
    if (kolumny && (!ost || l.y - ost.y < 2.6 * Math.max(l.h, ost.h))) { ciag.push(l); continue }
    zamknijCiag()
    if (kolumny) ciag.push(l)
  }
  zamknijCiag()
  const tabele = grupy.map((g, i) => {
    const s = siatki.find((x) => g.every((l) => l.y - l.h / 2 >= x.y - 2 && l.y - l.h / 2 <= x.y + x.h + 2))
    const elementy = g.flatMap((l) => l.el)
    const o = s ?? { x: Math.min(...g.map((l) => l.x0)), y: Math.min(...g.map((l) => l.gora)), w: Math.max(...g.map((l) => l.x1)) - Math.min(...g.map((l) => l.x0)), h: Math.max(...g.map((l) => l.dol)) - Math.min(...g.map((l) => l.gora)) }
    const t = tabelaZTekstu(elementy, { szer: szerPt, wys, obszar: s, obramowanie: !!s || maObramowanie(o, linieGrafiki), pionowe: linieGrafiki.filter((l) => l.w <= 2) })
    return { t, o, i }
  }).filter((x) => x.t)
  // 2. Reszta linii - kawałkami między tabelami (akapit nie przeskakuje nad tabelą).
  const bloki: BlokDokumentu[] = tabele.map((x) => x.t!)
  let kawalek: Linia[] = []
  const srodekTresci = wszystkie.length ? (Math.min(...wszystkie.map((l) => l.x0)) + Math.max(...wszystkie.map((l) => l.x1))) / 2 : szerPt / 2
  const zamknijKawalek = () => { bloki.push(...blokiZLinii(kawalek, szerPt, { wys, trescPt, srodekTresci })); kawalek = [] }
  for (const l of linie) {
    if (wTabeli.has(l)) { zamknijKawalek(); continue }
    kawalek.push(l)
  }
  zamknijKawalek()
  // 3. Obrazy (bez tła całej strony i drobnych ozdobników) i plamy grafiki poza tabelami (cieniowanie wierszy to nie obraz).
  if (wys) {
    const wspolne = (a: Prostokat, b: Prostokat) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
    const obrazy = (opcje.grafika?.obrazy ?? []).filter((o) => o.w >= 12 && o.h >= 12 && (o.w * o.h) / (szerPt * wys) <= 0.5)
    const plamyPoza = pasyPlam.filter((p) => p.h >= 4 && !tabele.some((x) => wspolne(p, x.o) > 0.3 * p.w * p.h) && !obrazy.some((o) => wspolne(p, o) > 0.5 * p.w * p.h))
    for (const o of [...obrazy, ...plamyPoza]) bloki.push(blok({ typ: 'obraz', ramka: ramkaWzgledna(o.x, o.y, o.x + o.w, o.y + o.h, szerPt, wys) }))
  }
  return wys ? posortujBloki(bloki) : bloki
}

/**
 * Układ dokładny (formularze, karty danych): każdy odcinek linii tekstu (tekst rozdzielony dużą przerwą - zwykle komórka)
 * to pole w miejscu oryginału; kolejne odcinki tej samej komórki (ten sam lewy brzeg, środek albo prawy brzeg, mały
 * odstęp, bez linii siatki między nimi) łączą się w jedno pole z podziałem wierszy. Linie i grafikę daje tło strony.
 */
export function blokiDokladne(el: ElementZCzcionka[], szerPt: number, wysPt: number, grafika?: GrafikaStrony): BlokDokumentu[] {
  const poziome = (grafika?.linie ?? []).filter((l) => l.h <= 2)
  // Odcinki linii jako osobne "linie" (z fragmentami formatowania).
  const odcinki: Linia[] = []
  for (const l of linieZElementow(el)) {
    let biez: ElementZCzcionka[] = []
    let koniec = -Infinity
    const zamknij = () => { if (biez.length) odcinki.push(...linieZElementow(biez)); biez = [] }
    for (const e of l.el) {
      if (biez.length && e.x - koniec > Math.max(1.0 * e.h, 6)) zamknij()
      biez.push(e)
      koniec = Math.max(koniec, e.x + e.w)
    }
    zamknij()
  }
  odcinki.sort((a, b) => a.y - b.y || a.x0 - b.x0)
  const grupy: Linia[][] = []
  for (const o of odcinki) {
    const g = grupy.find((x) => {
      const ost = x[x.length - 1]
      if (o.y - ost.y <= 0 || o.y - ost.y > 1.7 * Math.max(o.h, ost.h) || Math.abs(o.h - ost.h) > 0.15 * o.h) return false
      const lewy = Math.abs(o.x0 - ost.x0) <= 3, srodek = Math.abs((o.x0 + o.x1) / 2 - (ost.x0 + ost.x1) / 2) <= 3, prawy = Math.abs(o.x1 - ost.x1) <= 3
      if (!lewy && !srodek && !prawy) return false
      // Linia siatki między odcinkami - to już inna komórka.
      return !poziome.some((l) => l.y > ost.dol - 1 && l.y < o.gora + 1 && Math.min(l.x + l.w, o.x1) - Math.max(l.x, o.x0) > 0)
    })
    if (g) g.push(o)
    else grupy.push([o])
  }
  return grupy.map((g) => {
    const x0 = Math.min(...g.map((l) => l.x0)), x1 = Math.max(...g.map((l) => l.x1))
    const wyrownanie: Wyrownanie = g.length > 1 && g.every((l) => Math.abs(l.x0 - g[0].x0) <= 3) ? 'lewo'
      : g.length > 1 && g.every((l) => Math.abs(l.x1 - g[0].x1) <= 3) ? 'prawo' : g.length > 1 ? 'srodek' : 'lewo'
    const fragmenty = g.flatMap((l, i) => [...(i ? [{ tekst: '\n', b: false, i: false }] : []), ...l.fragmenty.map((f) => ({ ...f }))])
    const b = blok({
      typ: 'akapit', tekst: g.map((l) => l.tekst).join('\n'), wyrownanie, rozmiar: Math.round(mediana(g.map((l) => l.h)) * 2) / 2,
      pogrubiony: g.filter((l) => l.pogrubiony).reduce((x, l) => x + l.tekst.length, 0) > 0.6 * g.reduce((x, l) => x + l.tekst.length, 0),
      kursywa: g.every((l) => l.kursywa), fragmenty,
    })
    ukladBloku(b, g, szerPt, wysPt)
    b.ramka = ramkaWzgledna(x0, Math.min(...g.map((l) => l.gora)), x1, Math.max(...g.map((l) => l.dol)), szerPt, wysPt)
    const f = b.fragmenty ?? []
    if (!(f.some((x) => x.b) && f.some((x) => !x.b && x.tekst !== '\n')) && !(f.some((x) => x.i) && f.some((x) => !x.i && x.tekst !== '\n'))) delete b.fragmenty
    return b
  })
}

/** Kolejność czytania: od góry (pas ~1% strony), w pasie od lewej; bloki bez ramki zostają na swoim miejscu. */
export function posortujBloki(bloki: BlokDokumentu[]): BlokDokumentu[] {
  if (!bloki.every((b) => b.ramka)) return bloki
  return [...bloki].sort((a, b) => (Math.abs(a.ramka!.y - b.ramka!.y) < 0.01 ? a.ramka!.x - b.ramka!.x : a.ramka!.y - b.ramka!.y))
}

/** Wymiary strony w pt; zdjęcie (piksele) albo nietypowa skala - przeliczone na dłuższy bok A4. */
export function wymiaryWorda(w?: WymiaryStrony | null): { W: number; H: number } {
  if (!w || !(w.szerPt > 0) || !(w.wysPt > 0)) return { W: 595.3, H: 841.9 }
  const bok = Math.max(w.szerPt, w.wysPt)
  const k = bok > 1700 || bok < 300 ? 841.9 / bok : 1
  return { W: w.szerPt * k, H: w.wysPt * k }
}

/** Zakres stron z tekstu "1-3, 5" (puste - wszystkie); strony spoza dokumentu pominięte. */
export function parsujStrony(tekst: string, maks: number): number[] {
  const wszystkie = Array.from({ length: maks }, (_, i) => i + 1)
  if (!tekst.trim()) return wszystkie
  const wynik = new Set<number>()
  for (const c of tekst.split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(c)
    if (!m) continue
    const a = Number(m[1])
    const b = Number(m[2] ?? m[1])
    for (let n = Math.min(a, b); n <= Math.max(a, b); n++) if (n >= 1 && n <= maks) wynik.add(n)
  }
  return [...wynik].sort((a, b) => a - b)
}

/** Strony jako zwięzły zakres: [1,2,3,5] -> "1-3, 5". */
export function opisStron(strony: number[]): string {
  const s = [...new Set(strony)].sort((a, b) => a - b)
  const czesci: string[] = []
  for (let i = 0; i < s.length; i++) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++
    czesci.push(j > i ? `${s[i]}-${s[j]}` : String(s[i]))
    i = j
  }
  return czesci.join(', ')
}

// --- Inne formaty -------------------------------------------------------------------------------------

/** Zwykły tekst: akapity rozdzielone pustą linią, linie z punktorem - listy. */
export function blokiZTekstuZwyklego(tekst: string): BlokDokumentu[] {
  return tekst.replace(/\r/g, '').split(/\n{2,}/).map((a) => a.trim()).filter(Boolean).map((a) => {
    const linie = a.split('\n')
    if (linie.length > 1 && linie.every((l) => PUNKTOR.test(l))) return blok({ typ: 'lista', elementy: linie.map((l) => l.replace(PUNKTOR, '').trim()) })
    return blok({ typ: 'akapit', tekst: linie.join('\n') })
  })
}

/** Arkusz (wiersze komórek) -> nagłówek z nazwą arkusza i tabela; puste wiersze i kolumny pominięte. */
export function blokiZArkusza(arkusze: { nazwa: string; wiersze: string[][] }[]): BlokDokumentu[] {
  return arkusze.flatMap((a) => {
    const wiersze = a.wiersze.filter((w) => w.some((k) => String(k ?? '').trim()))
    if (!wiersze.length) return []
    const kolumn = Math.max(...wiersze.map((w) => w.length))
    const uzyte = Array.from({ length: kolumn }, (_, i) => wiersze.some((w) => String(w[i] ?? '').trim()))
    const tabela = wiersze.map((w) => uzyte.flatMap((u, i) => (u ? [String(w[i] ?? '').trim()] : [])))
    return [blok({ typ: 'naglowek', poziom: 2, tekst: a.nazwa, pogrubiony: true }), blok({ typ: 'tabela', wiersze: tabela, naglowek_tabeli: true })]
  })
}

/**
 * Teksty z rysunku DXF (encje TEXT, MTEXT, ATTRIB) bez AI - format tekstowy grup "kod / wartość". Formatowanie MTEXT
 * (\P nowa linia, {\f...;} czcionki) usunięte. Kolejność: od góry rysunku (większe Y) do dołu, od lewej.
 */
export function tekstyZDxf(dxf: string): string[] {
  const linie = dxf.replace(/\r/g, '').split('\n')
  const encje: { tekst: string; x: number; y: number }[] = []
  let typ = ''
  let biezaca: { tekst: string; x: number; y: number } | null = null
  for (let i = 0; i + 1 < linie.length; i += 2) {
    const kod = linie[i].trim()
    const wartosc = linie[i + 1]
    if (kod === '0') {
      if (biezaca?.tekst.trim()) encje.push(biezaca)
      typ = wartosc.trim()
      biezaca = ['TEXT', 'MTEXT', 'ATTRIB'].includes(typ) ? { tekst: '', x: 0, y: 0 } : null
      continue
    }
    if (!biezaca) continue
    if (kod === '1' || kod === '3') biezaca.tekst += wartosc
    else if (kod === '10') biezaca.x = Number(wartosc)
    else if (kod === '20') biezaca.y = Number(wartosc)
  }
  if (biezaca?.tekst.trim()) encje.push(biezaca)
  const czysc = (t: string) => t.replace(/\\P/g, '\n').replace(/\\[A-Za-z][^;\\{}]*;/g, '').replace(/[{}]/g, '').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').trim()
  return encje.sort((a, b) => b.y - a.y || a.x - b.x).map((e) => czysc(e.tekst)).filter(Boolean)
}

/** HTML z mammoth (DOCX) -> bloki: nagłówki h1-h3, akapity z pogrubieniem / kursywą całego akapitu, listy, tabele. */
export function blokiZHtml(html: string, parser: (h: string) => Document): BlokDokumentu[] {
  const doc = parser(html)
  const wynik: BlokDokumentu[] = []
  const tekst = (e: Element) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()
  const calyWyrozniony = (e: Element, tag: string) => {
    const t = tekst(e)
    const w = Array.from(e.querySelectorAll(tag)).map(tekst).join(' ').replace(/\s+/g, ' ').trim()
    return !!t && w.length >= t.length * 0.9
  }
  for (const e of Array.from(doc.body.children)) {
    const tag = e.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) wynik.push(blok({ typ: 'naglowek', poziom: Math.min(3, Number(tag[1])), tekst: tekst(e), pogrubiony: true }))
    else if (tag === 'p') { if (tekst(e)) wynik.push(blok({ typ: 'akapit', tekst: tekst(e), pogrubiony: calyWyrozniony(e, 'strong'), kursywa: calyWyrozniony(e, 'em') })) }
    else if (tag === 'ul' || tag === 'ol') wynik.push(blok({ typ: 'lista', elementy: Array.from(e.querySelectorAll(':scope > li')).map(tekst) }))
    else if (tag === 'table') {
      const wiersze = Array.from(e.querySelectorAll('tr')).map((tr) => Array.from(tr.querySelectorAll('td, th')).map(tekst))
      if (wiersze.length) wynik.push(blok({ typ: 'tabela', wiersze, naglowek_tabeli: !!e.querySelector('th') || wiersze.length > 1 }))
    }
  }
  return wynik
}

// --- Wynik AI -----------------------------------------------------------------------------------------

const TYPY: TypBloku[] = ['naglowek', 'akapit', 'lista', 'tabela', 'podpis', 'obraz']
const WYROWNANIA: Wyrownanie[] = ['lewo', 'srodek', 'prawo', 'wyjustowane']
const ulamek = (v: unknown) => Math.max(0, Math.min(1, (Number(v) || 0) / 100))

/** Blok w odpowiedzi AI: pola BlokDokumentu + położenie w % strony i szerokości kolumn w % tabeli. */
interface BlokAi extends Partial<Omit<BlokDokumentu, 'kolumny'>> { x?: number; y?: number; szer?: number; wys?: number; szer_kolumn?: number[] }

/** Bloki z odpowiedzi AI z bezpiecznymi wartościami (nieznany typ -> akapit, tabela bez wierszy pominięta). */
export function blokiZAi(bloki: unknown): BlokDokumentu[] {
  if (!Array.isArray(bloki)) return []
  return bloki.flatMap((x): BlokDokumentu[] => {
    const b = (x ?? {}) as BlokAi
    const typ = TYPY.includes(b.typ as TypBloku) ? b.typ as TypBloku : 'akapit'
    const wiersze = Array.isArray(b.wiersze) ? b.wiersze.map((w) => (Array.isArray(w) ? w.map((k) => String(k ?? '')) : [])) : []
    const elementy = Array.isArray(b.elementy) ? b.elementy.map((k) => String(k ?? '')).filter((k) => k.trim()) : []
    const ramka = Number(b.szer) > 0 && Number(b.wys) > 0
      ? { x: ulamek(b.x), y: ulamek(b.y), w: Math.min(ulamek(b.szer), 1 - ulamek(b.x)), h: Math.min(ulamek(b.wys), 1 - ulamek(b.y)) } : null
    const kol = Array.isArray(b.szer_kolumn) ? b.szer_kolumn.map((k) => Math.max(0, Number(k) || 0)) : []
    const sumaKol = kol.reduce((s, k) => s + k, 0)
    const wynik = blok({
      typ, poziom: typ === 'naglowek' ? Math.min(3, Math.max(1, Number(b.poziom) || 1)) : 0, tekst: String(b.tekst ?? '').trim(),
      pogrubiony: !!b.pogrubiony, kursywa: !!b.kursywa, wyrownanie: WYROWNANIA.includes(b.wyrownanie as Wyrownanie) ? b.wyrownanie as Wyrownanie : 'lewo',
      rozmiar: Math.max(0, Math.min(72, Number(b.rozmiar) || 0)), elementy, wiersze, naglowek_tabeli: !!b.naglowek_tabeli,
      ramka, obramowanie: !!b.obramowanie,
      kolumny: typ === 'tabela' && sumaKol > 0 && kol.length === Math.max(0, ...wiersze.map((w) => w.length)) ? kol.map((k) => Math.round((k / sumaKol) * 1000) / 1000) : [],
    })
    if (typ === 'obraz') return ramka && ramka.w > 0.01 && ramka.h > 0.01 ? [wynik] : []
    if (typ === 'tabela' && !wiersze.length) return []
    if (typ === 'lista' && !elementy.length) return wynik.tekst ? [{ ...wynik, typ: 'akapit' }] : []
    if (!['tabela', 'lista'].includes(typ) && !wynik.tekst) return []
    return [wynik]
  })
}

/** Liczba znaków treści bloku (tekst, punkty listy, komórki tabeli). */
export const znakiBloku = (b: Pick<BlokDokumentu, 'tekst' | 'elementy' | 'wiersze'>) =>
  b.tekst.length + b.elementy.reduce((s, e) => s + e.length, 0) + b.wiersze.reduce((s, w) => s + w.reduce((x, k) => x + k.length, 0), 0)

/**
 * Skala strony tłumaczenia: tekst dłuższy niż oryginał o więcej niż 3% - mniejsza czcionka, interlinia i odstępy
 * (wydłużenie^-0,75, najwyżej o 20%), żeby strona tłumaczenia mieściła się na stronie, jak w oryginale.
 */
export function skalaStronyTlumaczenia(bloki: BlokDokumentu[]): number {
  const z = bloki.filter((b) => b.dl_oryginalu)
  const orig = z.reduce((s, b) => s + b.dl_oryginalu!, 0)
  const tl = z.reduce((s, b) => s + znakiBloku(b), 0)
  const r = orig ? tl / orig : 1
  return r > 1.03 ? Math.max(0.8, Math.round(r ** -0.75 * 100) / 100) : 1
}

/** Bloki do tłumaczenia przez AI: sama treść i struktura (bez obrazów i bez układu - ten zostaje z oryginału). */
export function blokiDoTlumaczenia(bloki: BlokDokumentu[]) {
  return bloki.filter((b) => b.typ !== 'obraz').map((b) => ({
    typ: b.typ, poziom: b.poziom, tekst: zeZnacznikami(b), pogrubiony: b.pogrubiony, kursywa: b.kursywa, wyrownanie: b.wyrownanie,
    rozmiar: b.rozmiar, elementy: b.elementy, wiersze: b.wiersze, naglowek_tabeli: b.naglowek_tabeli,
  }))
}

/** Formatowanie wewnątrz akapitu jako znaczniki [b]...[/b], [i]...[/i] - AI przenosi je na słowa tłumaczenia. */
export function zeZnacznikami(b: Pick<BlokDokumentu, 'tekst' | 'fragmenty'>): string {
  if (!b.fragmenty?.length || b.fragmenty.map((f) => f.tekst).join('') !== b.tekst) return b.tekst
  return b.fragmenty.map((f) => {
    const [lewa, srodek, prawa] = [f.tekst.match(/^\s*/)![0], f.tekst.trim(), f.tekst.match(/\s*$/)![0]]
    if (!srodek) return f.tekst
    const w = f.b ? `[b]${srodek}[/b]` : srodek
    return lewa + (f.i ? `[i]${w}[/i]` : w) + prawa
  }).join('')
}

/** Tekst ze znacznikami [b] / [i] -> tekst i fragmenty (bez znaczników - fragmenty puste). */
export function zeZnacznikow(tekst: string): { tekst: string; fragmenty?: FragmentTekstu[] } {
  if (!/\[\/?[bi]\]/.test(tekst)) return { tekst }
  const fragmenty: FragmentTekstu[] = []
  let b = false
  let i = false
  for (const c of tekst.split(/(\[\/?[bi]\])/)) {
    if (c === '[b]') b = true
    else if (c === '[/b]') b = false
    else if (c === '[i]') i = true
    else if (c === '[/i]') i = false
    else if (c) fragmenty.push({ tekst: c, b, i })
  }
  return { tekst: fragmenty.map((f) => f.tekst).join(''), fragmenty }
}

/**
 * Tłumaczenie z układem oryginału: kolejne bloki tłumaczenia (bez obrazów) wchodzą w miejsce tekstu kolejnych bloków
 * oryginału - położenie, czcionka, kolumny i obrazy zostają z oryginału. Tabela zachowuje liczbę wierszy i komórek
 * oryginału, gdy tłumaczenie ma ten sam kształt. Nadmiarowe bloki tłumaczenia dopisane na końcu (bez położenia).
 */
export function scalTlumaczenie(oryginal: BlokDokumentu[], tlumaczenie: BlokDokumentu[]): BlokDokumentu[] {
  const tl = tlumaczenie.filter((b) => b.typ !== 'obraz')
  let i = 0
  const wynik = oryginal.map((o) => {
    if (o.typ === 'obraz') return o
    const p = tl[i++]
    if (!p) return o
    const wiersze = o.typ === 'tabela' && p.wiersze.length
      ? (p.wiersze.length === o.wiersze.length ? o.wiersze.map((w, r) => w.map((k, c) => p.wiersze[r][c] ?? k)) : p.wiersze) : o.wiersze
    const elementy = o.typ === 'lista' && p.elementy.length ? p.elementy : o.elementy
    const zm = zeZnacznikow(p.tekst || (o.typ === 'tabela' || o.typ === 'lista' ? o.tekst : p.elementy.join('\n') || o.tekst))
    const tekst = zm.tekst
    const skala = o.tekst && tekst.length > o.tekst.length * 1.1 ? Math.max(0.7, Math.round((o.tekst.length / tekst.length) * 100) / 100) : undefined
    return { ...o, tekst, wiersze, elementy, fragmenty: zm.fragmenty, skala_czcionki: skala, dl_oryginalu: znakiBloku(o) }
  })
  return [...wynik, ...tl.slice(i).map((b) => ({ ...b, ramka: null }))]
}

/**
 * Opis kafla przed obrazem dla AI: numer, fragment, położenie w siatce kafli (model łączy kafle bez powtórzeń) i zakres
 * strony w procentach - model podaje położenie bloków w % całej strony.
 */
export function opisKaflaDokumentu(nr: number, fragment: string, k: Prostokat, wszystkie: Prostokat[], naStronie?: Prostokat) {
  const kolumny = [...new Set(wszystkie.map((x) => x.x))].sort((a, b) => a - b)
  const wiersze = [...new Set(wszystkie.map((x) => x.y))].sort((a, b) => a - b)
  const proc = (v: number) => Math.round(v * 1000) / 10
  const zakres = naStronie ? `, obejmuje strony: x ${proc(naStronie.x)}-${proc(naStronie.x + naStronie.w)}%, y ${proc(naStronie.y)}-${proc(naStronie.y + naStronie.h)}%` : ''
  return `Kafel ${nr}: ${fragment}, wiersz ${wiersze.indexOf(k.y) + 1}/${wiersze.length}, kolumna ${kolumny.indexOf(k.x) + 1}/${kolumny.length}${zakres}`
}

/** Strony treści w kolejności numerów (klucze JSON to teksty). */
export const numeryStron = (r: Record<string, unknown>) => Object.keys(r).map(Number).filter((n) => n > 0).sort((a, b) => a - b)
