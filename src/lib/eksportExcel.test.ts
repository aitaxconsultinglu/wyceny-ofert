import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { zbudujKalkulacje } from './eksportExcel'
import { policzWycene, type ParametryKalk } from './kalkulacja'
import { klucz, nowyAparat, type Aparat, type PozycjaWyceny, type StanWyceny } from './wyceny'

// Dane FIKCYJNE: jeden aparat z każdą zakładką; formuły arkusza przeliczone w teście muszą dać kwoty aplikacji.
const poz = (zm: Partial<PozycjaWyceny>): PozycjaWyceny => ({
  klucz: klucz(), lp: 0, zakladka: 'materialy', sekcja: 'blachy', nazwa: 'x', ilosc: 1, jm: 'szt', cena_jedn: 0, jednostka_ceny: 'jm', zrodlo_ceny: 'recznie', dodatkowe: {}, ...zm,
})

function stanTestowy(metoda: 'wskaznikowa' | 'szczegolowa', ilosc = 2): StanWyceny {
  const a: Aparat = {
    ...nowyAparat(1, 'Zbiornik testowy'), ilosc, masa_netto_kg: 3000, metoda_robocizny: metoda, wskaznik_rbh_t: 150, stawka_wskaznikowa: 40, naddatki: { blachy: 10 },
    pozycje: [
      poz({ nazwa: 'Blacha', ilosc: 2, masa_reczna: true, masa_jedn: 250, cena_jedn: 6.5, jednostka_ceny: 'kg' }),
      poz({ nazwa: 'Dennica', ilosc: 2, cena_jedn: 1200, jednostka_ceny: 'jm' }),
      poz({ sekcja: 'zlaczne', nazwa: 'Śruby', ilosc: 40, cena_jedn: 3.2 }),
      poz({ zakladka: 'robocizna', sekcja: null, nazwa: 'Spawacz', ilosc: 120, jm: 'rbh', cena_jedn: 50, dodatkowe: { przedzial: '7-15' } }),
      poz({ zakladka: 'robocizna', sekcja: null, nazwa: 'Ślusarz', ilosc: 32, jm: 'rbh', cena_jedn: 45, dodatkowe: { przedzial: '15-19' } }),
      poz({ zakladka: 'kooperacja', sekcja: 'zwijanie', nazwa: 'Zwijanie płaszcza', ilosc: 1, cena_jedn: 1800 }),
      poz({ zakladka: 'badania', sekcja: null, nazwa: 'RT', ilosc: 12, jm: 'mb', cena_jedn: 90 }),
      poz({ zakladka: 'transport', sekcja: 'transport', nazwa: 'Dostawa', ilosc: 2, jm: 'kurs', cena_jedn: 8, dodatkowe: { km: 150 } }),
      poz({ zakladka: 'projekt', sekcja: null, nazwa: 'Projekt', ilosc: 1, cena_jedn: 0, wartosc_reczna: 3500 }),
    ],
  }
  return {
    wycena: {
      id: 'w1', zapytanie_id: 'z1', wersja: 1, nazwa: null, status: 'robocza', narzut_zakupowy_proc: 5, narzut_kooperacja_proc: 10, kurs_eur: 4.25, kurs_eur_data: '2026-10-01',
      kurs_eur_zrodlo: 'NBP', termin_realizacji_tyg: 12, montaz_tyg: null, uwagi: null, komentarz_prezesa: null, oferta: {}, podsumowanie: null, skopiowana_z: null,
      utworzono: '', zmodyfikowano: '', zatwierdzono: null,
    },
    marze: null,
    aparaty: [a],
    zapytanie: { id: 'z1', numer: 'ZO/1/2026', przedmiot: 'Zbiornik testowy', klient: 'Klient testowy', rodzaj_aparatu: 'zbiornik', zakres_wymiennika: null, zakres_opis: null },
  }
}

const par = (zysk: number, zaokr: number): ParametryKalk => ({
  narzut_zakupowy_proc: 5, narzut_kooperacja_proc: 10, narzut_zysk_proc: zysk, zaokraglenie: zaokr, korekta_prezesa_kwota: 100, korekta_prezesa_proc: -1, kurs_eur: 4.25,
  sposobMasy: () => 'brak', gestosc: () => 7.85, naddatekDomyslny: () => 0,
})
const S = { kategorieMaterialow: [], kategorieUslug: [] }

/** Mini-arkusz kalkulacyjny: przelicza formuły (SUM, IF, ROUND, odwołania do innych arkuszy) bez zapisanych wyników. */
function przelicz(wb: ExcelJS.Workbook) {
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

const kolumnaB = (ws: ExcelJS.Worksheet, etykieta: string) => {
  let adres: string | null = null
  ws.eachRow((r, n) => { if (r.getCell(1).value === etykieta) adres = `B${n}` })
  return adres
}

describe('eksport Excel w układzie arkusza wzorcowego', () => {
  for (const [metoda, zysk, zaokr] of [['wskaznikowa', 25, 0], ['szczegolowa', 18, 100]] as const) {
    it(`formuły dają kwoty aplikacji (${metoda}, zysk ${zysk}%, zaokrąglenie ${zaokr})`, async () => {
      const stan = stanTestowy(metoda)
      const p = par(zysk, zaokr)
      const wynik = policzWycene(stan.aparaty, p)
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await zbudujKalkulacje(stan, wynik, p, S, true))
      expect(wb.worksheets.map((x) => x.name)).toEqual(['Wycena', 'Robocizna', 'Materiały', 'Kooperacja', 'Badania-odbiory-transport'])
      const op = wb.getWorksheet('Wycena')!
      const V = przelicz(wb)
      const sprawdz = (et: string, oczekiwana: number | null) => {
        const adr = kolumnaB(op, et)
        expect(adr, et).not.toBeNull()
        const komorka = op.getCell(adr!).value as { formula?: string }
        expect(komorka.formula, et).toBeTruthy()
        expect(V('Wycena', adr!), et).toBeCloseTo(oczekiwana ?? 0, 2)
      }
      sprawdz('Robocizna', wynik.robocizna.koszt)
      sprawdz('Materiały', wynik.materialy.koszt)
      sprawdz('Kooperacja', wynik.kooperacja.koszt)
      sprawdz('Badania, odbiory, transport, projekt', wynik.badania.koszt)
      sprawdz('Koszty całkowite', wynik.koszty.koszt)
      sprawdz('Zysk', wynik.zysk)
      sprawdz('CENA', wynik.cena)
      sprawdz('CENA KOŃCOWA (netto)', wynik.cena_koncowa)
      sprawdz('Cena w EUR', wynik.cena_koncowa_eur)
    })
  }

  it('bez prawa do marż: koszty tak, ceny i zysku nie ma; etykiety po angielsku', async () => {
    const stan = stanTestowy('wskaznikowa', 1)
    const p = par(25, 0)
    const wynik = policzWycene(stan.aparaty, p)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await zbudujKalkulacje(stan, wynik, p, S, false, null, 'en'))
    expect(wb.worksheets.map((x) => x.name)).toEqual(['Quote', 'Labour', 'Materials', 'Subcontracting', 'Tests-inspections-transport'])
    const op = wb.getWorksheet('Quote')!
    expect(kolumnaB(op, 'Total costs')).not.toBeNull()
    expect(kolumnaB(op, 'FINAL PRICE (net)')).toBeNull()
    expect(przelicz(wb)('Quote', kolumnaB(op, 'Total costs')!)).toBeCloseTo(wynik.koszty.koszt, 2)
  })
})
