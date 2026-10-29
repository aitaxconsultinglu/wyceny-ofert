// Wersja edytowalna -> dokument Word. Bloki z położeniem na stronie (ramka) składają się w układzie oryginału: każda
// strona to osobna sekcja o wymiarach i marginesach oryginału, blok ma wcięcia i odstęp przed sobą jak na stronie,
// bloki obok siebie (np. adres i data, logo i nagłówek) idą do niewidocznej tabeli, tabele mają szerokości kolumn
// i obramowanie oryginału, obrazy (logo, rysunki) są wycięte ze strony. Czcionka, rozmiar, pogrubienie, wyrównanie
// i odstęp linii jak w oryginale. Tekst zostaje zwykłym, edytowalnym tekstem (bez pól tekstowych), więc dłuższe
// tłumaczenie przesuwa dalszą treść, zamiast na nią nachodzić. Bloki bez ramki (DOCX, arkusze, starsze odczyty) -
// jako zwykły tekst: nagłówki, akapity, listy, tabele, każda strona od nowej strony.
import {
  AlignmentType, BorderStyle, Document, Footer, FrameAnchorType, FrameWrap, Header, HeadingLevel, HeightRule, HorizontalPositionRelativeFrom, ImageRun,
  LineRuleType, Packer, PageBreak, PageOrientation, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign,
  VerticalPositionRelativeFrom, WidthType, type ISectionOptions,
} from 'docx'
import { nazwaPliku, pobierzPlik } from './pobierz'
import { wymiaryWorda, type BlokDokumentu, type UkladStrony, type Wyrownanie, type WymiaryStrony } from './wersjeEdytowalne'

const WYROWNANIE: Record<Wyrownanie, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  lewo: AlignmentType.LEFT, srodek: AlignmentType.CENTER, prawo: AlignmentType.RIGHT, wyjustowane: AlignmentType.JUSTIFIED,
}
const POZIOMY = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3]
const RAMKA = { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' }
const RAMKA_UKLADU = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
const BRAK = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const BEZ_RAMEK = { top: BRAK, bottom: BRAK, left: BRAK, right: BRAK, insideHorizontal: BRAK, insideVertical: BRAK }
/** Twipy (1/20 pt) - jednostka wymiarów Worda. */
const tw = (pt: number) => Math.max(0, Math.round(pt * 20))

export interface ObrazBloku { dane: Uint8Array; typ: 'png' | 'jpg' }
export interface StronaWorda {
  nr: number
  bloki: BlokDokumentu[]
  wymiary?: WymiaryStrony | null
  /** Wycięte obrazy bloków "obraz" - indeks bloku -> bajty. */
  obrazy?: Record<number, ObrazBloku>
  /** Układ strony (domyślnie płynny) i tło strony bez tekstu dla układu dokładnego. */
  uklad?: UkladStrony
  tlo?: ObrazBloku | null
}

/** Tekst z nowymi liniami jako kolejne przebiegi z łamaniem linii. */
type StylPrzebiegu = { bold?: boolean; italics?: boolean; size?: number; font?: string; color?: string; underline?: object; characterSpacing?: number }
const przebiegi = (tekst: string, o: StylPrzebiegu) =>
  tekst.split('\n').map((l, i) => new TextRun({ text: l, break: i ? 1 : 0, ...o }))

/** Tekst bloku z formatowaniem wewnątrz (pogrubione słowa), gdy fragmenty pasują do tekstu (po tłumaczeniu ich nie ma). */
const przebiegiBloku = (b: BlokDokumentu, o: StylPrzebiegu) =>
  b.fragmenty?.length && b.fragmenty.map((f) => f.tekst).join('') === b.tekst
    ? b.fragmenty.flatMap((f) => przebiegi(f.tekst, { ...o, bold: f.b, italics: f.i }))
    : przebiegi(b.tekst, o)

// --- Bez układu (zwykły tekst) -----------------------------------------------------------------------

function tabela(b: BlokDokumentu) {
  const kolumn = Math.max(1, ...b.wiersze.map((w) => w.length))
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: RAMKA, bottom: RAMKA, left: RAMKA, right: RAMKA, insideHorizontal: RAMKA, insideVertical: RAMKA },
    rows: b.wiersze.map((w, i) => new TableRow({
      tableHeader: b.naglowek_tabeli && i === 0,
      children: Array.from({ length: kolumn }, (_, k) => new TableCell({
        shading: b.naglowek_tabeli && i === 0 ? { fill: 'F1F5F9' } : undefined,
        children: [new Paragraph({ children: przebiegi(w[k] ?? '', { bold: b.naglowek_tabeli && i === 0, size: 18 }) })],
      })),
    })),
  })
}

