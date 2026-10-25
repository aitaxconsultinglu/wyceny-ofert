import { describe, expect, it } from 'vitest'
import { Packer } from 'docx'
import { unzipSync, strFromU8 } from 'fflate'
import {
  blokiStrony, blokiZAi, blokiZArkusza, blokiZTekstu, blokiZTekstuZwyklego, jezykPliku, rodzajPliku, tekstBlokow, tekstyZDxf, wykryjJezyk,
  type ElementZCzcionka,
} from './wersjeEdytowalne'
import { dokumentWord } from './wersjeEdytowalneWord'
import { krokPrzewijania } from '../components/ui/ZaznaczanieObszarow'

// Dane FIKCYJNE.
const e = (str: string, x: number, y: number, h = 10, z: Partial<ElementZCzcionka> = {}): ElementZCzcionka => ({ str, x, y, w: str.length * h * 0.5, h, ...z })

describe('język bez AI', () => {
  it('rozpoznaje polski, angielski, niemiecki i rosyjski', () => {
    expect(wykryjJezyk('Zbiornik należy wykonać zgodnie z dokumentacją oraz przepisami dla urządzeń ciśnieniowych, które są w umowie.').kod).toBe('pl')
    expect(wykryjJezyk('The vessel shall be designed and fabricated in accordance with the code and all requirements of this specification.').kod).toBe('en')
    expect(wykryjJezyk('Der Behälter ist nach den Vorgaben der Spezifikation und mit den Prüfungen für die Abnahme zu fertigen.').kod).toBe('de')
    expect(wykryjJezyk('Сосуд должен быть изготовлен в соответствии с требованиями проекта и спецификации заказчика.').kod).toBe('ru')
  })
  it('za mało tekstu - bez rozpoznania', () => {
    expect(wykryjJezyk('DN100 PN16').kod).toBeNull()
  })
})

describe('rodzaj pliku', () => {
  it('z rozszerzenia', () => {
    expect(rodzajPliku('skan.JPG')).toBe('obraz')
    expect(rodzajPliku('karta.pdf')).toBe('pdf')
    expect(rodzajPliku('rys.dxf')).toBe('cad')
    expect(rodzajPliku('zestawienie.xlsx')).toBe('arkusz')
    expect(rodzajPliku('archiwum.7z')).toBe('inny')
  })
})

describe('bloki z warstwy tekstowej', () => {
  const strona: ElementZCzcionka[] = [
    e('SPECIFICATION', 230, 60, 20, { pogrubiony: true }),
    e('1. Scope', 50, 110, 12, { pogrubiony: true }),
    e('The vessel shall be made', 50, 140), e('of carbon steel.', 175, 140),
    e('Welding according to the', 50, 153), e('approved procedures.', 175, 153),
    e('• hydrotest', 50, 190), e('• radiography', 50, 203),
    e('Page 1', 520, 800, 8),
  ]
  const bloki = blokiZTekstu(strona, 595)

  it('nagłówki z rozmiaru i pogrubienia, akapit z łączonych linii, lista z punktorów', () => {
    expect(bloki[0]).toMatchObject({ typ: 'naglowek', poziom: 1, tekst: 'SPECIFICATION', wyrownanie: 'srodek' })
    expect(bloki[1]).toMatchObject({ typ: 'naglowek', tekst: '1. Scope' })
    expect(bloki[2]).toMatchObject({ typ: 'akapit', tekst: 'The vessel shall be made of carbon steel. Welding according to the approved procedures.' })
    expect(bloki[3]).toMatchObject({ typ: 'lista', elementy: ['hydrotest', 'radiography'] })
    expect(bloki[4]).toMatchObject({ typ: 'akapit', tekst: 'Page 1', wyrownanie: 'prawo' })
  })

  it('zaznaczony obszar "tabela" daje tabelę, "tekst" - akapity; kolejność od góry', () => {
    const el = [
      e('Opis', 50, 100), e('Notes below the table here', 50, 300),
      e('Item', 50, 200), e('Qty', 200, 200), e('Shell', 50, 215), e('1', 200, 215), e('Head', 50, 230), e('2', 200, 230),
    ]
    const b = blokiStrony(el, 595, [
      { x: 40, y: 290, w: 400, h: 20, rodzaj: 'tekst' },
      { x: 40, y: 190, w: 300, h: 50, rodzaj: 'tabela' },
    ])
    expect(b[0].typ).toBe('tabela')
    expect(b[0].wiersze).toEqual([['Item', 'Qty'], ['Shell', '1'], ['Head', '2']])
    expect(b[1]).toMatchObject({ typ: 'akapit', tekst: 'Notes below the table here' })
  })
})

