import { describe, expect, it } from 'vitest'
import { dobierzCene, type WierszCeny } from './bazaCen'
import { pustaKarta, type KartaAnalizy } from './analiza'
import { aparatyZKarty, dopasujAparat, ujednolicJednostkeUslugi, klauzuleZAnalizy, medianaRbhT, przypiszOdczyty, punktyWeryfikacji, zmienneOferty, type KlauzulaBazy } from './przygotowanie'
import { nowyAparat, type PozycjaWyceny, type StanWyceny } from './wyceny'
import type { ParametryKalk } from './kalkulacja'

// Dane FIKCYJNE.
const wiersz = (z: Partial<WierszCeny>): WierszCeny => ({
  klucz: Math.random().toString(), zrodlo: 'oferta', id_zrodla: 'x', pozycja_id: 1, data: '2026-09-01', dostawca: 'D', opis: 'opis',
  kategoria_materialu: 'blachy', kategoria_uslugi: null, gatunek: 'P265GH', d_zew: null, d_wew: null, grubosc: 10, szerokosc: null, dlugosc: null,
  dn: null, pn: null, ilosc: 1, jm: 'kg', cena_jedn: 6, waluta: 'PLN', wartosc_pln: 6, masa_calk: 1, cena_pln_kg: 6, cena_pln_m: null, cena_pln_szt: null,
  cena_pln_odniesienia: null, jednostka_odniesienia: null, wielkosc_odniesienia: null, termin: null, termin_dni: null, waznosc_do: null, waznosc_opis: null,
  warunki: null, wymagania: {}, doplaty: [], nr_zo: null, zapytanie_id: null, uwagi: null, rodzaj_kosztu: 'materialy', ...z,
})
const DZIS = '2026-10-20'

