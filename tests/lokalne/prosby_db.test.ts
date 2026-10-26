// Prośby o oferty na prawdziwym projekcie: technolog zgłasza prośbę, dział handlowy ją przyjmuje i dodaje ofertę
// (powiązaną z prośbą), technolog nie zmieni cudzej prośby; licznik kolejki; zapytanie w koszu zabiera prośbę i ofertę
// (wskazujące na siebie nawzajem) i przywraca je z tymi samymi id. Dane fikcyjne, konta tymczasowe (.test).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, maSupabase } from './srodowisko'

const znacznik = Math.random().toString(36).slice(2, 8)

describe.skipIf(!maSupabase)('prośby o oferty: kolejka działu handlowego', () => {
  let serwis: SupabaseClient
  const k = {} as Record<'technolog' | 'technolog2' | 'handlowy', SupabaseClient>
  const id = {} as Record<'technolog' | 'technolog2' | 'handlowy', string>
  const r = {} as Record<'zapytanie' | 'prosba' | 'oferta' | 'dostawca', string>
  let kosz = ''

  beforeAll(async () => {
    serwis = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    for (const n of ['technolog', 'technolog2', 'handlowy'] as const) {
      const email = `${n}-pr-${znacznik}@wyceny.test`
      await serwis.from('uprawnienia_startowe').insert({ email, rola: n === 'technolog2' ? 'technolog' : n, widzi_marze: false })
      const haslo = `Test-${crypto.randomUUID()}!`
      const { data } = await serwis.auth.admin.createUser({ email, password: haslo, email_confirm: true })
      id[n] = data.user!.id
      k[n] = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
      await k[n].auth.signInWithPassword({ email, password: haslo })
    }
    const { data: z } = await k.technolog.from('zapytania').insert({ numer: '', przedmiot: `TEST prośby ${znacznik}`, rodzaj_aparatu: 'wymiennik' }).select('id').single()
    r.zapytanie = z!.id
    const { data: d } = await serwis.from('dostawcy').insert({ nazwa: `TEST kooperant ${znacznik}` }).select('id').single()
    r.dostawca = d!.id
  }, 90_000)

  afterAll(async () => {
    if (kosz) await serwis.from('kosz').delete().eq('id', kosz)
    if (r.zapytanie) { await serwis.from('oferty_dostawcow').delete().eq('zapytanie_id', r.zapytanie); await serwis.from('zapytania').delete().eq('id', r.zapytanie) }
    if (r.dostawca) await serwis.from('dostawcy').delete().eq('id', r.dostawca)
    for (const n of ['technolog', 'technolog2', 'handlowy'] as const) {
      if (id[n]) await serwis.auth.admin.deleteUser(id[n])
      await serwis.from('uprawnienia_startowe').delete().eq('email', `${n}-pr-${znacznik}@wyceny.test`)
    }
  }, 90_000)

  it('technolog zgłasza prośbę; licznik kolejki ją widzi', async () => {
    const przed = Number((await k.handlowy.rpc('prosby_do_obslugi')).data)
    const { data, error } = await k.technolog.from('prosby_o_oferte').insert({
      zapytanie_id: r.zapytanie, zakladka: 'kooperacja', kategoria_uslugi: 'sekafenowanie', opis: 'Sekafenowanie sit', parametry: { powierzchnia_m2: '12' },
    }).select('id, status, zlecajacy').single()
    expect(error).toBeNull()
    expect(data).toMatchObject({ status: 'nowa', zlecajacy: id.technolog })
    r.prosba = data!.id
    expect(Number((await k.handlowy.rpc('prosby_do_obslugi')).data)).toBe(przed + 1)
  })

  it('inny technolog nie zmieni cudzej prośby; dział handlowy przyjmuje i przypisuje', async () => {
    const { data: obca } = await k.technolog2.from('prosby_o_oferte').update({ status: 'anulowana' }).eq('id', r.prosba).select('id')
    expect(obca).toEqual([])
    const { error } = await k.handlowy.from('prosby_o_oferte').update({ status: 'przyjeta', odpowiedzialny: id.handlowy }).eq('id', r.prosba)
    expect(error).toBeNull()
  })

  it('oferta do prośby i wybór oferty w prośbie', async () => {
    const { data: o, error } = await k.handlowy.from('oferty_dostawcow').insert({ dostawca_id: r.dostawca, zapytanie_id: r.zapytanie, prosba_id: r.prosba, data_oferty: '2026-10-20' }).select('id').single()
    expect(error).toBeNull()
    r.oferta = o!.id
    await k.handlowy.from('pozycje_ofert').insert({ oferta_id: r.oferta, lp: 1, opis: 'sekafenowanie', kategoria_uslugi: 'sekafenowanie', ilosc: 12, jm: 'm2', cena_jedn: 100 })
    expect((await k.technolog.from('prosby_o_oferte').update({ oferta_id: r.oferta, status: 'oferta_otrzymana' }).eq('id', r.prosba)).error).toBeNull()
  })

  it('zapytanie w koszu zabiera prośbę i ofertę; przywrócenie z tymi samymi id i powiązaniami', async () => {
    const { data, error } = await k.technolog.rpc('przenies_do_kosza', { p_rodzaj: 'zapytanie', p_id: r.zapytanie })
    expect(error).toBeNull()
    kosz = data as string
    expect((await serwis.from('prosby_o_oferte').select('id').eq('id', r.prosba)).data).toEqual([])
    expect((await k.technolog.rpc('przywroc_z_kosza', { p_kosz: kosz })).error).toBeNull()
    kosz = ''
    const { data: p } = await serwis.from('prosby_o_oferte').select('oferta_id, status').eq('id', r.prosba).single()
    expect(p).toEqual({ oferta_id: r.oferta, status: 'oferta_otrzymana' })
    const { data: o } = await serwis.from('oferty_dostawcow').select('prosba_id').eq('id', r.oferta).single()
    expect(o!.prosba_id).toBe(r.prosba)
  })
})
