// Test etapu 4 na prawdziwym projekcie: karta analizy zapytania - dane do AI tylko z dokumentów istotnych,
// zapis i poprawki (RLS), audyt bez surowej odpowiedzi modelu, tryb AI w funkcji i usługi jako źródło
// zapytań do kooperantów. Dane fikcyjne, konta tymczasowe (.test).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { pustaKarta, uslugiDoZapytan, uzupelnijKarte, type KartaAnalizy } from '../../src/lib/analiza'
import { przygotujAnalize } from '../../src/lib/analizaZapytania'
import { zapiszZapytanieDostawcy } from '../../src/lib/zapytaniaDostawcow'
import { env, maSupabase } from './srodowisko'

const znacznik = Math.random().toString(36).slice(2, 8)
type Rola = 'technolog' | 'handlowy'

describe.skipIf(!maSupabase)('etap 4: karta analizy zapytania w bazie', () => {
  let serwis: SupabaseClient
  const k = {} as Record<Rola, SupabaseClient>
  const id = {} as Record<Rola, string>
  let zapytanie = { id: '', numer: '', przedmiot: `TEST analiza ${znacznik}`, klient: null as string | null }

  beforeAll(async () => {
    serwis = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    for (const n of ['technolog', 'handlowy'] as const) {
      const email = `${n}-an-${znacznik}@wyceny.test`
      await serwis.from('uprawnienia_startowe').insert({ email, rola: n, widzi_marze: false })
      const haslo = `Test-${crypto.randomUUID()}!`
      const { data } = await serwis.auth.admin.createUser({ email, password: haslo, email_confirm: true })
      id[n] = data.user!.id
      k[n] = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
      await k[n].auth.signInWithPassword({ email, password: haslo })
    }
    const { data: z } = await k.technolog.from('zapytania').insert({ numer: '', przedmiot: zapytanie.przedmiot, rodzaj_aparatu: 'zbiornik' }).select('id, numer').single()
    zapytanie = { ...zapytanie, id: z!.id, numer: z!.numer }
    await k.technolog.from('dokumenty').insert([
      { zapytanie_id: zapytanie.id, nazwa_pliku: 'specyfikacja-test.docx', typ: 'specyfikacja', istotny: true, stan: 'tylko_tekst', tekst: 'Wymagana wizja lokalna. Izolacja 100 mm.' },
      { zapytanie_id: zapytanie.id, nazwa_pliku: 'standard-test.pdf', typ: 'standard_klienta', istotny: false, stan: 'tylko_tekst', tekst: 'TAJNY STANDARD - nie wysyłać' },
    ])
  }, 60_000)

  afterAll(async () => {
    if (zapytanie.id) await serwis.from('zapytania').delete().eq('id', zapytanie.id)
    for (const n of ['technolog', 'handlowy'] as const) {
      if (id[n]) await serwis.auth.admin.deleteUser(id[n])
      await serwis.from('uprawnienia_startowe').delete().eq('email', `${n}-an-${znacznik}@wyceny.test`)
    }
  }, 60_000)

  it('do analizy idą tylko dokumenty istotne', async () => {
    const p = await przygotujAnalize(zapytanie, k.technolog)
    expect(p.dokumentow).toBe(1)
    expect(p.dane.tekst).toContain('specyfikacja-test.docx')
    expect(p.dane.tekst).toContain('Wymagana wizja lokalna')
    expect(p.dane.tekst).not.toContain('TAJNY STANDARD')
    expect(p.dane.obrazy).toEqual([])
    expect(p.dane.metadane).toMatchObject({ zapytanie: zapytanie.numer })
  })

  it('funkcja AI zna tryb analizuj_zapytanie (bez klucza 503 jeszcze przed modelem, nie "nieznany tryb")', async () => {
    const odp = await fetch(`${env.SUPABASE_URL}/functions/v1/ai`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_JWT}`, apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tryb: 'analizuj_zapytanie', szacuj: true, tekst: 'test' }),
    })
    expect([200, 503]).toContain(odp.status)
  })

  it('technolog zapisuje kartę, dział handlowy poprawia; audyt bez surowej odpowiedzi AI; usuwa tylko administrator', async () => {
    const karta = pustaKarta()
    karta.uslugi = [{ kategoria: null, opis: 'Izolacja testowa', ilosc: 1, jm: 'kpl', uwagi: '100 mm' }]
    const { error } = await k.technolog.from('analizy_zapytan').upsert({ zapytanie_id: zapytanie.id, dane: karta, ekstrakcja_ai: { tajne: 'surowa odpowiedź analizy' }, model: 'test' })
    expect(error).toBeNull()
    const { data: h } = await k.handlowy.from('analizy_zapytan').select('dane, zmodyfikowal').eq('zapytanie_id', zapytanie.id).single()
    const zH = uzupelnijKarte(h!.dane as Partial<KartaAnalizy>)
    zH.uwagi = 'poprawka działu handlowego'
    expect((await k.handlowy.from('analizy_zapytan').update({ dane: zH }).eq('zapytanie_id', zapytanie.id)).error).toBeNull()
    const { data: po } = await serwis.from('analizy_zapytan').select('dane, zmodyfikowal').eq('zapytanie_id', zapytanie.id).single()
    expect((po!.dane as KartaAnalizy).uwagi).toBe('poprawka działu handlowego')
    expect(po!.zmodyfikowal).toBe(id.handlowy)
    const { data: log } = await serwis.from('audit_log').select('zmiany').eq('tabela', 'analizy_zapytan').eq('zapytanie_id', zapytanie.id)
    expect(log!.length).toBeGreaterThanOrEqual(2)
    expect(JSON.stringify(log)).not.toContain('surowa odpowiedź analizy')
    await k.technolog.from('analizy_zapytan').delete().eq('zapytanie_id', zapytanie.id)
    expect((await serwis.from('analizy_zapytan').select('zapytanie_id').eq('zapytanie_id', zapytanie.id)).data).toHaveLength(1)
  })

  it('usługi z karty jako zapytanie do kooperanta (oznaczone źródłem "analiza")', async () => {
    const { data } = await k.handlowy.from('analizy_zapytan').select('dane').eq('zapytanie_id', zapytanie.id).single()
    const pozycje = uslugiDoZapytan(uzupelnijKarte(data!.dane as Partial<KartaAnalizy>))
    expect(pozycje).toMatchObject([{ opis: 'Izolacja testowa - 100 mm', rodzaj: 'usluga', kategoria: 'inne' }])
    const zid = await zapiszZapytanieDostawcy({
      zapytanie_id: zapytanie.id, wycena_id: null, odczyt_id: null, analiza: true, rodzaj: 'usluga', kategoria: 'inne',
      temat: `${zapytanie.numer} – Izolacja`, tresc: 'test', pozycje: pozycje.map(({ opis, ilosc, jm, masa_kg }) => ({ opis, ilosc, jm, masa_kg })), wymagania: [], termin_odpowiedzi: null,
    }, [{ dostawca_id: null, nazwa: 'izolacje@example.test', email: 'izolacje@example.test' }], k.handlowy)
    expect((await serwis.from('zapytania_dostawcow').select('analiza').eq('id', zid).single()).data!.analiza).toBe(true)
  })
})
