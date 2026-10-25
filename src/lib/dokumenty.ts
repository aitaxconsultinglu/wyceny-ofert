import { t } from '@/i18n'
// Odczyt plików w przeglądarce: maile (.msg, .eml) z załącznikami, PDF (tekst + render stron),
// DOCX, XLS/XLSX, ZIP. Ciężkie biblioteki ładowane dopiero przy pierwszym użyciu.
// Zasady planu Free: mail zapisujemy jako tekst, a załączniki osobno; obrazki ze stopek
// pomijamy; obrazy dla AI generujemy tutaj i nie trafiają do Storage.

export type TypDokumentu =
  | 'rysunek' | 'karta_danych' | 'specyfikacja' | 'formularz_wymagan' | 'standard_klienta' | 'obliczenia'
  | 'korespondencja' | 'oferta_dostawcy' | 'karta_dostawy' | 'raport_registo' | 'inne'

export const ETYKIETY_TYPU: Record<TypDokumentu, string> = {
  rysunek: t('rysunek'), karta_danych: t('karta danych'), specyfikacja: t('specyfikacja'), formularz_wymagan: t('formularz wymagań'),
  standard_klienta: t('standard klienta'), obliczenia: t('obliczenia'), korespondencja: t('korespondencja'),
  oferta_dostawcy: t('oferta dostawcy'), karta_dostawy: t('karta dostawy'), raport_registo: t('raport Registo'), inne: t('inne'),
}

export interface WczytanyPlik {
  nazwa: string
  mime: string
  rozmiar: number
  dane: Uint8Array
  rodzaj: 'mail' | 'pdf' | 'docx' | 'arkusz' | 'obraz' | 'tekst' | 'inny'
  tekst: string
  /** PDF: liczba stron i czy to skan (bez warstwy tekstowej). Mail: temat, od, data, message_id. */
  metadane: Record<string, unknown>
  zalaczniki: WczytanyPlik[]
  typSugerowany: TypDokumentu
  /** Znacznik "istotny" ustawiony przez człowieka przed zapisem (import z maila) - inaczej domyślny wg typu. */
  istotny?: boolean
  /** Załącznik maila odznaczony przy imporcie ("nie wgrywaj") - nie trafia do bazy ani do bucketu. */
  wgraj?: boolean
}

const rozszerzenie = (n: string) => n.toLowerCase().split('.').pop() ?? ''

/** Domyślne typy dokumentów z nazwy pliku - człowiek może zmienić. */
export function zgadnijTyp(nazwa: string, rodzaj: WczytanyPlik['rodzaj']): TypDokumentu {
  const n = nazwa.toLowerCase()
  if (rodzaj === 'mail') return 'korespondencja'
  if (/standard|norma|wytyczn/.test(n)) return 'standard_klienta'
  if (/formularz/.test(n)) return 'formularz_wymagan'
  if (/specyfikac|siwz|opis przedmiotu/.test(n)) return 'specyfikacja'
  if (/datasheet|karta danych|data sheet/.test(n)) return 'karta_danych'
  if (/oblicz|calc/.test(n)) return 'obliczenia'
  if (/oferta|offer|quotation|wycena dostawcy/.test(n)) return 'oferta_dostawcy'
  if (/karta dostawy/.test(n)) return 'karta_dostawy'
  if (/registo/.test(n)) return 'raport_registo'
  if (/rys|drw|dwg|rysunek/.test(n)) return 'rysunek'
  return 'inne'
}

function mimeZRozszerzenia(nazwa: string) {
  const e = rozszerzenie(nazwa)
  return ({
    pdf: 'application/pdf', msg: 'application/vnd.ms-outlook', eml: 'message/rfc822',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', zip: 'application/zip', txt: 'text/plain',
  } as Record<string, string>)[e] ?? 'application/octet-stream'
}

/** Obrazek ze stopki/treści maila (image001.png) - nie jest dokumentem. */
function toObrazekZeStopki(nazwa: string, rozmiar: number, contentId?: string | null) {
  return /^image\d{3}\.(png|jpe?g|gif)$/i.test(nazwa) || (/\.(png|jpe?g|gif)$/i.test(nazwa) && (rozmiar < 40_000 || !!contentId))
}