describe('inne formaty', () => {
  it('tekst zwykły i arkusz', () => {
    expect(blokiZTekstuZwyklego('Akapit pierwszy\ndruga linia\n\n- jeden\n- dwa').map((b) => b.typ)).toEqual(['akapit', 'lista'])
    const a = blokiZArkusza([{ nazwa: 'Arkusz1', wiersze: [['Poz', '', 'Nazwa'], ['', '', ''], ['1', '', 'Płaszcz']] }])
    expect(a[1].wiersze).toEqual([['Poz', 'Nazwa'], ['1', 'Płaszcz']])
  })

  it('DXF: TEXT i MTEXT od góry rysunku, formatowanie MTEXT usunięte', () => {
    const dxf = ['0', 'SECTION', '2', 'ENTITIES',
      '0', 'TEXT', '10', '10', '20', '50', '1', 'NOZZLE %%c100',
      '0', 'MTEXT', '10', '10', '20', '90', '1', '{\\fArial|b1;TITLE}\\PSecond line',
      '0', 'LINE', '10', '0', '20', '0', '0', 'ENDSEC'].join('\n')
    expect(tekstyZDxf(dxf)).toEqual(['TITLE\nSecond line', 'NOZZLE Ø100'])
  })

  it('wynik AI: bezpieczne wartości, puste bloki pominięte', () => {
    const b = blokiZAi([
      { typ: 'naglowek', poziom: 7, tekst: 'Tytuł', wyrownanie: 'srodek' },
      { typ: 'tabela', wiersze: [] },
      { typ: 'nieznany', tekst: 'Tekst' },
      { typ: 'lista', elementy: [], tekst: 'jedyny punkt' },
    ])
    expect(b.map((x) => [x.typ, x.poziom])).toEqual([['naglowek', 3], ['akapit', 0], ['akapit', 0]])
    expect(blokiZAi(null)).toEqual([])
  })

  it('język pliku = język stron z największą ilością tekstu', () => {
    const t = (tekst: string) => ({ bloki: blokiZTekstuZwyklego(tekst), zrodlo: 'tekst' as const })
    expect(jezykPliku({ strony: { 1: { ...t('a'), jezyk: 'pl' }, 2: { ...t('dłuższy tekst strony drugiej'), jezyk: 'en' } }, tlumaczenie: {} })).toBe('en')
    expect(tekstBlokow(blokiZArkusza([{ nazwa: 'A', wiersze: [['x', 'y']] }]))).toContain('x | y')
  })
})

describe('Word', () => {
  it('nagłówki, akapity, listy i tabele; strony rozdzielone podziałem strony', async () => {
    const doc = dokumentWord([
      { nr: 1, bloki: blokiZTekstu([e('TITLE', 250, 60, 20, { pogrubiony: true }), e('Body text of the page.', 50, 120)], 595) },
      { nr: 2, bloki: blokiZArkusza([{ nazwa: 'Tabela', wiersze: [['Poz', 'Nazwa'], ['1', 'Płaszcz']] }]) },
      { nr: 3, bloki: [] },
    ], 'test')
    const xml = strFromU8(unzipSync(new Uint8Array(await Packer.toBuffer(doc)))['word/document.xml'])
    expect(xml).toContain('Heading1')
    expect(xml).toContain('Body text of the page.')
    expect(xml).toContain('<w:tbl>')
    expect(xml).toContain('Płaszcz')
    expect((xml.match(/w:type="page"/g) ?? []).length).toBe(1)
  })
})

describe('przewijanie przy zaznaczaniu', () => {
  it('przy krawędzi przewija, im bliżej - tym szybciej; w środku stoi', () => {
    expect(krokPrzewijania(300, 0, 600)).toBe(0)
    expect(krokPrzewijania(590, 0, 600)).toBeGreaterThan(0)
    expect(krokPrzewijania(10, 0, 600)).toBeLessThan(0)
    expect(krokPrzewijania(700, 0, 600)).toBe(28)
    expect(krokPrzewijania(595, 0, 600)).toBeGreaterThan(krokPrzewijania(560, 0, 600))
  })
})
