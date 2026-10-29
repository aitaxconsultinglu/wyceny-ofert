// Pliki modułu "Wersje edytowalne" w przeglądarce: zapis w bucket "dokumenty" (edytowalne/<id>/<nazwa>), podgląd stron
// PDF i obrazów z wycinaniem obszarów do AI, warstwa tekstowa PDF z czcionką i odczyt struktury DOCX / arkuszy / TXT / DXF.
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { supabase } from './supabase'
import { komunikatPL } from './config'
import { pdfjs } from './dokumenty'
import { BUCKET, bezpiecznaNazwa } from './magazyn'
import { kafle, type Prostokat } from './rysunki'
import { infoStrony, kafleObszaru, miaraTekstu, natywneDpi, otworzRysunek, renderSzary, renderujPodglad, tloBezTekstu, wycinekJpeg, type Kafel } from './rysunkiPdf'
import { doKosza } from './kosz'
import {
  CZCIONKI_SYSTEMOWE, blok, blokiZArkusza, blokiZHtml, blokiZTekstuZwyklego, plamyGrafiki, podzielPlamy, rodzajPliku, rodzinaCzcionki, tekstJakWidac, tekstyZDxf,
  type RenderStrony,
  type BlokDokumentu, type ElementZCzcionka, type GrafikaStrony, type RodzajPliku, type TrescPliku,
} from './wersjeEdytowalne'
import { t } from '@/i18n'

export interface PlikEdytowalny {
  id: string; nazwa_pliku: string; mime: string | null; rozmiar: number | null; rodzaj: RodzajPliku; sciezka: string | null
  stron: number | null; jezyk: string | null; tresc: TrescPliku; utworzyl: string | null; utworzono: string; zmodyfikowano: string
}

/** Dokumenty tekstowe czytamy w ~200 DPI (pismo 10 pt ma wtedy ok. 28 px) - taniej niż 300 DPI rysunków. */
export const DPI_DOKUMENTU = 200

const MIME: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel', csv: 'text/csv', txt: 'text/plain', dxf: 'image/vnd.dxf',
}

/** Zapis pliku: wiersz w pliki_edytowalne, potem plik w Storage (uprawnienie wynika z wiersza). */
export async function dodajPlik(plik: File, limitMb: number): Promise<PlikEdytowalny> {
  if (plik.size > limitMb * 1024 * 1024) throw new Error(t('{0}: plik ma {1} MB - powyżej limitu {2} MB.', plik.name, (plik.size / 1024 / 1024).toFixed(1), limitMb))
  const rodzaj = rodzajPliku(plik.name)
  const bajty = new Uint8Array(await plik.arrayBuffer())
  let stron: number | null = rodzaj === 'obraz' ? 1 : null
  if (rodzaj === 'pdf') {
    try { stron = (await otworzRysunek(bajty)).numPages } catch { throw new Error(t('{0}: nie udało się otworzyć PDF (uszkodzony albo zaszyfrowany).', plik.name)) }
  }
  const mime = plik.type || MIME[plik.name.toLowerCase().split('.').pop() ?? ''] || 'application/octet-stream'
  const { data, error } = await supabase.from('pliki_edytowalne')
    .insert({ nazwa_pliku: plik.name, mime, rozmiar: plik.size, rodzaj, stron }).select('*').single()
  if (error) throw new Error(komunikatPL(error.message))
  const sciezka = `edytowalne/${data.id}/${bezpiecznaNazwa(plik.name)}`
  const { error: bladPliku } = await supabase.storage.from(BUCKET).upload(sciezka, bajty, { contentType: mime, upsert: false })
  if (bladPliku) {
    await supabase.from('pliki_edytowalne').delete().eq('id', data.id)
    throw new Error(t('{0}: nie udało się zapisać pliku ({1}).', plik.name, komunikatPL(bladPliku.message)))
  }
  await supabase.from('pliki_edytowalne').update({ sciezka }).eq('id', data.id)
  return { ...(data as PlikEdytowalny), sciezka }
}

/** Usunięcie pliku = przeniesienie do kosza (plik w Storage zostaje do trwałego usunięcia). */
export async function usunPlik(p: PlikEdytowalny) {
  await doKosza('plik_edytowalny', [p.id], 'edytowalne')
}