export function elementyWorda(bloki: BlokDokumentu[]): (Paragraph | Table)[] {
  return bloki.flatMap((b): (Paragraph | Table)[] => {
    const size = b.rozmiar ? Math.round(b.rozmiar * 2) : undefined
    const wspolne = { alignment: WYROWNANIE[b.wyrownanie] ?? AlignmentType.LEFT }
    if (b.typ === 'obraz') return []
    if (b.typ === 'tabela') return [tabela(b), new Paragraph({ spacing: { after: 120 }, children: [] })]
    if (b.typ === 'lista') return b.elementy.map((e) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: przebiegi(e, { size }) }))
    if (b.typ === 'naglowek') {
      return [new Paragraph({ ...wspolne, heading: POZIOMY[Math.min(3, Math.max(1, b.poziom)) - 1], children: przebiegi(b.tekst, { bold: true, italics: b.kursywa, size }) })]
    }
    return [new Paragraph({
      ...wspolne, spacing: { after: 120 },
      children: przebiegi(b.tekst, { bold: b.pogrubiony, italics: b.kursywa || b.typ === 'podpis', size: size ?? (b.typ === 'podpis' ? 18 : undefined) }),
    })]
  })
}

// --- Układ oryginału -----------------------------------------------------------------------------------

interface Polozenie { x0: number; x1: number; gora: number; dol: number }
interface Pas { bloki: { b: BlokDokumentu; i: number; p: Polozenie }[]; gora: number; dol: number }

/**
 * Pasy strony: bloki w kolejności od góry; blok obok bloków bieżącego pasa (pionowo się z nimi pokrywa, poziomo nie)
 * dołącza do pasa - taki pas to niewidoczna tabela z kolumnami. Wymiary w pt.
 */
export function pasyStrony(bloki: BlokDokumentu[], W: number, H: number): Pas[] {
  const z = bloki.map((b, i) => ({ b, i })).filter((x) => x.b.ramka)
    .map((x) => ({ ...x, p: { x0: x.b.ramka!.x * W, x1: (x.b.ramka!.x + x.b.ramka!.w) * W, gora: x.b.ramka!.y * H, dol: (x.b.ramka!.y + x.b.ramka!.h) * H } }))
    .sort((a, b) => a.p.gora - b.p.gora || a.p.x0 - b.p.x0)
  const pasy: Pas[] = []
  for (const x of z) {
    const ost = pasy[pasy.length - 1]
    const wspolne = ost ? Math.min(x.p.dol, ost.dol) - Math.max(x.p.gora, ost.gora) : -1
    const obok = ost && wspolne > 0.3 * Math.min(x.p.dol - x.p.gora, ost.dol - ost.gora)
      && ost.bloki.every((y) => x.p.x0 >= y.p.x1 - 2 || x.p.x1 <= y.p.x0 + 2)
    if (obok && ost) { ost.bloki.push(x); ost.gora = Math.min(ost.gora, x.p.gora); ost.dol = Math.max(ost.dol, x.p.dol) }
    else pasy.push({ bloki: [x], gora: x.p.gora, dol: x.p.dol })
  }
  pasy.forEach((p) => p.bloki.sort((a, b) => a.p.x0 - b.p.x0))
  return pasy
}

interface Miejsce { lewe: number; prawe: number; przed: number; szer: number; wys: number; /** Miejsce na prawym marginesie (pt) - zapas dla wiersza na całą szerokość. */ margines?: number }

/** Akapit z odstępem przed (pt) i wysokością linii - rezerwuje miejsce albo oddziela tabele. */
const odstep = (przed: number, wys = 1) =>
  new Paragraph({ spacing: { before: tw(przed), after: 0, line: Math.max(20, tw(wys)), lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: '', size: 2 })] })

