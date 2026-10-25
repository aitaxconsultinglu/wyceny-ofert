import { describe, expect, it } from 'vitest'
import { filtrujISortuj, filtryNaZapytanie, pasujeFiltr, przelaczSort, wartosciListy, type DefinicjaKolumny, type ZapytanieFiltrowalne } from './tabela'

// Dane FIKCYJNE.
interface W { numer: string; klient: string | null; kwota: number | null; data: string | null; pilne: boolean }
const W_: W[] = [
  { numer: 'ZO/3/2026', klient: 'Łódź Sp.', kwota: 300, data: '2026-03-01', pilne: false },
  { numer: 'ZO/10/2026', klient: 'Alfa', kwota: null, data: '2026-01-15', pilne: true },
  { numer: 'ZO/2/2026', klient: 'alfa', kwota: 100, data: null, pilne: false },
]
const K: DefinicjaKolumny<W>[] = [
  { id: 'numer', typ: 'tekst', wartosc: (w) => w.numer, pole: 'numer' },
  { id: 'klient', typ: 'lista', wartosc: (w) => w.klient, pole: 'klient' },
  { id: 'kwota', typ: 'liczba', wartosc: (w) => w.kwota, pole: 'kwota' },
  { id: 'data', typ: 'data', wartosc: (w) => w.data, pole: 'data' },
  { id: 'pilne', typ: 'tak_nie', wartosc: (w) => w.pilne, pole: 'pilne' },
]
const nr = (l: W[]) => l.map((w) => w.numer)

describe('filtry', () => {
  it('tekst: zawiera / zaczyna / równa się, bez wielkości liter i polskich znaków', () => {
    expect(pasujeFiltr('Łódź Sp.', { typ: 'tekst', tryb: 'zawiera', wartosc: 'lodz' })).toBe(true)
    expect(pasujeFiltr('ZO/10/2026', { typ: 'tekst', tryb: 'zaczyna', wartosc: 'zo/1' })).toBe(true)
    expect(pasujeFiltr('ZO/10/2026', { typ: 'tekst', tryb: 'rowna', wartosc: 'ZO/1' })).toBe(false)
  })
  it('liczba: zakres, większe, mniejsze; puste tylko bez ograniczeń', () => {
    expect(nr(filtrujISortuj(W_, K, { sort: [], filtry: { kwota: { typ: 'liczba', tryb: 'zakres', od: 100, do: 200 } } }))).toEqual(['ZO/2/2026'])
    expect(nr(filtrujISortuj(W_, K, { sort: [], filtry: { kwota: { typ: 'liczba', tryb: 'wieksze', od: 100, do: null } } }))).toEqual(['ZO/3/2026'])
    expect(nr(filtrujISortuj(W_, K, { sort: [], filtry: { kwota: { typ: 'liczba', tryb: 'mniejsze', od: null, do: 300 } } }))).toEqual(['ZO/2/2026'])
  })
  it('data, lista wartości z pustymi, tak/nie', () => {
    expect(nr(filtrujISortuj(W_, K, { sort: [], filtry: { data: { typ: 'data', od: '2026-02-01', do: null } } }))).toEqual(['ZO/3/2026'])
    expect(nr(filtrujISortuj(W_, K, { sort: [], filtry: { klient: { typ: 'lista', wartosci: ['Alfa', '(puste)'] } } }))).toEqual(['ZO/10/2026'])
    expect(nr(filtrujISortuj(W_, K, { sort: [], filtry: { pilne: { typ: 'tak_nie', wartosc: true } } }))).toEqual(['ZO/10/2026'])
    expect(wartosciListy(W_, K[1]).map((x) => x.wartosc)).toEqual(['alfa', 'Alfa', 'Łódź Sp.'].sort((a, b) => a.localeCompare(b, 'pl')))
  })
})

describe('sortowanie', () => {
  it('numerycznie w tekście, puste na końcu w obu kierunkach, wielokrotne', () => {
    expect(nr(filtrujISortuj(W_, K, { sort: [{ kol: 'numer', kier: 'rosnaco' }], filtry: {} }))).toEqual(['ZO/2/2026', 'ZO/3/2026', 'ZO/10/2026'])
    expect(nr(filtrujISortuj(W_, K, { sort: [{ kol: 'kwota', kier: 'malejaco' }], filtry: {} }))).toEqual(['ZO/3/2026', 'ZO/2/2026', 'ZO/10/2026'])
    expect(nr(filtrujISortuj(W_, K, { sort: [{ kol: 'klient', kier: 'rosnaco' }, { kol: 'kwota', kier: 'malejaco' }], filtry: {} })).slice(0, 2)).toEqual(['ZO/2/2026', 'ZO/10/2026'])
  })
  it('kliknięcie: rosnąco → malejąco → brak; Shift dokłada kolumnę', () => {
    let s = przelaczSort({ sort: [], filtry: {} }, 'numer', false)
    expect(s.sort).toEqual([{ kol: 'numer', kier: 'rosnaco' }])
    s = przelaczSort(s, 'numer', false)
    expect(s.sort).toEqual([{ kol: 'numer', kier: 'malejaco' }])
    s = przelaczSort(s, 'kwota', true)
    expect(s.sort.map((x) => x.kol)).toEqual(['numer', 'kwota'])
    s = przelaczSort(s, 'numer', false)
    expect(s.sort).toEqual([])
  })
})

describe('filtry po stronie bazy', () => {
  it('ten sam stan jako warunki zapytania', () => {
    const wywolania: string[] = []
    interface Q extends ZapytanieFiltrowalne<Q> { _q?: true }
    const q: Q = new Proxy({} as Q, {
      get: (_t, m) => (...a: unknown[]) => { wywolania.push(`${String(m)}:${JSON.stringify(a)}`); return q },
    })
    filtryNaZapytanie(q, K, {
      sort: [{ kol: 'data', kier: 'malejaco' }],
      filtry: { numer: { typ: 'tekst', tryb: 'zawiera', wartosc: '10%' }, kwota: { typ: 'liczba', tryb: 'zakres', od: 1, do: null }, pilne: { typ: 'tak_nie', wartosc: false } },
    })
    expect(wywolania).toEqual([
      'ilike:["numer","%10\\\\%%"]', 'gte:["kwota",1]', 'eq:["pilne",false]', 'order:["data",{"ascending":false,"nullsFirst":false}]',
    ])
  })
})
