// Test etapu 4 na prawdziwym projekcie: odczyty rysunków w bazie (RLS, audyt bez surowego wyniku AI)
// i przeniesienie wykazu części do wyceny tą samą drogą co ekran. Dane fikcyjne, konta tymczasowe (.test).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { pozycjeZListy } from '../../src/lib/importListy'
import { listaZRysunku, type WynikRysunku } from '../../src/lib/rysunki'
import { nowyAparat, wczytajWycene, zapiszWycene } from '../../src/lib/wyceny'
import { env, maSupabase } from './srodowisko'

const znacznik = Math.random().toString(36).slice(2, 8)
const WYNIK: WynikRysunku = {
  pozycje: [
    { poz: '1', nazwa: 'Płaszcz blacha 10x1500x3000', ilosc: 1, jm: 'szt', material: 'P265GH', norma: null, wymiary: null, masa_jedn: 353, masa_calk: null, uwagi: null, pewnosc: 0.95, sekcja: 'blachy', obszar_zrodlowy: { strona: 1, x: 0.7, y: 0.5, w: 0.3, h: 0.02 } },
    { poz: '2', nazwa: 'Kołnierz DN100 PN16', ilosc: 4, jm: 'szt', material: 'P250GH (?)', norma: 'EN 1092-1', wymiary: null, masa_jedn: 5.2, masa_calk: null, uwagi: null, pewnosc: 0.6, sekcja: 'kolnierze', obszar_zrodlowy: null },
  ],
  krocce: [{ oznaczenie: 'N1', ilosc: 1, dn: 'DN100', pn: 'PN16', przylacze: 'WN-RF', przeznaczenie: 'wlot', uwagi: null, pewnosc: 0.9, obszar_zrodlowy: null }],
  parametry: [{ nazwa: 'Ciśnienie obliczeniowe', przestrzen: null, wartosc: '1,6', jednostka: 'MPa', pewnosc: 0.9 }],
  uwagi: ['PWHT'],
}

describe.skipIf(!maSupabase)('etap 4: odczyty rysunków w bazie i przeniesienie do wyceny', () => {
  let serwis: SupabaseClient
  const k = {} as Record<'technolog' | 'handlowy', SupabaseClient>
  const id = {} as Record<'technolog' | 'handlowy', string>
  let zapytanie = ''
  let odczyt = ''

  beforeAll(async () => {
    serwis = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    for (const n of ['technolog', 'handlowy'] as const) {
      const email = `${n}-r-${znacznik}@wyceny.test`
      await serwis.from('uprawnienia_startowe').insert({ email, rola: n, widzi_marze: false })
      const haslo = `Test-${crypto.randomUUID()}!`
      const { data } = await serwis.auth.admin.createUser({ email, password: haslo, email_confirm: true })
      id[n] = data.user!.id
      k[n] = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
      await k[n].auth.signInWithPassword({ email, password: haslo })
    }
    const { data: z } = await k.technolog.from('zapytania').insert({ numer: "", przedmiot: `TEST rysunki ${znacznik}`, rodzaj_aparatu: "wymiennik" }).select('id').single()
    zapytanie = z!.id
  }, 60_000)

  afterAll(async () => {
    if (zapytanie) await serwis.from('zapytania').delete().eq('id', zapytanie)
    for (const n of ['technolog', 'handlowy'] as const) {
      if (id[n]) await serwis.auth.admin.deleteUser(id[n])
      await serwis.from('uprawnienia_startowe').delete().eq('email', `${n}-r-${znacznik}@wyceny.test`)
    }
  }, 60_000)

  it('technolog zapisuje odczyt; poprawka widoczna dla działu handlowego; audyt bez surowego wyniku AI', async () => {
    const { data, error } = await k.technolog.from('odczyty_rysunkow').insert({
      zapytanie_id: zapytanie, nazwa_pliku: 'rysunek-testowy.pdf', strona: 1,
      obszary: [{ id: 'a', rodzaj: 'czesci', x: 0.7, y: 0.2, w: 0.3, h: 0.8 }], wynik: WYNIK, zrodlo: 'ai',
      ekstrakcja_ai: [{ obszar: 'czesci', wynik: { tajne: 'surowa odpowiedź modelu' } }], model: 'test', koszt_pln: 0.12,
    }).select('id').single()
    expect(error).toBeNull()
    odczyt = data!.id
    const poprawiony = { ...WYNIK, pozycje: WYNIK.pozycje.map((p) => ({ ...p, pewnosc: 1 })) }
    const { error: e2 } = await k.technolog.from('odczyty_rysunkow').update({ wynik: poprawiony, sprawdzony: true }).eq('id', odczyt)
    expect(e2).toBeNull()
    const { data: h } = await k.handlowy.from('odczyty_rysunkow').select('wynik, sprawdzony').eq('id', odczyt).single()
    expect(h!.sprawdzony).toBe(true)
    expect((h!.wynik as WynikRysunku).pozycje.every((p) => p.pewnosc === 1)).toBe(true)
    const { data: log } = await serwis.from('audit_log').select('zmiany').eq('tabela', 'odczyty_rysunkow').eq('rekord_id', odczyt)
    expect(log!.length).toBeGreaterThanOrEqual(2)
    expect(JSON.stringify(log)).not.toContain('surowa odpowiedź modelu')
  })

  it('odczyt usuwa autor albo administrator - inny pracownik nie', async () => {
    await k.handlowy.from('odczyty_rysunkow').delete().eq('id', odczyt)
    const { data } = await serwis.from('odczyty_rysunkow').select('id').eq('id', odczyt)
    expect(data).toHaveLength(1)
  })

  it('przeniesienie do wyceny: pozycje w zakładce Materiały nowego aparatu, źródło i niepewność w uwagach', async () => {
    const { data: w } = await k.technolog.rpc('nowa_wycena', { p_zapytanie: zapytanie, p_nazwa: null })
    const s = await wczytajWycene(w as string, k.technolog)
    const a = nowyAparat(s.aparaty.length + 1, 'Aparat z rysunku')
    s.aparaty.push(a)
    a.pozycje.push(...pozycjeZListy(listaZRysunku(WYNIK.pozycje), 'rysunek rysunek-testowy.pdf, str. 1'))
    await zapiszWycene(s, false, k.technolog)
    const po = await wczytajWycene(w as string, k.technolog)
    const ap = po.aparaty.find((x) => x.nazwa === 'Aparat z rysunku')!
    expect(ap.pozycje).toHaveLength(2)
    expect(ap.pozycje[0]).toMatchObject({ zakladka: 'materialy', sekcja: 'blachy', gatunek: 'P265GH', grubosc: 10, masa_jedn: 353, zrodlo_opis: 'rysunek rysunek-testowy.pdf, str. 1' })
    expect(ap.pozycje[1]).toMatchObject({ sekcja: 'kolnierze', ilosc: 4 })
    expect(ap.pozycje[1].uwagi).toContain('(?)')
  })
})
