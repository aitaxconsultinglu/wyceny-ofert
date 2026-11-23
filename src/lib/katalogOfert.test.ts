import { describe, expect, it } from 'vitest'
import { czyPlikKatalogu, formularzBezAi, numerZO, zalacznikiOferty } from './katalogOfert'
import type { WczytanyPlik } from './dokumenty'

// Dane FIKCYJNE.
const plik = (z: Partial<WczytanyPlik>): WczytanyPlik => ({
  nazwa: 'oferta.pdf', mime: 'application/pdf', rozmiar: 1, dane: new Uint8Array(), rodzaj: 'pdf', tekst: '', typSugerowany: 'oferta_dostawcy', metadane: {}, zalaczniki: [], ...z,
})
const DOSTAWCY = [{ id: 'd1', nazwa: 'Stalex Sp. z o.o.', aliasy: [], kontakty: [{ email: 'biuro@stalex.example' }] }]

describe('katalog ofert', () => {
  it('pliki ofert i pomijane pliki systemowe', () => {
    expect(czyPlikKatalogu('Oferta 12.PDF')).toBe(true)
    expect(czyPlikKatalogu('Oferty/2026/mail.msg')).toBe(true)
    expect(czyPlikKatalogu('~$oferta.xlsx')).toBe(false)
    expect(czyPlikKatalogu('Thumbs.db')).toBe(false)
    expect(czyPlikKatalogu('rysunek.dwg')).toBe(false)
  })

  it('numer ZO z nazwy pliku i treści', () => {
    expect(numerZO('Oferta do ZO/123/2026 - odkuwki.pdf')).toBe('ZO/123/2026')
    expect(numerZO('zo-45 blachy')).toBe('ZO/45')
    expect(numerZO('Oferta 2026-11 rury')).toBeNull()
  })

  it('mail: załączniki-oferty bez kart katalogowych; bez AI - dostawca po domenie, cena i ZO', () => {
    const mail = plik({
      nazwa: 'RE oferta.msg', rodzaj: 'mail', metadane: { od: 'Jan Kowalski', od_email: 'jan@stalex.example', temat: 'Oferta ZO/7/2026', data: '2026-11-20' },
      tekst: 'Dzień dobry, w załączeniu oferta.',
      zalaczniki: [
        plik({ nazwa: 'oferta 77.pdf', tekst: 'Blacha P265GH 10 mm 2 szt 1 250,00 PLN/szt\nTermin realizacji: 3 tygodnie\nOferta ważna do 2026-12-31' }),
        plik({ nazwa: 'datasheet.pdf', tekst: 'Material data' }),
      ],
    })
    expect(zalacznikiOferty(mail)).toEqual(['oferta 77.pdf'])
    const { formularz, wystarczy } = formularzBezAi(mail, DOSTAWCY)
    expect(formularz.dostawca_id).toBe('d1')
    expect(formularz.nr_zo).toBe('ZO/7/2026')
    expect(formularz.data_oferty).toBe('2026-11-20')
    expect(wystarczy).toBe(true)
  })

  it('skan bez tekstu - czeka na AI', () => {
    expect(formularzBezAi(plik({ nazwa: 'skan.pdf', metadane: { skan: true } }), DOSTAWCY).wystarczy).toBe(false)
  })
})