describe('dobór ceny z bazy', () => {
  const ceny = [
    wiersz({ klucz: 'stara', zrodlo: 'oferta', data: '2026-01-10', waznosc_do: '2026-02-01', cena_pln_kg: 5 }),
    wiersz({ klucz: 'zakup', zrodlo: 'zakup', data: '2026-08-01', cena_pln_kg: 7, waznosc_do: null }),
    wiersz({ klucz: 'wazna', zrodlo: 'oferta', data: '2026-06-01', waznosc_do: '2026-12-31', cena_pln_kg: 6.5, dostawca: 'Huta' }),
    wiersz({ klucz: 'inna', gatunek: 'S235JR', cena_pln_kg: 4 }),
    wiersz({ klucz: 'kolnierz', kategoria_materialu: 'kolnierze', gatunek: 'P250GH', grubosc: null, d_zew: 220, jm: 'szt', cena_pln_kg: null, cena_pln_szt: 180 }),
    wiersz({ klucz: 'usluga', kategoria_materialu: null, kategoria_uslugi: 'malowanie', gatunek: null, ilosc: 1, wartosc_pln: 12000 }),
  ]
  const gat = [{ kod: 'P265GH', grupa: 'P265GH', rodzaj_stali: 'weglowa' }] as never[]

  it('ważna oferta przed zakupem i ofertą przeterminowaną; gatunek musi pasować', () => {
    const c = dobierzCene({ sekcja: 'blachy', gatunek: 'P265GH', grubosc: 10, jednostka_ceny: 'kg' }, ceny, gat, false, DZIS)
    expect(c).toMatchObject({ cena_jedn: 6.5, jednostka_ceny: 'kg', zrodlo_ceny: 'oferta', zrodlo_dostawca: 'Huta', dopasowanie: 'dokladne' })
    const bezWaznych = dobierzCene({ sekcja: 'blachy', gatunek: 'P265GH', grubosc: 10, jednostka_ceny: 'kg' }, ceny.filter((w) => w.klucz !== 'wazna'), gat, false, DZIS)
    expect(bezWaznych).toMatchObject({ cena_jedn: 7, zrodlo_ceny: 'zakup' })
  })

  it('zakupy: cenę daje tylko rodzaj „materiały” (kooperacja i niesklasyfikowane - nie)', () => {
    const tylkoZakupy = [
      wiersz({ klucz: 'koop', zrodlo: 'zakup', cena_pln_kg: 3, rodzaj_kosztu: 'kooperacja' }),
      wiersz({ klucz: 'bufor', zrodlo: 'zakup', cena_pln_kg: 3.5, rodzaj_kosztu: null }),
    ]
    expect(dobierzCene({ sekcja: 'blachy', gatunek: 'P265GH', grubosc: 10, jednostka_ceny: 'kg' }, tylkoZakupy, gat, false, DZIS)).toBeNull()
    expect(dobierzCene({ sekcja: 'blachy', gatunek: 'P265GH', grubosc: 10, jednostka_ceny: 'kg' }, [...tylkoZakupy, wiersz({ klucz: 'mat', zrodlo: 'zakup', cena_pln_kg: 7.1 })], gat, false, DZIS))
      .toMatchObject({ cena_jedn: 7.1 })
  })

  it('oferta zebrana do tego zapytania ma pierwszeństwo - także po terminie ważności', () => {
    const zZapytania = [...ceny, wiersz({ klucz: 'do-zo', zrodlo: 'oferta', data: '2025-09-01', waznosc_do: '2025-09-30', cena_pln_kg: 8.2, dostawca: 'Kuźnia ZO', zapytanie_id: 'zo-1' })]
    expect(dobierzCene({ sekcja: 'blachy', gatunek: 'P265GH', grubosc: 10, jednostka_ceny: 'kg' }, zZapytania, gat, false, DZIS, 'zo-1'))
      .toMatchObject({ cena_jedn: 8.2, zrodlo_dostawca: 'Kuźnia ZO' })
    expect(dobierzCene({ sekcja: 'blachy', gatunek: 'P265GH', grubosc: 10, jednostka_ceny: 'kg' }, zZapytania, gat, false, DZIS, 'inne-zo'))
      .toMatchObject({ cena_jedn: 6.5 })
  })

  it('inne wymiary: dla ceny za kg przybliżona (kategoria + gatunek), dla sztuk brak', () => {
    expect(dobierzCene({ sekcja: 'blachy', gatunek: 'P265GH', grubosc: 40, jednostka_ceny: 'kg' }, ceny, gat, false, DZIS)).toMatchObject({ cena_jedn: 6.5, dopasowanie: 'przyblizone' })
    expect(dobierzCene({ sekcja: 'kolnierze', gatunek: 'P250GH', d_zew: 220, jednostka_ceny: 'jm' }, ceny, gat, false, DZIS)).toMatchObject({ cena_jedn: 180, jednostka_ceny: 'jm' })
    expect(dobierzCene({ sekcja: 'kolnierze', gatunek: 'P250GH', d_zew: 400, jednostka_ceny: 'jm' }, ceny, gat, false, DZIS)).toBeNull()
  })

  it('bez kategorii nie zgadujemy; usługa po kategorii usługi', () => {
    expect(dobierzCene({ sekcja: null, gatunek: 'P265GH', jednostka_ceny: 'kg' }, ceny, gat, false, DZIS)).toBeNull()
    expect(dobierzCene({ sekcja: 'malowanie', jednostka_ceny: 'jm' }, ceny, gat, true, DZIS)).toMatchObject({ cena_jedn: 12000, jednostka_ceny: 'jm' })
  })
})

describe('wstępna wycena', () => {
  it('aparaty z karty; bez nich jeden z przedmiotu', () => {
    const k = pustaKarta()
    k.podsumowanie.ilosc_szt = 2
    expect(aparatyZKarty(k, 'Zbiornik Z-1')).toMatchObject([{ nazwa: 'Zbiornik Z-1', ilosc: 2 }])
    k.aparaty = [{ nazwa: 'Separator S-1', typ: 'separator', ilosc: 1, masa_kg: 900, srednica_mm: null, dlugosc_mm: null, wysokosc_mm: null, material: null }]
    expect(aparatyZKarty(k, 'x')[0].nazwa).toBe('Separator S-1')
  })

  it('odczyt rysunku do aparatu po wspólnym oznaczeniu', () => {
    expect(przypiszOdczyty(['SEP-0002.pdf', 'SEP-0001.pdf', 'ogolny.pdf'], [{ nazwa: 'Separator SEP-0001' }, { nazwa: 'Separator SEP-0002' }])).toEqual([1, 0, 0])
  })

  it('rysunek wskazany przy aparacie w analizie wygrywa z nazwą (numer rysunku inny niż oznaczenie aparatu)', () => {
    const aparaty = [
      { nazwa: 'Z-1 (150 m³)', rysunki: ['RYS-110 Rysunek zbiornika.pdf'] },
      { nazwa: 'Z-2 (500 m³)', rysunki: ['rys-510 rysunek zbiornika'] },
      { nazwa: 'Z-3 (700 m³)' },
    ]
    expect(przypiszOdczyty(['RYS-510 Rysunek zbiornika.pdf', 'RYS-110 Rysunek zbiornika.pdf', 'RYS-710 Rysunek zbiornika.pdf'], aparaty)).toEqual([1, 0, 0])
    expect(dopasujAparat('RYS-710 Rysunek zbiornika.pdf', aparaty)).toBeNull()
  })

  it('mediana rbh/t odporna na wartości puste i odstające', () => {
    expect(medianaRbhT([100, null, 120, 900, 0, 110])).toBe(115)
    expect(medianaRbhT([null, undefined])).toBeNull()
  })
})

