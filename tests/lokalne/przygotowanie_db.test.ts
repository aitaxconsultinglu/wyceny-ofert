// Test na prawdziwym projekcie: "Przygotuj automatycznie" bez AI (klucz nie jest potrzebny) - z karty analizy
// i zapisanego odczytu rysunku powstaje wstępna wycena (aparat, materiały, usługi, robocizna wskaźnikowa),
// projekt oferty z klauzulami dobranymi do wymagań i raport w karcie. Dane fikcyjne, konto tymczasowe (.test).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { pustaKarta, type KartaAnalizy } from '../../src/lib/analiza'
import { wykonajPrzygotowanie, zaplanujPrzygotowanie, type SlownikiPrzygotowania, type ZapytanieDoPrzygotowania } from '../../src/lib/przygotowanieAuto'
import { wczytajWycene } from '../../src/lib/wyceny'
import type { WynikRysunku } from '../../src/lib/rysunki'
import type { Ustawienia } from '../../src/lib/types'
import { env, maSupabase } from './srodowisko'

const znacznik = Math.random().toString(36).slice(2, 8)

describe.skipIf(!maSupabase)('przygotowanie automatyczne (bez AI) na prawdziwej bazie', () => {
  let serwis: SupabaseClient
  let tech: SupabaseClient
  let userId = ''
  let z: ZapytanieDoPrzygotowania
  let s: SlownikiPrzygotowania
  const email = `technolog-pa-${znacznik}@wyceny.test`

  beforeAll(async () => {
    serwis = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    await serwis.from('uprawnienia_startowe').insert({ email, rola: 'technolog', widzi_marze: false })
    const haslo = `Test-${crypto.randomUUID()}!`
    const { data } = await serwis.auth.admin.createUser({ email, password: haslo, email_confirm: true })
    userId = data.user!.id
    tech = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
    await tech.auth.signInWithPassword({ email, password: haslo })

    const { data: zap } = await tech.from('zapytania').insert({ numer: '', przedmiot: 'Zapytanie z maila', status: 'nowe', rodzaj_aparatu: 'zbiornik' }).select('id, numer').single()
    z = { id: zap!.id, numer: zap!.numer, przedmiot: 'Zapytanie z maila', klient: null, klient_id: null, nr_zapytania_klienta: null, termin_oferty: null, status: 'nowe' }

    const karta: KartaAnalizy = pustaKarta()
    karta.podsumowanie.przedmiot = `Zbiornik testowy TEST-${znacznik}`
    karta.podsumowanie.termin_realizacji = '12 tygodni'
    karta.aparaty = [{ nazwa: `Zbiornik TEST-${znacznik}`, typ: 'zbiornik pionowy', ilosc: 1, masa_kg: null, srednica_mm: 1600, dlugosc_mm: null, wysokosc_mm: 3000, material: 'P265GH' }]
    karta.wymagania = karta.wymagania.map((w) => (w.kod === 'ndt' ? { ...w, stan: 'wymagane', opis: '100% RT' } : w.kod === 'izolacja' ? { ...w, stan: 'nie' } : w))
    karta.uslugi = [{ kategoria: 'ciecie', opis: 'Cięcie testowe', ilosc: null, jm: '', uwagi: '' }]
    await tech.from('analizy_zapytan').insert({ zapytanie_id: z.id, dane: karta })
    const wynik: WynikRysunku = {
      pozycje: [
        { poz: '1', nazwa: 'Płaszcz blacha 10x1500x3000', ilosc: 1, jm: 'szt', material: 'P265GH', norma: null, wymiary: null, masa_jedn: 353, masa_calk: null, uwagi: null, pewnosc: 0.95, sekcja: 'blachy', obszar_zrodlowy: null },
        { poz: '2', nazwa: 'Kołnierz DN100 PN16', ilosc: 2, jm: 'szt', material: 'P250GH', norma: null, wymiary: null, masa_jedn: 5, masa_calk: null, uwagi: null, pewnosc: 0.6, sekcja: 'kolnierze', obszar_zrodlowy: null },
      ],
      krocce: [], parametry: [], uwagi: [],
    }
    // Kopia tego samego rysunku w innym pliku (np. z zaznaczoną izolacją) - lista nie może się powielić w wycenie.
    await tech.from('odczyty_rysunkow').insert({ zapytanie_id: z.id, nazwa_pliku: `TEST-${znacznik} izolacja.pdf`, strona: 1, wynik, zrodlo: 'tekst' })
    await tech.from('odczyty_rysunkow').insert({ zapytanie_id: z.id, nazwa_pliku: `TEST-${znacznik}.pdf`, strona: 1, wynik, zrodlo: 'tekst' })

    const [km, ku, g, rs, st, ust] = await Promise.all([
      serwis.from('kategorie_materialow').select('*'), serwis.from('kategorie_uslug').select('*'), serwis.from('gatunki').select('*'),
      serwis.from('rodzaje_stali').select('*'), serwis.from('stawki_robocizny').select('*'), serwis.from('ustawienia').select('klucz, wartosc'),
    ])
    s = {
      kategorieMaterialow: km.data ?? [], kategorieUslug: ku.data ?? [], gatunki: g.data ?? [], rodzajeStali: rs.data ?? [], stawki: st.data ?? [],
      ustawienia: Object.fromEntries((ust.data ?? []).map((x) => [x.klucz, x.wartosc])) as unknown as Ustawienia,
    }
  }, 60_000)

  afterAll(async () => {
    if (z?.id) await serwis.from('zapytania').delete().eq('id', z.id)
    if (userId) await serwis.auth.admin.deleteUser(userId)
    await serwis.from('uprawnienia_startowe').delete().eq('email', email)
  }, 60_000)

  it('plan bez dokumentów: brak zadań AI, wycena powstaje z karty i odczytów', async () => {
    const plan = await zaplanujPrzygotowanie(z, { analiza: true, rysunki: true }, () => undefined, tech)
    expect(plan.zadania).toEqual([])
    expect(plan.aiDostepne).toBe(false)
    expect(plan.pominiete.join(' ')).toMatch(/brak dokumentów/)

    const raport = await wykonajPrzygotowanie(z, plan, { wycena: true, oferta: true }, s, false, () => undefined, tech)
    expect(raport.kroki.map((k) => [k.nazwa, k.stan])).toEqual([
      ['Analiza zapytania', 'pominiety'], ['Listy materiałów z rysunków', 'pominiety'], ['Wstępna wycena', 'ok'], ['Projekt oferty', 'ok'],
    ])

    const w = await wczytajWycene(raport.wycena_id!, tech)
    expect(w.wycena.nazwa).toBe('Wstępna - przygotowana automatycznie')
    expect(w.aparaty).toHaveLength(1)
    const a = w.aparaty[0]
    expect(a).toMatchObject({ nazwa: `Zbiornik TEST-${znacznik}`, typ: 'zbiornik', material_wiodacy: 'P265GH', metoda_robocizny: 'wskaznikowa', masa_netto_kg: 363 })
    const mat = a.pozycje.filter((p) => p.zakladka === 'materialy')
    expect(mat.map((p) => [p.sekcja, p.gatunek, p.zrodlo_opis])).toEqual([
      ['blachy', 'P265GH', `rysunek TEST-${znacznik}.pdf, str. 1`], ['kolnierze', 'P250GH', `rysunek TEST-${znacznik}.pdf, str. 1`],
    ])
    expect(mat[1].uwagi).toContain('(?)')
    expect(a.pozycje.find((p) => p.nazwa === 'Cięcie testowe')).toMatchObject({ zakladka: 'kooperacja', sekcja: 'ciecie', ilosc: 1, jm: 'kpl' })
    const oferta = w.wycena.oferta as { obejmuje: string[]; nie_obejmuje: string[]; termin_realizacji: string; przedmiot: string; zmienne: Record<string, string> }
    expect(oferta.obejmuje.some((t) => /NDT/.test(t))).toBe(true)
    expect(oferta.nie_obejmuje.some((t) => /izolacj/i.test(t))).toBe(true)
    expect(oferta).toMatchObject({ termin_realizacji: '12 tygodni', przedmiot: `Zbiornik testowy TEST-${znacznik}` })
    expect(oferta.zmienne).toMatchObject({ zakres_NDT: '100% RT', gatunki: 'P265GH' })

    const { data: an } = await serwis.from('analizy_zapytan').select('dane').eq('zapytanie_id', z.id).single()
    const zapisany = (an!.dane as KartaAnalizy).przygotowanie!
    expect(zapisany.wycena_id).toBe(raport.wycena_id)
    expect(zapisany.weryfikacja.map((p) => p.rodzaj)).toEqual(expect.arrayContaining(['odczyt']))
    expect((await serwis.from('zapytania').select('status').eq('id', z.id).single()).data!.status).toBe('kalkulacja')
  }, 120_000)
})
