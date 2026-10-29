// Wersje edytowalne na prawdziwych plikach (bez AI): odczytują się wszystkie strony, bloki mają położenie na stronie,
// Word ma sekcję na każdą stronę oryginału z jej wymiarami; formularz z gęstą siatką dostaje układ dokładny z tłem.
// Pliki z konfiguracji "edytowalne" w prywatne/testy.json (ścieżki względem FOLDER_MATERIALOW).
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Packer } from 'docx'
import { unzipSync, strFromU8 } from 'fflate'
import { zrodloPdf } from '../../src/lib/wersjeEdytowalnePliki'
import { blokiDokladne, blokiStrony, jestFormularzem } from '../../src/lib/wersjeEdytowalne'
import { dokumentWord, type StronaWorda } from '../../src/lib/wersjeEdytowalneWord'
import { TESTY, plikTestu } from './srodowisko'

const dokument = plikTestu(TESTY.edytowalne?.dokument)
const formularz = plikTestu(TESTY.edytowalne?.formularz)

async function strony(plik: string, uklad: 'auto' | 'plynny') {
  const z = await zrodloPdf(new Uint8Array(readFileSync(plik)))
  const wynik: StronaWorda[] = []
  for (let nr = 1; nr <= z.stron; nr++) {
    const i = await z.info(nr)
    const el = await z.tekst(nr)
    const g = await z.grafika(nr)
    const dokladny = uklad === 'auto' && jestFormularzem(g)
    const tlo = dokladny ? await z.tlo(nr) : null
    wynik.push({
      nr, wymiary: { szerPt: i.szerPt, wysPt: i.wysPt }, uklad: dokladny ? 'dokladny' : 'plynny', tlo: tlo ? { dane: tlo, typ: 'jpg' } : null,
      bloki: dokladny ? blokiDokladne(el, i.szerPt, i.wysPt, g) : blokiStrony(el, i.szerPt, [], { wysPt: i.wysPt, grafika: g }),
    })
  }
  return { z, wynik }
}

const sekcje = async (s: StronaWorda[]) => {
  const xml = strFromU8(unzipSync(new Uint8Array(await Packer.toBuffer(dokumentWord(s, 'test'))))['word/document.xml'])
  return (xml.match(/<w:sectPr/g) ?? []).length
}

describe.skipIf(!dokument)('wersje edytowalne - dokument wielostronicowy', () => {
  it('każda strona odczytana bez AI, bloki z położeniem, Word: sekcja na stronę', async () => {
    const { z, wynik } = await strony(dokument!, 'plynny')
    expect(z.stron).toBeGreaterThan(1)
    expect(wynik.filter((s) => s.bloki.length)).toHaveLength(z.stron)
    expect(wynik.every((s) => s.bloki.every((b) => b.ramka))).toBe(true)
    expect(await sekcje(wynik)).toBe(z.stron)
  }, 300_000)
})

describe.skipIf(!formularz)('wersje edytowalne - formularz z siatką', () => {
  it('strony z gęstą siatką w układzie dokładnym z tłem, pola w Wordzie', async () => {
    const { wynik } = await strony(formularz!, 'auto')
    const dokladne = wynik.filter((s) => s.uklad === 'dokladny')
    expect(dokladne.length).toBeGreaterThan(0)
    expect(dokladne.every((s) => s.tlo && s.tlo.dane.length > 1000)).toBe(true)
    const xml = strFromU8(unzipSync(new Uint8Array(await Packer.toBuffer(dokumentWord(dokladne, 'test'))))['word/document.xml'])
    expect((xml.match(/w:framePr/g) ?? []).length).toBeGreaterThan(20)
  }, 300_000)
})