export async function zapiszTresc(id: string, tresc: TrescPliku, jezyk: string | null) {
  const { error } = await supabase.from('pliki_edytowalne').update({ tresc, jezyk }).eq('id', id)
  if (error) throw new Error(komunikatPL(error.message))
}

/** Wpis w dzienniku odczytów: kto, co, które strony, za ile (odczyt bez AI - 0 zł). */
export async function zapiszOdczyt(w: { plik_id: string; nazwa_pliku: string; rodzaj: 'tekst' | 'ai' | 'tlumaczenie'; strony: number[]; obszarow: number; jezyk: string | null; model?: string | null; koszt_pln?: number }) {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('odczyty_plikow').insert({ ...w, model: w.model ?? null, koszt_pln: w.koszt_pln ?? 0, utworzyl: u.user?.id })
  if (error) throw new Error(komunikatPL(error.message))
}

// --- Podgląd stron (PDF, obraz) ---------------------------------------------------------------------

export interface InfoStronyPliku { szerPt: number; wysPt: number; elementowTekstu: number; natywneDpi: number | null }

/** Wspólny interfejs PDF i obrazu: podgląd z zaznaczaniem, warstwa tekstowa (tylko PDF) i wycinki do AI. */
export interface ZrodloStron {
  stron: number
  info(nr: number): Promise<InfoStronyPliku>
  podglad(nr: number): Promise<{ dataUrl: string }>
  tekst(nr: number): Promise<ElementZCzcionka[]>
  /** Linie i obrazy strony (pt) - tabele z siatką i obrazy w wersji edytowalnej. */
  grafika(nr: number): Promise<GrafikaStrony>
  /** Obszar (względny 0..1) jako kafle JPEG do AI; szer / wys - wymiary obszaru w pikselach kafli. */
  kafle(nr: number, obszar: Prostokat): Promise<{ kafle: Kafel[]; dpi: number | null; szer: number; wys: number }>
  /** Obszar (względny 0..1) jako JPEG - obraz bloku do Worda. */
  wycinek(nr: number, obszar: Prostokat): Promise<Uint8Array>
  /** Strona bez tekstu (linie, wypełnienia, obrazy) jako JPEG - tło układu dokładnego; null - źródło bez warstwy tekstowej. */
  tlo(nr: number): Promise<Uint8Array | null>
}

/** Warstwa tekstowa jak tekstStrony, z pogrubieniem i kursywą z nazwy fontu (fonty ładuje lista operatorów strony). */
async function tekstZCzcionka(doc: PDFDocumentProxy, nr: number): Promise<ElementZCzcionka[]> {
  const lib = await pdfjs()
  const strona = await doc.getPage(nr)
  await strona.getOperatorList()
  const v = strona.getViewport({ scale: 1 })
  const tc = await strona.getTextContent()
  const czcionki = new Map<string, { pogrubiony: boolean; kursywa: boolean; czcionka: string | null; font: string; styl_z_nazwy: boolean }>()
  const czcionka = (nazwa: string) => {
    if (!czcionki.has(nazwa)) {
      type Font = { name?: string; fallbackName?: string; bold?: boolean; italic?: boolean; black?: boolean }
      const pobierz = (): Font | null => { try { return strona.commonObjs.get(nazwa) as Font } catch { return null } }
      const f = pobierz()
      const n = `${f?.name ?? ''} ${tc.styles[nazwa]?.fontFamily ?? ''}`
      czcionki.set(nazwa, {
        pogrubiony: !!f?.bold || !!f?.black || /bold|black|heavy|semibold|demi/i.test(n), kursywa: !!f?.italic || /italic|oblique/i.test(n),
        czcionka: rodzinaCzcionki(f?.name) ?? rodzinaCzcionki(f?.fallbackName) ?? rodzinaCzcionki(tc.styles[nazwa]?.fontFamily),
        font: nazwa,
        // Fonty bez nazwy (np. "ABCDEF+CIDFont+F2" z wydruku do PDF) nie mówią, czy są pogrubione - wtedy decyduje render.
        styl_z_nazwy: f?.bold !== undefined || f?.italic !== undefined || (!!f?.name && !/cidfont|^([A-Z]{6}\+)?F\d+$|^T\d/i.test(f.name)),
      })
    }
    return czcionki.get(nazwa)!
  }
  const wynik: ElementZCzcionka[] = []
  for (const it of tc.items) {
    if (!('str' in it) || !it.str.trim()) continue
    const m = lib.Util.transform(v.transform, it.transform) as number[]
    if (Math.abs(m[1]) > 0.1 * Math.abs(m[0])) continue
    wynik.push({ str: it.str, x: m[4], y: m[5], w: it.width, h: Math.hypot(m[2], m[3]), ...czcionka(it.fontName) })
  }
  return wynik
}

