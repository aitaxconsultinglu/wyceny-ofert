import { describe, expect, it } from 'vitest'
import { jestKartaDanych, jestRysunkiem, klasyfikujDokument, type DaneKlasyfikacji } from './klasyfikacjaDokumentow'

// Dane FIKCYJNE - nazwy plików i fragmenty treści typowe dla zapytań (PL i EN).
const d = (zm: Partial<DaneKlasyfikacji>): DaneKlasyfikacji => ({ nazwa: 'plik.pdf', rodzaj: 'pdf', tekst: '', ...zm })

describe('klasyfikacja dokumentów bez AI', () => {
  it('nazwa pliku PL / EN', () => {
    expect(klasyfikujDokument(d({ nazwa: 'Zapytanie ofertowe nr 12.pdf' })).typ).toBe('zapytanie_ofertowe')
    expect(klasyfikujDokument(d({ nazwa: 'RFQ-1234_heat exchanger.pdf' })).typ).toBe('zapytanie_ofertowe')
    expect(klasyfikujDokument(d({ nazwa: 'E-101 Datasheet rev2.pdf' })).typ).toBe('wymagania')
    expect(klasyfikujDokument(d({ nazwa: 'Technical specification.docx', rodzaj: 'docx' })).typ).toBe('wymagania')
    expect(klasyfikujDokument(d({ nazwa: 'Standard ABC-01 malowanie.pdf' })).typ).toBe('wymagania')
    expect(klasyfikujDokument(d({ nazwa: 'Obliczenia wytrzymałościowe.pdf' })).typ).toBe('inne')
    expect(klasyfikujDokument(d({ nazwa: 'ABC_r4_Rys zbiornika.pdf' })).typ).toBe('projekt')
    expect(klasyfikujDokument(d({ nazwa: 'General arrangement V-1.pdf' })).typ).toBe('projekt')
    expect(klasyfikujDokument(d({ nazwa: 'E-1_zestawienie_materiałowe 0.pdf' })).typ).toBe('lista_materialowa')
    expect(klasyfikujDokument(d({ nazwa: 'szkic.jpg', rodzaj: 'obraz' })).typ).toBe('projekt')
    expect(klasyfikujDokument(d({ nazwa: 'Oferta nr 12.pdf' })).typ).toBe('oferta_dostawcy')
  })
  it('treść, format arkusza, CAD i maile', () => {
    expect(klasyfikujDokument(d({ nazwa: 'V-200.pdf', tekst: 'PROCESS DATA SHEET\nDesign pressure 1.6 MPa' })).typ).toBe('wymagania')
    expect(jestKartaDanych('V-200.pdf', 'PROCESS DATA SHEET')).toBe(true)
    expect(klasyfikujDokument(d({ nazwa: 'scan001.pdf', skan: true, stron: 1, format_mm: [594, 420] })).typ).toBe('projekt')
    expect(klasyfikujDokument(d({ nazwa: 'scan002.pdf', skan: true, stron: 12, format_mm: [210, 297] })).typ).toBe('inne')
    expect(klasyfikujDokument(d({ nazwa: 'X.pdf', tekst: 'Part list\nItem Description Qty' })).typ).toBe('lista_materialowa')
    const cad = klasyfikujDokument(d({ nazwa: 'wymiennik.dwg', rodzaj: 'inny' }))
    expect([cad.typ, cad.tylko_przechowanie]).toEqual(['projekt', true])
    expect(klasyfikujDokument(d({ nazwa: 'RE: pytania.msg', rodzaj: 'mail' })).typ).toBe('zapytanie_ofertowe')
    expect(klasyfikujDokument(d({ nazwa: 'notatka.pdf', tekst: 'Lorem ipsum' })).powod).toBe('brak rozpoznanych słów kluczowych')
  })
  it('dokumenty z tabelami do listy materiałowej', () => {
    expect(['projekt', 'lista_materialowa'].every(jestRysunkiem)).toBe(true)
    expect(jestRysunkiem('wymagania')).toBe(false)
  })
})
