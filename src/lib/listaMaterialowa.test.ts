import { describe, expect, it } from 'vitest'
import { porownajPoz, pozycjeZArkusza, zlozListe } from './listaMaterialowa'
import { PUSTY_WYNIK, type PozycjaRysunku } from './rysunki'

// Dane FIKCYJNE.
const p = (poz: string, nazwa: string, z: Partial<PozycjaRysunku> = {}): PozycjaRysunku => ({
  poz, nazwa, ilosc: 1, jm: 'szt', material: null, norma: null, wymiary: null, masa_jedn: null, masa_calk: null, uwagi: null,
  pewnosc: 0.9, sekcja: 'inne', obszar_zrodlowy: null, ...z,
})

describe('lista materiałowa', () => {
  it('kolejność numerów pozycji', () => {
    expect(['10', '2', '9.4', '', '10.1'].sort(porownajPoz)).toEqual(['2', '9.4', '10', '10.1', ''])
  })

  it('strony i tabele scalone po numerze pozycji, duplikaty bez numeru usunięte, porządek po numerze', () => {
    const str1 = { ...PUSTY_WYNIK, pozycje: [p('2', 'Płaszcz', { material: 'P265GH' }), p('7', 'U-rura', { wymiary: 'ø25x2,6' })] }
    const str2 = { ...PUSTY_WYNIK, pozycje: [p('1', 'Dno'), p('7', 'U-rura', { masa_jedn: 45.5, uwagi: 'L=4518', pewnosc: 0.7 }), p('', 'Tabliczka'), p('', 'Tabliczka')] }
    const krocce = { ...PUSTY_WYNIK, krocce: [{ oznaczenie: 'N1', ilosc: 1, dn: 'DN50', pn: 'PN40', przylacze: null, przeznaczenie: null, uwagi: null, pewnosc: 0.9, obszar_zrodlowy: null }] }
    const l = zlozListe(str1, str2, krocce, krocce)
    expect(l.pozycje.map((x) => x.poz)).toEqual(['1', '2', '7', ''])
    expect(l.pozycje[2]).toMatchObject({ wymiary: 'ø25x2,6', masa_jedn: 45.5, uwagi: 'L=4518' })
    expect(l.krocce).toHaveLength(1)
  })

  it('arkusz: wymiary z kolumn, masa całkowita', () => {
    const l = pozycjeZArkusza([{ lp: 1, nazwa: 'Blacha', sekcja: 'blachy', gatunek: 'S235JR', norma: null, d_zew: null, d_wew: null, grubosc: 10, szerokosc: 300, dlugosc: 1200, dn: null, pn: null, ilosc: 2, jm: 'szt', masa_jedn: 28.3, uwagi: null, pewnosc: 1 }])
    expect(l.pozycje[0]).toMatchObject({ poz: '1', wymiary: '10x300x1200', masa_calk: 56.6, material: 'S235JR' })
  })
})