/**
 * Grafika strony z listy operatorów pdf.js: odcinki i krawędzie obrysowanych prostokątów (siatki tabel, podkreślenia)
 * oraz miejsca obrazów (logo, rysunki, zdjęcia). Współrzędne w pt od lewego górnego rogu, jak warstwa tekstowa.
 */
async function grafikaStrony(doc: PDFDocumentProxy, nr: number): Promise<Omit<GrafikaStrony, 'plamy'>> {
  const lib = await pdfjs()
  const O = lib.OPS
  const strona = await doc.getPage(nr)
  const v = strona.getViewport({ scale: 1 })
  const ops = await strona.getOperatorList()
  type M = number[]
  let ctm: M = [1, 0, 0, 1, 0, 0]
  const stos: M[] = []
  const linie: Prostokat[] = []
  const obrazy: Prostokat[] = []
  const prostokat = (pkt: [number, number][]): Prostokat => {
    const m = lib.Util.transform(v.transform, ctm) as M
    const p = pkt.map((x) => lib.Util.applyTransform(x, m) as [number, number])
    const xs = p.map((x) => x[0])
    const ys = p.map((x) => x[1])
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
  }
  const linia = (r: Prostokat) => { if ((r.h <= 2 && r.w >= 8) || (r.w <= 2 && r.h >= 8)) linie.push(r) }
  const OBRYS = new Set([O.stroke, O.closeStroke, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke])
  for (let j = 0; j < ops.fnArray.length; j++) {
    const fn = ops.fnArray[j]
    const a = ops.argsArray[j] as unknown[]
    if (fn === O.save) stos.push(ctm)
    else if (fn === O.restore) ctm = stos.pop() ?? ctm
    else if (fn === O.transform) ctm = lib.Util.transform(ctm, a) as M
    else if (fn === O.paintFormXObjectBegin) { stos.push(ctm); if (Array.isArray(a?.[0])) ctm = lib.Util.transform(ctm, a[0]) as M }
    else if (fn === O.paintFormXObjectEnd) ctm = stos.pop() ?? ctm
    else if (fn === O.paintImageXObject || fn === O.paintInlineImageXObject || fn === O.paintImageMaskXObject) obrazy.push(prostokat([[0, 0], [1, 0], [0, 1], [1, 1]]))
    else if (fn === O.constructPath) {
      const [podOps, argi] = a as [number[], number[]]
      const obrys = OBRYS.has(ops.fnArray[j + 1])
      let k = 0
      let biez: [number, number] = [0, 0]
      let start: [number, number] = [0, 0]
      for (const op of podOps) {
        if (op === O.rectangle) {
          const [x, y, w, h] = argi.slice(k, k + 4); k += 4
          const r = prostokat([[x, y], [x + w, y + h]])
          if (r.h <= 2 || r.w <= 2) linia(r)
          else if (obrys) {
            linia({ x: r.x, y: r.y, w: r.w, h: 0 }); linia({ x: r.x, y: r.y + r.h, w: r.w, h: 0 })
            linia({ x: r.x, y: r.y, w: 0, h: r.h }); linia({ x: r.x + r.w, y: r.y, w: 0, h: r.h })
          }
        } else if (op === O.moveTo) { biez = [argi[k], argi[k + 1]]; start = biez; k += 2 }
        else if (op === O.lineTo) { const nowy: [number, number] = [argi[k], argi[k + 1]]; k += 2; if (obrys) linia(prostokat([biez, nowy])); biez = nowy }
        else if (op === O.curveTo) { biez = [argi[k + 4], argi[k + 5]]; k += 6 }
        else if (op === O.curveTo2 || op === O.curveTo3) { biez = [argi[k + 2], argi[k + 3]]; k += 4 }
        else if (op === O.closePath) { if (obrys) linia(prostokat([biez, start])); biez = start }
      }
    }
  }
  // Obrazy pocięte na pasy (częste w PDF) - sklejone w jeden prostokąt.
  const sklejone: Prostokat[] = []
  for (const o of obrazy.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const s = sklejone.find((x) => o.x < x.x + x.w + 1 && x.x < o.x + o.w + 1 && o.y < x.y + x.h + 1 && x.y < o.y + o.h + 1)
    if (s) { const x1 = Math.max(s.x + s.w, o.x + o.w); const y1 = Math.max(s.y + s.h, o.y + o.h); s.x = Math.min(s.x, o.x); s.y = Math.min(s.y, o.y); s.w = x1 - s.x; s.h = y1 - s.y }
    else sklejone.push({ ...o })
  }
  return { linie, obrazy: sklejone }
}

