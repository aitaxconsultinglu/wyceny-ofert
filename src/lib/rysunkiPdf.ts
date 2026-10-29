// Render rysunków PDF (pdf.js): podgląd strony, zaznaczony obszar w ~300 DPI pocięty na kafle
// i warstwa tekstowa w układzie strony po obrocie. Działa w przeglądarce i w testach lokalnych
// (Node + @napi-rs/canvas) - płótna tworzy fabryka pdf.js. Obrazy nie trafiają do Storage.
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { pdfjs } from './dokumenty'
import { dpiObszaru, kafle, type ElementTekstu, type Prostokat } from './rysunki'
import { jestObrazem, pdfZJpeg, wymiaryJpeg } from './obrazPdf'

interface Plotno { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }
interface FabrykaPlocien { create(w: number, h: number): Plotno; destroy(p: Plotno): void }
const fabryka = (doc: PDFDocumentProxy) => (doc as unknown as { canvasFactory: FabrykaPlocien }).canvasFactory

/**
 * Bajty pliku rysunku do otwarcia w pdf.js: PDF bez zmian, JPG / PNG jako jednostronicowy PDF z obrazem
 * (PNG i nieczytelny JPEG przez płótno przeglądarki - białe tło pod przezroczystością).
 */
export async function bajtyRysunku(dane: Uint8Array, nazwa: string): Promise<Uint8Array> {
  if (!jestObrazem(nazwa)) return dane
  if (/\.jpe?g$/i.test(nazwa) && wymiaryJpeg(dane)) return pdfZJpeg(dane)
  const bitmapa = await createImageBitmap(new Blob([dane.slice()]))
  const c = document.createElement('canvas')
  c.width = bitmapa.width; c.height = bitmapa.height
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(bitmapa, 0, 0)
  const blob = await new Promise<Blob>((ok, zle) => c.toBlob((b) => (b ? ok(b) : zle(new Error('Nie udało się przetworzyć obrazu.'))), 'image/jpeg', 0.92))
  return pdfZJpeg(new Uint8Array(await blob.arrayBuffer()))
}

export async function otworzRysunek(dane: Uint8Array): Promise<PDFDocumentProxy> {
  const lib = await pdfjs()
  return lib.getDocument({ data: dane.slice(), verbosity: 0 }).promise
}

export interface InfoStrony { szerPt: number; wysPt: number; obrot: number; elementowTekstu: number }

export async function infoStrony(doc: PDFDocumentProxy, nr: number): Promise<InfoStrony> {
  const strona = await doc.getPage(nr)
  const v = strona.getViewport({ scale: 1 })
  const tc = await strona.getTextContent()
  return { szerPt: v.width, wysPt: v.height, obrot: strona.rotate, elementowTekstu: tc.items.filter((x) => 'str' in x && x.str.trim()).length }
}

/**
 * intent "print": pdf.js nie dzieli wtedy renderu przez requestAnimationFrame, więc duży arkusz
 * renderuje się także w karcie w tle (przy "display" render w ukrytej karcie stoi).
 */
async function renderuj(doc: PDFDocumentProxy, nr: number, skala: number, wycinek?: { x: number; y: number; w: number; h: number }) {
  const intent = 'print'
  const strona = await doc.getPage(nr)
  const viewport = strona.getViewport({ scale: skala })
  const w = Math.max(1, Math.round(wycinek?.w ?? viewport.width))
  const h = Math.max(1, Math.round(wycinek?.h ?? viewport.height))
  const p = fabryka(doc).create(w, h)
  p.context.fillStyle = 'white'
  p.context.fillRect(0, 0, w, h)
  await strona.render({
    canvasContext: p.context, viewport, intent,
    transform: wycinek ? [1, 0, 0, 1, -Math.round(wycinek.x), -Math.round(wycinek.y)] : undefined,
  } as Parameters<typeof strona.render>[0]).promise
  return { p, w, h }
}

const jpeg = (c: HTMLCanvasElement, jakosc: number) => c.toDataURL('image/jpeg', jakosc)

/** Cała strona do wyświetlenia (dłuższy bok <= maksBok, nie więcej niż 150 DPI). */
export async function renderujPodglad(doc: PDFDocumentProxy, nr: number, maksBok = 3200) {
  const strona = await doc.getPage(nr)
  const v1 = strona.getViewport({ scale: 1 })
  const skala = Math.min(150 / 72, maksBok / Math.max(v1.width, v1.height))
  const { p, w, h } = await renderuj(doc, nr, skala)
  const dataUrl = jpeg(p.canvas, 0.8)
  fabryka(doc).destroy(p)
  return { dataUrl, szer: w, wys: h, skala }
}

