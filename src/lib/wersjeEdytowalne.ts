// Moduł "Wersje edytowalne": pliki spoza zapytań i wycen (PDF, skany, zdjęcia, DOCX, arkusze, DXF) przerabiane na wersję
// edytowalną - listę bloków (nagłówki, akapity, listy, tabele) z formatowaniem, z której powstaje dokument Word.
// Ta sama struktura bloków przychodzi z odczytu bez AI (warstwa tekstowa PDF, struktura pliku) i z AI (tryb odczytaj_dokument).
// Tu tylko logika bez przeglądarki (testowana); pliki i render: wersjeEdytowalnePliki.ts, Word: wersjeEdytowalneWord.ts.
import { linieTekstu } from './odczytTekstowy'
import { elementyWObszarze, ulozWTabele, type ElementTekstu, type Prostokat } from './rysunki'
import { t } from '@/i18n'

export type TypBloku = 'naglowek' | 'akapit' | 'lista' | 'tabela' | 'podpis'
export type Wyrownanie = 'lewo' | 'srodek' | 'prawo' | 'wyjustowane'

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
}

export interface StronaTresci { bloki: BlokDokumentu[]; zrodlo: 'tekst' | 'ai'; jezyk: string | null }
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

/** Element warstwy tekstowej z informacją o czcionce (pogrubienie / kursywa z nazwy fontu). */
export interface ElementZCzcionka extends ElementTekstu { pogrubiony?: boolean; kursywa?: boolean }

const mediana = (l: number[]) => {
  const s = [...l].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}
const PUNKTOR = /^\s*([•●▪■◦○·\-–—*]|\(?\d{1,2}[.)]|\(?[a-z][.)])\s+/

interface Linia { tekst: string; x0: number; x1: number; y: number; h: number; pogrubiony: boolean; kursywa: boolean }

function linieZElementow(el: ElementZCzcionka[]): Linia[] {
  return linieTekstu(el).map((l) => {
    let tekst = ''
    let koniec = -Infinity
    for (const e of l as ElementZCzcionka[]) {
      const odstep = e.x - koniec
      tekst += tekst && odstep > Math.max(1, e.h * 0.2) && !tekst.endsWith(' ') && !e.str.startsWith(' ') ? ` ${e.str}` : e.str
      koniec = e.x + e.w
    }
    const znaki = l.reduce((s, e) => s + e.str.length, 0) || 1
    const pogrubione = (l as ElementZCzcionka[]).filter((e) => e.pogrubiony).reduce((s, e) => s + e.str.length, 0)
    const kursywa = (l as ElementZCzcionka[]).filter((e) => e.kursywa).reduce((s, e) => s + e.str.length, 0)
    return {
      tekst: tekst.replace(/\s+/g, ' ').trim(), x0: Math.min(...l.map((e) => e.x)), x1: Math.max(...l.map((e) => e.x + e.w)),
      y: l[0].y, h: mediana(l.map((e) => e.h)), pogrubiony: pogrubione / znaki > 0.6, kursywa: kursywa / znaki > 0.6,
    }
  }).filter((l) => l.tekst)
}

function wyrownanieLinii(l: Linia, szer: number): Wyrownanie {
  const srodek = (l.x0 + l.x1) / 2
  const dlugosc = l.x1 - l.x0
  if (dlugosc < 0.7 * szer && Math.abs(srodek - szer / 2) < 0.04 * szer && l.x0 > 0.15 * szer) return 'srodek'
  if (l.x1 > 0.85 * szer && l.x0 > 0.55 * szer) return 'prawo'
  return 'lewo'
}

/**
 * Akapity, nagłówki i listy z linii tekstu: linie o tej samej czcionce i z małym odstępem łączą się w akapit; większa
 * czcionka albo krótka pogrubiona linia to nagłówek; linia z punktorem / numeracją - lista. szer = szerokość strony w pt.
 */