export async function zrodloPdf(bajty: Uint8Array): Promise<ZrodloStron> {
  const doc = await otworzRysunek(bajty)
  // Render strony do analizy (widoczność tekstu, plamy grafiki) - raz na stronę.
  const rendery = new Map<number, Promise<RenderStrony>>()
  const render = (nr: number) => { if (!rendery.has(nr)) rendery.set(nr, renderSzary(doc, nr, 1.5)); return rendery.get(nr)! }
  const teksty = new Map<number, Promise<ElementZCzcionka[]>>()
  const miara = miaraTekstu(doc)
  /** Warstwa tekstowa bez tekstu niewidocznego na stronie (biały na białym, przykryty). */
  const tekst = (nr: number) => {
    if (!teksty.has(nr)) {
      teksty.set(nr, (async () => {
        const el = await tekstZCzcionka(doc, nr)
        if (!el.length) return el
        const widoczne = tekstJakWidac(await render(nr), el)
        // Szerokość w PDF względem tej samej czcionki w systemie - odstęp znaków dla Worda.
        for (const e of widoczne) {
          if (!e.czcionka || !CZCIONKI_SYSTEMOWE.has(e.czcionka) || e.str.length < 2) continue
          e.odstep = (e.w - miara(e.str, e.czcionka, e.h, !!e.pogrubiony)) / e.str.length
        }
        return widoczne
      })())
    }
    return teksty.get(nr)!
  }
  const natywne: Record<number, number | null> = {}
  const dpiStrony = async (nr: number) => { if (!(nr in natywne)) natywne[nr] = await natywneDpi(doc, nr); return natywne[nr] }
  return {
    stron: doc.numPages,
    info: async (nr) => { const i = await infoStrony(doc, nr); return { ...i, natywneDpi: await dpiStrony(nr) } },
    podglad: (nr) => renderujPodglad(doc, nr),
    tekst,
    grafika: async (nr) => {
      const g = await grafikaStrony(doc, nr)
      const el = await tekst(nr)
      // Strona bez tekstu (skan) czytana jest przez AI - plamy niepotrzebne.
      if (!el.length) return { ...g, plamy: [], kropki: [] }
      const wyklucz = [
        ...el.map((e) => ({ x: e.x, y: e.y - e.h * 0.85, w: e.w, h: e.h * 1.05 })),
        ...g.linie.map((l) => ({ x: l.x - 1, y: l.y - 1, w: l.w + 2, h: l.h + 2 })), ...g.obrazy,
      ]
      return { ...g, ...podzielPlamy(plamyGrafiki(await render(nr), wyklucz)) }
    },
    kafle: async (nr, obszar) => {
      const k = await kafleObszaru(doc, nr, obszar, { dpi: DPI_DOKUMENTU, natywne: await dpiStrony(nr) })
      return { kafle: k.kafle, dpi: k.dpi, szer: k.szer, wys: k.wys }
    },
    wycinek: (nr, obszar) => wycinekJpeg(doc, nr, obszar),
    tlo: async (nr) => {
      const el = await tekst(nr)
      return tloBezTekstu(doc, nr, el.map((e) => ({ x: e.x, y: e.y - e.h * 0.85, w: e.w, h: e.h * 1.08 })))
    },
  }
}

const jpeg = (c: HTMLCanvasElement, jakosc = 0.85) => c.toDataURL('image/jpeg', jakosc)

