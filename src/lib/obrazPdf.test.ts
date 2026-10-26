import { describe, expect, it } from 'vitest'
import { jestObrazem, pdfZJpeg, wymiaryJpeg } from './obrazPdf'

// Sztuczny JPEG: SOI, APP0 (JFIF), SOF0 1654 x 2339 px (A4 przy 200 DPI), 3 składowe, EOI - do testu nagłówków wystarczy.
function jpeg(szer: number, wys: number, skladowe = 3) {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  const sof = [0xff, 0xc0, 0x00, 8 + 3 * skladowe, 0x08, wys >> 8, wys & 255, szer >> 8, szer & 255, skladowe, ...Array(3 * skladowe).fill(1)]
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xd9])
}

describe('obraz jako PDF', () => {
  it('wymiary z nagłówka JPEG; inny plik to nie JPEG', () => {
    expect(wymiaryJpeg(jpeg(1654, 2339))).toEqual({ szer: 1654, wys: 2339, skladowe: 3 })
    expect(wymiaryJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
    expect(jestObrazem('skan.JPG')).toBe(true)
    expect(jestObrazem('rys.png')).toBe(true)
    expect(jestObrazem('rys.pdf')).toBe(false)
  })

  it('PDF z jedną stroną: rozmiar strony z DPI, obraz bez przekodowania, poprawna tablica xref', () => {
    const j = jpeg(1654, 2339)
    const pdf = pdfZJpeg(j, 200)
    const tekst = new TextDecoder('latin1').decode(pdf)
    expect(tekst.startsWith('%PDF-1.4')).toBe(true)
    expect(tekst).toContain('/MediaBox [0 0 595.44 842.04]')
    expect(tekst).toContain('/Width 1654 /Height 2339 /ColorSpace /DeviceRGB')
    expect(tekst).toContain(`/Length ${j.length}`)
    // Offsety xref wskazują początki obiektów 1..5.
    const xref = tekst.slice(tekst.indexOf('xref\n'))
    const offsety = [...xref.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
    expect(offsety).toHaveLength(5)
    offsety.forEach((o, i) => expect(tekst.slice(o, o + 8)).toBe(`${i + 1} 0 obj\n`))
    expect(Number(/startxref\n(\d+)/.exec(tekst)![1])).toBe(tekst.indexOf('xref\n'))
  })

  it('skala szarości i CMYK', () => {
    expect(new TextDecoder('latin1').decode(pdfZJpeg(jpeg(100, 50, 1)))).toContain('/ColorSpace /DeviceGray')
    expect(new TextDecoder('latin1').decode(pdfZJpeg(jpeg(100, 50, 4)))).toContain('/DeviceCMYK')
    expect(() => pdfZJpeg(new Uint8Array([1, 2, 3]))).toThrow()
  })
})
