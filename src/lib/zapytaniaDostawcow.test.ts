import { describe, expect, it } from 'vitest'
import {
  grupujWgKategorii, linkMailto, liniaPozycji, MAKS_MAILTO, opisPozycji, poprawnyEmail, pozycjeZOdczytu, pozycjeZWyceny, statusOdbiorcy,
  tematZapytania, terminRoboczy, trescZapytania, wymaganiaDomyslne,
} from './zapytaniaDostawcow'
import { nowyAparat, type PozycjaWyceny, type StanWyceny } from './wyceny'
import type { UstawieniaZapytan } from './types'

// Dane FIKCYJNE.
const UST: UstawieniaZapytan = {
  dw: 'oferty@example.test', dni_bez_odpowiedzi: 5, dni_na_odpowiedz: 5, powitanie: 'Dzień dobry,',
  wstep_material: 'Proszę o ofertę na materiał jak poniżej', wstep_usluga: 'Proszę o ofertę na usługę jak poniżej',
  zakonczenie: 'Prosimy o termin realizacji.', podpis: 'Z poważaniem\nDział handlowy',
  wymagania: [
    { kod: 'atest', tekst: 'z atestem 3.1 + PED', kategorie: ['*material'], w_naglowku: true },
    { kod: 'udarnosc', tekst: 'Udarność w -45 °C.', kategorie: ['*material'], w_naglowku: false },
    { kod: 'ut_rury', tekst: 'Badanie UT rur.', kategorie: ['rury_technologiczne'], w_naglowku: false },
    { kod: 'naddatki', tekst: 'Naddatki na obróbkę.', kategorie: ['odkuwki'], w_naglowku: false },
  ],
}

const poz = (z: Partial<PozycjaWyceny>): PozycjaWyceny => ({
  klucz: 'x', lp: 1, zakladka: 'materialy', sekcja: 'odkuwki', nazwa: '', ilosc: 1, jm: 'szt', cena_jedn: 0, jednostka_ceny: 'jm', ...z,
} as PozycjaWyceny)

function stan(): StanWyceny {
  const a = nowyAparat(1, 'Wymiennik')
  a.ilosc = 2
  a.pozycje = [
    poz({ nazwa: 'Odkuwka, krążek Ø900x100', gatunek: 'A350 LF2', ilosc: 1, masa_jedn: 500 }),
    poz({ nazwa: 'Rurka 25x2', sekcja: 'rury_technologiczne', gatunek: 'P235GH', ilosc: 120, jm: 'm', masa_jedn: 1.1, zrodlo_ceny: 'oferta' }),
    poz({ zakladka: 'kooperacja', sekcja: 'malowanie', nazwa: 'Malowanie zbiornika', ilosc: 1, jm: 'kpl' }),
    poz({ zakladka: 'robocizna', sekcja: null, nazwa: 'Spawacz', ilosc: 100, jm: 'rbh' }),
    poz({ nazwa: '   ' }),
  ]
  return { wycena: {} as StanWyceny['wycena'], marze: null, zapytanie: { id: 'z', numer: 'ZO/1/2026', przedmiot: 'Test', klient: null, rodzaj_aparatu: null, zakres_wymiennika: null, zakres_opis: null }, aparaty: [a] }
}

describe('pozycje do zapytania', () => {
  it('z wyceny: materiały i kooperacja, ilość razy liczba aparatów, bez robocizny i pustych', () => {
    const p = pozycjeZWyceny(stan())
    expect(p.map((x) => [x.opis, x.ilosc, x.kategoria, x.rodzaj])).toEqual([
      ['Odkuwka, krążek Ø900x100 A350 LF2', 2, 'odkuwki', 'material'],
      ['Rurka 25x2 P235GH', 240, 'rury_technologiczne', 'material'],
      ['Malowanie zbiornika', 2, 'malowanie', 'usluga'],
    ])
    expect(p[0].masa_kg).toBe(1000)
    expect(p[1].ma_cene).toBe(true)
  })

  it('z odczytu rysunku: wymiary, materiał bez znacznika (?), masa całkowita', () => {
    const p = pozycjeZOdczytu({
      pozycje: [{ poz: '3', nazwa: 'Kołnierz', ilosc: 4, jm: 'szt', material: 'P250GH (?)', norma: 'EN 1092-1', wymiary: 'DN100 PN16', masa_jedn: 5, masa_calk: null, uwagi: null, pewnosc: 0.6, sekcja: 'kolnierze', obszar_zrodlowy: null }],
      krocce: [], parametry: [], uwagi: [],
    })
    expect(p[0]).toMatchObject({ opis: 'Kołnierz DN100 PN16 P250GH EN 1092-1', ilosc: 4, masa_kg: 20, kategoria: 'kolnierze', zrodlo: 'poz. 3' })
  })

  it('opis nie powtarza gatunku zapisanego już w nazwie', () => {
    expect(opisPozycji({ nazwa: 'Blacha 10 P355NL1', gatunek: 'P355 NL1' })).toBe('Blacha 10 P355NL1')
  })

  it('grupy według kategorii i domyślne wymagania', () => {
    const g = grupujWgKategorii(pozycjeZWyceny(stan()))
    expect(g.map((x) => x.kategoria)).toEqual(['odkuwki', 'rury_technologiczne', 'malowanie'])
    expect(wymaganiaDomyslne('rury_technologiczne', 'material', UST.wymagania)).toEqual(['atest', 'udarnosc', 'ut_rury'])
    expect(wymaganiaDomyslne('odkuwki', 'material', UST.wymagania)).toEqual(['atest', 'udarnosc', 'naddatki'])
    expect(wymaganiaDomyslne('malowanie', 'usluga', UST.wymagania)).toEqual([])
  })
})