/** Zdjęcie / skan JPG, PNG: jedna "strona" w pikselach; obszar do AI w natywnej rozdzielczości, pocięty na kafle. */
export async function zrodloObrazu(bajty: Uint8Array, mime: string): Promise<ZrodloStron> {
  const bitmapa = await createImageBitmap(new Blob([bajty.slice()], { type: mime }))
  const W = bitmapa.width
  const H = bitmapa.height
  const plotno = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
  return {
    stron: 1,
    info: async () => ({ szerPt: W, wysPt: H, elementowTekstu: 0, natywneDpi: null }),
    podglad: async () => {
      const s = Math.min(1, 3200 / Math.max(W, H))
      const c = plotno(Math.round(W * s), Math.round(H * s))
      c.getContext('2d')!.drawImage(bitmapa, 0, 0, c.width, c.height)
      return { dataUrl: jpeg(c, 0.8) }
    },
    tekst: async () => [],
    grafika: async () => ({ linie: [], obrazy: [] }),
    tlo: async () => null,
    wycinek: async (_nr, o) => {
      const c = plotno(Math.max(1, Math.round(o.w * W)), Math.max(1, Math.round(o.h * H)))
      c.getContext('2d')!.drawImage(bitmapa, Math.round(o.x * W), Math.round(o.y * H), c.width, c.height, 0, 0, c.width, c.height)
      const d = jpeg(c, 0.9)
      return Uint8Array.from(atob(d.slice(d.indexOf(',') + 1)), (z) => z.charCodeAt(0))
    },
    kafle: async (_nr, o) => {
      const x = Math.round(o.x * W)
      const y = Math.round(o.y * H)
      const w = Math.max(1, Math.round(o.w * W))
      const h = Math.max(1, Math.round(o.h * H))
      const wynik: Kafel[] = []
      for (const k of kafle(w, h, 1500, 0.1)) {
        const c = plotno(k.w, k.h)
        const ctx = c.getContext('2d')!
        ctx.fillStyle = 'white'; ctx.fillRect(0, 0, k.w, k.h)
        ctx.drawImage(bitmapa, x + k.x, y + k.y, k.w, k.h, 0, 0, k.w, k.h)
        const dataUrl = jpeg(c)
        wynik.push({ prostokat: k, dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) })
      }
      return { kafle: wynik, dpi: null, szer: w, wys: h }
    },
  }
}

// --- Struktura plików bez podglądu (DOCX, arkusze, tekst, DXF) ----------------------------------------

/** Odczyt bez AI pliku, który nie ma stron do zaznaczania - całość jako jedna "strona" wersji edytowalnej. */
export async function blokiZPliku(nazwa: string, rodzaj: RodzajPliku, bajty: Uint8Array): Promise<BlokDokumentu[]> {
  const e = nazwa.toLowerCase().split('.').pop() ?? ''
  if (rodzaj === 'docx') {
    const mammoth = await import('mammoth')
    const { value } = await mammoth.convertToHtml({ arrayBuffer: bajty.buffer.slice(bajty.byteOffset, bajty.byteOffset + bajty.byteLength) as ArrayBuffer })
    return blokiZHtml(value, (h) => new DOMParser().parseFromString(h, 'text/html'))
  }
  if (rodzaj === 'arkusz') {
    const XLSX = await import('xlsx-js-style')
    const wb = e === 'csv' ? XLSX.read(new TextDecoder().decode(bajty), { type: 'string' }) : XLSX.read(bajty, { type: 'array' })
    return blokiZArkusza(wb.SheetNames.map((n) => ({
      nazwa: n, wiersze: (XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '' }) as unknown[][]).map((w) => w.map((k) => String(k ?? ''))),
    })))
  }
  if (rodzaj === 'tekst') return blokiZTekstuZwyklego(new TextDecoder().decode(bajty))
  if (rodzaj === 'cad') {
    if (e !== 'dxf') throw new Error(t('Plik .{0} to binarny format CAD - aplikacja go nie odczyta. Zapisz rysunek w programie CAD jako PDF albo DXF i dodaj ponownie.', e))
    const teksty = tekstyZDxf(new TextDecoder().decode(bajty))
    if (!teksty.length) throw new Error(t('W pliku DXF nie ma tekstów (TEXT / MTEXT). Zapisz rysunek jako PDF, żeby odczytać go z podglądem.'))
    return teksty.map((t) => blok({ typ: 'akapit', tekst: t }))
  }
  throw new Error(t('Ten format nie jest obsługiwany. Dodaj PDF, skan / zdjęcie (JPG, PNG), DOCX, XLSX, CSV, TXT albo DXF.'))
}

export async function pobierzPlikEdytowalny(sciezka: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(BUCKET).download(sciezka)
  if (error || !data) throw new Error(komunikatPL(error?.message ?? 'Nie udało się pobrać pliku.'))
  return new Uint8Array(await data.arrayBuffer())
}