function elementyBloku(b: BlokDokumentu, m: Miejsce, obraz?: ObrazBloku): (Paragraph | Table)[] {
  const run: StylPrzebiegu = {
    bold: b.pogrubiony || (b.typ === 'naglowek' && !b.ramka), italics: b.kursywa, size: b.rozmiar ? Math.round(b.rozmiar * 2) : undefined,
    font: b.czcionka ?? undefined, color: '000000', underline: b.podkreslony ? {} : undefined,
    // Odstęp znaków jak w oryginale (w granicach rozsądku) - te same miejsca łamania wierszy.
    characterSpacing: b.odstep_znakow && Math.abs(b.odstep_znakow) >= 0.02 && Math.abs(b.odstep_znakow) <= 1.5 ? Math.round(b.odstep_znakow * 20) : undefined,
  }
  // Odstęp linii jak w oryginale (dokładny, gdy linie nie są ciaśniejsze niż czcionka).
  const linia = b.interlinia && b.interlinia > 0
    ? { line: tw(b.interlinia), lineRule: b.rozmiar && b.interlinia < b.rozmiar * 1.05 ? LineRuleType.AT_LEAST : LineRuleType.EXACT } : {}
  const jednaLinia = !b.interlinia && !b.tekst.includes('\n')
  // Inna czcionka niż w PDF bywa minimalnie szersza: pojedyncza linia nie ma prawej granicy (wyśrodkowana - szersze pole),
  // akapit dostaje 3% zapasu - żeby Word nie łamał linii inaczej niż oryginał.
  let { lewe, prawe } = m
  if (jednaLinia && b.wyrownanie === 'lewo') prawe = 0
  else if (jednaLinia && b.wyrownanie === 'srodek') { const zapas = Math.min(lewe, prawe, 0.15 * m.szer); lewe -= zapas; prawe -= zapas }
  else if (jednaLinia && b.wyrownanie === 'prawo') lewe = 0
  // Akapit sięgający (prawie) prawego marginesu zawija się na marginesie, jak w oryginale; węższy - w swojej szerokości z zapasem.
  else prawe = prawe < 0.08 * (m.szer + m.lewe + m.prawe) ? 0 : Math.max(0, prawe - 0.03 * m.szer)
  // Tekst na całą szerokość może minimalnie wejść w prawy margines (pojedynczy wiersz do 4%, akapit 0,5%) - ostatnie
  // słowo nie przeskakuje do nowego wiersza przez różnicę miar czcionki.
  const zapas = prawe === 0 && m.margines ? Math.min(m.margines - 4, (jednaLinia ? 0.04 : 0.005) * m.szer) : 0
  const indent = { left: tw(lewe), right: zapas > 0 ? -Math.round(zapas * 20) : tw(prawe) }
  const wyr = WYROWNANIE[b.wyrownanie] ?? AlignmentType.LEFT
  if (b.typ === 'obraz') {
    if (!obraz) return [odstep(m.przed, m.wys)]
    const px = (pt: number) => Math.max(1, Math.round((pt * 96) / 72))
    return [new Paragraph({
      indent: { left: tw(m.lewe) }, spacing: { before: tw(m.przed), after: 0 },
      children: [new ImageRun({ type: obraz.typ, data: obraz.dane, transformation: { width: px(m.szer), height: px(m.wys) } })],
    })]
  }
  if (b.typ === 'tabela') {
    const kolumn = Math.max(1, ...b.wiersze.map((w) => w.length))
    const udzialy = b.kolumny?.length === kolumn ? b.kolumny : Array<number>(kolumn).fill(1 / kolumn)
    const szer = tw(m.szer)
    const ramka = b.obramowanie ? RAMKA_UKLADU : BRAK
    return [
      odstep(m.przed),
      new Table({
        width: { size: szer, type: WidthType.DXA }, columnWidths: udzialy.map((u) => Math.round(u * szer)), indent: { size: tw(m.lewe), type: WidthType.DXA },
        layout: TableLayoutType.FIXED, margins: { left: 60, right: 60, top: 0, bottom: 0 },
        borders: { top: ramka, bottom: ramka, left: ramka, right: ramka, insideHorizontal: ramka, insideVertical: ramka },
        rows: b.wiersze.map((w, r) => new TableRow({
          tableHeader: b.naglowek_tabeli && r === 0,
          children: Array.from({ length: kolumn }, (_, k) => new TableCell({
            width: { size: Math.round(udzialy[k] * szer), type: WidthType.DXA },
            children: [new Paragraph({
              alignment: b.style_komorek?.[r]?.[k]?.includes('c') ? AlignmentType.CENTER : b.style_komorek?.[r]?.[k]?.includes('r') ? AlignmentType.RIGHT : undefined,
              children: przebiegi(w[k] ?? '', b.style_komorek?.[r]?.[k] !== undefined
                ? { ...run, bold: b.style_komorek[r][k].includes('b'), italics: b.style_komorek[r][k].includes('i') }
                : { ...run, bold: b.naglowek_tabeli && r === 0 ? true : run.bold }),
            })],
          })),
        })),
      }),
    ]
  }
  if (b.typ === 'lista') {
    const wciecie = 14
    return b.elementy.map((e, i) => new Paragraph({
      bullet: { level: 0 }, alignment: wyr, indent: { left: tw(lewe + wciecie), hanging: tw(wciecie), right: tw(prawe) },
      spacing: { before: i ? 0 : tw(m.przed), after: 0, ...linia }, children: przebiegi(e, run),
    }))
  }
  return [new Paragraph({
    alignment: wyr, indent, spacing: { before: tw(m.przed), after: 0, ...linia },
    heading: b.typ === 'naglowek' ? POZIOMY[Math.min(3, Math.max(1, b.poziom)) - 1] : undefined,
    children: przebiegiBloku(b, run),
  })]
}

