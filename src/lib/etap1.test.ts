import { describe, expect, it } from 'vitest'
import { cennikEtapu1, dnLiczba, dobierzCene, type WierszCeny } from './bazaCen'
import { gatunekZeSlownika, rodzajGatunku, rownowazniki } from './slowniki'
import { SZABLONY, elementPozycji, kompletnosc, szablonDlaTypu, ulozWgSzablonu, wierszElementu } from './szablony'
import { masaZParametrow, odczytajArkuszZTekstu } from './odczytTekstowy'
import { liczbaZ, pozycjeZKroccow } from './wycenaMaterialowa'
import type { ElementTekstu } from './rysunki'
import type { Gatunek } from './types'
import type { PozycjaWyceny } from './wyceny'

// Dane FIKCYJNE.
const wiersz = (z: Partial<WierszCeny>): WierszCeny => ({
  klucz: Math.random().toString(), zrodlo: 'zakup', id_zrodla: 'x', pozycja_id: 1, data: '2026-09-01', dostawca: 'D', opis: 'opis',
  kategoria_materialu: 'blachy', kategoria_uslugi: null, gatunek: 'P265GH', d_zew: null, d_wew: null, grubosc: 10, szerokosc: null, dlugosc: null,
  dn: null, pn: null, ilosc: 1, jm: 'kg', cena_jedn: 6, waluta: 'PLN', wartosc_pln: 6, masa_calk: 1, cena_pln_kg: 6, cena_pln_m: null, cena_pln_szt: null,
  cena_pln_odniesienia: null, jednostka_odniesienia: null, wielkosc_odniesienia: null, termin: null, termin_dni: null, waznosc_do: null, waznosc_opis: null,
  warunki: null, wymagania: {}, doplaty: [], nr_zo: null, zapytanie_id: null, uwagi: null, rodzaj_kosztu: 'materialy', ...z,
})
const GAT: Gatunek[] = [
  { kod: 'P265GH', grupa: 'P265GH', rodzaj_stali: 'weglowa', norma: null, uwagi: null },
  { kod: 'S235JR', grupa: 'S235JR', rodzaj_stali: 'weglowa', norma: null, uwagi: null },
  { kod: 'Fe37', grupa: 'S235JR', rodzaj_stali: 'weglowa', norma: null, uwagi: null },
  { kod: 'SA106', grupa: 'A106', rodzaj_stali: 'weglowa', norma: null, uwagi: null },
  { kod: 'A106 Gr.B', grupa: 'A106', rodzaj_stali: 'weglowa', norma: null, uwagi: null },
  { kod: '1.4307', grupa: '304L', rodzaj_stali: 'nierdzewna', norma: null, uwagi: null },
  { kod: '304L', grupa: '304L', rodzaj_stali: 'nierdzewna', norma: null, uwagi: null },
]
const poz = (z: Partial<PozycjaWyceny>): PozycjaWyceny => ({
  klucz: Math.random().toString(), lp: 0, zakladka: 'materialy', sekcja: 'blachy', nazwa: '', ilosc: 1, jm: 'kg', cena_jedn: 0,
  jednostka_ceny: 'kg', zrodlo_ceny: 'recznie', masa_reczna: false, dodatkowe: {}, ...z,
})