/** Cała strona w zadanym DPI jako JPEG (bajty) - przekodowanie skanu przy kompresji pliku. */
export async function stronaJakoJpeg(doc: PDFDocumentProxy, nr: number, dpi: number, jakosc: number) {
  const { p, w, h } = await renderuj(doc, nr, dpi / 72)
  const dataUrl = jpeg(p.canvas, jakosc)
  fabryka(doc).destroy(p)
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bajty = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bajty[i] = bin.charCodeAt(i)
  return { bajty, szer: w, wys: h }
}

/**
 * Natywna rozdzielczość skanu: największy obraz osadzony na stronie względem rozmiaru strony.
 * null, gdy na stronie nie ma obrazów (PDF wektorowy).
 */
export async function natywneDpi(doc: PDFDocumentProxy, nr: number): Promise<number | null> {
  const lib = await pdfjs()
  const strona = await doc.getPage(nr)
  const v = strona.getViewport({ scale: 1 })
  const ops = await strona.getOperatorList()
  let maks: number | null = null
  for (let j = 0; j < ops.fnArray.length; j++) {
    if (ops.fnArray[j] !== lib.OPS.paintImageXObject) continue
    const [id, w, h] = ops.argsArray[j] as [string, number, number]
    let bok = Math.max(Number(w) || 0, Number(h) || 0)
    if (!bok) {
      const zrodlo = id.startsWith('g_') ? strona.commonObjs : strona.objs
      const o = await new Promise<{ width: number; height: number } | null>((ok) => { try { zrodlo.get(id, ok) } catch { ok(null) } })
      bok = Math.max(o?.width ?? 0, o?.height ?? 0)
    }
    const dpi = Math.round(bok / (Math.max(v.width, v.height) / 72))
    if (dpi && (maks === null || dpi > maks)) maks = dpi
  }
  return maks
}

export interface Kafel { prostokat: Prostokat; base64: string; dataUrl: string }
export interface KafleObszaru { kafle: Kafel[]; szer: number; wys: number; dpi: number }

/**
 * Obszar (współrzędne względne strony) w ~300 DPI (albo natywnie, gdy skan ma więcej; mały wycinek
 * powiększony do ~1500 px), pocięty na kafle <= maksBok z zakładką 10%. Do AI idą tylko te wycinki.
 */
export async function kafleObszaru(
  doc: PDFDocumentProxy, nr: number, obszar: Prostokat,
  opcje: { dpi?: number; natywne?: number | null; maksBok?: number; zakladka?: number; jakosc?: number } = {},
): Promise<KafleObszaru> {
  const strona = await doc.getPage(nr)
  const v1 = strona.getViewport({ scale: 1 })
  const dpi = dpiObszaru(obszar.w * v1.width, obszar.h * v1.height, { dpi: opcje.dpi, natywne: opcje.natywne, minBok: opcje.maksBok ?? 1500 })
  const s = dpi / 72
  const { p, w, h } = await renderuj(doc, nr, s, { x: obszar.x * v1.width * s, y: obszar.y * v1.height * s, w: obszar.w * v1.width * s, h: obszar.h * v1.height * s })
  const wynik: Kafel[] = []
  for (const k of kafle(w, h, opcje.maksBok ?? 1500, opcje.zakladka ?? 0.1)) {
    const kp = fabryka(doc).create(k.w, k.h)
    kp.context.drawImage(p.canvas, k.x, k.y, k.w, k.h, 0, 0, k.w, k.h)
    const dataUrl = jpeg(kp.canvas, opcje.jakosc ?? 0.85)
    fabryka(doc).destroy(kp)
    wynik.push({ prostokat: k, dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) })
  }
  fabryka(doc).destroy(p)
  return { kafle: wynik, szer: w, wys: h, dpi }
}

/**
 * Warstwa tekstowa strony w układzie po obrocie (jak na ekranie), w punktach: x od lewej,
 * y = linia bazowa od góry. Tylko tekst poziomy - opisy pionowe (np. wymiary) psułyby wiersze.
 */