describe('projekt oferty z karty analizy', () => {
  const KL: KlauzulaBazy[] = [
    { kategoria: 'obejmuje', tekst: 'Wykonanie {przedmiot} o łącznej wadze {masa_kg} kg', tagi: ['wykonanie'], kolejnosc: 1 },
    { kategoria: 'obejmuje', tekst: 'Zakup materiału z atestem 3.1, producent UE', tagi: ['material'], kolejnosc: 2 },
    { kategoria: 'obejmuje', tekst: 'Zakup materiału z udarnością w temp. {temp_udarnosci}', tagi: ['material', 'udarnosc'], kolejnosc: 3 },
    { kategoria: 'obejmuje', tekst: 'Sporządzenie dokumentacji koncesyjno-warsztatowej', tagi: ['projekt', 'udt'], kolejnosc: 4 },
    { kategoria: 'obejmuje', tekst: 'Uzgodnienie dokumentacji i odbiory UDT', tagi: ['udt'], kolejnosc: 5 },
    { kategoria: 'obejmuje', tekst: 'Badania NDT spoin: {zakres_NDT}', tagi: ['ndt'], kolejnosc: 6 },
    { kategoria: 'obejmuje', tekst: 'Zabezpieczenie antykorozyjne zewnętrzne', tagi: ['antykorozja'], kolejnosc: 7 },
    { kategoria: 'obejmuje', tekst: 'Zabezpieczenie antykorozyjne powierzchni wewnętrznej i zewnętrznej', tagi: ['antykorozja'], kolejnosc: 8 },
    { kategoria: 'obejmuje', tekst: 'Dokumentację jakościową', tagi: ['dokumentacja'], kolejnosc: 9 },
    { kategoria: 'nie_obejmuje', tekst: 'Wykonania izolacji', tagi: ['izolacja'], kolejnosc: 1 },
    { kategoria: 'uwagi', tekst: 'Zakres zgodny z zapytaniem.', tagi: [], kolejnosc: 1 },
    { kategoria: 'uwagi', tekst: 'Termin od daty zamówienia.', tagi: ['termin'], kolejnosc: 2 },
  ]
  const karta = (): KartaAnalizy => {
    const k = pustaKarta()
    const ust = (kod: string, stan: 'wymagane' | 'nie', opis = '') => { k.wymagania = k.wymagania.map((w) => (w.kod === kod ? { ...w, stan, opis } : w)) }
    ust('material', 'wymagane', 'udarność -45 °C KV 27 J')
    ust('udt', 'wymagane'); ust('ndt', 'wymagane', '100% RT spoin doczołowych'); ust('antykorozja', 'wymagane', 'dwa systemy: zewnątrz i wewnątrz'); ust('izolacja', 'nie')
    return k
  }

  it('klauzule do wymagań: udarność, UDT, NDT z zakresem, antykorozja wewn./zewn., brak izolacji, uwagi', () => {
    expect(klauzuleZAnalizy(karta(), KL)).toEqual({
      obejmuje: [
        'Wykonanie {przedmiot} o łącznej wadze {masa_kg} kg', 'Zakup materiału z udarnością w temp. {temp_udarnosci}',
        'Sporządzenie dokumentacji koncesyjno-warsztatowej', 'Uzgodnienie dokumentacji i odbiory UDT', 'Badania NDT spoin: {zakres_NDT}',
        'Zabezpieczenie antykorozyjne powierzchni wewnętrznej i zewnętrznej', 'Dokumentację jakościową',
      ],
      nie_obejmuje: ['Wykonania izolacji'],
      uwagi: ['Zakres zgodny z zapytaniem.', 'Termin od daty zamówienia.'],
    })
    expect(klauzuleZAnalizy(null, KL).obejmuje).toEqual(['Wykonanie {przedmiot} o łącznej wadze {masa_kg} kg', 'Zakup materiału z atestem 3.1, producent UE', 'Dokumentację jakościową'])
  })

  it('zmienne klauzul z karty i aparatów', () => {
    const k = karta()
    k.podsumowanie.miejsce_dostawy = 'Zakład klienta'
    expect(zmienneOferty(k, [{ material_wiodacy: 'P355NL1', masa_netto_kg: 1000, ilosc: 2 }, { material_wiodacy: 'P265GH', masa_netto_kg: 500, ilosc: 1 }]))
      .toEqual({ temp_udarnosci: '-45 °C', zakres_NDT: '100% RT spoin doczołowych', miejsce_dostawy: 'Zakład klienta', gatunki: 'P355NL1/P265GH', masa_kg: '2500' })
  })
})