/** Załącznik maila pominięty przy odczycie - lista trafia do metadanych maila (widać ją przy imporcie). */
export interface PominietyZalacznik { nazwa: string; rozmiar: number; powod: string }

/** Mniejsze obrazki to prawie zawsze logo, ikony i banery ze stopki - skan dokumentu waży więcej. */
export const MIN_OBRAZ_DOKUMENTU = 150_000

/**
 * Czy załącznik maila jest "śmieciem" (nie dokumentem zapytania ani oferty): obrazki ze stopki, logo i ikony,
 * wizytówki, podpisy S/MIME, zaproszenia z kalendarza, winmail.dat, puste pliki. Zwraca powód albo null.
 */
export function powodPominieciaZalacznika(nazwa: string, rozmiar: number, contentId?: string | null): string | null {
  const e = rozszerzenie(nazwa)
  if (!rozmiar) return 'pusty plik'
  if (toObrazekZeStopki(nazwa, rozmiar, contentId)) return 'obrazek ze stopki / logo'
  if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'emz', 'wmf'].includes(e) && (rozmiar < MIN_OBRAZ_DOKUMENTU || e === 'gif')) return 'mały obrazek (logo, ikona, baner)'
  if (['vcf', 'p7s', 'p7m', 'p7c', 'ics', 'htm', 'html', 'url', 'lnk', 'dat'].includes(e)) return 'wizytówka, podpis cyfrowy, zaproszenie lub plik techniczny poczty'
  return null
}

// --- PDF -------------------------------------------------------------------------------
let pdfjsObietnica: Promise<typeof import('pdfjs-dist')> | null = null
export async function pdfjs() {
  if (!pdfjsObietnica) {
    pdfjsObietnica = (async () => {
      // Poza przeglądarką (lokalny skrypt seed) - wersja "legacy" bez workera z adresu URL.
      if (typeof window === 'undefined') {
        const sciezka = 'pdfjs-dist/legacy/build/pdf.mjs'
        return (await import(/* @vite-ignore */ sciezka)) as typeof import('pdfjs-dist')
      }
      const lib = await import('pdfjs-dist')
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      lib.GlobalWorkerOptions.workerSrc = worker.default
      return lib
    })()
  }
  return pdfjsObietnica
}

export interface TekstPdf { stron: number; strony: string[]; skan: boolean }

export async function tekstPdf(dane: Uint8Array): Promise<TekstPdf> {
  const lib = await pdfjs()
  const doc = await lib.getDocument({ data: dane.slice() }).promise
  const strony: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const strona = await doc.getPage(i)
    const tc = await strona.getTextContent()
    // Zachowujemy podział na linie wg pozycji Y - tabele zostają czytelne dla modelu.
    let ostatnieY: number | null = null
    let linia = ''
    const linie: string[] = []
    for (const el of tc.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
      const y = Math.round(el.transform[5])
      if (ostatnieY !== null && Math.abs(y - ostatnieY) > 2) { linie.push(linia.trim()); linia = '' }
      linia += (linia && !linia.endsWith(' ') ? ' ' : '') + el.str
      ostatnieY = y
    }
    if (linia.trim()) linie.push(linia.trim())
    strony.push(linie.filter(Boolean).join('\n'))
  }
  const znakow = strony.reduce((s, t) => s + t.replace(/\s/g, '').length, 0)
  return { stron: doc.numPages, strony, skan: znakow < 40 * doc.numPages }
}

export interface RenderStrony { base64: string; dataUrl: string; szerokosc: number; wysokosc: number }