export async function tekstStrony(doc: PDFDocumentProxy, nr: number): Promise<ElementTekstu[]> {
  const lib = await pdfjs()
  const strona = await doc.getPage(nr)
  const v = strona.getViewport({ scale: 1 })
  const tc = await strona.getTextContent()
  const wynik: ElementTekstu[] = []
  for (const it of tc.items) {
    if (!('str' in it) || !it.str.trim()) continue
    const m = lib.Util.transform(v.transform, it.transform) as number[]
    if (Math.abs(m[1]) > 0.1 * Math.abs(m[0])) continue
    const h = Math.hypot(m[2], m[3])
    wynik.push({ str: it.str, x: m[4], y: m[5], w: it.width, h })
  }
  return wynik
}

/** Wycinek strony (obszar względny) w zadanym DPI jako JPEG - obrazy (logo, rysunki) do wersji edytowalnej w Wordzie. */
export async function wycinekJpeg(doc: PDFDocumentProxy, nr: number, obszar: Prostokat, dpi = 150, jakosc = 0.9) {
  const strona = await doc.getPage(nr)
  const v1 = strona.getViewport({ scale: 1 })
  const s = dpi / 72
  const { p } = await renderuj(doc, nr, s, { x: obszar.x * v1.width * s, y: obszar.y * v1.height * s, w: obszar.w * v1.width * s, h: obszar.h * v1.height * s })
  const dataUrl = jpeg(p.canvas, jakosc)
  fabryka(doc).destroy(p)
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bajty = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bajty[i] = bin.charCodeAt(i)
  return bajty
}

/** Strona w odcieniach szarości do analizy (widoczność tekstu, plamy grafiki): jasność i nasycenie koloru pikseli. */
export async function renderSzary(doc: PDFDocumentProxy, nr: number, skala = 1.5) {
  const { p, w, h } = await renderuj(doc, nr, skala)
  const d = p.context.getImageData(0, 0, w, h).data
  fabryka(doc).destroy(p)
  const jasnosc = new Uint8Array(w * h)
  const nasycenie = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]
    jasnosc[i] = (r * 299 + g * 587 + b * 114) / 1000
    nasycenie[i] = Math.max(r, g, b) - Math.min(r, g, b)
  }
  return { szer: w, wys: h, skala, jasnosc, nasycenie }
}

/** Szerokość tekstu (pt) w czcionce systemowej - porównanie z szerokością w PDF daje odstęp znaków do Worda. */
export function miaraTekstu(doc: PDFDocumentProxy) {
  const p = fabryka(doc).create(10, 10)
  return (tekst: string, czcionka: string, rozmiar: number, pogrubiony: boolean) => {
    p.context.font = `${pogrubiony ? 'bold ' : ''}${rozmiar * 4}px "${czcionka}"`
    return p.context.measureText(tekst).width / 4
  }
}

/**
 * Tło strony bez tekstu (JPEG): render strony, na którym prostokąty tekstu (pt) są zamalowane kolorem otoczenia -
 * zostają linie, ramki, wypełnienia, obrazy i napisy narysowane krzywymi. Pod tekst w polach w trybie "dokładnym".
 */
export async function tloBezTekstu(doc: PDFDocumentProxy, nr: number, prostokaty: Prostokat[], dpi = 150, jakosc = 0.85) {
  const s = dpi / 72
  const { p, w, h } = await renderuj(doc, nr, s)
  const ctx = p.context
  const d = ctx.getImageData(0, 0, w, h).data
  const px = (x: number, y: number) => { const i = (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4; return [d[i], d[i + 1], d[i + 2]] }
  for (const r of prostokaty) {
    const x0 = Math.floor(r.x * s) - 1, x1 = Math.ceil((r.x + r.w) * s) + 1, y0 = Math.floor(r.y * s) - 1, y1 = Math.ceil((r.y + r.h) * s) + 1
    // Kolor tła: najjaśniejszy z mediany pikseli tuż poza prostokątem (tekst na białym - biel, na pasku - kolor paska).
    const brzeg: number[][] = []
    for (let x = x0; x <= x1; x += 2) brzeg.push(px(x, y0 - 1), px(x, y1 + 1))
    for (let y = y0; y <= y1; y += 2) brzeg.push(px(x0 - 1, y), px(x1 + 1, y))
    const med = (k: number) => brzeg.map((c) => c[k]).sort((a, b) => a - b)[Math.floor(brzeg.length / 2)] ?? 255
    ctx.fillStyle = `rgb(${med(0)},${med(1)},${med(2)})`
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
  }
  const dataUrl = jpeg(p.canvas, jakosc)
  fabryka(doc).destroy(p)
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
  const bajty = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bajty[i] = bin.charCodeAt(i)
  return bajty
}
