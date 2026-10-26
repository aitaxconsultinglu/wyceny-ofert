// Cennik roboczogodzin i zakupy na prawdziwym projekcie: stawki widzi tylko prezes / administrator / flaga marż, zmienia
// prezes; nowa wycena dostaje migawkę (technolog bez flagi widzi ją w wycenie), zmiana cennika nie zmienia migawki,
// ale jest wykrywana; odświeżenie bierze nowe stawki. Zakupy: klasyfikacja rodzaju kosztu, decyzja ręczna zostaje.
// Dane fikcyjne, konta tymczasowe (.test).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, maSupabase } from './srodowisko'

const znacznik = Math.random().toString(36).slice(2, 8)

describe.skipIf(!maSupabase)('cennik roboczogodzin i rodzaj kosztu zakupów', () => {
  let serwis: SupabaseClient
  const k = {} as Record<'technolog' | 'prezes' | 'handlowy', SupabaseClient>
  const id = {} as Record<'technolog' | 'prezes' | 'handlowy', string>
  const r = {} as { stanowisko: number; zapytanie: string; wycena: string; zakupy: number[] }

  beforeAll(async () => {
    serwis = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    for (const n of ['technolog', 'prezes', 'handlowy'] as const) {
      const email = `${n}-cn-${znacznik}@wyceny.test`
      await serwis.from('uprawnienia_startowe').insert({ email, rola: n, widzi_marze: n === 'prezes' })
      const haslo = `Test-${crypto.randomUUID()}!`
      const { data } = await serwis.auth.admin.createUser({ email, password: haslo, email_confirm: true })
      id[n] = data.user!.id
      k[n] = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
      await k[n].auth.signInWithPassword({ email, password: haslo })
    }
    const { data: z } = await k.technolog.from('zapytania').insert({ numer: '', przedmiot: `TEST cennik ${znacznik}`, rodzaj_aparatu: 'zbiornik' }).select('id').single()
    r.zapytanie = z!.id
  }, 90_000)

  afterAll(async () => {
    if (r.zapytanie) await serwis.from('zapytania').delete().eq('id', r.zapytanie)
    if (r.stanowisko) await serwis.from('cennik_robocizny').delete().eq('id', r.stanowisko)
    if (r.zakupy?.length) await serwis.from('zakupy').delete().in('id', r.zakupy)
    await serwis.from('reguly_klasyfikacji').delete().like('opis', `%${znacznik}%`)
    for (const n of ['technolog', 'prezes', 'handlowy'] as const) {
      if (id[n]) await serwis.auth.admin.deleteUser(id[n])
      await serwis.from('uprawnienia_startowe').delete().eq('email', `${n}-cn-${znacznik}@wyceny.test`)
    }
  }, 90_000)

  it('prezes dodaje stanowisko i stawki; technolog nie zmieni cennika i nie widzi stawek', async () => {
    const { data: st, error } = await k.prezes.from('cennik_robocizny').insert({ nazwa: `TEST monter ${znacznik}`, tryb: 'przedzialy' }).select('id').single()
    expect(error).toBeNull()
    r.stanowisko = st!.id
    expect((await k.prezes.from('cennik_robocizny_stawki').insert([
      { stanowisko_id: r.stanowisko, przedzial_kod: '7-15', stawka: 61, wazna_od: '2026-01-01' },
      { stanowisko_id: r.stanowisko, przedzial_kod: 'wolne', stawka: 91, wazna_od: '2026-01-01' },
    ])).error).toBeNull()
    expect((await k.technolog.from('cennik_robocizny_stawki').insert({ stanowisko_id: r.stanowisko, przedzial_kod: '7-15', stawka: 1 })).error).not.toBeNull()
    expect((await k.technolog.from('cennik_robocizny_stawki').select('id').eq('stanowisko_id', r.stanowisko)).data).toEqual([])
    expect((await k.technolog.from('cennik_robocizny').select('nazwa').eq('id', r.stanowisko)).data).toHaveLength(1)
  })

  it('nowa wycena ma migawkę cennika - widoczną dla technologa w wycenie', async () => {
    const { data: w } = await k.technolog.rpc('nowa_wycena', { p_zapytanie: r.zapytanie, p_nazwa: 'test' })
    r.wycena = w as string
    const { data } = await k.technolog.from('wyceny').select('stawki_cennika').eq('id', r.wycena).single()
    const moje = (data!.stawki_cennika as { stanowisko_id: number; przedzial: string; stawka: number }[]).filter((x) => x.stanowisko_id === r.stanowisko)
    expect(moje.map((x) => [x.przedzial, Number(x.stawka)]).sort()).toEqual([['7-15', 61], ['wolne', 91]])
    expect((await k.technolog.rpc('cennik_zmieniony', { p_wycena: r.wycena })).data).toBe(false)
  })

  it('nowa wersja stawki: migawka bez zmian, zmiana wykryta, odświeżenie bierze nową stawkę', async () => {
    const dzis = new Date().toISOString().slice(0, 10)
    expect((await k.prezes.from('cennik_robocizny_stawki').insert({ stanowisko_id: r.stanowisko, przedzial_kod: '7-15', stawka: 66, wazna_od: dzis })).error).toBeNull()
    const przed = await k.technolog.from('wyceny').select('stawki_cennika').eq('id', r.wycena).single()
    expect((przed.data!.stawki_cennika as { stanowisko_id: number; przedzial: string; stawka: number }[]).find((x) => x.stanowisko_id === r.stanowisko && x.przedzial === '7-15')!.stawka).toBe(61)
    expect((await k.technolog.rpc('cennik_zmieniony', { p_wycena: r.wycena })).data).toBe(true)
    const { data: nowa, error } = await k.technolog.rpc('odswiez_stawki_wyceny', { p_wycena: r.wycena })
    expect(error).toBeNull()
    expect((nowa as { stanowisko_id: number; przedzial: string; stawka: number }[]).find((x) => x.stanowisko_id === r.stanowisko && x.przedzial === '7-15')!.stawka).toBe(66)
  })

  it('zakupy: klasyfikacja automatyczna, ręczna decyzja zostaje po „przeklasyfikuj”', async () => {
    const wiersz = (nazwa: string, typ: string, rodzaj: string) => ({
      klucz: `${znacznik}|${nazwa}`, numer_karty: `TEST/${znacznik}`, nr_zamowienia: `${typ}/1/2026`, typ_zamowienia: typ, nazwa, ilosc: 1, cena_jedn: 10, wartosc: 10, rodzaj,
    })
    const { data, error } = await serwis.from('zakupy').insert([
      wiersz('Usługa trawienia i pasywacji', 'ZJ', 'usluga'), wiersz('Blacha 10 P265GH', 'ZM', 'material'), wiersz('Dziwna usługa XYZ', 'ZJ', 'usluga'),
    ]).select('id, nazwa, rodzaj_kosztu')
    expect(error).toBeNull()
    r.zakupy = data!.map((x) => x.id)
    expect(data!.map((x) => x.rodzaj_kosztu)).toEqual(['kooperacja', 'materialy', null])
    await k.handlowy.from('zakupy').update({ rodzaj_kosztu: 'transport_inne', rodzaj_reczny: true }).eq('id', r.zakupy[2])
    expect((await k.technolog.rpc('przeklasyfikuj_zakupy')).error).not.toBeNull()
    expect((await k.handlowy.rpc('przeklasyfikuj_zakupy')).error).toBeNull()
    const { data: po } = await serwis.from('zakupy').select('id, rodzaj_kosztu').in('id', r.zakupy).order('id')
    expect(po!.map((x) => x.rodzaj_kosztu)).toEqual(['kooperacja', 'materialy', 'transport_inne'])
    // Reguła dodana przez dział handlowy działa przy kolejnej klasyfikacji.
    expect((await k.handlowy.from('reguly_klasyfikacji').insert({ wzorzec: '^Dziwna usługa XYZ$', rodzaj_kosztu: 'kooperacja', priorytet: 200, opis: `test ${znacznik}` })).error).toBeNull()
    expect((await k.handlowy.from('reguly_klasyfikacji').insert({ wzorzec: '([', rodzaj_kosztu: 'kooperacja', opis: `zły ${znacznik}` })).error).not.toBeNull()
    await k.handlowy.from('zakupy').update({ rodzaj_reczny: false }).eq('id', r.zakupy[2])
    expect((await serwis.from('zakupy').select('rodzaj_kosztu').eq('id', r.zakupy[2]).single()).data!.rodzaj_kosztu).toBe('kooperacja')
  })
})
