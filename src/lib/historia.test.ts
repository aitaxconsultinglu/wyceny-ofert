import { describe, expect, it } from 'vitest'
import { dodajKrok, opisZmiany, polaczZOstatnim, roznica, zastosuj, type Krok, type Stos } from './historia'

// Dane FIKCYJNE.
const stan = { nazwa: 'A', aparaty: [{ klucz: 'k1', pozycje: [{ klucz: 'p1', ilosc: 1 }, { klucz: 'p2', ilosc: 2 }] }] }

describe('różnice stanów', () => {
  it('tylko zmienione ścieżki, bez kluczy technicznych; zastosowanie w obie strony', () => {
    const po = { ...stan, aparaty: [{ klucz: 'x', pozycje: [{ klucz: 'p1', ilosc: 1 }, { klucz: 'p2', ilosc: 5 }] }] }
    const z = roznica(stan, po)
    expect(z).toEqual([{ s: ['aparaty', 0, 'pozycje', 1, 'ilosc'], przed: 2, po: 5 }])
    expect(zastosuj(po, z, 'wstecz').aparaty[0].pozycje[1].ilosc).toBe(2)
    expect(zastosuj(stan, z, 'naprzod').aparaty[0].pozycje[1].ilosc).toBe(5)
    expect(opisZmiany(z)).toBe('zmiana: ilosc w pozycji 2')
  })
  it('dodanie pozycji (inna długość tablicy) i nowe pole', () => {
    const po = { ...stan, uwagi: 'x', aparaty: [{ ...stan.aparaty[0], pozycje: [...stan.aparaty[0].pozycje, { klucz: 'p3', ilosc: 3 }] }] }
    const z = roznica(stan, po)
    const wstecz = zastosuj(po, z, 'wstecz') as typeof po
    expect(wstecz.aparaty[0].pozycje).toHaveLength(2)
    expect('uwagi' in wstecz).toBe(false)
  })
})

describe('stos', () => {
  const k = (opis: string, czas = 0): Krok => ({ opis, czas, zmiany: [{ s: [opis], przed: 0, po: 1 }] })
  it('kolejność, nowa zmiana po cofnięciu czyści ponowienia, bez limitu głębokości', () => {
    let st: Stos = { kroki: [], wskaznik: 0 }
    for (let i = 0; i < 5000; i++) st = dodajKrok(st, k(`k${i}`, i * 10_000))
    expect(st.kroki).toHaveLength(5000)
    st = { ...st, wskaznik: 4998 }       // dwa cofnięcia
    st = dodajKrok(st, k('nowy'))
    expect(st.kroki).toHaveLength(4999)
    expect(st.kroki.at(-1)!.opis).toBe('nowy')
    expect(st.wskaznik).toBe(4999)
  })
  it('pisanie w jednym polu łączy się w jeden krok', () => {
    let st: Stos = { kroki: [], wskaznik: 0 }
    st = polaczZOstatnim(st, { opis: 'a', czas: 0, zmiany: [{ s: ['nazwa'], przed: 'A', po: 'Ab' }] })
    st = polaczZOstatnim(st, { opis: 'a', czas: 300, zmiany: [{ s: ['nazwa'], przed: 'Ab', po: 'Abc' }] })
    st = polaczZOstatnim(st, { opis: 'b', czas: 2000, zmiany: [{ s: ['nazwa'], przed: 'Abc', po: 'Abcd' }] })
    expect(st.kroki).toHaveLength(2)
    expect(st.kroki[0].zmiany![0]).toEqual({ s: ['nazwa'], przed: 'A', po: 'Abc' })
  })
})
