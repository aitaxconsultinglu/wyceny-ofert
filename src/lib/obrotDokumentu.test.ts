import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { nowyKat, obrocPdf } from './obrotDokumentu'

describe('obracanie dokumentu', () => {
  it('kąt po obrocie w zakresie 0-270', () => {
    expect(nowyKat(0, 90)).toBe(90)
    expect(nowyKat(0, -90)).toBe(270)
    expect(nowyKat(270, 90)).toBe(0)
  })
  it('PDF: obrót wszystkich stron bez zmiany treści', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([595, 842]); doc.addPage([842, 595])
    const obrocony = await PDFDocument.load(await obrocPdf(await doc.save(), 90))
    expect(obrocony.getPages().map((s) => s.getRotation().angle)).toEqual([90, 90])
    const z_powrotem = await PDFDocument.load(await obrocPdf(await obrocony.save(), -90))
    expect(z_powrotem.getPages().map((s) => [s.getRotation().angle, s.getWidth()])).toEqual([[0, 595], [0, 842]])
  })
})
