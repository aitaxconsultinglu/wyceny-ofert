// Karty dostawy Optimy w PDF (folder z przykładowymi kartami w FOLDER_MATERIALOW, poza repozytorium): odczyt warstwy
// tekstowej bez AI tym samym parserem co XLS - suma pozycji zgodna ze stopką "Suma dostaw".
import { existsSync, readdirSync, readFileSync } from 'fs'
import { describe, expect, it } from 'vitest'
import { otworzRysunek, infoStrony, tekstStrony } from '../../src/lib/rysunkiPdf'
import { wierszeKartyZPdf } from '../../src/lib/importOptimaPdf'
import { parsujKarteDostawy } from '../../src/lib/importOptima'
import { maMaterialy, plikMaterialow, TESTY } from './srodowisko'

const FOLDER = TESTY.karty_dostawy_pdf ? plikMaterialow(TESTY.karty_dostawy_pdf) : ''

describe.skipIf(!maMaterialy || !FOLDER || !existsSync(FOLDER))('karty dostawy w PDF', () => {
  it('każda karta: pozycje, numer karty i suma zgodna ze stopką', async () => {
    const pliki = readdirSync(FOLDER).filter((n) => n.toLowerCase().endsWith('.pdf'))
    expect(pliki.length).toBeGreaterThan(0)
    for (const n of pliki) {
      const pdf = await otworzRysunek(new Uint8Array(readFileSync(`${FOLDER}/${n}`)))
      const strony = []
      for (let i = 1; i <= pdf.numPages; i++) strony.push({ elementy: await tekstStrony(pdf, i), szerPt: (await infoStrony(pdf, i)).szerPt })
      const k = parsujKarteDostawy(wierszeKartyZPdf(strony))
      expect(k.numer_karty, n).toMatch(/\/\d{4}$/)
      expect(k.pozycje.length, n).toBeGreaterThan(0)
      expect(k.ostrzezenia.filter((o) => /bez zamówienia/.test(o)), n).toEqual([])
      expect(k.zgodna, `${n}: pozycje ${k.suma_pozycji}, zamówienia ${k.suma_zamowien}, stopka ${k.suma_stopka}`).toBe(true)
    }
  }, 120_000)
})
