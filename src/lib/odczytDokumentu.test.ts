import { describe, expect, it } from 'vitest'
import { opisRodzajowDlaAi, rozdzielNaOdczyty } from './odczytDokumentu'
import { PUSTY_WYNIK, nowaPozycjaRysunku, opisObszaruDlaAi, polaczWyniki, tabelaWlasna, wierszyWyniku } from './rysunki'
import { przeciagnij } from '../components/ui/ZaznaczanieObszarow'
import type { RodzajTabeli } from './types'

// Dane FIKCYJNE.
const rt = (kod: string, nazwa: string, struktura: RodzajTabeli['struktura'], element: string | null = null): RodzajTabeli =>
  ({ id: 1, rodzaj_aparatu: 'wymiennik', kod, nazwa, nazwa_pl: nazwa, struktura, kolumny: [], element_szablonu: element, do_materialow: struktura === 'czesci', kolejnosc: 0 })
const RODZAJE = [
  rt('wykaz_czesci', 'Wykaz części', 'czesci'), rt('krocce', 'Tabela króćców', 'krocce', 'krocce'), rt('warunki_pracy', 'Warunki pracy', 'parametry'),
  rt('badania', 'Badania i wymagania', 'wlasna'), rt('uwagi', 'Uwagi do wyceny', 'uwagi'), rt('wlasna', 'Własna tabela', 'wlasna'),
]

describe('własne tabele', () => {
  it('nagłówek z pierwszego wiersza, a gdy wygląda na dane - kolumny numerowane', () => {
    const z = tabelaWlasna([['Badanie', 'Zakres'], ['RT', '100%'], ['UT', '10%']], { nazwa: 'Badania' })
    expect([z.kolumny, z.wiersze]).toEqual([['Badanie', 'Zakres'], [['RT', '100%'], ['UT', '10%']]])
    const b = tabelaWlasna([['1', '2'], ['3', '4']], { nazwa: 'X' })
    expect(b.kolumny).toEqual(['Kolumna 1', 'Kolumna 2'])
    expect(b.wiersze).toHaveLength(2)
    // Kolumny ustalone przez technologa mają pierwszeństwo (wiersz nagłówka zostaje danymi).
    expect(tabelaWlasna([['a', 'b', 'c']], { nazwa: 'Y', kolumny: ['K1'] }).kolumny).toEqual(['K1', 'Kolumna 2', 'Kolumna 3'])
  })
  it('łączenie wyników kafli: jedna tabela na obszar, wiersze bez powtórzeń', () => {
    const a = { ...PUSTY_WYNIK, tabele: [{ id: '1', obszar_id: 'o', nazwa: 'T', kolumny: ['A'], wiersze: [['x'], ['y']] }] }
    const b = { ...PUSTY_WYNIK, tabele: [{ id: '2', obszar_id: 'o', nazwa: 'T', kolumny: ['A'], wiersze: [['y'], ['z']] }] }
    const w = polaczWyniki(a, b)
    expect(w.tabele).toHaveLength(1)
    expect(w.tabele![0].wiersze).toEqual([['x'], ['y'], ['z']])
    expect(wierszyWyniku(w)).toBe(3)
  })
  it('opis obszaru dla AI: własna tabela z nazwą i kolumnami', () => {
    expect(opisObszaruDlaAi({ rodzaj: 'wlasna', nazwa: 'Zestawienie śrub', kolumny: ['Poz', 'Rozmiar'] })).toBe('własna tabela: Zestawienie śrub (kolumny: Poz, Rozmiar)')
    expect(opisObszaruDlaAi({ rodzaj: 'czesci', nazwa: 'Tabela dennic' })).toBe('wykaz części - Tabela dennic')
  })
})

describe('odczyt całego dokumentu', () => {
  it('wynik strony -> osobne odczyty wg rodzaju tabeli aparatu', () => {
    const w = {
      ...PUSTY_WYNIK,
      pozycje: [{ ...nowaPozycjaRysunku(1), nazwa: 'Płaszcz' }],
      krocce: [{ oznaczenie: 'N1', ilosc: 1, dn: 'DN50', pn: null, przylacze: null, przeznaczenie: null, uwagi: null, pewnosc: 1, obszar_zrodlowy: null }],
      parametry: [{ nazwa: 'Design pressure', przestrzen: 'płaszcz', wartosc: '1,6 MPa', jednostka: null, pewnosc: 1 }],
      uwagi: ['PWHT'],
      tabele: [{ id: 't', obszar_id: null, nazwa: 'Badania i wymagania', kolumny: ['Badanie'], wiersze: [['RT']] }, { id: 'u', obszar_id: null, nazwa: 'Inna', kolumny: ['A'], wiersze: [['x']] }],
    }
    const o = rozdzielNaOdczyty(w, 3, RODZAJE)
    expect(o.map((x) => [x.rodzaj_tabeli, x.nazwa])).toEqual([
      ['wykaz_czesci', 'Wykaz części (str. 3)'], ['krocce', 'Tabela króćców (str. 3)'], ['warunki_pracy', 'Warunki pracy (str. 3)'],
      ['uwagi', 'Uwagi do wyceny (str. 3)'], ['badania', 'Badania i wymagania (str. 3)'], ['wlasna', 'Inna (str. 3)'],
    ])
    expect(o[1].obszary[0].element).toBe('krocce')
    expect(o[4].wynik.tabele![0].obszar_id).toBe(o[4].obszary[0].id)
    expect(rozdzielNaOdczyty(PUSTY_WYNIK, 1, RODZAJE)).toEqual([])
  })
  it('opis dla AI wymienia rodzaje tabel własnych aparatu', () => {
    expect(opisRodzajowDlaAi(RODZAJE)).toContain('Badania i wymagania')
    expect(opisRodzajowDlaAi(RODZAJE)).not.toContain('Własna tabela')
  })
})

describe('zaznaczenie: przesunięcie i zmiana rozmiaru', () => {
  const p = { x: 0.2, y: 0.2, w: 0.3, h: 0.2 }
  it('przesunięcie zostaje na stronie', () => {
    expect(przeciagnij(p, 'srodek', 0.1, 0.1)).toEqual({ x: expect.closeTo(0.3), y: expect.closeTo(0.3), w: 0.3, h: 0.2 })
    expect(przeciagnij(p, 'srodek', 0.9, -0.9)).toEqual({ x: expect.closeTo(0.7), y: 0, w: 0.3, h: 0.2 })
  })
  it('narożnik zmienia rozmiar, nie odwraca prostokąta', () => {
    const se = przeciagnij(p, 'se', 0.1, 0.1)
    expect([se.x, se.y, se.w, se.h].map((v) => +v.toFixed(3))).toEqual([0.2, 0.2, 0.4, 0.3])
    const nw = przeciagnij(p, 'nw', 0.5, 0.5)
    expect(nw.w).toBeCloseTo(0.01)
    expect(nw.h).toBeCloseTo(0.01)
  })
})