describe('treść i wysyłka', () => {
  it('temat z numerem ZO i treść w układzie zapytań działu handlowego', () => {
    expect(tematZapytania('ZO/1/2026', 'Odkuwki')).toBe('ZO/1/2026 – Odkuwki')
    const p = pozycjeZWyceny(stan()).filter((x) => x.kategoria === 'odkuwki')
    const t = trescZapytania({ numerZO: 'ZO/1/2026', rodzaj: 'material', pozycje: p, wymagania: ['atest', 'naddatki'], terminOdpowiedzi: '2026-10-26', uwagi: 'Rysunek w załączniku.' }, UST)
    expect(t).toBe([
      'Dzień dobry,', '',
      'Proszę o ofertę na materiał jak poniżej z atestem 3.1 + PED:', '',
      'Odkuwka, krążek Ø900x100 A350 LF2 – 2 szt (ok. 1000 kg)', '',
      'Uwagi:', '1. Naddatki na obróbkę.', '2. Rysunek w załączniku.', '',
      'Ofertę prosimy przesłać do 26.10.2026.',
      'W odpowiedzi prosimy zachować w temacie numer zapytania ZO/1/2026.',
      'Prosimy o termin realizacji.', '',
      'Z poważaniem', 'Dział handlowy',
    ].join('\n'))
  })

  it('usługa "1 kpl" bez ilości w linii', () => {
    expect(liniaPozycji({ opis: 'Izolacja', ilosc: 1, jm: 'kpl', masa_kg: null, rodzaj: 'usluga' })).toBe('Izolacja')
    expect(liniaPozycji({ opis: 'Rurka', ilosc: 1.5, jm: 'm', masa_kg: 2.25, rodzaj: 'material' })).toBe('Rurka – 1,5 m (ok. 2,3 kg)')
  })

  it('mailto z tematem, DW i treścią; za długa treść - informacja o schowku', () => {
    const k = linkMailto({ do: ['a@b.test'], dw: UST.dw, temat: 'ZO/1/2026 – Odkuwki', tresc: 'Dzień dobry,\nlinia' })
    expect(k.pelny).toBe(true)
    expect(k.url).toBe('mailto:a%40b.test?subject=ZO%2F1%2F2026%20%E2%80%93%20Odkuwki&cc=oferty%40example.test&body=Dzie%C5%84%20dobry%2C%0Alinia')
    const dlugi = linkMailto({ do: ['a@b.test'], temat: 'T', tresc: 'x'.repeat(MAKS_MAILTO) })
    expect(dlugi.pelny).toBe(false)
    expect(decodeURIComponent(dlugi.url)).toContain('schowku')
    expect(dlugi.url.length).toBeLessThan(MAKS_MAILTO)
  })

  it('walidacja adresu', () => {
    expect(['jan@firma.pl', 'zly', 'a@b', 'a b@c.pl'].map(poprawnyEmail)).toEqual([true, false, false, false])
  })
})

describe('status odpowiedzi', () => {
  const teraz = new Date('2026-10-20T12:00:00Z')
  it('oferta > odmowa > nie wysłane > brak odpowiedzi po X dniach > wysłane', () => {
    expect(statusOdbiorcy({ wyslano: '2026-10-01T10:00:00Z', oferta: 'o1', odmowa: true }, 5, teraz)).toBe('oferta')
    expect(statusOdbiorcy({ wyslano: '2026-10-01T10:00:00Z', oferta: null, odmowa: true }, 5, teraz)).toBe('odmowa')
    expect(statusOdbiorcy({ wyslano: null, oferta: null, odmowa: false }, 5, teraz)).toBe('przygotowane')
    expect(statusOdbiorcy({ wyslano: '2026-10-14T10:00:00Z', oferta: null, odmowa: false }, 5, teraz)).toBe('brak_odpowiedzi')
    expect(statusOdbiorcy({ wyslano: '2026-10-17T10:00:00Z', oferta: null, odmowa: false }, 5, teraz)).toBe('wyslane')
  })

  it('termin odpowiedzi w dniach roboczych', () => {
    expect(terminRoboczy(5, new Date(2026, 9, 16))).toBe('2026-10-23')   // piątek + 5 dni roboczych
    expect(terminRoboczy(1, new Date(2026, 9, 17))).toBe('2026-10-19')   // sobota -> poniedziałek
  })
})
