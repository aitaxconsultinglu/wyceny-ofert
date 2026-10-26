import { describe, expect, it } from 'vitest'
import { polaZapytaniaZDokumentow, stronaFragmentu } from './polaZDokumentow'

// Dane FIKCYJNE.
const KLIENCI = [{ id: 'k1', nazwa: 'Zakłady Testowe SA', skrot: 'ZTSA', domeny: ['zaklady-testowe.pl'] }]
const PUSTE = { nr_zapytania_klienta: null, termin_oferty: null, klient_id: null }

describe('pola karty zapytania z dokumentów', () => {
  it('numer, termin i klient z zapytania ofertowego, ze źródłem (plik, strona)', () => {
    const p = polaZapytaniaZDokumentow([
      { nazwa: 'opis.pdf', typ: 'projekt', tekst: '--- strona 1 ---\nOpis techniczny' },
      { nazwa: 'zapytanie.pdf', typ: 'zapytanie_ofertowe', tekst: '--- strona 1 ---\nZTSA\n--- strona 2 ---\nZapytanie ofertowe nr ZT-77/2026\nTermin składania ofert: 05.11.2026 godz. 12:00' },
    ], PUSTE, KLIENCI)
    expect(p.map((x) => [x.pole, x.pole === 'termin_oferty' ? new Date(x.wartosc).getDate() : x.wartosc, x.zrodlo])).toEqual([
      ['nr_zapytania_klienta', 'ZT-77/2026', 'zapytanie.pdf, str. 2'],
      ['termin_oferty', 5, 'zapytanie.pdf, str. 2'],
      ['klient_id', 'k1', 'zapytanie.pdf (nazwa „ztsa” w treści)'],
    ])
  })
  it('wypełnione pola zostają (poprawka człowieka ma pierwszeństwo)', () => {
    const p = polaZapytaniaZDokumentow([{ nazwa: 'z.pdf', typ: 'zapytanie_ofertowe', tekst: 'Zapytanie ofertowe nr ZT-1/2026' }],
      { nr_zapytania_klienta: 'RĘCZNY-1', termin_oferty: '2026-11-01T10:00:00Z', klient_id: 'k9' }, KLIENCI)
    expect(p).toEqual([])
  })
  it('strona fragmentu', () => {
    expect(stronaFragmentu('--- strona 1 ---\na\n--- strona 3 ---\nb', 'b')).toBe(3)
    expect(stronaFragmentu('bez stron', 'bez')).toBeNull()
  })
})
