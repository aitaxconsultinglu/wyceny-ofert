// Kalkulacja w Excelu w układzie arkusza wzorcowego wyceny: Wycena (opinia o zapytaniu z oceną ekonomiczną), a dla każdego
// aparatu Robocizna (pracochłonność), Materiały, Kooperacja oraz Badania, odbiory, transport. Sumy, masy, koszty pozycji,
// naddatki, narzuty, zysk i cena są formułami (z zapisanym wynikiem), więc arkusz da się dalej przeliczać w Excelu.
// Etykiety w języku wybranym przy eksporcie (PL / EN).
import ExcelJS from 'exceljs'
import { policzAparat, policzPozycje, type ParametryKalk, type WynikWyceny } from './kalkulacja'
import type { StanWyceny } from './wyceny'
import { logoFirmy, nazwaPliku, pobierzPlik } from './pobierz'
import type { DaneFirmy, KategoriaMaterialu, KategoriaUslugi } from './types'
import { ETYKIETY_STANU, type KartaAnalizy } from './analiza'
import { PRZEDZIALY_CZASU, type DodatkoweRobocizny } from './robocizna'
import { jezyk as jezykInterfejsu, nazwaWJezyku, tj, type Jezyk, type KluczTlumaczenia } from '@/i18n'

const ZL = '#,##0.00'
const KG = '#,##0.0'
const RAMKA: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFB0B7C3' } }, bottom: { style: 'thin', color: { argb: 'FFB0B7C3' } },
  left: { style: 'thin', color: { argb: 'FFB0B7C3' } }, right: { style: 'thin', color: { argb: 'FFB0B7C3' } },
}
const NAGLOWEK_TLO: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF9C4' } }
const SEKCJA_TLO: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDFF3FB' } }
const NIEPEWNE: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }

interface Slowniki { kategorieMaterialow: KategoriaMaterialu[]; kategorieUslug: KategoriaUslugi[]; ustawienia?: { firma?: DaneFirmy } }

type Wartosc = string | number | null | undefined | { formula: string; result: number | null }
/** Formuła z zapisanym wynikiem (plik otwiera się z wartościami, także bez przeliczenia). */
const F = (formula: string, result: number | null | undefined): Wartosc => ({ formula, result: result ?? null })
/** Odwołanie do komórki innego arkusza: 'A1 Materiały'!Q12. */
const ref = (arkusz: string, kol: string, wiersz: number) => `'${arkusz.replace(/'/g, "''")}'!${kol}${wiersz}`

function naglowek(ws: ExcelJS.Worksheet, tytul: string, podtytul: string, logo: number | null, firma: string) {
  if (logo !== null) ws.addImage(logo, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 32 } })
  ws.getCell('C1').value = firma
  ws.getCell('C1').font = { bold: true, size: 12 }
  ws.getCell('C2').value = tytul
  ws.getCell('C2').font = { bold: true, size: 11 }
  ws.getCell('C3').value = podtytul
  ws.getCell('C3').font = { size: 9, color: { argb: 'FF64748B' } }
  ws.getRow(1).height = 20
  return 5
}

function wierszTabeli(ws: ExcelJS.Worksheet, nr: number, wartosci: Wartosc[], opcje: { naglowek?: boolean; pogrubiony?: boolean; formaty?: (string | undefined)[]; tlo?: ExcelJS.Fill } = {}) {
  const r = ws.getRow(nr)
  wartosci.forEach((v, i) => {
    const c = r.getCell(i + 1)
    c.value = (v === undefined ? null : v) as ExcelJS.CellValue
    c.border = RAMKA
    if (opcje.naglowek) { c.font = { bold: true, size: 9 }; c.fill = NAGLOWEK_TLO; c.alignment = { wrapText: true, vertical: 'middle' } }
    if (opcje.pogrubiony) c.font = { bold: true }
    if (opcje.tlo) c.fill = opcje.tlo
    const f = opcje.formaty?.[i]
    if (f && v !== null && v !== undefined && typeof v !== 'string') c.numFmt = f
  })
  return nr + 1
}

/** Pusty wiersz z wartościami w wybranych kolumnach (A=1). */
const w = (n: number, wart: Record<number, Wartosc>) => Array.from({ length: n }, (_, i) => wart[i + 1] ?? '')

