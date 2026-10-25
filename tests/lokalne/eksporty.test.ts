// Test akceptacyjny etapu 3 (lokalnie, na prawdziwym projekcie): z zatwierdzonych wycen w bazie
// powstają kalkulacja Excel, notatka dla prezesa i oferta Word. Pliki są otwierane ponownie
// i porównywane z kalkulacją oraz z cenami zamrożonymi przy zatwierdzeniu. Kwot nie ma w repo.
import { beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import { Packer } from 'docx'
import { zbudujKalkulacje } from '../../src/lib/eksportExcel'
import { zbudujNotatke, zbudujOferte } from '../../src/lib/eksportWord'
import { policzWycene } from '../../src/lib/kalkulacja'
import { pustaKarta } from '../../src/lib/analiza'
import { parametry, wczytajWycene } from '../../src/lib/wyceny'
import type { DaneFirmy, Gatunek, KategoriaMaterialu, KategoriaUslugi, OfertaDomyslne, RodzajStali } from '../../src/lib/types'
import { env, maSupabase } from './srodowisko'

const zl = (n: number | null | undefined) =>
  `${new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n ?? 0))} zł`

async function tekstDocx(doc: Parameters<typeof Packer.toBuffer>[0]) {
  const mammoth = await import('mammoth')
  return (await mammoth.extractRawText({ buffer: await Packer.toBuffer(doc) })).value
}

function wartoscWiersza(ws: ExcelJS.Worksheet, etykieta: string): number | null {
  let wynik: number | null = null
  ws.eachRow((r) => {
    const v = r.getCell(2).value
    // Formuły mają zapisany wynik: { formula, result }.
    if (r.getCell(1).value === etykieta) wynik = Number(v && typeof v === 'object' && 'result' in v ? v.result : v)
  })
  return wynik
}

describe.skipIf(!maSupabase)('etap 3: eksport Excel / notatka / oferta z zatwierdzonych wycen', () => {
  let db: SupabaseClient
  let ids: { id: string; przedmiot: string }[] = []
  const s = {} as {
    kategorieMaterialow: KategoriaMaterialu[]; kategorieUslug: KategoriaUslugi[]; gatunki: Gatunek[]; rodzajeStali: RodzajStali[]
    ustawienia: { firma: DaneFirmy; oferta_domyslne: OfertaDomyslne }
  }
  let klauzule: { kategoria: string; tekst: string }[] = []

  beforeAll(async () => {
    db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const [w, ust, km, ku, g, rs, kl] = await Promise.all([
      db.from('wyceny').select('id, zapytania(przedmiot)').eq('status', 'zatwierdzona').like('nazwa', 'Historyczna%'),
      db.from('ustawienia').select('klucz, wartosc').in('klucz', ['firma', 'oferta_domyslne']),
      db.from('kategorie_materialow').select('*').order('kolejnosc'),
      db.from('kategorie_uslug').select('*').order('kolejnosc'),
      db.from('gatunki').select('*'),
      db.from('rodzaje_stali').select('*'),
      db.from('klauzule').select('kategoria, tekst').eq('aktywna', true).order('kolejnosc'),
    ])
    ids = ((w.data ?? []) as unknown as { id: string; zapytania: { przedmiot: string } }[]).map((x) => ({ id: x.id, przedmiot: x.zapytania.przedmiot }))
    const u = Object.fromEntries((ust.data ?? []).map((x) => [x.klucz, x.wartosc]))
    Object.assign(s, {
      kategorieMaterialow: km.data ?? [], kategorieUslug: ku.data ?? [], gatunki: g.data ?? [], rodzajeStali: rs.data ?? [],
      ustawienia: { firma: u.firma, oferta_domyslne: u.oferta_domyslne ?? { gwarancja_mies: 24, waznosc_dni: 30, platnosc: '', vat_proc: 23 } },
    })
    klauzule = kl.data ?? []
  }, 60_000)

  it('w bazie są zaimportowane wyceny historyczne', () => {
    expect(ids.length).toBeGreaterThanOrEqual(1)
  })

  it('każda wycena: pliki zgodne z kalkulacją i z ceną zamrożoną przy zatwierdzeniu', async () => {
    for (const { id, przedmiot } of ids) {
      const stan = await wczytajWycene(id, db)
      const par = parametry(stan.wycena, stan.marze, s)
      const wynik = policzWycene(stan.aparaty, par)
      // Cena przeliczona z pozycji w bazie = cena zapisana przy zatwierdzeniu.
      expect(wynik.koszty.koszt, przedmiot).toBeCloseTo(Number(stan.marze!.koszt_calkowity), 2)
      expect(wynik.cena_koncowa!, przedmiot).toBeCloseTo(Number(stan.marze!.cena_koncowa), 2)

      // Excel z marżami: zakładka Wycena (opinia + ocena ekonomiczna) i zakładki per aparat w układzie arkusza wzorcowego.
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await zbudujKalkulacje(stan, wynik, par, s, true))
      const nazwy = wb.worksheets.map((x) => x.name)
      expect(nazwy[0]).toBe('Wycena')
      expect(nazwy.filter((n) => n.endsWith('Robocizna')).length).toBe(stan.aparaty.length)
      expect(nazwy.filter((n) => n.endsWith('Materiały')).length).toBe(stan.aparaty.length)
      const ps = wb.getWorksheet('Wycena')!
      expect(wartoscWiersza(ps, 'Koszty całkowite')!).toBeCloseTo(wynik.koszty.koszt, 2)
      expect(wartoscWiersza(ps, 'CENA KOŃCOWA (netto)')!).toBeCloseTo(wynik.cena_koncowa!, 2)

      // Karta analizy (dane fikcyjne) trafia do zakładki "Wycena" - wymagania i niespójności.
      const karta = pustaKarta()
      karta.wymagania = karta.wymagania.map((x) => (x.kod === 'pwht' ? { ...x, stan: 'wymagane', opis: 'PWHT testowe', zrodlo: 'spec.docx, str. 1' } : x))
      karta.niespojnosci = [{ opis: 'Niespójność testowa', zrodla: 'spec.docx' }]
      const wbA = new ExcelJS.Workbook()
      await wbA.xlsx.load(await zbudujKalkulacje(stan, wynik, par, s, true, karta))
      const teksty: string[] = []
      wbA.getWorksheet('Wycena')!.eachRow((row) => row.eachCell((c) => teksty.push(String(c.value ?? ''))))
      expect(teksty).toEqual(expect.arrayContaining(['KARTA ANALIZY ZAPYTANIA', 'PWHT (obróbka cieplna)', 'PWHT testowe (spec.docx, str. 1)', 'Niespójność testowa']))

      // Excel bez prawa do marż: koszty tak, ceny i zysku nie ma.
      const wb2 = new ExcelJS.Workbook()
      await wb2.xlsx.load(await zbudujKalkulacje(stan, wynik, par, s, false))
      const ps2 = wb2.getWorksheet('Wycena')!
      expect(wartoscWiersza(ps2, 'Koszty całkowite')!).toBeCloseTo(wynik.koszty.koszt, 2)
      expect(wartoscWiersza(ps2, 'CENA KOŃCOWA (netto)')).toBeNull()

      // Notatka dla prezesa: "Razem" i "Łącznie" jak w kalkulacji.
      const notatka = await tekstDocx(await zbudujNotatke(stan, wynik, par, s))
      expect(notatka).toContain(`Razem: ${zl(wynik.koszty.koszt)}`)
      expect(notatka).toContain(zl(wynik.cena_koncowa))
      expect(notatka).toContain(stan.zapytanie.numer)

      // Oferta dla klienta: cena, klauzule, bez kosztów i narzutów; zatwierdzona = bez znaku "PROJEKT".
      const wybrane = (k: string) => klauzule.filter((x) => x.kategoria === k).slice(0, 2).map((x) => x.tekst)
      const oferta = await tekstDocx(await zbudujOferte({
        numer: stan.zapytanie.numer, data: '19.10.2026', klient: stan.zapytanie.klient ?? '', nr_zapytania_klienta: '',
        przedmiot: stan.zapytanie.przedmiot,
        pozycje: stan.aparaty.map((a, i) => ({ nazwa: a.nazwa, ilosc: a.ilosc, material: a.material_wiodacy ?? '', masa_kg: a.masa_netto_kg, cena: wynik.aparaty[i]?.cena ?? null })),
        cena_netto: wynik.cena_koncowa!, cena_bez_opcji: wynik.ma_opcje ? wynik.cena_bez_opcji : null, opis_wariantu: 'bez pozycji opcjonalnych',
        vat_proc: s.ustawienia.oferta_domyslne.vat_proc, waluta: 'PLN', kurs_eur: null,
        obejmuje: wybrane('obejmuje'), nie_obejmuje: wybrane('nie_obejmuje'), uwagi: wybrane('uwagi'),
        termin_realizacji: '12 tygodni', gwarancja: '24 miesięcy', waznosc: '30 dni', platnosc: 'przelew 30 dni', podpis: 'Dział handlowy', projekt: false,
      }, s.ustawienia.firma))
      expect(oferta).toContain(`OFERTA nr ${stan.zapytanie.numer}`)
      expect(oferta).toContain(`Cena netto: ${zl(wynik.cena_koncowa).replace(' zł', '')} zł`)
      for (const t of [...wybrane('obejmuje'), ...wybrane('nie_obejmuje')]) expect(oferta).toContain(t)
      expect(oferta).not.toMatch(/PROJEKT OFERTY|Narzut|Koszty całkowite|Razem:/)
    }
  }, 120_000)
})
