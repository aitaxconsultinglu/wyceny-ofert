// Karta dostawy Optimy wydrukowana do PDF (warstwa tekstowa, bez AI) -> wiersze w układzie kolumn wydruku XLS, które czyta
// parsujKarteDostawy (importOptima.ts) - ten sam parser, te same reguły i ta sama kontrola sumy ze stopką.
// Kolumny wydruku mają stałe położenie na stronie A4 (części szerokości strony); tekst z jednej kolumny w jednym wierszu
// jest sklejany (PDF z Optimy dzieli wyrazy na polskich znakach: "PRZEDSI" + "Ę" + "BIORSTWO").
import type { ElementTekstu } from './rysunki'
import { liczbaPL, type WierszArkusza } from './importOptima'

/** Granice kolumn jako część szerokości strony (A4 595 pt): nazwa | ilość | j.m. | zrealizowana | cena | wartość | data | status. */
const GRANICE: [number, number][] = [
  [270 / 595, 7], [298 / 595, 8], [330 / 595, 9], [350 / 595, 10], [392 / 595, 11], [435 / 595, 13], [490 / 595, 15],
]
/** Liczby są wyrównane do prawej: kolumnę wyznacza prawa krawędź (ilość | zrealizowana | cena | wartość). */
const GRANICE_LICZB: [number, number][] = [[324 / 595, 9], [372 / 595, 10], [413 / 595, 11], [440 / 595, 13]]
const NR_ZAMOWIENIA = /^Z[A-Z]\/\d+\/\d{4}$/
const LICZBA = /^-?\d{1,3}(?:[\s ]\d{3})*(?:,\d+)?$|^-?\d+(?:,\d+)?$/
const DATA = /^(\d{2})\.(\d{2})\.(\d{4})$/

const kolumna = (e: ElementTekstu, szer: number) => {
  const t = e.str.trim()
  if (LICZBA.test(t) && e.x >= GRANICE[0][0] * szer - 20) {
    let k = 7
    for (const [g, nr] of GRANICE_LICZB) if (e.x + e.w > g * szer) k = nr
    return k
  }
  let k = 0
  for (const [g, nr] of GRANICE) if (e.x >= g * szer) k = nr
  return k
}

/** Elementy jednego wiersza (ta sama linia bazowa ±2 pt), posortowane od lewej. */
function wierszeStrony(el: ElementTekstu[]): ElementTekstu[][] {
  const wiersze: ElementTekstu[][] = []
  for (const e of [...el].filter((x) => x.str.trim()).sort((a, b) => a.y - b.y || a.x - b.x)) {
    const w = wiersze.find((r) => Math.abs(r[0].y - e.y) <= 2)
    if (w) w.push(e); else wiersze.push([e])
  }
  return wiersze.map((r) => r.sort((a, b) => a.x - b.x))
}

/** Tekst z elementów: bez spacji między kawałkami jednego wyrazu, ze spacją przy odstępie. */
function sklej(el: ElementTekstu[]): string {
  let s = ''
  let koniec: number | null = null
  for (const e of el) {
    if (koniec !== null && e.x - koniec > 1.5 && !s.endsWith(' ') && !e.str.startsWith(' ')) s += ' '
    s += e.str
    koniec = e.x + e.w
  }
  return s.replace(/\s+/g, ' ').trim()
}

/** Data "dd.mm.rrrr" jako liczba seryjna Excela - jak w wydruku XLS. */
const seryjna = (d: string) => { const [, dd, mm, rr] = DATA.exec(d)!; return Date.UTC(Number(rr), Number(mm) - 1, Number(dd)) / 86400000 + 25569 }

export function wierszeKartyZPdf(strony: { elementy: ElementTekstu[]; szerPt: number }[]): WierszArkusza[] {
  const wynik: WierszArkusza[] = []
  for (const { elementy, szerPt } of strony) {
    for (const r of wierszeStrony(elementy)) {
      const kol = new Map<number, ElementTekstu[]>()
      for (const e of r) { const k = kolumna(e, szerPt); kol.set(k, [...(kol.get(k) ?? []), e]) }
      const w: WierszArkusza = []
      for (const [k, el] of kol) w[k] = sklej(el)
      const c0 = String(w[0] ?? '')
      // Wiersz zamówienia: numer i dostawca (nazwa dostawcy sięga kolumny ilości - całość po numerze to dostawca).
      const nr = /^(Z[A-Z]\/\d+\/\d{4})\s*(.*)$/.exec(c0)
      if (nr && NR_ZAMOWIENIA.test(nr[1])) {
        wynik.push([nr[1], '', r[0].str.trim() === nr[1] ? sklej(r.slice(1)) : nr[2]])
        continue
      }
      // Liczby jak w XLS; data dostawy jako liczba seryjna, status obok.
      for (const k of [7, 9, 10, 11]) if (typeof w[k] === 'string' && LICZBA.test(w[k] as string)) w[k] = liczbaPL(w[k] as string)
      if (typeof w[13] === 'string' && DATA.test(w[13] as string)) w[13] = seryjna(w[13] as string)
      else if (w[13] === undefined && w[15] !== undefined) { w[13] = w[15]; w[15] = undefined }
      // Suma zamówienia: sama kwota w kolumnie wartości - w XLS jest w kolumnie 9.
      const pelne = w.map((x, i) => (x !== undefined && x !== '' ? i : -1)).filter((i) => i >= 0)
      if (pelne.length === 1 && pelne[0] === 11 && typeof w[11] === 'number') { w[9] = w[11]; w[11] = undefined }
      for (let i = 0; i < w.length; i++) if (w[i] === undefined) w[i] = null
      wynik.push(w)
    }
  }
  return wynik
}
