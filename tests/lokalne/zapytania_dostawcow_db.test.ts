// Test etapu 4 na prawdziwym projekcie: zapytania do dostawców w bazie - kto może je wysyłać,
// oznaczanie wysłania i status "jest oferta" wyliczany z bazy ofert. Dane fikcyjne, konta tymczasowe (.test).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { oznaczOdbiorce, statusOdbiorcy, wczytajOdbiorcow, zapiszZapytanieDostawcy, type NoweZapytanieDostawcy } from '../../src/lib/zapytaniaDostawcow'
import { env, maSupabase } from './srodowisko'

const znacznik = Math.random().toString(36).slice(2, 8)
type Rola = 'technolog' | 'handlowy'

describe.skipIf(!maSupabase)('etap 4: zapytania do dostawców w bazie', () => {
  let serwis: SupabaseClient
  const k = {} as Record<Rola, SupabaseClient>
  const id = {} as Record<Rola, string>
  let zapytanie = ''
  let dostawca = ''
  let zapDostawcy = ''
  const oferty: string[] = []
  const nowe = (): NoweZapytanieDostawcy => ({
    zapytanie_id: zapytanie, wycena_id: null, odczyt_id: null, rodzaj: 'material', kategoria: 'odkuwki',
    temat: 'ZO/TEST – Odkuwki', tresc: 'Dzień dobry,\nproszę o ofertę...', pozycje: [{ opis: 'Odkuwka testowa', ilosc: 1, jm: 'szt', masa_kg: 10 }],
    wymagania: ['atest'], termin_odpowiedzi: '2026-10-30',
  })

  beforeAll(async () => {
    serwis = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    for (const n of ['technolog', 'handlowy'] as const) {
      const email = `${n}-zd-${znacznik}@wyceny.test`
      await serwis.from('uprawnienia_startowe').insert({ email, rola: n, widzi_marze: false })
      const haslo = `Test-${crypto.randomUUID()}!`
      const { data } = await serwis.auth.admin.createUser({ email, password: haslo, email_confirm: true })
      id[n] = data.user!.id
      k[n] = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
      await k[n].auth.signInWithPassword({ email, password: haslo })
    }
    const { data: z } = await k.handlowy.from('zapytania').insert({ numer: '', przedmiot: `TEST zapytania do dostawców ${znacznik}`, rodzaj_aparatu: 'wymiennik' }).select('id').single()
    zapytanie = z!.id
    const { data: d } = await k.handlowy.from('dostawcy').insert({ nazwa: `TEST Kuźnia ${znacznik}`, kategorie: ['odkuwki'], kontakty: [{ osoba: 'X', email: 'x@example.test' }] }).select('id').single()
    dostawca = d!.id
  }, 60_000)

  afterAll(async () => {
    if (oferty.length) await serwis.from('oferty_dostawcow').delete().in('id', oferty)
    if (zapytanie) await serwis.from('zapytania').delete().eq('id', zapytanie)
    if (dostawca) await serwis.from('dostawcy').delete().eq('id', dostawca)
    for (const n of ['technolog', 'handlowy'] as const) {
      if (id[n]) await serwis.auth.admin.deleteUser(id[n])
      await serwis.from('uprawnienia_startowe').delete().eq('email', `${n}-zd-${znacznik}@wyceny.test`)
    }
  }, 60_000)

  it('szablon i biblioteka wymagań są w ustawieniach (czyta każdy pracownik)', async () => {
    const { data } = await k.technolog.from('ustawienia').select('wartosc').eq('klucz', 'zapytania_dostawcow').single()
    const w = data!.wartosc as { wymagania: { kod: string }[]; dni_bez_odpowiedzi: number }
    expect(w.wymagania.map((x) => x.kod)).toEqual(expect.arrayContaining(['atest', 'udarnosc', 'ut_rury', 'nft', 'naddatki']))
    expect(w.dni_bez_odpowiedzi).toBeGreaterThan(0)
  })

  it('technolog nie wysyła zapytań do dostawców (RLS), ale je widzi', async () => {
    await expect(zapiszZapytanieDostawcy(nowe(), [], k.technolog)).rejects.toThrow()
    zapDostawcy = await zapiszZapytanieDostawcy(nowe(), [
      { dostawca_id: dostawca, nazwa: `TEST Kuźnia ${znacznik}`, email: 'x@example.test' },
      { dostawca_id: null, nazwa: 'inny@example.test', email: 'inny@example.test' },
    ], k.handlowy)
    const widzi = await wczytajOdbiorcow(zapytanie, k.technolog)
    expect(widzi).toHaveLength(2)
    expect(widzi.every((o) => statusOdbiorcy(o, 5) === 'przygotowane')).toBe(true)
  })

  it('wysłanie: data i autor; cofnięcie czyści', async () => {
    const [o] = (await wczytajOdbiorcow(zapytanie, k.handlowy)).filter((x) => x.dostawca_id === dostawca)
    await oznaczOdbiorce(o.id, { wyslano: true }, k.handlowy)
    const { data } = await serwis.from('zapytania_dostawcow_odbiorcy').select('wyslano, wyslal').eq('id', o.id).single()
    expect(data!.wyslal).toBe(id.handlowy)
    expect(Date.now() - new Date(data!.wyslano).getTime()).toBeLessThan(120_000)
    expect(statusOdbiorcy({ ...o, wyslano: data!.wyslano }, 5)).toBe('wyslane')
    await expect(oznaczOdbiorce(o.id, { wyslano: false }, k.technolog)).resolves.toBeUndefined()   // RLS: bez efektu
    expect((await serwis.from('zapytania_dostawcow_odbiorcy').select('wyslano').eq('id', o.id).single()).data!.wyslano).not.toBeNull()
  })

  it('oferta tego dostawcy do tego ZO zmienia status na "jest oferta"; odrzucona się nie liczy; odmowa', async () => {
    const odrz = await k.handlowy.from('oferty_dostawcow').insert({ dostawca_id: dostawca, zapytanie_id: zapytanie, status: 'odrzucona' }).select('id').single()
    oferty.push(odrz.data!.id)
    let o = (await wczytajOdbiorcow(zapytanie, k.handlowy)).find((x) => x.dostawca_id === dostawca)!
    expect(o.oferta).toBeNull()
    const dobra = await k.handlowy.from('oferty_dostawcow').insert({ dostawca_id: dostawca, zapytanie_id: zapytanie, data_oferty: '2026-10-20' }).select('id').single()
    oferty.push(dobra.data!.id)
    o = (await wczytajOdbiorcow(zapytanie, k.handlowy)).find((x) => x.dostawca_id === dostawca)!
    expect(o.oferta).toBe(dobra.data!.id)
    expect(statusOdbiorcy(o, 5)).toBe('oferta')

    const inny = (await wczytajOdbiorcow(zapytanie, k.handlowy)).find((x) => !x.dostawca_id)!
    await oznaczOdbiorce(inny.id, { odmowa: true, uwagi: 'brak materiału' }, k.handlowy)
    const po = (await wczytajOdbiorcow(zapytanie, k.handlowy)).find((x) => x.id === inny.id)!
    expect(statusOdbiorcy(po, 5)).toBe('odmowa')
    expect(po.uwagi).toBe('brak materiału')
  })

  it('usunięcie zapytania klienta usuwa zapytania do dostawców', async () => {
    const { count } = await serwis.from('zapytania_dostawcow').select('id', { count: 'exact', head: true }).eq('id', zapDostawcy)
    expect(count).toBe(1)
  })
})
