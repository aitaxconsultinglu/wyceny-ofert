import { describe, expect, it } from 'vitest'
import { pozycjeZOdczytu, scalZOdczytem, zmienioneWZrodle, zrodloPozycji, type OdczytDoPrzeniesienia } from './przeniesienieOdczytu'
import { nowaPozycjaRysunku, PUSTY_WYNIK, type PozycjaRysunku } from './rysunki'

// Dane FIKCYJNE.
const czesc = (poz: string, nazwa: string, ilosc: number, material = 'P265GH'): PozycjaRysunku => ({ ...nowaPozycjaRysunku(1), poz, nazwa, ilosc, material, sekcja: 'blachy', wymiary: '10x1000x2000' })
const odczyt = (zm: Partial<OdczytDoPrzeniesienia> = {}): OdczytDoPrzeniesienia => ({
  id: 'o1', nazwa_pliku: 'rys.pdf', strona: 2, nazwa: 'Tabela dennic', rodzaj_tabeli: 'wykaz_czesci',
  obszary: [{ id: 'a', rodzaj: 'czesci', element: 'dennice', x: 0, y: 0, w: 1, h: 1 }],
  wynik: { ...PUSTY_WYNIK, pozycje: [czesc('1', 'Dennica', 2), czesc('2', 'Płaszcz', 1)] }, ...zm,
})

describe('przeniesienie odczytu do wyceny', () => {
  it('wykaz części -> Materiały z elementem szablonu i źródłem (odczyt, wiersz, opis)', () => {
    const p = pozycjeZOdczytu(odczyt())
    expect(p.map((x) => [x.zakladka, x.nazwa.split(' ')[0], x.ilosc])).toEqual([['materialy', 'Dennica', 2], ['materialy', 'Płaszcz', 1]])
    expect((p[0].dodatkowe as { element?: string }).element).toBe('dennice')
    expect(zrodloPozycji(p[0])).toMatchObject({ odczyt_id: 'o1', wiersz: 'p:1', opis: 'rysunek rys.pdf, str. 2 - Tabela dennic' })
  })

  it('króćce -> rura króćca i kołnierz; badania -> zakładka Badania', () => {
    const k = pozycjeZOdczytu(odczyt({ wynik: { ...PUSTY_WYNIK, krocce: [{ oznaczenie: 'N1', ilosc: 2, dn: 'DN100', pn: 'PN16', przylacze: 'WN-RF', przeznaczenie: 'wlot', uwagi: null, pewnosc: 1, obszar_zrodlowy: null }] } }))
    expect(k.map((x) => [x.sekcja, x.ilosc, (x.dodatkowe as { element: string }).element])).toEqual([['rury_krocce', 2, 'krocce'], ['kolnierze', 2, 'kolnierze']])
    expect(k[1].nazwa).toBe('Kołnierz N1 - wlot DN100 PN16 WN-RF')
    const b = pozycjeZOdczytu(odczyt({ rodzaj_tabeli: 'badania', wynik: { ...PUSTY_WYNIK, tabele: [{ id: 't', obszar_id: null, nazwa: 'Badania', kolumny: ['Badanie', 'Zakres'], wiersze: [['RT', '100%'], ['', '']] }] } }))
    expect(b.map((x) => [x.zakladka, x.nazwa, x.uwagi])).toEqual([['badania', 'RT', 'Zakres: 100%']])
  })

  it('ponowne przeniesienie aktualizuje pozycje (cena zostaje), nie dubluje; nowe wiersze dochodzą', () => {
    const pierwsze = pozycjeZOdczytu(odczyt()).map((p) => ({ ...p, cena_jedn: 9.5, zrodlo_ceny: 'zakup' as const }))
    const zmieniony = odczyt({ wynik: { ...PUSTY_WYNIK, pozycje: [czesc('1', 'Dennica', 3), czesc('2', 'Płaszcz', 1), czesc('3', 'Króciec', 4)] } })
    const s = scalZOdczytem(pierwsze, pozycjeZOdczytu(zmieniony))
    expect([s.dodane, s.zaktualizowane, s.bezZmian, s.usunieteWZrodle]).toEqual([1, 1, 1, 0])
    expect(s.pozycje).toHaveLength(3)
    expect(s.pozycje[0]).toMatchObject({ ilosc: 3, cena_jedn: 9.5, zrodlo_ceny: 'zakup' })
    // Zmiana w źródle widoczna przed ponownym przeniesieniem.
    expect(zmienioneWZrodle(pierwsze, [zmieniony]).map((p) => p.nazwa.split(' ')[0])).toEqual(['Dennica'])
    // Wiersz usunięty z odczytu zostaje w wycenie.
    expect(scalZOdczytem(pierwsze, pozycjeZOdczytu(odczyt({ wynik: { ...PUSTY_WYNIK, pozycje: [czesc('1', 'Dennica', 2)] } }))).usunieteWZrodle).toBe(1)
  })

  it('pozycje bez numeru i z powtórzonym numerem dostają klucz wiersza', () => {
    const p = pozycjeZOdczytu(odczyt({ wynik: { ...PUSTY_WYNIK, pozycje: [czesc('', 'A', 1), czesc('5', 'B', 1), czesc('5', 'C', 1)] } }))
    expect(p.map((x) => zrodloPozycji(x)!.wiersz)).toEqual(['p:#1', 'p:5', 'p:#3'])
  })
})
