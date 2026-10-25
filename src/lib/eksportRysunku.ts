// Excel z odczytu rysunku: zakładki Parametry, Króćce, Wykaz części, Uwagi do wyceny.
// Niepewne odczyty (pewność < 0,8) są wyróżnione i oznaczone "(?)".
import ExcelJS from 'exceljs'
import { PROG_PEWNOSCI, type WynikRysunku } from './rysunki'
import { nazwaPliku, pobierzPlik } from './pobierz'

import { lokalizacja, t } from '@/i18n'

export interface MetaRysunku { zapytanie: string; plik: string; strona: number; zrodlo: string }

const NAGLOWEK: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF9C4' } }
const NIEPEWNE: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
const ZRODLA: Record<string, string> = { recznie: t('wpisane ręcznie'), tekst: t('warstwa tekstowa PDF'), ai: t('odczyt AI') }

function arkusz(wb: ExcelJS.Workbook, nazwa: string, meta: MetaRysunku, kolumny: [string, number][], wiersze: { wartosci: (string | number | null)[]; pewnosc?: number }[]) {
  const ws = wb.addWorksheet(nazwa)
  ws.getCell('A1').value = t('{0} · {1}, str. {2} · {3}', meta.zapytanie, meta.plik, meta.strona, ZRODLA[meta.zrodlo] ?? meta.zrodlo)
  ws.getCell('A1').font = { bold: true }
  ws.columns = kolumny.map(([, width]) => ({ width }))
  const n = ws.getRow(3)
  kolumny.forEach(([naglowek], i) => {
    const c = n.getCell(i + 1)
    c.value = naglowek
    c.font = { bold: true, size: 9 }
    c.fill = NAGLOWEK
    c.alignment = { wrapText: true, vertical: 'middle' }
  })
  wiersze.forEach((w, j) => {
    const r = ws.getRow(4 + j)
    const niepewny = w.pewnosc !== undefined && w.pewnosc < PROG_PEWNOSCI
    w.wartosci.forEach((v, i) => {
      const c = r.getCell(i + 1)
      c.value = v
      if (niepewny) c.fill = NIEPEWNE
    })
  })
  ws.views = [{ state: 'frozen', ySplit: 3 }]
  if (wiersze.length) ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + wiersze.length, column: kolumny.length } }
  return ws
}

const pew = (p: number) => (p < PROG_PEWNOSCI ? `${Math.round(p * 100)}% (?)` : `${Math.round(p * 100)}%`)

export async function zbudujExcelRysunku(w: WynikRysunku, meta: MetaRysunku, kategorie: { kod: string; nazwa: string }[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Wyceny i oferty'
  wb.created = new Date()
  arkusz(wb, t('Parametry'), meta, [[t('Parametr'), 40], [t('Przestrzeń'), 14], [t('Wartość'), 28], [t('Jednostka'), 11], [t('Pewność'), 10]],
    w.parametry.map((p) => ({ pewnosc: p.pewnosc, wartosci: [p.nazwa, p.przestrzen, p.wartosc, p.jednostka, pew(p.pewnosc)] })))
  arkusz(wb, t('Króćce'), meta, [[t('Oznaczenie'), 12], [t('Ilość'), 7], [t('DN / rozmiar'), 13], [t('PN / klasa'), 11], [t('Przyłącze'), 14], [t('Przeznaczenie'), 26], [t('Uwagi'), 50], [t('Pewność'), 10]],
    w.krocce.map((k) => ({ pewnosc: k.pewnosc, wartosci: [k.oznaczenie, k.ilosc, k.dn, k.pn, k.przylacze, k.przeznaczenie, k.uwagi, pew(k.pewnosc)] })))
  const kat = (kod: string) => kategorie.find((k) => k.kod === kod)?.nazwa ?? kod
  arkusz(wb, t('Wykaz części'), meta, [[t('Poz.'), 6], [t('Nazwa'), 40], [t('Ilość'), 7], [t('J.m.'), 6], [t('Materiał'), 16], [t('Norma'), 18], [t('Wymiary'), 18], [t('Masa jedn. [kg]'), 11], [t('Masa całk. [kg]'), 11], [t('Kategoria'), 18], [t('Uwagi'), 30], [t('Pewność'), 10]],
    w.pozycje.map((p) => ({
      pewnosc: p.pewnosc,
      wartosci: [p.poz, p.nazwa, p.ilosc, p.jm, p.material, p.norma, p.wymiary, p.masa_jedn, p.masa_calk ?? (p.masa_jedn !== null && p.ilosc !== null ? p.masa_jedn * p.ilosc : null), kat(p.sekcja), p.uwagi, pew(p.pewnosc)],
    })))
  const masa = w.pozycje.reduce((s, p) => s + (p.masa_calk ?? (p.masa_jedn ?? 0) * (p.ilosc ?? 0)), 0)
  const uwagi = arkusz(wb, t('Uwagi do wyceny'), meta, [[t('Uwaga'), 100]], w.uwagi.map((u) => ({ wartosci: [u] })))
  if (masa) {
    const r = uwagi.getRow(5 + w.uwagi.length)
    r.getCell(1).value = t('Suma mas z wykazu części: {0} kg (kontrola z masą na rysunku).', new Intl.NumberFormat(lokalizacja(), { maximumFractionDigits: 1 }).format(masa))
    r.getCell(1).font = { italic: true }
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

export async function pobierzExcelRysunku(w: WynikRysunku, meta: MetaRysunku, kategorie: { kod: string; nazwa: string }[]) {
  const bufor = await zbudujExcelRysunku(w, meta, kategorie)
  pobierzPlik(bufor, `${nazwaPliku(`${meta.zapytanie} ${meta.plik.replace(/\.pdf$/i, '')} str${meta.strona}`)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}