/** Pasy jako elementy Worda od pozycji "od" (pt od góry strony) - odstępy przed pasami jak na stronie. */
function elementyPasow(pasy: Pas[], s: StronaWorda, W: number, mL: number, mR: number, od: number): (Paragraph | Table)[] {
  const dzieci: (Paragraph | Table)[] = []
  let dol = od
  for (const p of pasy) {
    // 10% luzu w odstępach - inna czcionka niż w PDF nie wypycha końca strony na następną.
    const przed = Math.max(0, p.gora - dol) * 0.9
    if (p.bloki.length === 1) {
      const { b, i, p: q } = p.bloki[0]
      dzieci.push(...elementyBloku(b, { lewe: Math.max(0, q.x0 - mL), prawe: Math.max(0, W - mR - q.x1), przed, szer: q.x1 - q.x0, wys: q.dol - q.gora, margines: mR }, s.obrazy?.[i]))
    } else {
      const start = Math.max(0, p.bloki[0].p.x0 - mL)
      const koniec = Math.min(W - mR, Math.max(...p.bloki.map((x) => x.p.x1)))
      const szer = p.bloki.map((x, k) => Math.max(20, (k + 1 < p.bloki.length ? p.bloki[k + 1].p.x0 : koniec) - x.p.x0))
      dzieci.push(odstep(przed), new Table({
        width: { size: tw(szer.reduce((a, b) => a + b, 0)), type: WidthType.DXA }, columnWidths: szer.map(tw),
        indent: { size: tw(start), type: WidthType.DXA }, layout: TableLayoutType.FIXED, borders: BEZ_RAMEK,
        margins: { left: 0, right: 0, top: 0, bottom: 0 },
        rows: [new TableRow({
          children: p.bloki.map((x, k) => new TableCell({
            width: { size: tw(szer[k]), type: WidthType.DXA }, verticalAlign: VerticalAlign.TOP, borders: { top: BRAK, bottom: BRAK, left: BRAK, right: BRAK },
            children: (() => {
              const e = elementyBloku(x.b, { lewe: 0, prawe: Math.max(0, szer[k] - (x.p.x1 - x.p.x0)), przed: Math.max(0, x.p.gora - p.gora), szer: x.p.x1 - x.p.x0, wys: x.p.dol - x.p.gora }, s.obrazy?.[x.i])
              // Komórka musi kończyć się akapitem (Word), także gdy zawiera tabelę.
              return e[e.length - 1] instanceof Table ? [...e, new Paragraph({ children: [] })] : e
            })(),
          })),
        })],
      }))
    }
    dol = p.dol
  }
  if (dzieci[dzieci.length - 1] instanceof Table) dzieci.push(new Paragraph({ children: [] }))
  return dzieci
}

/**
 * Nagłówek i stopka strony: pasy przy górnej (do 14% wysokości) i dolnej krawędzi (od 85%), oddzielone od treści
 * przerwą - trafiają do nagłówka / stopki sekcji, więc zostają na swoim miejscu, nawet gdy treść się wydłuży
 * (inna czcionka, dłuższe tłumaczenie).
 */