export function blokiZTekstu(el: ElementZCzcionka[], szer: number): BlokDokumentu[] {
  const linie = linieZElementow(el)
  if (!linie.length) return []
  // Czcionka treści: rozmiar, którym napisano najwięcej znaków (nagłówki są krótkie, więc nie przesuwają wyniku).
  const znakiWgRozmiaru: Record<number, number> = {}
  for (const l of linie) znakiWgRozmiaru[Math.round(l.h * 2) / 2] = (znakiWgRozmiaru[Math.round(l.h * 2) / 2] ?? 0) + l.tekst.length
  const tresc = Number(Object.entries(znakiWgRozmiaru).sort((a, b) => b[1] - a[1])[0][0])
  const wynik: BlokDokumentu[] = []
  let biezacy: { b: BlokDokumentu; ostatnia: Linia } | null = null
  const zamknij = () => { if (biezacy) wynik.push(biezacy.b); biezacy = null }
  for (const l of linie) {
    const stosunek = l.h / (tresc || 1)
    const naglowek = stosunek >= 1.18 || (l.pogrubiony && l.tekst.length <= 90 && !/[.,;:]$/.test(l.tekst) && stosunek >= 0.95)
    const punktor = PUNKTOR.exec(l.tekst)
    const odstep: number = biezacy ? l.y - (biezacy as { ostatnia: Linia }).ostatnia.y : Infinity
    const rozmiar = Math.round(l.h)
    const wyrownanie = wyrownanieLinii(l, szer)
    if (punktor && !naglowek) {
      const tekst = l.tekst.slice(punktor[0].length).trim()
      const cur = biezacy as { b: BlokDokumentu; ostatnia: Linia } | null
      if (cur && cur.b.typ === 'lista' && odstep < 2.2 * l.h) { cur.b.elementy.push(tekst); cur.ostatnia = l; continue }
      zamknij()
      biezacy = { b: blok({ typ: 'lista', elementy: [tekst], rozmiar }), ostatnia: l }
      continue
    }
    const cur = biezacy as { b: BlokDokumentu; ostatnia: Linia } | null
    if (cur && cur.b.typ === 'lista' && !naglowek && odstep < 1.8 * l.h && l.x0 > cur.ostatnia.x0 + 2) {
      // Zawinięta linia punktu listy.
      cur.b.elementy[cur.b.elementy.length - 1] += ` ${l.tekst}`; cur.ostatnia = l; continue
    }
    const pasuje = cur && cur.b.typ === (naglowek ? 'naglowek' : 'akapit') && odstep < 1.8 * Math.max(l.h, cur.ostatnia.h)
      && Math.abs(cur.ostatnia.h - l.h) < 0.15 * l.h && cur.ostatnia.pogrubiony === l.pogrubiony && cur.b.wyrownanie === wyrownanie
    if (pasuje && cur) {
      const laczenie = cur.b.tekst.endsWith('-') && /^[a-ząęłńóśźż]/.test(l.tekst) ? cur.b.tekst.slice(0, -1) : `${cur.b.tekst} `
      cur.b.tekst = laczenie + l.tekst
      cur.ostatnia = l
      continue
    }
    zamknij()
    biezacy = {
      b: blok({
        typ: naglowek ? 'naglowek' : 'akapit', poziom: naglowek ? (stosunek >= 1.6 ? 1 : stosunek >= 1.3 ? 2 : 3) : 0,
        tekst: l.tekst, pogrubiony: l.pogrubiony, kursywa: l.kursywa, wyrownanie, rozmiar,
      }),
      ostatnia: l,
    }
  }
  zamknij()
  return wynik
}

/** Tabela z elementów warstwy tekstowej w obszarze (te same kolumny co odczyt tabel rysunków). */
export function tabelaZTekstu(el: ElementTekstu[]): BlokDokumentu | null {
  const t = ulozWTabele(el)
  const wiersze = t.wiersze.filter((w) => w.some((k) => k.trim()))
  return wiersze.length ? blok({ typ: 'tabela', wiersze, naglowek_tabeli: wiersze.length > 1 }) : null
}

