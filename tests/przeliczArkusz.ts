// Mini-arkusz kalkulacyjny do testów eksportu Excel: przelicza formuły (SUM, IF, ROUND, odwołania do innych arkuszy)
// bez zapisanych wyników - sprawdza, że formuły w pliku dają kwoty aplikacji.
import type ExcelJS from 'exceljs'

/** Mini-arkusz kalkulacyjny: przelicza formuły (SUM, IF, ROUND, odwołania do innych arkuszy) bez zapisanych wyników. */
export function przelicz(wb: ExcelJS.Workbook) {
  const pamiec = new Map<string, number>()
  const wartosc = (ark: string, adr: string): number => {
    const k = `${ark}!${adr}`
    if (pamiec.has(k)) return pamiec.get(k)!
    const v = wb.getWorksheet(ark)!.getCell(adr.replace(/\$/g, '')).value as unknown
    const n = v && typeof v === 'object' && 'formula' in (v as object) ? licz(ark, (v as { formula: string }).formula) : Number(typeof v === 'number' ? v : 0)
    pamiec.set(k, n)
    return n
  }
  const zakres = (ark: string, a: string, b: string) => {
    const [, ka, wa] = /([A-Z]+)(\d+)/.exec(a.replace(/\$/g, ''))!
    const [, , wb2] = /([A-Z]+)(\d+)/.exec(b.replace(/\$/g, ''))!
    let s = 0
    for (let r = Number(wa); r <= Number(wb2); r++) s += wartosc(ark, `${ka}${r}`)
    return s
  }
  function licz(ark: string, f: string): number {
    const js = f
      .replace(/(?:'((?:[^']|'')+)'!)?(\$?[A-Z]+\$?\d+):(\$?[A-Z]+\$?\d+)/g, (_, a, x, y) => `Z(${JSON.stringify(a ? a.replace(/''/g, "'") : ark)},"${x}","${y}")`)
      .replace(/(?:'((?:[^']|'')+)'!)?(\$?[A-Z]{1,2}\$?\d+)(?![\w"])/g, (m, a, x) => (/^(SUM|IF|ROUND)$/.test(m) ? m : `V(${JSON.stringify(a ? a.replace(/''/g, "'") : ark)},"${x}")`))
      .replace(/SUM\(/g, 'S(').replace(/ROUND\(/g, 'R(').replace(/IF\(/g, 'I(')
      .replace(/([^<>=!])=([^=])/g, '$1===$2').replace(/<>/g, '!==')
    return Number(new Function('V', 'Z', 'S', 'R', 'I', `return (${js})`)(
      wartosc, zakres, (...x: number[]) => x.reduce((a, b) => a + b, 0),
      (x: number, n: number) => Math.round(x * 10 ** n) / 10 ** n, (w: boolean, a: number, b: number) => (w ? a : b),
    ))
  }
  return wartosc
}
