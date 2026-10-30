// Obracanie dokumentu o 90° (skan zapisany w poziomie albo w pionie): PDF - obrót stron (bez przekodowania treści,
// bez utraty jakości), obraz - przerysowanie na płótnie (PNG bez strat, JPEG / WebP w jakości 0,95). Plik w magazynie
// jest nadpisywany obróconą wersją; odczyty i podgląd korzystają z niej od razu.
import { supabase } from './supabase'
import { komunikatPL } from './config'
import { BUCKET, pobierzBajty } from './magazyn'

export type KatObrotu = 90 | -90 | 180

/** Kąt po obrocie w zakresie 0..270. */
export const nowyKat = (obecny: number, kat: KatObrotu) => (((obecny + kat) % 360) + 360) % 360

export async function obrocPdf(dane: Uint8Array, kat: KatObrotu): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import('pdf-lib')
  const doc = await PDFDocument.load(dane, { ignoreEncryption: true, updateMetadata: false })
  for (const s of doc.getPages()) s.setRotation(degrees(nowyKat(s.getRotation().angle, kat)))
  return doc.save({ useObjectStreams: true })
}

export async function obrocObraz(dane: Uint8Array, mime: string, kat: KatObrotu): Promise<Uint8Array> {
  const bitmapa = await createImageBitmap(new Blob([dane.slice()], { type: mime }))
  const bok = kat === 180
  const c = document.createElement('canvas')
  c.width = bok ? bitmapa.width : bitmapa.height
  c.height = bok ? bitmapa.height : bitmapa.width
  const ctx = c.getContext('2d')!
  ctx.translate(c.width / 2, c.height / 2)
  ctx.rotate((kat * Math.PI) / 180)
  ctx.drawImage(bitmapa, -bitmapa.width / 2, -bitmapa.height / 2)
  const typ = /png/i.test(mime) ? 'image/png' : /webp/i.test(mime) ? 'image/webp' : 'image/jpeg'
  const blob = await new Promise<Blob>((ok, zle) => c.toBlob((b) => (b ? ok(b) : zle(new Error('Nie udało się obrócić obrazu.'))), typ, 0.95))
  return new Uint8Array(await blob.arrayBuffer())
}

/** Obraca plik dokumentu w magazynie (PDF albo obraz) i zapisuje nowy rozmiar, skrót i kąt w metadanych. */
export async function obrocDokument(d: { id: string; sciezka: string; nazwa_pliku: string; mime: string | null; metadane: Record<string, unknown> | null }, kat: KatObrotu) {
  if (d.sciezka.endsWith('.gz')) throw new Error('Tego pliku nie da się obrócić (zapisany jako archiwum).')
  const dane = await pobierzBajty(d.sciezka)
  const pdf = /\.pdf$/i.test(d.nazwa_pliku) || d.mime === 'application/pdf'
  const nowe = pdf ? await obrocPdf(dane, kat) : await obrocObraz(dane, d.mime ?? 'image/jpeg', kat)
  const mime = pdf ? 'application/pdf' : d.mime ?? 'image/jpeg'
  const { error } = await supabase.storage.from(BUCKET).upload(d.sciezka, nowe, { contentType: mime, upsert: true })
  if (error) throw new Error(komunikatPL(error.message))
  const { sha256 } = await import('./kompresja')
  const metadane = { ...(d.metadane ?? {}), obrot: nowyKat(Number(d.metadane?.obrot ?? 0), kat) }
  const { error: e2 } = await supabase.from('dokumenty').update({ rozmiar_zapisany: nowe.byteLength, hash: await sha256(nowe), metadane }).eq('id', d.id)
  if (e2) throw new Error(komunikatPL(e2.message))
  return metadane
}