describe('szablony wymiennika i zbiornika', () => {
  it('typ aparatu -> szablon', () => {
    expect(szablonDlaTypu('wymiennik płaszczowo-rurowy')?.kod).toBe('wymiennik')
    expect(szablonDlaTypu('wkład rurowy')?.kod).toBe('wymiennik')
    expect(szablonDlaTypu('zbiornik poziomy')?.kod).toBe('zbiornik')
    expect(szablonDlaTypu('kolumna')).toBeNull()
  })

  it('rozpoznanie po nazwie z pierwszeństwem drobnych elementów', () => {
    const w = SZABLONY.wymiennik
    const kod = (nazwa: string, sekcja = 'inne') => elementPozycji({ nazwa, sekcja, dodatkowe: {} }, w)?.kod
    expect(kod('Nozzle reinf.')).toBe('wzmocnienia')
    expect(kod('Nozzle Flange')).toBe('kolnierze')
    expect(kod('Nozzle Neck')).toBe('krocce')
    expect(kod('Studbolts for flanges')).toBe('zlaczne')
    expect(kod('Uszczelka kołnierza')).toBe('uszczelki')
    expect(kod('Tubesheet')).toBe('sciany_sitowe')
    expect(kod('Tubes')).toBe('rurki')
    expect(kod('Uchwyt do podnoszenia')).toBe('inne')
    expect(kod('Pozycja bez nazwy', 'blachy')).toBe('plaszcz')
    expect(elementPozycji({ nazwa: 'cokolwiek', sekcja: 'blachy', dodatkowe: { element: 'podpory' } }, w)?.kod).toBe('podpory')
  })

  it('kompletność: brak wymaganego elementu i pozycje z ilością i ceną', () => {
    const z = SZABLONY.zbiornik
    const pozycje = [
      poz({ nazwa: 'Płaszcz', ilosc: 500, cena_jedn: 6 }),
      poz({ nazwa: 'Dno', ilosc: 0 }),
      poz({ nazwa: 'Robocizna', zakladka: 'robocizna' }),
    ]
    const k = Object.fromEntries(kompletnosc(pozycje, z).map((x) => [x.element.kod, x]))
    expect(k.plaszcz).toMatchObject({ pozycji: 1, zWartoscia: 1, brak: false })
    expect(k.dna).toMatchObject({ pozycji: 1, zWartoscia: 0, brak: false })
    expect(k.konstrukcja.brak).toBe(true)
    expect(k.dach.brak).toBe(false)
  })

  it('wiersz elementu i układ wg szablonu', () => {
    const z = SZABLONY.zbiornik
    const w = wierszElementu(z.elementy.find((e) => e.kod === 'konstrukcja')!, 'S235JR')
    expect(w).toMatchObject({ sekcja: 'ksztaltowniki', gatunek: 'S235JR', ilosc: 0, jm: 'kg', dodatkowe: { element: 'konstrukcja', szablon: true } })
    const ulozone = ulozWgSzablonu([poz({ nazwa: 'Uszczelka', sekcja: 'uszczelki' }), poz({ nazwa: 'Robocizna', zakladka: 'robocizna' }), poz({ nazwa: 'Płaszcz' })], z)
    expect(ulozone.map((p) => p.nazwa)).toEqual(['Płaszcz', 'Uszczelka', 'Robocizna'])
    expect(ulozone[0].dodatkowe).toMatchObject({ element: 'plaszcz' })
  })
})

describe('ceny etapu 1', () => {
  it('cennik: zakupy Optimy i oferty do tego zapytania, bez usług i ofert z innych zapytań', () => {
    const w = [
      wiersz({ klucz: 'zakup' }),
      wiersz({ klucz: 'oferta-zo', zrodlo: 'oferta', zapytanie_id: 'Z1' }),
      wiersz({ klucz: 'oferta-inna', zrodlo: 'oferta', zapytanie_id: 'Z2' }),
      wiersz({ klucz: 'usluga', kategoria_materialu: null, kategoria_uslugi: 'malowanie' }),
    ]
    expect(cennikEtapu1(w, 'Z1').map((x) => x.klucz)).toEqual(['zakup', 'oferta-zo'])
    expect(cennikEtapu1(w, null).map((x) => x.klucz)).toEqual(['zakup'])
  })

  it('średnica nominalna z DN, cali i NPS', () => {
    expect(dnLiczba('DN100')).toBe(100)
    expect(dnLiczba('100')).toBe(100)
    expect(dnLiczba("4''")).toBe(100)
    expect(dnLiczba('1.1/2"')).toBe(40)
    expect(dnLiczba('NPS 6')).toBe(150)
    expect(dnLiczba('kołnierz')).toBeNull()
  })

  it('kołnierz dostaje cenę tylko tej samej wielkości', () => {
    const w = [wiersz({ kategoria_materialu: 'kolnierze', gatunek: 'P265GH', dn: '25', jm: 'szt', cena_pln_szt: 20, cena_pln_kg: null, grubosc: null })]
    expect(dobierzCene({ sekcja: 'kolnierze', gatunek: 'P265GH', dn: "4''", jednostka_ceny: 'jm' }, w, GAT)).toBeNull()
    expect(dobierzCene({ sekcja: 'kolnierze', gatunek: 'P265GH', dn: 'DN25', jednostka_ceny: 'jm' }, w, GAT)?.cena_jedn).toBe(20)
  })

  it('cena zastępcza z tej samej grupy stali tylko na żądanie i nigdy z nierdzewnej dla węglowej', () => {
    const w = [wiersz({ gatunek: '1.4307', cena_pln_kg: 25 }), wiersz({ gatunek: 'S235JR', cena_pln_kg: 5 })]
    expect(dobierzCene({ sekcja: 'blachy', gatunek: 'SA516GR60', jednostka_ceny: 'kg' }, w, GAT)).toBeNull()
    expect(dobierzCene({ sekcja: 'blachy', gatunek: 'SA516GR60', jednostka_ceny: 'kg' }, w, GAT, false, undefined, null, true))
      .toMatchObject({ cena_jedn: 5, dopasowanie: 'inny_gatunek' })
    expect(dobierzCene({ sekcja: 'blachy', gatunek: 'AZBEST', jednostka_ceny: 'kg' }, w, GAT, false, undefined, null, true)).toBeNull()
  })
})

