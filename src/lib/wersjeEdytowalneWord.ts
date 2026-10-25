// Wersja edytowalna -> dokument Word: nagłówki jako style Nagłówek 1-3 (spis treści, nawigacja), akapity z wyrównaniem,
// pogrubieniem i rozmiarem czcionki, listy punktowane, tabele z obramowaniem; każda strona oryginału od nowej strony.
import { AlignmentType, BorderStyle, Document, HeadingLevel, Packer, PageBreak, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'
import { nazwaPliku, pobierzPlik } from './pobierz'
import type { BlokDokumentu, Wyrownanie } from './wersjeEdytowalne'

const WYROWNANIE: Record<Wyrownanie, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  lewo: AlignmentType.LEFT, srodek: AlignmentType.CENTER, prawo: AlignmentType.RIGHT, wyjustowane: AlignmentType.JUSTIFIED,
}
const POZIOMY = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3]
const RAMKA = { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' }

/** Tekst z nowymi liniami jako kolejne przebiegi z łamaniem linii. */
const przebiegi = (tekst: string, o: { bold?: boolean; italics?: boolean; size?: number }) =>
  tekst.split('\n').map((l, i) => new TextRun({ text: l, break: i ? 1 : 0, ...o }))

function tabela(b: BlokDokumentu) {
  const kolumn = Math.max(1, ...b.wiersze.map((w) => w.length))
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: RAMKA, bottom: RAMKA, left: RAMKA, right: RAMKA, insideHorizontal: RAMKA, insideVertical: RAMKA },
    rows: b.wiersze.map((w, i) => new TableRow({
      tableHeader: b.naglowek_tabeli && i === 0,
      children: Array.from({ length: kolumn }, (_, k) => new TableCell({
        shading: b.naglowek_tabeli && i === 0 ? { fill: 'F1F5F9' } : undefined,
        children: [new Paragraph({ children: przebiegi(w[k] ?? '', { bold: b.naglowek_tabeli && i === 0, size: 18 }) })],
      })),
    })),
  })
}

export function elementyWorda(bloki: BlokDokumentu[]): (Paragraph | Table)[] {
  return bloki.flatMap((b): (Paragraph | Table)[] => {
    const size = b.rozmiar ? Math.round(b.rozmiar * 2) : undefined
    const wspolne = { alignment: WYROWNANIE[b.wyrownanie] ?? AlignmentType.LEFT }
    if (b.typ === 'tabela') return [tabela(b), new Paragraph({ spacing: { after: 120 }, children: [] })]
    if (b.typ === 'lista') return b.elementy.map((e) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: przebiegi(e, { size }) }))
    if (b.typ === 'naglowek') {
      return [new Paragraph({ ...wspolne, heading: POZIOMY[Math.min(3, Math.max(1, b.poziom)) - 1], children: przebiegi(b.tekst, { bold: true, italics: b.kursywa, size }) })]
    }
    return [new Paragraph({
      ...wspolne, spacing: { after: 120 },
      children: przebiegi(b.tekst, { bold: b.pogrubiony, italics: b.kursywa || b.typ === 'podpis', size: size ?? (b.typ === 'podpis' ? 18 : undefined) }),
    })]
  })
}

/** Dokument Word ze stron (kolejność stron oryginału); strony bez treści pominięte. */
export function dokumentWord(strony: { nr: number; bloki: BlokDokumentu[] }[], tytul: string): Document {
  const dzieci: (Paragraph | Table)[] = []
  strony.filter((s) => s.bloki.length).forEach((s, i) => {
    if (i > 0) dzieci.push(new Paragraph({ children: [new PageBreak()] }))
    dzieci.push(...elementyWorda(s.bloki))
  })
  return new Document({
    title: tytul,
    creator: 'Wersje edytowalne',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children: dzieci }],
  })
}

export async function pobierzWord(strony: { nr: number; bloki: BlokDokumentu[] }[], nazwa: string) {
  const plik = nazwaPliku(nazwa.replace(/\.[^.]+$/, ''))
  pobierzPlik(await Packer.toBlob(dokumentWord(strony, plik)), `${plik}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
}