export async function eksportujKalkulacje(stan: StanWyceny, wynik: WynikWyceny, par: ParametryKalk, s: Slowniki, widziMarze: boolean, analiza: KartaAnalizy | null = null, j: Jezyk = jezykInterfejsu()) {
  const bufor = await zbudujKalkulacje(stan, wynik, par, s, widziMarze, analiza, j)
  const nazwa = j === 'en' ? `${stan.zapytanie.numer} calculation v${stan.wycena.wersja}` : `${stan.zapytanie.numer} kalkulacja v${stan.wycena.wersja}`
  pobierzPlik(bufor, `${nazwaPliku(nazwa)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}

/** Karta analizy (pod opinią o zapytaniu w zakładce Wycena). */
function kartaAnalizy(an: ExcelJS.Worksheet, r: number, k: KartaAnalizy, j: Jezyk) {
  const L = (x: KluczTlumaczenia, ...a: unknown[]) => tj(j, x, ...a)
  const p = k.podsumowanie
  r++
  r = wierszTabeli(an, r, [L('KARTA ANALIZY ZAPYTANIA'), '', ''], { naglowek: true })
  for (const [et, v] of [
    [L('Nr zapytania klienta'), p.nr_zapytania_klienta], [L('Miejsce dostawy / warunki'), [p.miejsce_dostawy, p.warunki_dostawy].filter(Boolean).join(' · ')],
    [L('Termin złożenia oferty'), p.termin_oferty], [L('Termin realizacji / postój'), [p.termin_realizacji, p.postoj].filter(Boolean).join(' · ')],
    [L('Ważność / gwarancja / płatność'), [p.waznosc_oferty, p.gwarancja, p.platnosc].filter(Boolean).join(' · ')], [L('Dokumenty oferty'), p.dokumenty_oferty],
  ] as [string, string][]) if (v.trim()) r = wierszTabeli(an, r, [et, v])
  r++
  r = wierszTabeli(an, r, [L('Wymaganie kosztotwórcze'), L('Opis'), L('Stan / wpływ')], { naglowek: true })
  for (const x of k.wymagania.filter((y) => y.stan === 'wymagane' || y.stan === 'do_wyjasnienia')) {
    r = wierszTabeli(an, r, [x.nazwa, [x.opis, x.zrodlo && `(${x.zrodlo})`].filter(Boolean).join(' '), `${ETYKIETY_STANU[x.stan]}${x.wplyw ? ` / ${x.wplyw}` : ''}`],
      { tlo: x.stan === 'do_wyjasnienia' ? NIEPEWNE : undefined })
  }
  if (k.uslugi.length) {
    r++
    r = wierszTabeli(an, r, [L('Usługa do zapytania'), L('Zakres'), L('Ilość')], { naglowek: true })
    for (const u of k.uslugi) r = wierszTabeli(an, r, [u.kategoria ?? 'inne', [u.opis, u.uwagi].filter(Boolean).join(' - '), u.ilosc ? `${u.ilosc} ${u.jm}` : ''])
  }
  if (k.pytania.length || k.niespojnosci.length) {
    r++
    r = wierszTabeli(an, r, [L('Pytania do klienta / niespójności'), '', ''], { naglowek: true })
    for (const q of k.pytania) r = wierszTabeli(an, r, [L('pytanie'), q.tresc, q.odpowiedz || L('bez odpowiedzi')])
    for (const n of k.niespojnosci) r = wierszTabeli(an, r, [L('niespójność'), n.opis, n.zrodla], { tlo: NIEPEWNE })
  }
  const o = k.ocena
  r++
  r = wierszTabeli(an, r, [L('Ocena działów'), '', ''], { naglowek: true })
  const komplet = ([[L('arkusz danych'), o.kompletnosc.arkusz_danych], [L('dokumentacja wykonawcza'), o.kompletnosc.dokumentacja_wykonawcza], [L('dokumentacja koncesyjna'), o.kompletnosc.dokumentacja_koncesyjna], [L('szkic / rysunek założeniowy'), o.kompletnosc.szkic]] as [string, boolean][])
    .filter(([, v]) => v).map(([n]) => n).join(', ')
  const podpis = (b: keyof NonNullable<typeof o.podpisy>) => (o.podpisy?.[b] ? ` (${o.podpisy[b]!.kto}, ${o.podpisy[b]!.kiedy.slice(0, 10)})` : '')
  for (const [et, v] of [
    [L('Kompletność dokumentacji'), komplet && komplet + podpis('kompletnosc')],
    [L('Ocena technologiczna'), [o.technologiczna, o.uwagi_technologiczne].filter(Boolean).join(' - ') + podpis('technologiczna')],
    [L('Ocena spawalnicza'), o.spawalnicza && o.spawalnicza + podpis('spawalnicza')],
    ...o.terminy_materialow.filter((x) => x.termin.trim()).map((x) => [L('Termin zakupu: {0}', x.grupa), x.termin]),
    [L('Istotne problemy i wpływ na termin'), o.problemy ?? ''],
    [L('Przygotowanie oferty'), [o.plan_jakosci && L('plan jakości'), o.zmiana_terminu && L('proponowana zmiana terminu'), o.uwagi].filter(Boolean).join('; ')],
    [L('Ryzyka i uwagi'), k.uwagi],
  ] as [string, string][]) if (v?.trim()) r = wierszTabeli(an, r, [et, v])
  return r
}

/** Wiersze sum arkusza aparatu (numery wierszy) - do formuł oceny ekonomicznej w zakładce Wycena. */
interface SumyAparatu { robocizna: string; materialy: string; kooperacja: string; badania: string }

/** Skoroszyt kalkulacji jako bufor (bez pobierania - używane też w teście lokalnym). */
export async function zbudujKalkulacje(stan: StanWyceny, wynik: WynikWyceny, par: ParametryKalk, s: Slowniki, widziMarze: boolean, analiza: KartaAnalizy | null = null, j: Jezyk = 'pl'): Promise<ArrayBuffer> {
  const L = (x: KluczTlumaczenia, ...a: unknown[]) => tj(j, x, ...a)
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Wyceny i oferty'
  wb.created = new Date()
  const logoDane = logoFirmy(s.ustawienia?.firma)
  const logo = logoDane ? wb.addImage({ buffer: logoDane, extension: 'png' }) : null
  const firma = s.ustawienia?.firma?.nazwa ?? ''
  const naglowekArkusza = (ws: ExcelJS.Worksheet, tytul: string, pod: string) => naglowek(ws, tytul, pod, logo, firma)
  const wyc = stan.wycena
  const podtytul = `${stan.zapytanie.numer} · ${stan.zapytanie.przedmiot}${stan.zapytanie.klient ? ` · ${stan.zapytanie.klient}` : ''} · ${L('wycena v{0}', wyc.wersja)} (${wyc.status})`

  // Zakładka Wycena jako pierwsza (wypełniana na końcu - formuły odwołują się do sum zakładek aparatów).
  const op = wb.addWorksheet(L('Wycena'))
  const sumy: SumyAparatu[] = []

  stan.aparaty.forEach((a, ia) => {
    const k = policzAparat(a, par)
    const pref = stan.aparaty.length > 1 ? `A${ia + 1} ` : ''
    const tyt = L('{0} - {1} szt., masa netto {2} kg', a.nazwa, a.ilosc, a.masa_netto_kg ?? '?')
    const nazwaArk = (x: string) => `${pref}${x}`.slice(0, 31)

    // --- Robocizna (pracochłonność) ---
    const nR = nazwaArk(L('Robocizna'))
    const p = wb.addWorksheet(nR)
    let rp = naglowekArkusza(p, `${L('ZESTAWIENIE PRACOCHŁONNOŚCI DLA 1 SZT.')} - ${tyt}`, podtytul)
    p.columns = [6, 32, 14, 12, 14, 14, 10, 18, 26].map((width) => ({ width }))
    let razemRob: number
    if (a.metoda_robocizny === 'wskaznikowa') {
      rp = wierszTabeli(p, rp, [L('L.p.'), L('Przyjęto'), L('j.m.'), L('Ilość'), '', L('Wartość')], { naglowek: true })
      const r0 = rp
      rp = wierszTabeli(p, rp, [1, L('Ciężar NETTO'), 't', (a.masa_netto_kg ?? 0) / 1000], { formaty: [undefined, undefined, undefined, '#,##0.000'] })
      rp = wierszTabeli(p, rp, [2, L('Wskaźnik pracochłonności'), 'rbh/t', a.wskaznik_rbh_t ?? 0])
      rp = wierszTabeli(p, rp, [3, L('Ilość rbh'), 'rbh', F(`D${r0}*D${r0 + 1}`, k.robocizna.rbh), '', k.robocizna.dni !== null ? L('{0} dni przy {1} os.', k.robocizna.dni.toFixed(1), a.liczba_osob) : ''], { formaty: [undefined, undefined, undefined, KG] })
      rp = wierszTabeli(p, rp, [4, L('Stawka średnia'), L('PLN/rbh'), a.stawka_wskaznikowa ?? 0, '', F(`D${r0 + 2}*D${r0 + 3}`, k.robocizna.wartosc)], { formaty: [undefined, undefined, undefined, ZL, undefined, ZL] })
      rp++
      razemRob = rp
      rp = wierszTabeli(p, rp, ['', L('RAZEM'), 'rbh', F(`D${r0 + 2}`, k.robocizna.rbh), '', F(`F${r0 + 3}`, k.robocizna.wartosc)], { pogrubiony: true, formaty: [undefined, undefined, undefined, KG, undefined, ZL] })
    } else {
      rp = wierszTabeli(p, rp, [L('L.p.'), L('Stanowisko'), L('Przedział czasu'), L('Ilość rbh'), L('Stawka PLN/rbh'), L('Wartość PLN'), 'MPK', L('Technolog'), L('Uwagi')], { naglowek: true })
      const r0 = rp
      a.pozycje.filter((x) => x.zakladka === 'robocizna').forEach((x, i) => {
        const dod = (x.dodatkowe ?? {}) as DodatkoweRobocizny
        const przedzial = PRZEDZIALY_CZASU.find((y) => y.kod === dod.przedzial)?.nazwa ?? dod.przedzial ?? ''
        const wart = x.wartosc_reczna ?? x.ilosc * x.cena_jedn
        rp = wierszTabeli(p, rp, [i + 1, x.nazwa, przedzial, x.ilosc, x.cena_jedn, x.wartosc_reczna !== null && x.wartosc_reczna !== undefined ? wart : F(`D${rp}*E${rp}`, wart), x.mpk ?? '', dod.technolog ?? '', x.uwagi ?? ''],
          { formaty: [undefined, undefined, undefined, KG, ZL, ZL] })
      })
      const r1 = Math.max(rp - 1, r0)
      rp++
      razemRob = rp
      rp = wierszTabeli(p, rp, ['', L('RAZEM'), '', F(`SUM(D${r0}:D${r1})`, k.robocizna.rbh), '', F(`SUM(F${r0}:F${r1})`, k.robocizna.wartosc)], { pogrubiony: true, formaty: [undefined, undefined, undefined, KG, undefined, ZL] })
      rp = wierszTabeli(p, rp, ['', L('Średnia stawka'), '', '', F(`IF(D${razemRob}>0,F${razemRob}/D${razemRob},0)`, k.robocizna.srednia_stawka ?? 0)], { formaty: [undefined, undefined, undefined, undefined, ZL] })
    }
    const masaT = (a.masa_netto_kg ?? 0) / 1000
    rp = wierszTabeli(p, rp, ['', L('Ilość rbh/t'), 'rbh/t', masaT > 0 ? F(`D${razemRob}/${masaT}`, k.robocizna.rbh_na_t ?? 0) : ''], { formaty: [undefined, undefined, undefined, KG] })
    if (a.ilosc !== 1) wierszTabeli(p, rp, ['', L('Pracochłonność dla {0} szt.', a.ilosc), 'rbh', F(`D${razemRob}*${a.ilosc}`, k.robocizna.rbh * a.ilosc), '', F(`F${razemRob}*${a.ilosc}`, k.robocizna.wartosc * a.ilosc)], { formaty: [undefined, undefined, undefined, KG, undefined, ZL] })

    // --- Materiały ---
    const nM = nazwaArk(L('Materiały'))
    const m = wb.addWorksheet(nM)
    let rm = naglowekArkusza(m, `${L('ZESTAWIENIE MATERIAŁOWE DLA 1 SZT.')} - ${tyt}`, podtytul)
    m.columns = [6, 26, 14, 14, 8, 8, 7, 8, 8, 8, 8, 6, 10, 11, 10, 7, 13, 28, 22].map((width) => ({ width }))
    rm = wierszTabeli(m, rm, [L('L.p.'), L('Przeznaczenie'), L('Rodzaj'), L('Gatunek'), L('φ zew'), L('φ wew'), 'g', 'b', 'l', 'DN', L('Ilość'), L('j.m.'), L('Masa jedn. kg'), L('Masa całk. kg'), L('Cena'), L('za'), L('Koszt PLN'), L('Źródło ceny'), L('Uwagi')], { naglowek: true })
    const razemSekcji: number[] = []
    for (const sek of k.materialy.sekcje) {
      const kat = s.kategorieMaterialow.find((x) => x.kod === sek.sekcja)
      const nazwaSek = kat ? nazwaWJezyku(kat, j) : sek.sekcja
      m.mergeCells(rm, 1, rm, 19)
      m.getCell(rm, 1).value = nazwaSek; m.getCell(rm, 1).font = { bold: true }; m.getCell(rm, 1).fill = SEKCJA_TLO
      rm++
      const r0 = rm
      a.pozycje.filter((x) => x.zakladka === 'materialy' && (x.sekcja ?? 'inne') === sek.sekcja).forEach((x, i) => {
        const wp = policzPozycje(x, par)
        const reczna = x.wartosc_reczna !== null && x.wartosc_reczna !== undefined
        const koszt: Wartosc = reczna ? wp.koszt : x.jednostka_ceny === 'kg' ? F(`N${rm}*O${rm}`, wp.koszt) : x.jednostka_ceny === 'jm' ? F(`K${rm}*O${rm}`, wp.koszt) : wp.koszt
        rm = wierszTabeli(m, rm, [i + 1, x.nazwa, x.rodzaj ?? '', x.gatunek ?? '', x.d_zew ?? null, x.d_wew ?? null, x.grubosc ?? null, x.szerokosc ?? null, x.dlugosc ?? null, x.dn ?? '',
          x.ilosc, x.jm, wp.masa_jedn, wp.masa_jedn !== null ? F(`K${rm}*M${rm}`, wp.masa_calk) : null, x.cena_jedn || null, x.jednostka_ceny === 'jm' ? `zł/${x.jm}` : `zł/${x.jednostka_ceny}`, koszt,
          x.zrodlo_ceny === 'recznie' ? L('ręcznie') : `${x.zrodlo_ceny} ${x.zrodlo_dostawca ?? ''} ${x.zrodlo_data ?? ''}`.trim(), [x.opcjonalna ? L('OPCJA') : '', x.uwagi ?? ''].filter(Boolean).join(' ')],
        { formaty: [undefined, undefined, undefined, undefined, KG, KG, KG, KG, KG, undefined, KG, undefined, '#,##0.000', KG, ZL, undefined, ZL] })
      })
      const r1 = Math.max(rm - 1, r0)
      const rN = rm
      rm = wierszTabeli(m, rm, w(19, { 2: L('Naddatki technologiczne [%]'), 15: sek.naddatek_proc, 17: F(`SUM(Q${r0}:Q${r1})*O${rN}/100`, sek.naddatek) }), { formaty: [...Array(16).fill(undefined), ZL] })
      razemSekcji.push(rm)
      rm = wierszTabeli(m, rm, w(19, { 2: L('RAZEM {0}', nazwaSek), 14: F(`SUM(N${r0}:N${r1})`, sek.masa), 17: F(`SUM(Q${r0}:Q${r1})+Q${rN}`, sek.razem) }), { pogrubiony: true, formaty: [...Array(13).fill(undefined), KG, undefined, undefined, ZL] })
      rm++
    }
    const sumaSekcji = (kol: string) => (razemSekcji.length ? razemSekcji.map((x) => `${kol}${x}`).join('+') : '0')
    const rK = rm
    rm = wierszTabeli(m, rm, w(19, { 2: L('KOSZT MATERIAŁÓW (z naddatkami)'), 17: F(sumaSekcji('Q'), k.materialy.koszt) }), { pogrubiony: true, formaty: [...Array(16).fill(undefined), ZL] })
    const rNz = rm
    rm = wierszTabeli(m, rm, w(19, { 2: L('Koszty zakupu (narzut zakupowy) [%]'), 15: par.narzut_zakupowy_proc, 17: F(`Q${rK}*O${rNz}/100`, k.materialy.narzut_zakupowy) }), { formaty: [...Array(16).fill(undefined), ZL] })
    const rMat = rm
    rm = wierszTabeli(m, rm, w(19, { 2: L('MATERIAŁY Z NARZUTEM (1 szt.)'), 17: F(`Q${rK}+Q${rNz}`, k.materialy.razem) }), { pogrubiony: true, formaty: [...Array(16).fill(undefined), ZL] })
    rm = wierszTabeli(m, rm, w(19, { 2: L('Ciężar BRUTTO [kg]'), 14: F(sumaSekcji('N'), k.materialy.masa_brutto) }), { formaty: [...Array(13).fill(undefined), KG] })
    if (a.ilosc !== 1) wierszTabeli(m, rm, w(19, { 2: L('Materiały dla {0} szt.', a.ilosc), 14: F(`N${rm - 1}*${a.ilosc}`, k.materialy.masa_brutto * a.ilosc), 17: F(`Q${rMat}*${a.ilosc}`, k.materialy.razem * a.ilosc) }), { pogrubiony: true, formaty: [...Array(13).fill(undefined), KG, undefined, undefined, ZL] })

    // --- Kooperacja ---
    const nK = nazwaArk(L('Kooperacja'))
    const ko = wb.addWorksheet(nK)
    let rk = naglowekArkusza(ko, `${L('KOOPERACJA DLA 1 SZT.')} - ${tyt}`, podtytul)
    ko.columns = [6, 24, 34, 9, 9, 9, 9, 9, 12, 14, 26].map((width) => ({ width }))
    rk = wierszTabeli(ko, rk, [L('L.p.'), L('Kategoria'), L('Nazwa elementu, robót'), L('śr. 1'), L('śr. 2'), L('grubość'), L('wys.'), L('Ilość'), L('Cena jedn.'), L('Wartość PLN'), L('Źródło / uwagi')], { naglowek: true })
    const rk0 = rk
    a.pozycje.filter((x) => x.zakladka === 'kooperacja').forEach((x, i) => {
      const kat = s.kategorieUslug.find((c) => c.kod === x.sekcja)
      const koszt = policzPozycje(x, par).koszt
      rk = wierszTabeli(ko, rk, [i + 1, kat ? nazwaWJezyku(kat, j) : '', x.nazwa, x.d_zew ?? null, x.d_wew ?? null, x.grubosc ?? null, x.dlugosc ?? null, x.ilosc, x.cena_jedn,
        x.wartosc_reczna !== null && x.wartosc_reczna !== undefined ? koszt : F(`H${rk}*I${rk}`, koszt),
        [x.opcjonalna ? L('OPCJA') : '', x.zrodlo_ceny !== 'recznie' ? `${x.zrodlo_dostawca ?? ''} ${x.zrodlo_data ?? ''}` : '', x.uwagi ?? ''].filter(Boolean).join(' ')],
      { formaty: [undefined, undefined, undefined, KG, KG, KG, KG, KG, ZL, ZL] })
    })
    const rk1 = Math.max(rk - 1, rk0)
    rk++
    const rkS = rk
    rk = wierszTabeli(ko, rk, w(10, { 3: L('RAZEM'), 10: F(`SUM(J${rk0}:J${rk1})`, k.kooperacja.koszt) }), { formaty: [...Array(9).fill(undefined), ZL] })
    const rkN = rk
    rk = wierszTabeli(ko, rk, w(10, { 3: L('Narzut na kooperację [%]'), 9: par.narzut_kooperacja_proc, 10: F(`J${rkS}*I${rkN}/100`, k.kooperacja.narzut) }), { formaty: [...Array(9).fill(undefined), ZL] })
    const rKoop = rk
    wierszTabeli(ko, rk, w(10, { 3: L('RAZEM Kooperacja (1 szt.)'), 10: F(`J${rkS}+J${rkN}`, k.kooperacja.razem) }), { pogrubiony: true, formaty: [...Array(9).fill(undefined), ZL] })

    // --- Badania, odbiory, transport ---
    const nB = nazwaArk(L('Badania-odbiory-transport'))
    const b = wb.addWorksheet(nB)
    let rb = naglowekArkusza(b, `${L('BADANIA, ODBIORY, PROJEKT, TRANSPORT DLA 1 SZT.')} - ${tyt}`, podtytul)
    b.columns = [6, 36, 10, 10, 12, 14, 26].map((width) => ({ width }))
    const razemBlokow: number[] = []
    for (const [zak, tytul] of [['projekt', L('Projekt')], ['badania', L('Badania i odbiory')], ['transport', L('Transport i sprzęt ciężki')], ['inne', L('Inne')]] as const) {
      b.mergeCells(rb, 1, rb, 7)
      b.getCell(rb, 1).value = tytul; b.getCell(rb, 1).font = { bold: true }; b.getCell(rb, 1).fill = SEKCJA_TLO
      rb++
      rb = wierszTabeli(b, rb, zak === 'transport' ? [L('L.p.'), L('Trasa'), 'km', L('Kursów'), 'zł/km', L('Wartość PLN'), L('Uwagi')] : [L('L.p.'), L('Nazwa'), L('Ilość'), L('j.m.'), L('Cena jedn.'), L('Wartość PLN'), L('Uwagi')], { naglowek: true })
      const r0 = rb
      a.pozycje.filter((x) => x.zakladka === zak).forEach((x, i) => {
        const wart = policzPozycje(x, par).koszt
        const reczna = x.wartosc_reczna !== null && x.wartosc_reczna !== undefined
        const km = Number(x.dodatkowe?.km ?? 0) || null
        rb = wierszTabeli(b, rb, zak === 'transport'
          ? [i + 1, x.nazwa, km, x.ilosc, x.cena_jedn, reczna ? wart : F(km ? `C${rb}*D${rb}*E${rb}` : `D${rb}*E${rb}`, wart), [x.dodatkowe?.ponadgabaryt ? L('ponadgabaryt') : '', x.uwagi ?? ''].filter(Boolean).join(' ')]
          : [i + 1, x.nazwa, x.ilosc, x.jm, x.cena_jedn, reczna ? wart : F(`C${rb}*E${rb}`, wart), [x.opcjonalna ? L('OPCJA') : '', x.uwagi ?? ''].filter(Boolean).join(' ')],
        { formaty: [undefined, undefined, KG, undefined, ZL, ZL] })
      })
      const suma = { projekt: k.badania.projekt, badania: k.badania.badania, transport: k.badania.transport, inne: k.badania.inne }[zak]
      razemBlokow.push(rb)
      // Pusty blok: suma 0 (zakres SUM wskazywałby na wiersz RAZEM - odwołanie cykliczne).
      rb = wierszTabeli(b, rb, w(6, { 2: L('RAZEM {0}', tytul), 6: rb > r0 ? F(`SUM(F${r0}:F${rb - 1})`, suma) : 0 }), { pogrubiony: true, formaty: [...Array(5).fill(undefined), ZL] })
      rb++
    }
    const rBad = rb
    wierszTabeli(b, rb, w(6, { 2: L('RAZEM badania, odbiory, projekt, transport (1 szt.)'), 6: F(razemBlokow.map((x) => `F${x}`).join('+'), k.badania.razem) }), { pogrubiony: true, formaty: [...Array(5).fill(undefined), ZL] })

    sumy.push({ robocizna: ref(nR, 'F', razemRob), materialy: ref(nM, 'Q', rMat), kooperacja: ref(nK, 'J', rKoop), badania: ref(nB, 'F', rBad) })
  })

  // --- Wycena: opinia o zapytaniu + ocena ekonomiczna (formuły z zakładek aparatów) ---
  op.columns = [{ width: 42 }, { width: 50 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 14 }]
  let r = naglowekArkusza(op, L('OPINIA O ZAPYTANIU / WYCENA'), podtytul)
  for (const [k, v] of [
    [L('Nr rejestracyjny'), stan.zapytanie.numer], [L('Zamawiający'), stan.zapytanie.klient ?? ''], [L('Przedmiot zapytania'), stan.zapytanie.przedmiot],
    [L('Wersja wyceny'), `v${wyc.wersja}${wyc.nazwa ? ` - ${wyc.nazwa}` : ''}`], [L('Status'), wyc.status],
    [L('Termin realizacji [tyg.]'), wyc.termin_realizacji_tyg ?? ''], [L('Uwagi'), wyc.uwagi ?? ''],
  ] as [string, string | number][]) r = wierszTabeli(op, r, [k, v])
  r++
  // Aparaty: koszt 1 szt. z zakładek, ilość, koszt razem, cena (zysk i zaokrąglenie jak w aplikacji).
  r = wierszTabeli(op, r, [L('Aparat'), L('Typ / materiał'), L('Ilość'), L('Masa netto kg / szt.'), L('Koszt 1 szt.'), L('Koszt razem')], { naglowek: true })
  const rA0 = r
  stan.aparaty.forEach((a, i) => {
    const sm = sumy[i]
    const k = wynik.aparaty[i]
    r = wierszTabeli(op, r, [a.nazwa, [a.typ, a.tema, a.material_wiodacy].filter(Boolean).join(', '), a.ilosc, a.masa_netto_kg ?? 0,
      F(`${sm.robocizna}+${sm.materialy}+${sm.kooperacja}+${sm.badania}`, k.koszt_szt), F(`E${r}*C${r}`, k.koszt)], { formaty: [undefined, undefined, undefined, KG, ZL, ZL] })
  })
  op.getColumn(2).alignment = { wrapText: true, vertical: 'top' }
  r++

  r = wierszTabeli(op, r, [L('OCENA EKONOMICZNA - ciężar całkowity netto [kg]'), F(stan.aparaty.map((_, i) => `C${rA0 + i}*D${rA0 + i}`).join('+') || '0', wynik.masa_kg)], { pogrubiony: true, formaty: [undefined, KG] })
  const rMasa = r - 1
  r = wierszTabeli(op, r, ['', 'PLN', L('PLN/kg'), L('Udział')], { naglowek: true })
  const rKoszty = r + 4
  const dzial = (etykieta: string, pole: keyof SumyAparatu, x: { koszt: number; zl_kg: number | null; udzial: number }) => {
    const f = sumy.map((sm, i) => `${sm[pole]}*C${rA0 + i}`).join('+') || '0'
    r = wierszTabeli(op, r, [etykieta, F(f, x.koszt), F(`IF($B$${rMasa}>0,B${r}/$B$${rMasa},0)`, x.zl_kg ?? 0), F(`IF($B$${rKoszty}>0,B${r}/$B$${rKoszty},0)`, x.udzial)], { formaty: [undefined, ZL, ZL, '0.0%'] })
  }
  dzial(L('Robocizna'), 'robocizna', wynik.robocizna)
  dzial(L('Materiały'), 'materialy', wynik.materialy)
  dzial(L('Kooperacja'), 'kooperacja', wynik.kooperacja)
  dzial(L('Badania, odbiory, transport, projekt'), 'badania', wynik.badania)
  r = wierszTabeli(op, r, [L('Koszty całkowite'), F(`SUM(B${rKoszty - 4}:B${rKoszty - 1})`, wynik.koszty.koszt), F(`IF($B$${rMasa}>0,B${r}/$B$${rMasa},0)`, wynik.koszty.zl_kg ?? 0), 1], { pogrubiony: true, formaty: [undefined, ZL, ZL, '0.0%'] })

  if (widziMarze && wynik.cena !== null) {
    r++
    const zysk = Number(wynik.zysk_proc ?? 0)
    const krok = Number(par.zaokraglenie ?? 0)
    r = wierszTabeli(op, r, [L('Zakładany zysk [%]'), zysk], { formaty: [undefined, '0.0'] })
    const rZ = r - 1
    r = wierszTabeli(op, r, [L('Zaokrąglenie ceny aparatu [zł]'), krok])
    const rKr = r - 1
    // Cena aparatu jak w aplikacji: koszt 1 szt. × (1 + zysk) zaokrąglony, × ilość.
    const cenaSzt = (i: number) => `IF($B$${rKr}>0,ROUND(E${rA0 + i}*(1+$B$${rZ}/100)/$B$${rKr},0)*$B$${rKr},ROUND(E${rA0 + i}*(1+$B$${rZ}/100),2))*C${rA0 + i}`
    const rCena = r + 1
    r = wierszTabeli(op, r, [L('Zysk'), F(`B${rCena}-B${rKoszty}`, wynik.zysk)], { formaty: [undefined, ZL] })
    r = wierszTabeli(op, r, [L('CENA'), F(stan.aparaty.map((_, i) => cenaSzt(i)).join('+'), wynik.cena), F(`IF($B$${rMasa}>0,B${r}/$B$${rMasa},0)`, wynik.masa_kg ? wynik.cena / wynik.masa_kg : 0)], { pogrubiony: true, formaty: [undefined, ZL, ZL] })
    const kw = Number(par.korekta_prezesa_kwota ?? 0)
    const pr = Number(par.korekta_prezesa_proc ?? 0)
    const rKor = r
    r = wierszTabeli(op, r, [L('Korekta prezesa'), F(`${kw}+B${rCena}*${pr}/100`, wynik.korekta ?? 0)], { formaty: [undefined, ZL] })
    const rKon = r
    r = wierszTabeli(op, r, [L('CENA KOŃCOWA (netto)'), F(`ROUND(B${rCena}+B${rKor},2)`, wynik.cena_koncowa), F(`IF($B$${rMasa}>0,B${r}/$B$${rMasa},0)`, wynik.cena_koncowa_zl_kg ?? 0)], { pogrubiony: true, tlo: NAGLOWEK_TLO, formaty: [undefined, ZL, ZL] })
    if (wyc.kurs_eur) {
      r = wierszTabeli(op, r, [L('Kurs EUR (NBP)'), wyc.kurs_eur, wyc.kurs_eur_data ?? ''], { formaty: [undefined, '0.0000'] })
      r = wierszTabeli(op, r, [L('Cena w EUR'), F(`B${rKon}/B${r - 1}`, wynik.cena_koncowa_eur), F(`IF($B$${rMasa}>0,B${r}/$B$${rMasa},0)`, wynik.cena_koncowa_eur !== null && wynik.masa_kg ? wynik.cena_koncowa_eur / wynik.masa_kg : 0)], { formaty: [undefined, ZL, ZL] })
    }
    if (wynik.ma_opcje) r = wierszTabeli(op, r, [L('Wariant bez pozycji opcjonalnych'), wynik.cena_bez_opcji], { formaty: [undefined, ZL] })
  }
  if (analiza) kartaAnalizy(op, r, analiza, j)

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}
