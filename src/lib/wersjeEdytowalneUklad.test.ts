import { describe, expect, it } from 'vitest'
import { Packer } from 'docx'
import { unzipSync, strFromU8 } from 'fflate'
import {
  blok, blokiDokladne, blokiStrony, blokiZAi, jestFormularzem, opisStron, parsujStrony, plamyGrafiki, podzielPlamy, rodzinaCzcionki,
  scalTlumaczenie, tekstJakWidac, widocznyTekst, type ElementZCzcionka, type RenderStrony,
} from './wersjeEdytowalne'
import { dokumentWord, pasyStrony, podzialStrony } from './wersjeEdytowalneWord'

// Dane FIKCYJNE. Strona A4 w pt.
const W = 595
const H = 842
const e = (str: string, x: number, y: number, h = 10, z: Partial<ElementZCzcionka> = {}): ElementZCzcionka => ({ str, x, y, w: str.length * h * 0.5, h, ...z })
const xml = async (d: ReturnType<typeof dokumentWord>) => strFromU8(unzipSync(new Uint8Array(await Packer.toBuffer(d)))['word/document.xml'])

/** Biały render strony z ciemnymi prostokątami (tusz) - do testów widoczności tekstu i plam grafiki. */
function render(tusz: { x: number; y: number; w: number; h: number }[], skala = 1): RenderStrony {
  const szer = Math.round(W * skala)
  const wys = Math.round(H * skala)
  const jasnosc = new Uint8Array(szer * wys).fill(255)
  for (const t of tusz) {
    for (let y = Math.round(t.y * skala); y < Math.round((t.y + t.h) * skala); y++) {
      for (let x = Math.round(t.x * skala); x < Math.round((t.x + t.w) * skala); x++) {
        if ((x + y) % 2 === 0) jasnosc[y * szer + x] = 20
      }
    }
  }
  return { szer, wys, skala, jasnosc, nasycenie: new Uint8Array(szer * wys) }
}

describe('wybór stron', () => {
  it('zakres z tekstu i z powrotem', () => {
    expect(parsujStrony('', 4)).toEqual([1, 2, 3, 4])
    expect(parsujStrony('1-2, 4, 9', 4)).toEqual([1, 2, 4])
    expect(parsujStrony('3-1', 4)).toEqual([1, 2, 3])
    expect(opisStron([5, 1, 2, 3])).toBe('1-3, 5')
  })
})

describe('czcionki', () => {
  it('rodzina z nazwy fontu PDF; czcionki symboli i nazwy bez rodziny - null albo ogólna', () => {
    expect(rodzinaCzcionki('ABCDEF+Arial-BoldMT')).toBe('Arial')
    expect(rodzinaCzcionki('TimesNewRomanPSMT')).toBe('Times New Roman')
    expect(rodzinaCzcionki('LLIJSF+CIDFont+F1')).toBeNull()
    expect(rodzinaCzcionki('sans-serif')).toBe('Arial')
    expect(rodzinaCzcionki('Symbol')).toBeNull()
  })
})

describe('tekst jak widać na renderze', () => {
  it('tekst bez tuszu (biały na białym) pominięty, przykryte słowo wycięte, pogrubienie z gęstości', () => {
    const widoczny = e('Visible text', 50, 100, 10, { font: 'f1' })
    const ukryty = e('Hidden text', 50, 130, 10, { font: 'f1' })
    const czesciowo = e('Dear Mr. Secret', 50, 160, 10, { font: 'f1' })
    const r = render([
      { x: 50, y: 92, w: widoczny.w, h: 10 },
      { x: 50, y: 152, w: 40, h: 10 }, // "Dear Mr." widać, nazwisko przykryte
    ])
    expect(widocznyTekst(r, widoczny)).toBe(true)
    expect(widocznyTekst(r, ukryty)).toBe(false)
    const wynik = tekstJakWidac(r, [widoczny, ukryty, czesciowo])
    expect(wynik.map((x) => x.str)).toEqual(['Visible text', 'Dear', 'Mr.'])
  })
})