export function podzialStrony(pasy: Pas[], H: number): { naglowek: Pas[]; tresc: Pas[]; stopka: Pas[] } {
  // Nagłówek i stopka to obrazy albo tekst mniejszy niż treść strony - ostatni akapit treści przy dole strony zostaje treścią.
  const rozmiary = pasy.flatMap((p) => p.bloki.filter((x) => x.b.typ !== 'obraz' && x.b.rozmiar).flatMap((x) => Array<number>(Math.min(400, Math.max(1, (x.b.tekst || x.b.wiersze.flat().join(' ')).length))).fill(x.b.rozmiar)))
  const tresc = rozmiary.length ? [...rozmiary].sort((a, b) => a - b)[Math.floor(rozmiary.length / 2)] : 0
  const pomocniczy = (p: Pas) => p.bloki.every((x) => x.b.typ === 'obraz' || (!!x.b.rozmiar && x.b.rozmiar < 0.95 * tresc))
  // Nagłówek: najdłuższy ciąg pasów od góry (każdy kończy się do 14% wysokości), po którym jest przerwa >= 12 pt.
  let gorne = 0
  for (let k = 1; k < pasy.length; k++) {
    if (pasy[k - 1].dol > 0.14 * H || !pomocniczy(pasy[k - 1])) break
    if (pasy[k].gora - pasy[k - 1].dol >= 12) gorne = k
  }
  // Stopka: pasy od 85% wysokości, od pierwszej przerwy >= 6 pt nad nimi.
  let d = pasy.length
  for (let k = pasy.length - 1; k > gorne; k--) {
    if (pasy[k].gora < 0.85 * H || !pomocniczy(pasy[k])) break
    if (pasy[k].gora - pasy[k - 1].dol >= 6) d = k
  }
  return { naglowek: pasy.slice(0, gorne), tresc: pasy.slice(gorne, d), stopka: pasy.slice(d) }
}

/** Strona w układzie oryginału: wymiary i marginesy oryginału, nagłówek, treść i stopka z odstępami jak na stronie. */
export function sekcjaWUkladzie(s: StronaWorda): ISectionOptions {
  const { W, H } = wymiaryWorda(s.wymiary)
  const z = s.bloki.filter((b) => b.ramka)
  const przytnij = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
  const mL = przytnij(Math.min(...z.map((b) => b.ramka!.x)) * W, 14, 90)
  const mR = przytnij((1 - Math.max(...z.map((b) => b.ramka!.x + b.ramka!.w))) * W, 14, 90)
  const { naglowek, tresc, stopka } = podzialStrony(pasyStrony(s.bloki, W, H), H)
  const gora = (l: Pas[]) => Math.min(...l.map((p) => p.gora))
  const dol = (l: Pas[]) => Math.max(...l.map((p) => p.dol))
  const yTresci = tresc.length ? gora(tresc) : 0.1 * H
  const mT = przytnij(yTresci, 14, 140)
  const mB = przytnij(H - (stopka.length ? gora(stopka) - 6 : tresc.length ? dol(tresc) : 0.9 * H), 14, 140)
  const dzieci = elementyPasow(tresc, s, W, mL, mR, mT)
  // Bloki bez ramki (np. nadmiarowe bloki tłumaczenia) - na końcu strony jako zwykły tekst.
  dzieci.push(...elementyWorda(s.bloki.filter((b) => !b.ramka)))
  if (!dzieci.length || dzieci[dzieci.length - 1] instanceof Table) dzieci.push(new Paragraph({ children: [] }))
  const odGory = naglowek.length ? przytnij(gora(naglowek), 6, mT) : Math.min(mT, 20)
  const odDolu = stopka.length ? przytnij(H - dol(stopka), 6, mB) : Math.min(mB, 20)
  const pozioma = W > H
  return {
    properties: {
      page: {
        // docx zamienia szerokość i wysokość dla orientacji poziomej - podajemy wymiary pionowe.
        size: { width: tw(Math.min(W, H)), height: tw(Math.max(W, H)), orientation: pozioma ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
        margin: { top: tw(mT), bottom: tw(mB), left: tw(mL), right: tw(mR), header: tw(odGory), footer: tw(odDolu) },
      },
    },
    headers: { default: new Header({ children: naglowek.length ? elementyPasow(naglowek, s, W, mL, mR, odGory) : [new Paragraph({ children: [] })] }) },
    footers: { default: new Footer({ children: stopka.length ? elementyPasow(stopka, s, W, mL, mR, gora(stopka)) : [new Paragraph({ children: [] })] }) },
    children: dzieci,
  }
}

/**
 * Strona w układzie dokładnym: tło (strona bez tekstu: siatka, linie, grafika) za tekstem i każdy blok w polu (ramce
 * Worda) w miejscu oryginału. Tekst w polach jest edytowalny; dłuższe tłumaczenie ma zmniejszoną czcionkę.
 */
export function sekcjaDokladna(s: StronaWorda): ISectionOptions {
  const { W, H } = wymiaryWorda(s.wymiary)
  const px = (pt: number) => Math.max(1, Math.round((pt * 96) / 72))
  const dzieci: Paragraph[] = [new Paragraph({
    spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
    children: s.tlo ? [new ImageRun({
      type: s.tlo.typ, data: s.tlo.dane, transformation: { width: px(W), height: px(H) },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 }, verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
        behindDocument: true, allowOverlap: true,
      },
    })] : [],
  })]
  for (const b of s.bloki) {
    if (!b.ramka || b.typ === 'obraz') continue
    const r = b.ramka
    const skala = b.skala_czcionki ?? 1
    const rozmiar = (b.rozmiar || 10) * skala
    const run: StylPrzebiegu = {
      bold: b.pogrubiony, italics: b.kursywa, size: Math.round(rozmiar * 2), font: b.czcionka ?? undefined, color: '000000',
      underline: b.podkreslony ? {} : undefined,
      characterSpacing: skala === 1 && b.odstep_znakow && Math.abs(b.odstep_znakow) >= 0.02 && Math.abs(b.odstep_znakow) <= 1.5 ? Math.round(b.odstep_znakow * 20) : undefined,
    }
    // Pole szersze niż tekst oryginału (8%, co najmniej 6 pt) - inna miara czcionki nie łamie wiersza.
    const zapas = Math.max(6, 0.08 * r.w * W)
    const x = r.x * W - (b.wyrownanie === 'prawo' ? zapas : b.wyrownanie === 'srodek' ? zapas / 2 : 0)
    const tekst = b.typ === 'lista' ? b.elementy.map((e) => `• ${e}`).join('\n') : b.typ === 'tabela' ? b.wiersze.map((w) => w.join('\t')).join('\n') : b.tekst
    dzieci.push(new Paragraph({
      frame: {
        type: 'absolute', position: { x: tw(Math.max(0, x)), y: tw(r.y * H) }, width: tw(r.w * W + zapas), height: tw(r.h * H),
        anchor: { horizontal: FrameAnchorType.PAGE, vertical: FrameAnchorType.PAGE }, rule: HeightRule.ATLEAST, wrap: FrameWrap.NONE,
      },
      alignment: WYROWNANIE[b.wyrownanie] ?? AlignmentType.LEFT,
      spacing: { before: 0, after: 0, ...(b.interlinia && skala === 1 ? { line: tw(b.interlinia), lineRule: LineRuleType.AT_LEAST } : { line: tw(rozmiar * 1.15), lineRule: LineRuleType.AT_LEAST }) },
      children: tekst === b.tekst ? przebiegiBloku(b, run) : przebiegi(tekst, run),
    }))
  }
  const pozioma = W > H
  return {
    properties: {
      page: {
        size: { width: tw(Math.min(W, H)), height: tw(Math.max(W, H)), orientation: pozioma ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
        margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 },
      },
    },
    children: dzieci,
  }
}

