// Test odbioru rundy 2 na prawdziwych materiałach (FOLDER_MATERIALOW i prywatne/testy.json - poza repozytorium):
// 1. arkusz wzorcowy wyceny w nowym układzie: eksport Excel z formułami przeliczony w teście daje sumy arkusza
//    (materiały, robocizna = masa × rbh/t × stawka, kooperacja, badania, koszty, zysk, cena, cena w EUR);
// 2. przykład stawki z cennika roboczogodzin (stanowisko × przedział × godziny);
// 3. trzy zapytania testowe z dokumentami z folderów: typy bez AI, pola karty zapytania ze źródłem, kompresja,
//    duplikat i limit pliku - po teście zapytania i pliki są usuwane.
// Raport (typy, kompresja, pola) w konsoli testu.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { wszystkieArkusze } from '../../src/lib/arkusz'
import { importujArkuszWyceny } from '../../src/lib/importArkuszaWyceny'
import { policzWycene, type ParametryKalk } from '../../src/lib/kalkulacja'
import { zbudujKalkulacje } from '../../src/lib/eksportExcel'
import { splaszczArchiwa, wczytajDane } from '../../src/lib/dokumenty'
import { zapiszDokument } from '../../src/lib/magazyn'
import { polaZapytaniaZDokumentow } from '../../src/lib/polaZDokumentow'
import { klucz, nowyAparat, type StanWyceny } from '../../src/lib/wyceny'
import { przelicz } from '../przeliczArkusz'
import { env, maMaterialy, maSupabase, plikMaterialow, plikTestu, TESTY } from './srodowisko'

const O = TESTY.odbior
const NADDATKI: Record<string, number> = { blachy: 5, odkuwki: 2, kolnierze: 2, prety: 2 }

describe.skipIf(!O?.arkusz_wzorcowy || !plikTestu(O.arkusz_wzorcowy.plik))('odbiór: arkusz wzorcowy w nowym układzie', () => {
  it('eksport Excel z formułami odtwarza sumy arkusza wzorcowego co do grosza (także EUR)', async () => {
    const a = O!.arkusz_wzorcowy!
    const w = importujArkuszWyceny(wszystkieArkusze(readFileSync(plikTestu(a.plik)!)))
    const par: ParametryKalk = {
      narzut_zakupowy_proc: 0, narzut_kooperacja_proc: 0, narzut_zysk_proc: w.narzut_zysk_proc, zaokraglenie: 0, kurs_eur: a.kurs_eur,
      sposobMasy: () => 'brak', gestosc: () => 7.85, naddatekDomyslny: (s) => NADDATKI[s ?? ''] ?? 0,
    }
    const wynik = policzWycene([w.aparat], par)
    // Robocizna wskaźnikowa: masa netto [t] × rbh/t × stawka.
    expect(a.masa_t * a.rbh_t * a.stawka).toBeCloseTo(a.robocizna, 2)
    for (const [et, v, o] of [
      ['materiały', wynik.materialy.koszt, a.materialy], ['robocizna', wynik.robocizna.koszt, a.robocizna], ['kooperacja', wynik.kooperacja.koszt, a.kooperacja],
      ['badania', wynik.badania.koszt, a.badania], ['koszty', wynik.koszty.koszt, a.koszty], ['zysk', wynik.zysk!, a.zysk], ['cena', wynik.cena_koncowa!, a.cena],
      ['cena EUR', wynik.cena_koncowa_eur!, a.cena_eur],
    ] as [string, number, number][]) expect(v, et).toBeCloseTo(o, 2)
    expect(w.narzut_zysk_proc).toBe(a.zysk_proc)

    const stan: StanWyceny = {
      wycena: {
        id: 'w', zapytanie_id: 'z', wersja: 1, nazwa: null, status: 'robocza', narzut_zakupowy_proc: 0, narzut_kooperacja_proc: 0, kurs_eur: a.kurs_eur,
        kurs_eur_data: null, kurs_eur_zrodlo: null, termin_realizacji_tyg: null, montaz_tyg: null, uwagi: null, komentarz_prezesa: null, oferta: {},
        podsumowanie: null, skopiowana_z: null, utworzono: '', zmodyfikowano: '', zatwierdzono: null,
      },
      marze: null,
      aparaty: [{ ...nowyAparat(1), ...w.aparat, klucz: klucz(), pozycje: w.aparat.pozycje.map((p) => ({ ...p, klucz: klucz(), lp: 0, dodatkowe: p.dodatkowe ?? {} })) } as StanWyceny['aparaty'][number]],
      zapytanie: { id: 'z', numer: 'ZO/TEST', przedmiot: 'arkusz wzorcowy', klient: null, rodzaj_aparatu: 'wymiennik', zakres_wymiennika: 'kompletny', zakres_opis: null },
    }
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await zbudujKalkulacje(stan, wynik, par, { kategorieMaterialow: [], kategorieUslug: [] }, true))
    const ws = wb.getWorksheet('Wycena')!
    const V = przelicz(wb)
    const adres = (et: string) => { let x = ''; ws.eachRow((r, n) => { if (r.getCell(1).value === et) x = `B${n}` }); return x }
    for (const [et, o] of [['Materiały', a.materialy], ['Robocizna', a.robocizna], ['Kooperacja', a.kooperacja], ['Badania, odbiory, transport, projekt', a.badania],
      ['Koszty całkowite', a.koszty], ['Zysk', a.zysk], ['CENA KOŃCOWA (netto)', a.cena], ['Cena w EUR', a.cena_eur]] as [string, number][]) {
      expect(V('Wycena', adres(et)), `Excel: ${et}`).toBeCloseTo(o, 2)
    }
  })
})

