import { describe, expect, it } from 'vitest'
import { grupyTerminow, terminyZOfert, wyrownajTerminy } from './terminyMaterialow'

// Dane FIKCYJNE.
const kat = [{ kod: 'blachy', nazwa: 'Blachy' }, { kod: 'dennice', nazwa: 'Dennice' }, { kod: 'rury_technologiczne', nazwa: 'Rury technologiczne' }, { kod: 'odkuwki', nazwa: 'Odkuwki' }, { kod: 'kolnierze', nazwa: 'Kołnierze' }, { kod: 'zlaczne', nazwa: 'Elementy złączne' }, { kod: 'uszczelki', nazwa: 'Uszczelki' }, { kod: 'spawalnicze', nazwa: 'Spawalnicze' }]

describe('terminy zakupu materiałów', () => {
  it('grupy z materiałów wyceny, bez materiałów - wg rodzaju aparatu (wymiennik bez dennic)', () => {
    expect(grupyTerminow(['odkuwki', 'blachy', 'spawalnicze'], 'wymiennik', kat)).toEqual(['Blachy', 'Odkuwki', 'Dokumentacja'])
    const wym = grupyTerminow([], 'wymiennik', kat)
    expect(wym).toContain('Rury technologiczne')
    expect(wym).not.toContain('Dennice')
    expect(grupyTerminow([], 'zbiornik', kat)).toContain('Dennice')
  })
  it('wpisane terminy zostają, najdłuższy termin z ofert', () => {
    expect(wyrownajTerminy([{ grupa: 'Odkuwki', termin: '10 tyg.' }, { grupa: 'Stara', termin: '2 tyg.' }], ['Odkuwki', 'Blachy']))
      .toEqual([{ grupa: 'Odkuwki', termin: '10 tyg.' }, { grupa: 'Blachy', termin: '' }, { grupa: 'Stara', termin: '2 tyg.' }])
    expect(terminyZOfert([{ kategoria: 'odkuwki', termin_dni: 30, dostawca: 'A' }, { kategoria: 'odkuwki', termin_dni: 56, dostawca: 'B' }], kat))
      .toEqual({ Odkuwki: '8 tyg. (56 dni, B)' })
  })
})
