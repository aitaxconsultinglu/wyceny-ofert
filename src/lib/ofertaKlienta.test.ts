import { describe, expect, it } from 'vitest'
import {
  brakujaceZmienne, dodajWersje, klauzulaWJezyku, normalizujOferte, podstaw, przesunSekcje, przywrocWersje, rozbierzTekst, tytulSekcji,
} from './ofertaKlienta'

// Dane FIKCYJNE.
const D = { gwarancja_mies: 24, waznosc_dni: 30, platnosc: '30 dni', przedmiot: 'Zbiornik testowy', termin_tyg: 12, numer: 'ZO/1/2026', ma_opcje: false, dzis: '2026-10-01' }

describe('oferta dla klienta - sekcje', () => {
  it('stara oferta bez sekcji dostaje sekcje domyślne, zachowuje klauzule i warunki', () => {
    const o = normalizujOferte({ obejmuje: ['Wykonanie {przedmiot}'], platnosc: '14 dni' }, D)
    expect(o.sekcje.map((s) => s.rodzaj)).toEqual(['dane', 'przedmiot', 'zakres', 'warunki', 'uwagi', 'cena', 'zalaczniki'])
    expect(o.obejmuje).toEqual(['Wykonanie {przedmiot}'])
    expect(o.platnosc).toBe('14 dni')
    expect(o.termin_realizacji).toBe('12 tygodni od daty otrzymania zamówienia')
    expect(o.numer_oferty).toBe('ZO/1/2026')
  })
  it('zapisana kolejność sekcji zostaje, brakujące dochodzą na końcu', () => {
    const o = normalizujOferte({ sekcje: [{ id: 'cena', rodzaj: 'cena', tytul: '', tekst: '', widoczna: false }] }, D)
    expect(o.sekcje[0].rodzaj).toBe('cena')
    expect(o.sekcje[0].widoczna).toBe(false)
    expect(o.sekcje).toHaveLength(7)
  })
  it('przesuwanie sekcji', () => {
    const o = normalizujOferte(null, D)
    expect(przesunSekcje(o.sekcje, 5, 1).map((s) => s.rodzaj).slice(0, 3)).toEqual(['dane', 'cena', 'przedmiot'])
    expect(przesunSekcje(o.sekcje, 0, 99)).toBe(o.sekcje)
  })
  it('tytuły w języku oferty, własny tytuł ma pierwszeństwo', () => {
    expect(tytulSekcji({ rodzaj: 'warunki', tytul: '' }, 'en')).toBe('Technical and commercial terms')
    expect(tytulSekcji({ rodzaj: 'warunki', tytul: 'Warunki' }, 'en')).toBe('Warunki')
  })
})

describe('oferta dla klienta - tekst, zmienne, wersje', () => {
  it('zmienne: podstawienie i brakujące', () => {
    expect(podstaw('Masa {masa_kg} kg, NDT {zakres_NDT}', { masa_kg: '2400' })).toBe('Masa 2400 kg, NDT [zakres_NDT]')
    expect(brakujaceZmienne(['{a} {b}', '{c}'], { a: 'x', c: ' ' })).toEqual(['b', 'c'])
  })
  it('formatowanie: punkty i pogrubienia', () => {
    expect(rozbierzTekst('Wstęp **ważne** koniec\n- punkt 1\n\n• punkt 2')).toEqual([
      { punkt: false, fragmenty: [{ tekst: 'Wstęp ', pogrubiony: false }, { tekst: 'ważne', pogrubiony: true }, { tekst: ' koniec', pogrubiony: false }] },
      { punkt: true, fragmenty: [{ tekst: 'punkt 1', pogrubiony: false }] },
      { punkt: true, fragmenty: [{ tekst: 'punkt 2', pogrubiony: false }] },
    ])
  })
  it('klauzula po angielsku z biblioteki', () => {
    const b = [{ tekst: 'Dokumentację jakościową', tekst_en: 'Quality documentation' }]
    expect(klauzulaWJezyku('Dokumentację jakościową', 'en', b)).toBe('Quality documentation')
    expect(klauzulaWJezyku('Własny punkt', 'en', b)).toBe('Własny punkt')
    expect(klauzulaWJezyku('Dokumentację jakościową', 'pl', b)).toBe('Dokumentację jakościową')
  })
  it('zapis i przywrócenie wersji treści', () => {
    let o = normalizujOferte({ platnosc: 'A' }, D)
    o = dodajWersje(o, 'Jan Test', 'pierwsza', 20, '2026-10-01T10:00:00Z')
    o = { ...o, platnosc: 'B' }
    expect(o.wersje).toHaveLength(1)
    expect(o.wersje[0].oferta).not.toHaveProperty('wersje')
    const p = przywrocWersje(o, o.wersje[0])
    expect(p.platnosc).toBe('A')
    expect(p.wersje).toHaveLength(1)
  })
})