/** Renderuje stronę PDF do JPEG o zadanej rozdzielczości (DPI) - np. skan oferty dla AI. */
export async function renderujStrone(dane: Uint8Array, nrStrony: number, dpi = 150, jakosc = 0.85): Promise<RenderStrony> {
  const lib = await pdfjs()
  const doc = await lib.getDocument({ data: dane.slice() }).promise
  const strona = await doc.getPage(nrStrony)
  const viewport = strona.getViewport({ scale: dpi / 72 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await strona.render({ canvasContext: ctx, viewport, canvas } as Parameters<typeof strona.render>[0]).promise
  const dataUrl = canvas.toDataURL('image/jpeg', jakosc)
  return { dataUrl, base64: dataUrl.split(',')[1], szerokosc: canvas.width, wysokosc: canvas.height }
}

/** Obraz zmniejszony tak, by dłuższy bok miał max `maks` px (limit wygodny dla modelu i tańszy). */
export async function przeskalujObraz(dataUrl: string, maks = 1568): Promise<RenderStrony> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const skala = Math.min(1, maks / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * skala)
  canvas.height = Math.round(img.height * skala)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  const wynik = canvas.toDataURL('image/jpeg', 0.85)
  return { dataUrl: wynik, base64: wynik.split(',')[1], szerokosc: canvas.width, wysokosc: canvas.height }
}

// --- Maile -------------------------------------------------------------------------------
function messageIdZNaglowkow(naglowki?: string) {
  return naglowki ? /^Message-ID:\s*(<[^>]+>)/im.exec(naglowki)?.[1] ?? null : null
}

async function wczytajMsg(nazwa: string, dane: Uint8Array): Promise<WczytanyPlik> {
  const { default: MsgReader } = await import('@kenjiuno/msgreader')
  const czytnik = new MsgReader(dane.buffer.slice(dane.byteOffset, dane.byteOffset + dane.byteLength) as ArrayBuffer)
  const d = czytnik.getFileData()
  const zalaczniki: WczytanyPlik[] = []
  const pominiete: PominietyZalacznik[] = []
  for (const a of d.attachments ?? []) {
    if (a.innerMsgContent || a.attachmentHidden) continue
    const zal = czytnik.getAttachment(a)
    const nazwaZal = zal.fileName || a.fileName || 'załącznik'
    const powod = powodPominieciaZalacznika(nazwaZal, zal.content.byteLength, a.pidContentId)
    if (powod) { pominiete.push({ nazwa: nazwaZal, rozmiar: zal.content.byteLength, powod }); continue }
    zalaczniki.push(await wczytajDane(nazwaZal, zal.content))
  }
  const tekst = (d.body ?? '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim()
  return {
    nazwa, mime: 'application/vnd.ms-outlook', rozmiar: dane.byteLength, dane, rodzaj: 'mail', tekst, zalaczniki,
    typSugerowany: 'korespondencja',
    metadane: {
      temat: d.subject ?? '', od: d.senderName ?? '', od_email: d.senderEmail ?? '',
      data: d.clientSubmitTime ?? d.messageDeliveryTime ?? null, message_id: messageIdZNaglowkow(d.headers),
      pominiete_zalaczniki: pominiete,
    },
  }
}

async function wczytajEml(nazwa: string, dane: Uint8Array): Promise<WczytanyPlik> {
  const { default: PostalMime } = await import('postal-mime')
  const mail = await PostalMime.parse(dane)
  const zalaczniki: WczytanyPlik[] = []
  const pominiete: PominietyZalacznik[] = []
  for (const a of mail.attachments ?? []) {
    const tresc = typeof a.content === 'string' ? new TextEncoder().encode(a.content) : new Uint8Array(a.content)
    const nazwaZal = a.filename || 'załącznik'
    const powod = powodPominieciaZalacznika(nazwaZal, tresc.byteLength, a.contentId)
    if (powod) { pominiete.push({ nazwa: nazwaZal, rozmiar: tresc.byteLength, powod }); continue }
    zalaczniki.push(await wczytajDane(nazwaZal, tresc))
  }
  const tekst = (mail.text ?? (mail.html ?? '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' '))
    .replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return {
    nazwa, mime: 'message/rfc822', rozmiar: dane.byteLength, dane, rodzaj: 'mail', tekst, zalaczniki,
    typSugerowany: 'korespondencja',
    metadane: {
      temat: mail.subject ?? '', od: mail.from?.name ?? '', od_email: mail.from?.address ?? '',
      data: mail.date ?? null, message_id: mail.messageId ?? null,
      pominiete_zalaczniki: pominiete,
    },
  }
}

// --- Pozostałe ---------------------------------------------------------------------------
async function tekstDocx(dane: Uint8Array) {
  const mammoth = await import('mammoth')
  // Poza przeglądarką (seed) mammoth czyta Buffer, nie ArrayBuffer - inaczej DOCX zostawał bez tekstu.
  const zrodlo = typeof window === 'undefined'
    ? { buffer: Buffer.from(dane) }
    : { arrayBuffer: dane.buffer.slice(dane.byteOffset, dane.byteOffset + dane.byteLength) as ArrayBuffer }
  const wynik = await mammoth.extractRawText(zrodlo as Parameters<typeof mammoth.extractRawText>[0])
  return wynik.value.replace(/\n{3,}/g, '\n\n').trim()
}

async function tekstArkusza(dane: Uint8Array) {
  const XLSX = await import('xlsx-js-style')
  const wb = XLSX.read(dane, { type: 'array' })
  return wb.SheetNames.map((n) => `### Arkusz: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: ' | ', blankrows: false })}`).join('\n\n')
}

async function rozpakujZip(dane: Uint8Array): Promise<{ nazwa: string; dane: Uint8Array }[]> {
  const { unzipSync } = await import('fflate')
  const pliki = unzipSync(dane)
  return Object.entries(pliki)
    .filter(([n, d]) => !n.endsWith('/') && d.byteLength > 0 && !n.startsWith('__MACOSX'))
    .map(([n, d]) => ({ nazwa: n.split('/').pop()!, dane: d }))
}

export async function wczytajDane(nazwa: string, dane: Uint8Array): Promise<WczytanyPlik> {
  const e = rozszerzenie(nazwa)
  const podstawa = { nazwa, mime: mimeZRozszerzenia(nazwa), rozmiar: dane.byteLength, dane, zalaczniki: [] as WczytanyPlik[], metadane: {} as Record<string, unknown> }
  try {
    if (e === 'msg') return await wczytajMsg(nazwa, dane)
    if (e === 'eml') return await wczytajEml(nazwa, dane)
    if (e === 'pdf') {
      const t = await tekstPdf(dane)
      return { ...podstawa, rodzaj: 'pdf', tekst: t.strony.map((s, i) => `--- strona ${i + 1} ---\n${s}`).join('\n\n'), metadane: { stron: t.stron, skan: t.skan }, typSugerowany: zgadnijTyp(nazwa, 'pdf') }
    }
    if (e === 'docx') return { ...podstawa, rodzaj: 'docx', tekst: await tekstDocx(dane), typSugerowany: zgadnijTyp(nazwa, 'docx') }
    if (e === 'xlsx' || e === 'xls' || e === 'xlsm') return { ...podstawa, rodzaj: 'arkusz', tekst: await tekstArkusza(dane), typSugerowany: zgadnijTyp(nazwa, 'arkusz') }
    if (e === 'zip') {
      const pliki = await rozpakujZip(dane)
      const zalaczniki: WczytanyPlik[] = []
      for (const p of pliki) zalaczniki.push(await wczytajDane(p.nazwa, p.dane))
      return { ...podstawa, rodzaj: 'inny', tekst: '', zalaczniki, typSugerowany: 'inne', metadane: { archiwum: true } }
    }
    if (['png', 'jpg', 'jpeg', 'webp'].includes(e)) return { ...podstawa, rodzaj: 'obraz', tekst: '', typSugerowany: zgadnijTyp(nazwa, 'obraz') }
    if (['txt', 'csv'].includes(e)) return { ...podstawa, rodzaj: 'tekst', tekst: new TextDecoder().decode(dane), typSugerowany: 'inne' }
  } catch (blad) {
    return { ...podstawa, rodzaj: 'inny', tekst: '', typSugerowany: 'inne', metadane: { blad_odczytu: String(blad) } }
  }
  return { ...podstawa, rodzaj: 'inny', tekst: '', typSugerowany: zgadnijTyp(nazwa, 'inny') }
}

export async function wczytajPlik(plik: File): Promise<WczytanyPlik> {
  return wczytajDane(plik.name, new Uint8Array(await plik.arrayBuffer()))
}

/** Spłaszcza archiwa ZIP: ZIP nie jest dokumentem, dokumentami są pliki w środku. */
export function splaszczArchiwa(pliki: WczytanyPlik[]): WczytanyPlik[] {
  return pliki.flatMap((p) => (p.metadane.archiwum ? splaszczArchiwa(p.zalaczniki) : [p]))
}

export function base64ZBajtow(dane: Uint8Array): string {
  let s = ''
  for (let i = 0; i < dane.length; i += 0x8000) s += String.fromCharCode(...dane.subarray(i, i + 0x8000))
  return btoa(s)
}