describe('gatunki z rysunków', () => {
  it('dopisek odmiany i normy nie przeszkadza w słowniku', () => {
    expect(gatunekZeSlownika('SA106GRB', GAT)?.grupa).toBe('A106')
    expect(gatunekZeSlownika('Fe37 B UNI 70 70', GAT)?.grupa).toBe('S235JR')
    expect(rownowazniki('Fe 37 B', GAT)).toEqual(['S235JR', 'Fe37'])
    expect(gatunekZeSlownika('304L', GAT)?.grupa).toBe('304L')
    expect(gatunekZeSlownika('S23', GAT)).toBeNull()
  })

  it('rodzaj stali ze słownika albo z oznaczenia', () => {
    expect(rodzajGatunku('SA516GR60', GAT)).toBe('weglowa')
    expect(rodzajGatunku('1.4301/1.4307', GAT)).toBe('nierdzewna')
    expect(rodzajGatunku('A2-70', GAT)).toBe('nierdzewna')
    expect(rodzajGatunku('SA193GRB7', GAT)).toBe('weglowa')
    expect(rodzajGatunku('AZBEST', GAT)).toBeNull()
    expect(rodzajGatunku(null, GAT)).toBeNull()
  })
})

describe('odczyt arkusza CAD z warstwy tekstowej', () => {
  const e = (str: string, x: number, y: number, w = 40): ElementTekstu => ({ str, x, y, w, h: 6 })
  const arkusz: ElementTekstu[] = [
    // Tabela materiałów
    e('PŁASZCZ', 600, 100), e('P265GH', 700, 100),
    e('DNO', 600, 110), e('P265GH', 700, 110),
    e('KOŁNIERZ', 600, 120), e('P250GH', 700, 120),
    // Dane projektowe
    e('Ciśnienie obliczeniowe = 1,0 MPa', 50, 300, 150),
    e('Temperatura obliczeniowa = 120 °C', 50, 310, 150),
    e('Ciężar pusty = 1 250 kg', 50, 320, 150),
    // Tabela króćców
    e('Poz.', 300, 400, 20), e('Ilość', 340, 400, 20), e('Wielkość', 380, 400, 30), e('PN', 430, 400, 15), e('Przeznaczenie', 470, 400, 60),
    e('N1', 300, 410, 15), e('1', 345, 410, 5), e('DN100', 380, 410, 30), e('16', 432, 410, 10), e('Wlot', 470, 410, 30),
    e('N2', 300, 420, 15), e('2', 345, 420, 5), e('DN50', 380, 420, 30), e('16', 432, 420, 10), e('Wylot', 470, 420, 30),
  ]
  const w = odczytajArkuszZTekstu(arkusz)

  it('tabela materiałów: element -> gatunek', () => {
    expect(w.pozycje.map((p) => [p.nazwa, p.material])).toEqual([['PŁASZCZ', 'P265GH'], ['DNO', 'P265GH'], ['KOŁNIERZ', 'P250GH']])
    expect(w.pozycje.every((p) => p.uwagi === 'tabela materiałów rysunku' && p.ilosc === null)).toBe(true)
  })

  it('dane projektowe i masa pusta', () => {
    expect(w.parametry.length).toBeGreaterThanOrEqual(3)
    expect(masaZParametrow(w.parametry)).toBe(1250)
  })

  it('tabela króćców -> rury i kołnierze', () => {
    expect(w.krocce.map((k) => [k.oznaczenie, k.ilosc, k.dn])).toEqual([['N1', 1, 'DN100'], ['N2', 2, 'DN50']])
    const p = pozycjeZKroccow(w.krocce, 'P265GH', 'P250GH', SZABLONY.zbiornik)
    expect(p.filter((x) => x.sekcja === 'kolnierze').map((x) => [x.ilosc, x.dn, x.gatunek])).toEqual([[1, 'DN100', 'P250GH'], [2, 'DN50', 'P250GH']])
  })

  it('liczby z rysunku: kropka i przecinek dziesiętne', () => {
    expect(liczbaZ('2.6 mm')).toBe(2.6)
    expect(liczbaZ('Ø 33,4')).toBe(33.4)
    expect(liczbaZ('brak')).toBeNull()
  })
})
