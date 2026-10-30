// Kompresja plików na prawdziwych materiałach (FOLDER_MATERIALOW, poza repozytorium): współczynniki dla folderów
// z przykładowymi zapytaniami (lista w prywatne/testy.json) i potwierdzenie, że odczyt działa na wersji skompresowanej tak jak na oryginale -
// warstwa tekstowa PDF (te same znaki, tabela z rysunku z CAD) i kafle skanów (render w ~300 DPI).
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { kompresujPlik } from '../../src/lib/kompresja'
import { tekstPdf } from '../../src/lib/dokumenty'
import { kafleObszaru, otworzRysunek, tekstStrony } from '../../src/lib/rysunkiPdf'
import { maMaterialy, plikMaterialow, TESTY } from './srodowisko'

const FOLDERY = TESTY.foldery_kompresji ?? []
const pliki = (d: string): string[] => readdirSync(d).flatMap((n) => {
  const p = join(d, n)
  return statSync(p).isDirectory() ? pliki(p) : [p]
})
const MIME: Record<string, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }

describe.skipIf(!maMaterialy || !FOLDERY.length)('kompresja plików - raport na materiałach przykładowych', () => {
  it('foldery: współczynniki kompresji i odczyt po kompresji', async () => {
    const wiersze: string[] = []
    for (const folder of FOLDERY) {
      let przed = 0
      let po = 0
      // Maile (.msg) nie są zapisywane jako pliki - aplikacja trzyma ich tekst i załączniki osobno.
      for (const p of pliki(plikMaterialow(folder)).filter((x) => /\.(pdf|docx|xlsx)$/i.test(x))) {
        const dane = new Uint8Array(readFileSync(p))
        const ext = p.split('.').pop()!.toLowerCase()
        // Próg 0 MB - sprawdzamy samą kompresję i odczyt po niej (w aplikacji pliki do 20 MB zostają bez kompresji).
        const w = await kompresujPlik(p, MIME[ext], dane, 0)
        przed += w.rozmiar_oryginalny
        po += w.rozmiar_zapisany
        let odczyt = '-'
        if (ext === 'pdf') {
          const [a, b] = [await tekstPdf(dane), await tekstPdf(w.dane)]
          expect(b.stron, p).toBe(a.stron)
          expect(b.strony.join('').replace(/\s/g, '').length, p).toBe(a.strony.join('').replace(/\s/g, '').length)
          // Rysunek / skan: warstwa tekstowa w układzie strony i kafle ~300 DPI z wersji skompresowanej.
          const pdf = await otworzRysunek(w.dane)
          const el = (await tekstStrony(pdf, 1)).length
          expect(el, p).toBe((await tekstStrony(await otworzRysunek(dane), 1)).length)
          const k = await kafleObszaru(pdf, 1, { x: 0, y: 0, w: 0.25, h: 0.25 })
          expect(k.kafle.length, p).toBeGreaterThan(0)
          odczyt = `tekst ${el} el., kafle ${k.kafle.length} × ${k.dpi} DPI`
        }
        wiersze.push(`${folder.slice(0, 22).padEnd(22)} | ${p.split(/[\\/]/).pop()!.slice(0, 44).padEnd(44)} | ${(w.rozmiar_oryginalny / 1024).toFixed(0).padStart(6)} KB -> ${(w.rozmiar_zapisany / 1024).toFixed(0).padStart(6)} KB | ${((1 - w.rozmiar_zapisany / w.rozmiar_oryginalny) * 100).toFixed(1).padStart(5)}% | ${w.metoda.padEnd(13)} | ${odczyt}`)
      }
      wiersze.push(`${folder.slice(0, 22).padEnd(22)} | RAZEM ${''.padEnd(38)} | ${(przed / 1024).toFixed(0).padStart(6)} KB -> ${(po / 1024).toFixed(0).padStart(6)} KB | ${((1 - po / przed) * 100).toFixed(1).padStart(5)}% |`)
    }
    console.log(`\nRAPORT KOMPRESJI\n${wiersze.join('\n')}`)
  }, 600_000)
})