/**
 * Strona PDF z warstwą tekstową -> bloki. Bez obszarów: cała strona jako tekst. Z obszarami: w kolejności od góry,
 * obszar "tabela" jako tabela, "tekst" jako akapity. Obszary w punktach strony.
 */
export function blokiStrony(el: ElementZCzcionka[], szerPt: number, obszary: (Prostokat & { rodzaj: RodzajObszaruTekstu })[] = []): BlokDokumentu[] {
  if (!obszary.length) return blokiZTekstu(el, szerPt)
  return [...obszary].sort((a, b) => a.y - b.y || a.x - b.x).flatMap((o) => {
    const wObszarze = elementyWObszarze(el, o) as ElementZCzcionka[]
    if (o.rodzaj === 'tabela') { const t = tabelaZTekstu(wObszarze); return t ? [t] : [] }
    return blokiZTekstu(wObszarze, szerPt)
  })
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

const TYPY: TypBloku[] = ['naglowek', 'akapit', 'lista', 'tabela', 'podpis']
const WYROWNANIA: Wyrownanie[] = ['lewo', 'srodek', 'prawo', 'wyjustowane']

/** Bloki z odpowiedzi AI z bezpiecznymi wartościami (nieznany typ -> akapit, tabela bez wierszy pominięta). */
export function blokiZAi(bloki: unknown): BlokDokumentu[] {
  if (!Array.isArray(bloki)) return []
  return bloki.flatMap((x): BlokDokumentu[] => {
    const b = (x ?? {}) as Partial<BlokDokumentu>
    const typ = TYPY.includes(b.typ as TypBloku) ? b.typ as TypBloku : 'akapit'
    const wiersze = Array.isArray(b.wiersze) ? b.wiersze.map((w) => (Array.isArray(w) ? w.map((k) => String(k ?? '')) : [])) : []
    const elementy = Array.isArray(b.elementy) ? b.elementy.map((k) => String(k ?? '')).filter((k) => k.trim()) : []
    const wynik = blok({
      typ, poziom: typ === 'naglowek' ? Math.min(3, Math.max(1, Number(b.poziom) || 1)) : 0, tekst: String(b.tekst ?? '').trim(),
      pogrubiony: !!b.pogrubiony, kursywa: !!b.kursywa, wyrownanie: WYROWNANIA.includes(b.wyrownanie as Wyrownanie) ? b.wyrownanie as Wyrownanie : 'lewo',
      rozmiar: Math.max(0, Math.min(72, Number(b.rozmiar) || 0)), elementy, wiersze, naglowek_tabeli: !!b.naglowek_tabeli,
    })
    if (typ === 'tabela' && !wiersze.length) return []
    if (typ === 'lista' && !elementy.length) return wynik.tekst ? [{ ...wynik, typ: 'akapit' }] : []
    if (!['tabela', 'lista'].includes(typ) && !wynik.tekst) return []
    return [wynik]
  })
}

/** Opis kafla przed obrazem dla AI: numer, fragment i położenie w siatce kafli (model łączy kafle bez powtórzeń). */
export function opisKaflaDokumentu(nr: number, fragment: string, k: Prostokat, wszystkie: Prostokat[]) {
  const kolumny = [...new Set(wszystkie.map((x) => x.x))].sort((a, b) => a - b)
  const wiersze = [...new Set(wszystkie.map((x) => x.y))].sort((a, b) => a - b)
  return `Kafel ${nr}: ${fragment}, wiersz ${wiersze.indexOf(k.y) + 1}/${wiersze.length}, kolumna ${kolumny.indexOf(k.x) + 1}/${kolumny.length}`
}

/** Strony treści w kolejności numerów (klucze JSON to teksty). */
export const numeryStron = (r: Record<string, unknown>) => Object.keys(r).map(Number).filter((n) => n > 0).sort((a, b) => a - b)