describe('plamy grafiki', () => {
  it('rysunek bez tekstu jako plama, drobna kropka jako punktor', () => {
    const r = render([{ x: 100, y: 700, w: 300, h: 30 }, { x: 60, y: 200, w: 4, h: 4 }], 1.5)
    const { plamy, kropki } = podzielPlamy(plamyGrafiki(r, []))
    expect(plamy).toHaveLength(1)
    expect(plamy[0].x).toBeCloseTo(100, -1)
    expect(plamy[0].w).toBeGreaterThan(290)
    expect(kropki).toHaveLength(1)
  })
})

describe('bloki z układem strony', () => {
  it('położenie, tabela z wyrównanych kolumn, twarde złamanie linii, numeracja zostaje tekstem', () => {
    const el = [
      e('COMPANY NAME LTD', 72, 80), e('Ref 12', 72, 92), e('01 Jan 2026', 72, 104),
      e('Customer Reference:', 72, 200), e('email of 1 May', 200, 200),
      e('Supplier Reference:', 72, 213), e('No 77 Rev 2', 200, 213),
      e('1. Scope of supply', 72, 260), e('2. Delivery', 72, 273),
    ]
    const b = blokiStrony(el, W, [], { wysPt: H })
    expect(b[0]).toMatchObject({ typ: 'akapit', tekst: 'COMPANY NAME LTD\nRef 12\n01 Jan 2026' })
    expect(b[0].ramka!.x).toBeCloseTo(72 / W, 3)
    expect(b[1]).toMatchObject({ typ: 'tabela', wiersze: [['Customer Reference:', 'email of 1 May'], ['Supplier Reference:', 'No 77 Rev 2']] })
    expect(b[1].kolumny).toHaveLength(2)
    expect(b.slice(2).map((x) => x.tekst)).toEqual(['1. Scope of supply', '2. Delivery'])
  })

  it('punktor z kropki grafiki, podkreślenie z linii, indeks górny w linii, obraz z plamy', () => {
    const el = [e('Heading', 72, 100, 12), e('first point', 90, 140), e('Density 992 kg/m', 72, 180), e('3', 152, 176, 6)]
    const b = blokiStrony(el, W, [], {
      wysPt: H,
      grafika: {
        linie: [{ x: 72, y: 102, w: 42, h: 0.5 }], obrazy: [], kropki: [{ x: 75, y: 134, w: 4, h: 4 }],
        plamy: [{ x: 100, y: 700, w: 300, h: 30, krok: 3, wiersze: Array(10).fill(true) }],
      },
    })
    expect(b.find((x) => x.tekst === 'Heading')?.podkreslony).toBe(true)
    expect(b.find((x) => x.typ === 'lista')?.elementy).toEqual(['first point'])
    expect(b.some((x) => x.tekst === 'Density 992 kg/m3')).toBe(true)
    expect(b.filter((x) => x.typ === 'obraz')).toHaveLength(1)
  })

  it('układ dokładny: komórka z dwóch linii to jedno pole, linia siatki rozdziela komórki', () => {
    const el = [e('Design pressure', 60, 100), e('Ciśnienie', 60, 112), e('10 bar', 300, 100), e('Below line', 60, 140)]
    const b = blokiDokladne(el, W, H, { linie: [{ x: 50, y: 125, w: 400, h: 0.5 }], obrazy: [] })
    expect(b.map((x) => x.tekst).sort()).toEqual(['10 bar', 'Below line', 'Design pressure\nCiśnienie'])
    expect(jestFormularzem({ linie: Array(60).fill({ x: 0, y: 0, w: 10, h: 0.5 }), obrazy: [] })).toBe(true)
  })
})

