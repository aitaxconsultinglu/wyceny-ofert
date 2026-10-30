// Kompresja pliku przed zapisem w Storage (w przeglądarce; PDF także w Node - raport kompresji w testach lokalnych).
// Zapisujemy tylko wersję zoptymalizowaną - oryginał zostaje na dysku pracownika. Każda metoda przechodzi test
// czytelności; gdy test nie przejdzie albo zysk jest mały, zapisujemy oryginał (metoda "brak").
// - PDF: optymalizacja struktury (pdf-lib: bez nieużywanych obiektów, strumienie obiektów) - warstwa tekstowa bez zmian
//   (test: ta sama liczba stron i znaków tekstu); skan bez warstwy tekstowej: strony przekodowane do JPEG w natywnej
//   rozdzielczości skanu, najwyżej 300 DPI (test: liczba stron, rozdzielczość >= min(natywna, 200 DPI)).
// - Obrazy JPG / PNG: WebP albo JPEG jakości 0,9, dłuższy bok najwyżej 6000 px (tylko przeglądarka).
// - Pozostałe (tekst, DXF, Office): gzip tylko przy zysku > 10% - pobieranie rozpakowuje (lib/magazyn.ts).
import { gzipSync } from 'fflate'

export type MetodaKompresji = 'brak' | 'pdf_struktura' | 'pdf_obrazy' | 'obraz_webp' | 'obraz_jpeg' | 'gzip'

export interface WynikKompresji {
  dane: Uint8Array
  mime: string
  metoda: MetodaKompresji
  rozmiar_oryginalny: number
  rozmiar_zapisany: number
  /** SHA-256 oryginału (hex) - duplikaty w zapytaniu. */
  hash: string
  /** Opis testu czytelności (do metadanych i raportu). */
  test: string
}

/** Minimalny zysk, żeby zapisać wersję skompresowaną (PDF, obrazy) i gzip (pliki, które zwykle są już spakowane). */
export const MIN_ZYSK = 0.05
export const MIN_ZYSK_GZIP = 0.10
export const DPI_SKANU = 300
export const MIN_DPI = 200
export const MAKS_BOK_OBRAZU = 6000
const JAKOSC_SKANU = 0.8
const JAKOSC_OBRAZU = 0.9

const rozszerzenie = (n: string) => n.toLowerCase().split('.').pop() ?? ''

