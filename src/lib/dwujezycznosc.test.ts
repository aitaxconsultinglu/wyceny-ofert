import { describe, expect, it } from 'vitest'
import { nazwyPLEN, jezykTerminu } from './terminy'
import { odczytajArkuszZTekstu } from './odczytTekstowy'
import { nrZapytaniaZTresci, terminOfertZTresci } from './importMaila'
import { SZABLONY, elementPozycji } from './szablony'
import type { ElementTekstu } from './rysunki'

// Dane FIKCYJNE - fragmenty dokumentów po angielsku, po polsku i dwujęzyczne.
const e = (str: string, x: number, y: number, w = 40): ElementTekstu => ({ str, x, y, w, h: 6 })

describe('słownik terminów PL / EN', () => {
  it('pewne odpowiedniki: znany termin albo zapis dwujęzyczny; nieznane - bez odpowiednika', () => {
    expect(nazwyPLEN('Shell')).toEqual({ nazwa_pl: 'płaszcz', nazwa_en: 'shell' })
    expect(nazwyPLEN('Płaszcz / Shell')).toEqual({ nazwa_pl: 'płaszcz', nazwa_en: 'shell' })
    expect(nazwyPLEN('Tubesheet')).toEqual({ nazwa_pl: 'ściana sitowa', nazwa_en: 'tubesheet' })
    expect(nazwyPLEN('Stud bolts')).toEqual({ nazwa_pl: 'szpilka', nazwa_en: 'stud bolt' })
    expect(nazwyPLEN('Króćce')).toEqual({ nazwa_pl: 'króciec', nazwa_en: 'nozzle' })
    expect(nazwyPLEN('Design pressure')).toEqual({ nazwa_pl: 'ciśnienie obliczeniowe', nazwa_en: 'design pressure' })
    expect(nazwyPLEN('Nozzle reinf. pad N1 special')).toEqual({})
    expect(nazwyPLEN('Płaszcz / Tubes')).toEqual({})
    expect(jezykTerminu('Dennica')).toBe('pl')
    expect(jezykTerminu('Heads')).toBe('en')
  })
})

describe('odczyt arkusza bez AI - rysunek po angielsku i dwujęzyczny', () => {
  const angielski: ElementTekstu[] = [
    e('SHELL', 600, 100), e('SA516 Gr.60', 700, 100),
    e('TUBESHEET', 600, 110), e('SA266 Gr.2', 700, 110),
    e('STUDBOLTS', 600, 120), e('SA193 B7', 700, 120),
    e('Design pressure = 1.6 MPa', 50, 300, 150),
    e('Corrosion allowance = 3 mm', 50, 310, 150),
    e('Empty weight = 2 400 kg', 50, 320, 150),
    e('Mark', 300, 400, 20), e('Qty', 340, 400, 20), e('Size', 380, 400, 30), e('Rating', 430, 400, 25), e('Service', 470, 400, 40),
    e('N1', 300, 410, 15), e('1', 345, 410, 5), e('4"', 380, 410, 20), e('150#', 432, 410, 20), e('Inlet', 470, 410, 30),
    e('N2', 300, 420, 15), e('2', 345, 420, 5), e('2"', 380, 420, 20), e('300#', 432, 420, 20), e('Drain', 470, 420, 30),
  ]
  const w = odczytajArkuszZTekstu(angielski)

  it('tabela materiałów po angielsku z odpowiednikami polskimi', () => {
    expect(w.pozycje.map((p) => [p.nazwa, p.material, p.nazwa_pl])).toEqual([
      ['SHELL', 'SA516 Gr.60', 'płaszcz'], ['TUBESHEET', 'SA266 Gr.2', 'ściana sitowa'], ['STUDBOLTS', 'SA193 B7', 'szpilka'],
    ])
  })
  it('dane projektowe i tabela króćców (Mark / Qty / Size / Rating / Service)', () => {
    expect(w.parametry.map((p) => p.nazwa)).toEqual(expect.arrayContaining(['Design pressure', 'Corrosion allowance']))
    expect(w.krocce.map((k) => [k.oznaczenie, k.ilosc, k.dn, k.pn, k.przeznaczenie])).toEqual([['N1', 1, '4"', '150#', 'Inlet'], ['N2', 2, '2"', '300#', 'Drain']])
  })
  it('wykaz części z nagłówkiem dwujęzycznym (Poz. / Item, Nazwa / Description, Ilość / Qty)', () => {
    const wykaz = odczytajArkuszZTekstu([
      e('Item', 50, 100, 25), e('Description', 100, 100, 60), e('Qty', 200, 100, 20), e('Material', 240, 100, 40),
      e('1', 50, 112, 5), e('Shell', 100, 112, 30), e('1', 200, 112, 5), e('P265GH', 240, 112, 40),
      e('2', 50, 124, 5), e('Dennica', 100, 124, 40), e('2', 200, 124, 5), e('P265GH', 240, 124, 40),
    ])
    expect(wykaz.pozycje.slice(0, 2).map((p) => [p.poz, p.nazwa, p.ilosc, p.nazwa_en])).toEqual([['1', 'Shell', 1, 'shell'], ['2', 'Dennica', 2, 'head']])
  })
})

describe('mail z zapytaniem po angielsku', () => {
  it('termin składania ofert i numer zapytania', () => {
    const termin = terminOfertZTresci('Please note: Deadline for submission of quotations: 05.11.2026 12:00 CET.')
    expect(termin && new Date(termin).getDate()).toBe(5)
    expect(terminOfertZTresci('Offers shall be submitted by 07/11/2026.')).not.toBeNull()
    expect(terminOfertZTresci('Due date: 2026-11-09 10:00')).not.toBeNull()
    expect(nrZapytaniaZTresci('Inquiry No. ABC-1234 - shell and tube heat exchanger', '')).toBe('ABC-1234')
    expect(nrZapytaniaZTresci('', 'Request for quotation no.: RFQ-77/2026')).toBe('RFQ-77/2026')
    expect(terminOfertZTresci('Termin składania ofert: 12.11.2026 godz. 10:00')).not.toBeNull()
  })
})

describe('szablony rozpoznają nazwy angielskie', () => {
  it('wymiennik i zbiornik', () => {
    const kod = (nazwa: string, s = SZABLONY.wymiennik) => elementPozycji({ nazwa, sekcja: 'inne', dodatkowe: {} }, s)?.kod
    expect(kod('Shell')).toBe('plaszcz')
    expect(kod('Tube sheet')).toBe('sciany_sitowe')
    expect(kod('Pass partition plate')).toBe('przegrody')
    expect(kod('Gasket')).toBe('uszczelki')
    expect(kod('Bottom head', SZABLONY.zbiornik)).toBe('dna')
    expect(kod('Roof', SZABLONY.zbiornik)).toBe('dach')
    expect(kod('Ladder', SZABLONY.zbiornik)).toBe('komunikacja')
  })
})

describe('prompty AI nie zakładają języka', () => {
  it('każdy tryb dostaje zasady dwujęzyczne (nagłówki PL / EN, liczby w obu zapisach)', async () => {
    const { TRYBY } = await import('../../supabase/functions/ai/tryby')
    const k = { kategorieMaterialow: [], kategorieUslug: [] }
    for (const tryb of ['wyciagnij_liste_z_rysunku', 'analizuj_zapytanie', 'wyciagnij_oferte']) {
      const ins = TRYBY[tryb].instrukcja(k)
      expect(ins, tryb).toContain('nie zakładaj języka')
      expect(ins, tryb).toContain('Part list / Wykaz części')
      expect(ins, tryb).toContain('12,345.50')
    }
  })
})
