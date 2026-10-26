import { describe, expect, it } from 'vitest'
import { parsujWklejke, stanowiskaMigawki, stawkaSredniaZMigawki, stawkaWDniu, stawkaZMigawki, type StawkaMigawki } from './cennikRobocizny'
import { policzPozycje, type ParametryKalk } from './kalkulacja'

// Dane FIKCYJNE (stawki przykładowe, nie z cennika firmy).
const PRZEDZIALY = [{ kod: '7-15', nazwa: '7-15', kolejnosc: 1 }, { kod: '15-19', nazwa: '15-19', kolejnosc: 2 }, { kod: '19-7', nazwa: '19-7', kolejnosc: 3 }, { kod: 'wolne', nazwa: 'dni wolne', kolejnosc: 4 }]
const MIGAWKA: StawkaMigawki[] = [
  { stanowisko_id: 1, nazwa: 'Monter', tryb: 'przedzialy', przedzial: '7-15', stawka: 60, srednia: false, mpk: null },
  { stanowisko_id: 1, nazwa: 'Monter', tryb: 'przedzialy', przedzial: 'wolne', stawka: 90, srednia: false, mpk: null },
  { stanowisko_id: 2, nazwa: 'Napawanie', tryb: 'stala', przedzial: null, stawka: 77, srednia: false, mpk: 'P05' },
  { stanowisko_id: 3, nazwa: 'Średnia warsztatu', tryb: 'stala', przedzial: null, stawka: 55, srednia: true, mpk: null },
]

describe('cennik roboczogodzin', () => {
  it('stawka z migawki wyceny: stanowisko × przedział albo stawka stała', () => {
    expect(stawkaZMigawki(MIGAWKA, 1, '7-15')).toBe(60)
    expect(stawkaZMigawki(MIGAWKA, 1, 'wolne')).toBe(90)
    expect(stawkaZMigawki(MIGAWKA, 1, '19-7')).toBeNull()
    expect(stawkaZMigawki(MIGAWKA, 2, '19-7')).toBe(77)
    expect(stawkaSredniaZMigawki(MIGAWKA)).toBe(55)
    expect(stanowiskaMigawki(MIGAWKA).map((s) => s.nazwa)).toEqual(['Monter', 'Napawanie', 'Średnia warsztatu'])
  })

  it('pozycja robocizny: godziny × stawka (np. 32 h × 60 zł = 1 920 zł)', () => {
    const par = { sposobMasy: () => 'brak', gestosc: () => 7.85, naddatekDomyslny: () => 0, narzut_zakupowy_proc: 0, narzut_kooperacja_proc: 0 } as unknown as ParametryKalk
    const w = policzPozycje({ zakladka: 'robocizna', sekcja: null, nazwa: 'Monter', ilosc: 32, jm: 'rbh', cena_jedn: stawkaZMigawki(MIGAWKA, 1, '7-15')!, jednostka_ceny: 'jm' }, par)
    expect([w.koszt, w.rbh]).toEqual([1920, 32])
  })

  it('wersje stawek: obowiązuje najnowsza nie późniejsza niż dzień', () => {
    const st = [
      { id: 1, stanowisko_id: 1, przedzial_kod: '7-15', stawka: 50, wazna_od: '2026-01-01' },
      { id: 2, stanowisko_id: 1, przedzial_kod: '7-15', stawka: 60, wazna_od: '2026-10-01' },
    ]
    expect(stawkaWDniu(st, 1, '7-15', '2026-09-30')?.stawka).toBe(50)
    expect(stawkaWDniu(st, 1, '7-15', '2026-10-26')?.stawka).toBe(60)
    expect(stawkaWDniu(st, 1, '7-15', '2025-12-31')).toBeNull()
  })

  it('wklejanie wielu wierszy ze schowka: przedziały w kolejności cennika, stawka stała', () => {
    expect(parsujWklejke('Stanowisko\t7-15\t15-19\t19-7\tdni wolne\nMonter\t60,00\t70\t80\t90\nNapawanie\tstała\t77 zł\nPusty\t-', PRZEDZIALY)).toEqual([
      { nazwa: 'Monter', stawki: { '7-15': 60, '15-19': 70, '19-7': 80, wolne: 90 } },
      { nazwa: 'Napawanie', stala: 77 },
    ])
  })
})