describe('AI i tłumaczenie z układem', () => {
  it('położenie w % strony, obraz, szerokości kolumn', () => {
    const b = blokiZAi([
      { typ: 'obraz', tekst: 'logo', x: 10, y: 5, szer: 20, wys: 8 },
      { typ: 'tabela', wiersze: [['a', 'b']], x: 10, y: 20, szer: 80, wys: 10, szer_kolumn: [30, 70], obramowanie: true },
      { typ: 'obraz', tekst: 'bez położenia' },
    ])
    expect(b).toHaveLength(2)
    expect(b[0].ramka).toEqual({ x: 0.1, y: 0.05, w: 0.2, h: 0.08 })
    expect(b[1]).toMatchObject({ kolumny: [0.3, 0.7], obramowanie: true })
  })

  it('tłumaczenie wchodzi w bloki oryginału: położenie i obrazy zostają, dłuższy tekst - mniejsza czcionka pola', () => {
    const oryginal = [
      blok({ typ: 'obraz', ramka: { x: 0, y: 0, w: 0.2, h: 0.1 } }),
      blok({ typ: 'akapit', tekst: 'Shell', ramka: { x: 0.1, y: 0.2, w: 0.3, h: 0.02 }, czcionka: 'Arial', fragmenty: [{ tekst: 'Shell', b: true, i: false }] }),
      blok({ typ: 'tabela', wiersze: [['Tube', 'Qty']], ramka: { x: 0.1, y: 0.3, w: 0.5, h: 0.05 } }),
    ]
    const pl = scalTlumaczenie(oryginal, [blok({ typ: 'akapit', tekst: 'Płaszcz zbiornika' }), blok({ typ: 'tabela', wiersze: [['Rura', 'Ilość']] })])
    expect(pl[0].typ).toBe('obraz')
    expect(pl[1]).toMatchObject({ tekst: 'Płaszcz zbiornika', czcionka: 'Arial', ramka: oryginal[1].ramka, fragmenty: undefined })
    expect(pl[1].skala_czcionki).toBeLessThan(1)
    expect(pl[2].wiersze).toEqual([['Rura', 'Ilość']])
  })
})

describe('Word w układzie oryginału', () => {
  it('pasy: bloki obok siebie w jednym pasie; nagłówek i stopka strony z małego tekstu przy krawędziach', () => {
    const r = (x: number, y: number, w: number, h: number) => ({ x: x / W, y: y / H, w: w / W, h: h / H })
    const bloki = [
      blok({ typ: 'akapit', tekst: 'Header', rozmiar: 8, ramka: r(72, 30, 100, 10) }),
      blok({ typ: 'akapit', tekst: 'Left', rozmiar: 11, ramka: r(72, 150, 100, 12) }),
      blok({ typ: 'akapit', tekst: 'Right', rozmiar: 11, ramka: r(400, 150, 100, 12) }),
      blok({ typ: 'akapit', tekst: 'Body text of the page', rozmiar: 11, ramka: r(72, 200, 450, 12) }),
      blok({ typ: 'akapit', tekst: 'Page 1 of 2', rozmiar: 7, ramka: r(270, 800, 50, 8) }),
    ]
    const pasy = pasyStrony(bloki, W, H)
    expect(pasy.map((p) => p.bloki.length)).toEqual([1, 2, 1, 1])
    const { naglowek, tresc, stopka } = podzialStrony(pasy, H)
    expect([naglowek.length, tresc.length, stopka.length]).toEqual([1, 2, 1])
  })

  it('wymiary strony oryginału, wcięcia, nagłówek / stopka; układ dokładny - pola i tło', async () => {
    const r = (x: number, y: number, w: number, h: number) => ({ x: x / W, y: y / H, w: w / W, h: h / H })
    const plynny = await xml(dokumentWord([{
      nr: 1, wymiary: { szerPt: 842, wysPt: 595 },
      bloki: [blok({ typ: 'akapit', tekst: 'Indented', rozmiar: 11, czcionka: 'Arial', ramka: r(150, 100, 100, 12) }), blok({ typ: 'akapit', tekst: 'Page 1', rozmiar: 7, ramka: r(300, 560, 30, 8) })],
    }], 'test'))
    expect(plynny).toContain('w:orient="landscape"')
    expect(plynny).toMatch(/w:ind w:left="\d+"/)
    expect(plynny).toContain('w:footerReference')
    const dokladny = await xml(dokumentWord([{
      nr: 1, wymiary: { szerPt: W, wysPt: H }, uklad: 'dokladny', tlo: { dane: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), typ: 'jpg' },
      bloki: [blok({ typ: 'akapit', tekst: 'Cell text', rozmiar: 9, ramka: r(60, 100, 80, 10) })],
    }], 'test'))
    expect(dokladny).toContain('w:framePr')
    expect(dokladny).toContain('behindDoc="1"')
    expect(dokladny).toContain('Cell text')
  })
})