/** Dokument Word ze stron (kolejność stron oryginału); strony bez treści pominięte. */
export function dokumentWord(strony: StronaWorda[], tytul: string): Document {
  const pelne = strony.filter((s) => s.bloki.length)
  const zUkladem = pelne.some((s) => s.bloki.some((b) => b.ramka))
  let sekcje: ISectionOptions[]
  if (zUkladem) {
    sekcje = pelne.map((s) => (!s.bloki.some((b) => b.ramka) ? { properties: {}, children: elementyWorda(s.bloki) } : s.uklad === 'dokladny' ? sekcjaDokladna(s) : sekcjaWUkladzie(s)))
  } else {
    const dzieci: (Paragraph | Table)[] = []
    pelne.forEach((s, i) => {
      if (i > 0) dzieci.push(new Paragraph({ children: [new PageBreak()] }))
      dzieci.push(...elementyWorda(s.bloki))
    })
    sekcje = [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children: dzieci }]
  }
  return new Document({
    title: tytul,
    creator: 'Wersje edytowalne',
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
        // Style nagłówków bez własnych odstępów i koloru - w układzie oryginału decyduje formatowanie bloku.
        ...(zUkladem ? Object.fromEntries(['heading1', 'heading2', 'heading3'].map((h) => [h, { run: { color: '000000', bold: false }, paragraph: { spacing: { before: 0, after: 0 } } }])) : {}),
      },
    },
    sections: sekcje,
  })
}

export async function pobierzWord(strony: StronaWorda[], nazwa: string) {
  const plik = nazwaPliku(nazwa.replace(/\.[^.]+$/, ''))
  pobierzPlik(await Packer.toBlob(dokumentWord(strony, plik)), `${plik}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
}