export async function sha256(dane: Uint8Array): Promise<string> {
  const skrot = await crypto.subtle.digest('SHA-256', dane.slice().buffer)
  return [...new Uint8Array(skrot)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Gzip rozpoznany po sygnaturze (1f 8b) - pliki zapisane metodą gzip rozpakowuje pobieranie. */
export const jestGzip = (d: Uint8Array) => d.length > 2 && d[0] === 0x1f && d[1] === 0x8b

const zysk = (przed: number, po: number) => (przed > 0 ? 1 - po / przed : 0)

interface Kandydat { dane: Uint8Array; metoda: MetodaKompresji; mime: string; test: string }

/** Znaki tekstu i liczba stron PDF (test czytelności warstwy tekstowej). */
async function tekstPdfu(dane: Uint8Array) {
  const { tekstPdf } = await import('./dokumenty')
  const t = await tekstPdf(dane)
  return { stron: t.stron, znakow: t.strony.reduce((s, x) => s + x.replace(/\s/g, '').length, 0), skan: t.skan }
}

async function kompresujPdf(dane: Uint8Array): Promise<Kandydat[]> {
  const { PDFDocument } = await import('pdf-lib')
  const przed = await tekstPdfu(dane)
  const kandydaci: Kandydat[] = []

  // 1. Struktura - treść stron bez zmian.
  try {
    const doc = await PDFDocument.load(dane, { updateMetadata: false })
    const s = await doc.save({ useObjectStreams: true })
    const po = await tekstPdfu(s)
    if (po.stron === przed.stron && po.znakow === przed.znakow) {
      kandydaci.push({ dane: s, metoda: 'pdf_struktura', mime: 'application/pdf', test: `stron ${po.stron}, znaków tekstu ${po.znakow} (bez zmian)` })
    }
  } catch { /* PDF zaszyfrowany albo uszkodzony - zostaje oryginał */ }

  // 2. Skan bez żadnego tekstu - przekodowanie obrazów stron (warstwa tekstowa, nawet szczątkowa, musi zostać).
  if (przed.skan && przed.znakow === 0) {
    try {
      const { otworzRysunek, natywneDpi, stronaJakoJpeg } = await import('./rysunkiPdf')
      const zrodlo = await otworzRysunek(dane)
      const nowy = await PDFDocument.create()
      const dpiStron: number[] = []
      let ok = true
      for (let nr = 1; nr <= zrodlo.numPages; nr++) {
        const strona = await zrodlo.getPage(nr)
        const v = strona.getViewport({ scale: 1 })
        const natywne = await natywneDpi(zrodlo, nr)
        // Nie wyżej niż natywnie (nic nie zyskujemy) i nie wyżej niż 300 DPI; skan poniżej 200 DPI zostaje w swojej rozdzielczości.
        const dpi = Math.min(natywne ?? DPI_SKANU, DPI_SKANU)
        const { bajty, szer } = await stronaJakoJpeg(zrodlo, nr, dpi, JAKOSC_SKANU)
        const efektywne = Math.round(szer / (v.width / 72))
        if (efektywne < Math.min(natywne ?? DPI_SKANU, MIN_DPI) - 2) { ok = false; break }
        dpiStron.push(efektywne)
        const obraz = await nowy.embedJpg(bajty)
        const p = nowy.addPage([v.width, v.height])
        p.drawImage(obraz, { x: 0, y: 0, width: v.width, height: v.height })
      }
      if (ok) {
        const s = await nowy.save({ useObjectStreams: true })
        const po = await tekstPdfu(s)
        if (po.stron === przed.stron) kandydaci.push({ dane: s, metoda: 'pdf_obrazy', mime: 'application/pdf', test: `skan: stron ${po.stron}, ${Math.min(...dpiStron)}-${Math.max(...dpiStron)} DPI` })
      }
    } catch { /* render niedostępny - zostaje kompresja struktury */ }
  }
  return kandydaci
}

/** Obraz w przeglądarce: WebP i JPEG, dłuższy bok <= MAKS_BOK_OBRAZU (test: wymiary wyniku). */
async function kompresujObraz(dane: Uint8Array, ext: string): Promise<Kandydat[]> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return []
  const bitmapa = await createImageBitmap(new Blob([dane.slice()]))
  const skala = Math.min(1, MAKS_BOK_OBRAZU / Math.max(bitmapa.width, bitmapa.height))
  const w = Math.round(bitmapa.width * skala)
  const h = Math.round(bitmapa.height * skala)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h)
  ctx.drawImage(bitmapa, 0, 0, w, h)
  const kandydaci: Kandydat[] = []
  for (const [mime, metoda] of [['image/webp', 'obraz_webp'], ['image/jpeg', 'obraz_jpeg']] as const) {
    if (metoda === 'obraz_jpeg' && ext === 'png') continue  // rysunek kreskowy z PNG - JPEG rozmywa linie
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, mime, JAKOSC_OBRAZU))
    if (!blob || blob.type !== mime) continue
    const wynik = new Uint8Array(await blob.arrayBuffer())
    const kontrola = await createImageBitmap(blob)
    if (kontrola.width === w && kontrola.height === h) kandydaci.push({ dane: wynik, metoda, mime, test: `${w}×${h} px${skala < 1 ? ` (z ${bitmapa.width}×${bitmapa.height})` : ''}` })
  }
  return kandydaci
}

/**
 * Najmniejsza wersja pliku, która przeszła test czytelności (albo oryginał). `mime` - typ zapisu (obraz może zmienić
 * format na WebP). Maile (.msg / .eml) nie są zapisywane jako pliki - tu nie trafiają.
 */
/** Plik do tylu MB zapisujemy bez kompresji - przekodowanie skanów i obrazów obniża jakość, a z nią czytelność drobnego pisma. */
export const KOMPRESJA_OD_MB = 20

export async function kompresujPlik(nazwa: string, mime: string, dane: Uint8Array, odMb = KOMPRESJA_OD_MB): Promise<WynikKompresji> {
  const hash = await sha256(dane)
  const ext = rozszerzenie(nazwa)
  const oryginal: WynikKompresji = { dane, mime, metoda: 'brak', rozmiar_oryginalny: dane.byteLength, rozmiar_zapisany: dane.byteLength, hash, test: 'oryginał' }
  if (dane.byteLength <= odMb * 1024 * 1024) return { ...oryginal, test: `oryginał (do ${odMb} MB bez kompresji)` }
  let kandydaci: Kandydat[] = []
  try {
    if (ext === 'pdf') kandydaci = await kompresujPdf(dane)
    else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) kandydaci = await kompresujObraz(dane, ext)
    else if (!['zip', 'gz', '7z', 'rar', 'msg', 'eml'].includes(ext)) {
      const g = gzipSync(dane, { level: 9 })
      if (zysk(dane.byteLength, g.byteLength) > MIN_ZYSK_GZIP) kandydaci.push({ dane: g, metoda: 'gzip', mime, test: 'gzip (rozpakowanie przy pobraniu)' })
    }
  } catch { kandydaci = [] }
  const najlepszy = kandydaci.filter((k) => zysk(dane.byteLength, k.dane.byteLength) >= (k.metoda === 'gzip' ? MIN_ZYSK_GZIP : MIN_ZYSK))
    .sort((a, b) => a.dane.byteLength - b.dane.byteLength)[0]
  if (!najlepszy) return oryginal
  return { ...oryginal, dane: najlepszy.dane, mime: najlepszy.mime, metoda: najlepszy.metoda, rozmiar_zapisany: najlepszy.dane.byteLength, test: najlepszy.test }
}
