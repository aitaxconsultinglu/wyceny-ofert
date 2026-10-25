// Pliki modułu "Wersje edytowalne" w przeglądarce: zapis w bucket "dokumenty" (edytowalne/<id>/<nazwa>), podgląd stron
// PDF i obrazów z wycinaniem obszarów do AI, warstwa tekstowa PDF z czcionką i odczyt struktury DOCX / arkuszy / TXT / DXF.
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { supabase } from './supabase'
import { komunikatPL } from './config'
import { pdfjs } from './dokumenty'
import { BUCKET, bezpiecznaNazwa } from './magazyn'
import { kafle, type Prostokat } from './rysunki'
import { infoStrony, kafleObszaru, natywneDpi, otworzRysunek, renderujPodglad, type Kafel } from './rysunkiPdf'
import { doKosza } from './kosz'
import {
  blok, blokiZArkusza, blokiZHtml, blokiZTekstuZwyklego, rodzajPliku, tekstyZDxf,
  type BlokDokumentu, type ElementZCzcionka, type RodzajPliku, type TrescPliku,
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
  /** Obszar (względny 0..1) jako kafle JPEG do AI. */
  kafle(nr: number, obszar: Prostokat): Promise<{ kafle: Kafel[]; dpi: number | null }>
}

/** Warstwa tekstowa jak tekstStrony, z pogrubieniem i kursywą z nazwy fontu (fonty ładuje lista operatorów strony). */
async function tekstZCzcionka(doc: PDFDocumentProxy, nr: number): Promise<ElementZCzcionka[]> {
  const lib = await pdfjs()
  const strona = await doc.getPage(nr)
  await strona.getOperatorList()
  const v = strona.getViewport({ scale: 1 })
  const tc = await strona.getTextContent()
  const czcionki = new Map<string, { pogrubiony: boolean; kursywa: boolean }>()
  const czcionka = (nazwa: string) => {
    if (!czcionki.has(nazwa)) {
      type Font = { name?: string; bold?: boolean; italic?: boolean; black?: boolean }
      const pobierz = (): Font | null => { try { return strona.commonObjs.get(nazwa) as Font } catch { return null } }
      const f = pobierz()
      const n = `${f?.name ?? ''} ${tc.styles[nazwa]?.fontFamily ?? ''}`
      czcionki.set(nazwa, { pogrubiony: !!f?.bold || !!f?.black || /bold|black|heavy|semibold|demi/i.test(n), kursywa: !!f?.italic || /italic|oblique/i.test(n) })
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

export async function zrodloPdf(bajty: Uint8Array): Promise<ZrodloStron> {
  const doc = await otworzRysunek(bajty)
  const natywne: Record<number, number | null> = {}
  const dpiStrony = async (nr: number) => { if (!(nr in natywne)) natywne[nr] = await natywneDpi(doc, nr); return natywne[nr] }
  return {
    stron: doc.numPages,
    info: async (nr) => { const i = await infoStrony(doc, nr); return { ...i, natywneDpi: await dpiStrony(nr) } },
    podglad: (nr) => renderujPodglad(doc, nr),
    tekst: (nr) => tekstZCzcionka(doc, nr),
    kafle: async (nr, obszar) => {
      const k = await kafleObszaru(doc, nr, obszar, { dpi: DPI_DOKUMENTU, natywne: await dpiStrony(nr) })
      return { kafle: k.kafle, dpi: k.dpi }
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
      return { kafle: wynik, dpi: null }
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
