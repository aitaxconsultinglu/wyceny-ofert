// Obraz (JPG / PNG ze zdjęcia albo skanu) jako jednostronicowy PDF w pamięci - podgląd, zaznaczanie obszarów, kafle
// do AI i zapis odczytów działają wtedy tak samo jak dla rysunków PDF. JPEG trafia do PDF bez przekodowania (DCTDecode);
// PNG przeglądarka zamienia najpierw na JPEG. Część czysta (bez DOM) - testy w obrazPdf.test.ts.

export interface WymiaryJpeg { szer: number; wys: number; skladowe: number }

/** Szerokość, wysokość i liczba składowych koloru z nagłówka SOF pliku JPEG (null - to nie JPEG). */
export function wymiaryJpeg(b: Uint8Array): WymiaryJpeg | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue }
    const znacznik = b[i + 1]
    const dl = (b[i + 2] << 8) | b[i + 3]
    // SOF0..SOF15 bez DHT (C4), JPG (C8) i DAC (CC).
    if (znacznik >= 0xc0 && znacznik <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(znacznik)) {
      return { wys: (b[i + 5] << 8) | b[i + 6], szer: (b[i + 7] << 8) | b[i + 8], skladowe: b[i + 9] }
    }
    if (znacznik === 0xd9 || znacznik === 0xda) break
    i += 2 + dl
  }
  return null
}

export const jestObrazem = (nazwa: string) => /\.(jpe?g|png)$/i.test(nazwa)

/**
 * JPEG -> PDF z jedną stroną o wymiarach obrazu przy `dpi` (domyślnie 200 - typowy skan; ma znaczenie tylko dla
 * podpisu wymiarów strony i progu DPI kafli, obraz nie jest skalowany).
 */
export function pdfZJpeg(jpeg: Uint8Array, dpi = 200): Uint8Array {
  const w = wymiaryJpeg(jpeg)
  if (!w) throw new Error('To nie jest plik JPEG.')
  const szerPt = +(w.szer * 72 / dpi).toFixed(2)
  const wysPt = +(w.wys * 72 / dpi).toFixed(2)
  const kolory = w.skladowe === 1 ? '/DeviceGray' : w.skladowe === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : '/DeviceRGB'
  const tresc = `q ${szerPt} 0 0 ${wysPt} 0 0 cm /Im0 Do Q`
  const enc = new TextEncoder()
  const czesci: Uint8Array[] = []
  const offsety: number[] = []
  let dlugosc = 0
  const dodaj = (x: Uint8Array | string) => { const b = typeof x === 'string' ? enc.encode(x) : x; czesci.push(b); dlugosc += b.length }
  const obiekt = (nr: number, tekst: string) => { offsety[nr] = dlugosc; dodaj(`${nr} 0 obj\n${tekst}\nendobj\n`) }

  dodaj('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  obiekt(1, '<< /Type /Catalog /Pages 2 0 R >>')
  obiekt(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  obiekt(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${szerPt} ${wysPt}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  offsety[4] = dlugosc
  dodaj(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w.szer} /Height ${w.wys} /ColorSpace ${kolory} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`)
  dodaj(jpeg)
  dodaj('\nendstream\nendobj\n')
  obiekt(5, `<< /Length ${tresc.length} >>\nstream\n${tresc}\nendstream`)
  const xref = dlugosc
  dodaj(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(offsety[n]).padStart(10, '0')} 00000 n \n`).join('')}`)
  dodaj(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const wynik = new Uint8Array(dlugosc)
  let o = 0
  for (const c of czesci) { wynik.set(c, o); o += c.length }
  return wynik
}