describe('punkty do weryfikacji', () => {
  it('brak masy, robocizna, pozycje bez ceny, niepewne odczyty, sprawy z karty', () => {
    const a = nowyAparat(1, 'Zbiornik')
    a.pozycje = [
      { klucz: '1', lp: 1, zakladka: 'materialy', sekcja: 'blachy', nazwa: 'Blacha', ilosc: 1, jm: 'szt', masa_jedn: 100, cena_jedn: 0, jednostka_ceny: 'kg', pewnosc: 0.5 } as PozycjaWyceny,
      { klucz: '2', lp: 2, zakladka: 'kooperacja', sekcja: null, nazwa: 'Malowanie', ilosc: 1, jm: 'kpl', cena_jedn: 0, jednostka_ceny: 'jm' } as PozycjaWyceny,
    ]
    const st = { wycena: {} as StanWyceny['wycena'], marze: null, zapytanie: { id: 'z', numer: 'ZO/1', przedmiot: 'x', klient: null }, aparaty: [a] } as StanWyceny
    const par = { narzut_zakupowy_proc: 0, narzut_kooperacja_proc: 0, sposobMasy: () => 'brak', gestosc: () => 7.85, naddatekDomyslny: () => 0 } as ParametryKalk
    const k = pustaKarta()
    k.niespojnosci = [{ opis: 'UDT kontra CE', zrodla: '' }]
    k.pytania = [{ tresc: 'Termin?', zrodlo: '', odpowiedz: '' }]
    const p = punktyWeryfikacji(st, par, k)
    expect(p.map((x) => x.rodzaj)).toEqual(['masa', 'robocizna', 'cena', 'odczyt', 'niespojnosc', 'pytanie'])
    expect(p.find((x) => x.rodzaj === 'cena')!.opis).toContain('2 poz. bez ceny')
  })
})

describe('jednostka usługi z oferty', () => {
  it('oferta ryczałtowa (1 kpl) przy ilości w sztukach: pozycja 1 kpl, ilość do uwag', () => {
    const p = { ilosc: 806, jm: 'szt.', uwagi: null as string | null }
    ujednolicJednostkeUslugi(p, 'kpl', 1)
    expect(p).toMatchObject({ ilosc: 1, jm: 'kpl' })
    expect(p.uwagi).toContain('806 szt.')
  })
  it('ta sama jednostka bez zmian; inna (m²) tylko uwaga', () => {
    const a = { ilosc: 3, jm: 'szt', uwagi: null as string | null }
    ujednolicJednostkeUslugi(a, 'szt.', 10)
    expect(a).toMatchObject({ ilosc: 3, jm: 'szt', uwagi: null })
    const b = { ilosc: 1, jm: 'kpl', uwagi: null as string | null }
    ujednolicJednostkeUslugi(b, 'm2', 60)
    expect(b).toMatchObject({ ilosc: 1, jm: 'kpl' })
    expect(b.uwagi).toMatch(/m2/)
  })
})