const serwis: SupabaseClient | null = maSupabase ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null

describe.skipIf(!serwis || !O?.stawka)('odbiór: cennik roboczogodzin', () => {
  it('stawka z cennika × godziny (przykład z zamówienia)', async () => {
    const s = O!.stawka!
    const { data } = await serwis!.rpc('stawki_cennika')
    const st = (data as { nazwa: string; przedzial_kod: string | null; stawka: number }[]).find((x) => x.nazwa === s.stanowisko && x.przedzial_kod === s.przedzial)
    expect(st, s.stanowisko).toBeDefined()
    expect(Number(st!.stawka) * s.godziny).toBeCloseTo(s.wartosc, 2)
  })
})

const ZAPYTANIA = (O?.zapytania ?? []).filter((z) => maMaterialy && statSync(plikMaterialow(z.folder), { throwIfNoEntry: false })?.isDirectory())
const pliki = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? pliki(p) : [p] })

describe.skipIf(!serwis || !ZAPYTANIA.length)('odbiór: trzy zapytania testowe z dokumentami', () => {
  const utworzone: string[] = []
  const sciezki: string[] = []
  afterAll(async () => {
    if (sciezki.length) await serwis!.storage.from('dokumenty').remove(sciezki)
    if (utworzone.length) await serwis!.from('zapytania').delete().in('id', utworzone)
  }, 120_000)

  it('dokumenty w typach bez AI, pola zapytania ze źródłem, kompresja, duplikat i limit pliku', async () => {
    const raport: string[] = []
    const { data: klienci } = await serwis!.from('klienci').select('id, nazwa, skrot, domeny')
    for (const z of ZAPYTANIA) {
      const { data: zap, error } = await serwis!.from('zapytania').insert({ numer: '', przedmiot: `TEST odbiór ${z.folder.slice(0, 20)}`, rodzaj_aparatu: z.rodzaj, zakres_wymiennika: z.zakres ?? null }).select('id, numer').single()
      expect(error).toBeNull()
      utworzone.push(zap!.id)
      const wczytane = []
      let pominieteMaile = 0
      for (const p of pliki(plikMaterialow(z.folder))) {
        for (const w of splaszczArchiwa([await wczytajDane(p.split(/[\\/]/).pop()!, new Uint8Array(readFileSync(p)))])) {
          try {
            const { dokument } = await zapiszDokument(w, { zapytanie_id: zap!.id }, { limitMb: 50 }, serwis!)
            if (dokument?.sciezka) sciezki.push(dokument.sciezka)
          } catch (e) {
            // Mail o tym samym Message-ID jest już w bazie (dane startowe) - aplikacja go nie dubluje.
            if (!/Message-ID/.test(String(e))) throw e
            pominieteMaile++
          }
          wczytane.push(w)
        }
      }
      // Duplikat: ten sam plik drugi raz - ostrzeżenie, bez zapisu.
      const pierwszy = wczytane.find((w) => w.rodzaj === 'pdf')!
      const dup = await zapiszDokument(pierwszy, { zapytanie_id: zap!.id }, { limitMb: 50 }, serwis!)
      expect(dup.dokument).toBeNull()
      // Pola karty zapytania z dokumentów (bez AI) - ze źródłem.
      const pola = polaZapytaniaZDokumentow(wczytane.flatMap((w) => [w, ...w.zalaczniki]).map((w) => ({ nazwa: w.nazwa, typ: w.typSugerowany, tekst: w.tekst })),
        { nr_zapytania_klienta: null, termin_oferty: null, klient_id: null }, (klienci ?? []).map((k) => ({ ...k, domeny: k.domeny ?? [] })))
      const { data: dok } = await serwis!.from('dokumenty').select('nazwa_pliku, typ, rozmiar_oryginalny, rozmiar_zapisany, metoda_kompresji, stan, nadrzedny_id')
        .or(`zapytanie_id.eq.${zap!.id},nadrzedny_id.in.(${(await serwis!.from('dokumenty').select('id').eq('zapytanie_id', zap!.id)).data!.map((x) => x.id).join(',') || '00000000-0000-0000-0000-000000000000'})`)
      const typy = Object.entries((dok ?? []).reduce<Record<string, number>>((m, d) => ({ ...m, [d.typ]: (m[d.typ] ?? 0) + 1 }), {})).map(([k, v]) => `${k} ${v}`).join(', ')
      const przed = (dok ?? []).filter((d) => d.stan === 'zapisany').reduce((s, d) => s + Number(d.rozmiar_oryginalny ?? 0), 0)
      const po = (dok ?? []).filter((d) => d.stan === 'zapisany').reduce((s, d) => s + Number(d.rozmiar_zapisany ?? 0), 0)
      raport.push(`${zap!.numer} (${z.rodzaj}${z.zakres ? `, ${z.zakres}` : ''}): dokumentów ${dok?.length}${pominieteMaile ? ` (maili już w bazie: ${pominieteMaile})` : ''}; typy: ${typy}; pliki ${(przed / 1024).toFixed(0)} KB -> ${(po / 1024).toFixed(0)} KB; pola: ${pola.map((p) => `${p.pole} = ${p.pole === 'klient_id' ? '(klient)' : p.wartosc} [${p.zrodlo}]`).join('; ') || 'brak'}`)
      expect(dok!.length).toBeGreaterThan(0)
      expect(dok!.some((d) => ['rysunek', 'rysunek_zestawieniowy', 'rysunek_wykonawczy', 'karta_danych'].includes(d.typ)), z.folder).toBe(true)
    }
    // Limit pliku: plik po kompresji większy niż 50 MB nie trafia do Storage (zostaje informacja / tekst).
    const duzy = new Uint8Array(51 * 1024 * 1024)
    for (let i = 0; i < duzy.length; i += 65536) crypto.getRandomValues(duzy.subarray(i, Math.min(i + 65536, duzy.length)))
    const { dokument, ostrzezenia } = await zapiszDokument(await wczytajDane('duzy-skan.bin', duzy), { zapytanie_id: utworzone[0] }, { limitMb: 50 }, serwis!)
    expect(dokument?.stan).toBe('pominiety_limit')
    expect(dokument?.sciezka).toBeNull()
    expect(ostrzezenia.join(' ')).toMatch(/limitu 50 MB/)
    console.log(`\nODBIÓR - TRZY ZAPYTANIA\n${raport.join('\n')}`)
  }, 600_000)
})
