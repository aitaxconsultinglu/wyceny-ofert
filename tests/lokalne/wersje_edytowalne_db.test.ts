// Moduł "Wersje edytowalne" na prawdziwym projekcie: pliki w bazie i w Storage (edytowalne/<id>/...), dziennik odczytów,
// uprawnienia (usuwa autor albo administrator, wpis w dzienniku tylko jako autor, anonim nic nie widzi). Dane fikcyjne,
// konta tymczasowe (.test); bez wywołań AI.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { blok } from '../../src/lib/wersjeEdytowalne'
import { env, maSupabase } from './srodowisko'

const znacznik = Math.random().toString(36).slice(2, 8)

describe.skipIf(!maSupabase)('wersje edytowalne: pliki, magazyn i dziennik odczytów', () => {
  let serwis: SupabaseClient
  const k = {} as Record<'technolog' | 'handlowy', SupabaseClient>
  const id = {} as Record<'technolog' | 'handlowy', string>
  let plik = ''
  let sciezka = ''

  beforeAll(async () => {
    serwis = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    for (const n of ['technolog', 'handlowy'] as const) {
      const email = `${n}-we-${znacznik}@wyceny.test`
      await serwis.from('uprawnienia_startowe').insert({ email, rola: n, widzi_marze: false })
      const haslo = `Test-${crypto.randomUUID()}!`
      const { data } = await serwis.auth.admin.createUser({ email, password: haslo, email_confirm: true })
      id[n] = data.user!.id
      k[n] = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
      await k[n].auth.signInWithPassword({ email, password: haslo })
    }
  }, 60_000)

  afterAll(async () => {
    if (sciezka) await serwis.storage.from('dokumenty').remove([sciezka])
    if (plik) await serwis.from('pliki_edytowalne').delete().eq('id', plik)
    await serwis.from('odczyty_plikow').delete().like('nazwa_pliku', `%${znacznik}%`)
    for (const n of ['technolog', 'handlowy'] as const) {
      if (id[n]) await serwis.auth.admin.deleteUser(id[n])
      await serwis.from('uprawnienia_startowe').delete().eq('email', `${n}-we-${znacznik}@wyceny.test`)
    }
  }, 60_000)

  it('pracownik dodaje plik i wgrywa go do magazynu; inny pracownik widzi i pobiera; anonim nie widzi nic', async () => {
    const { data, error } = await k.technolog.from('pliki_edytowalne')
      .insert({ nazwa_pliku: `test-${znacznik}.txt`, mime: 'text/plain', rozmiar: 11, rodzaj: 'tekst' }).select('id, utworzyl').single()
    expect(error).toBeNull()
    expect(data!.utworzyl).toBe(id.technolog)
    plik = data!.id
    sciezka = `edytowalne/${plik}/test-${znacznik}.txt`
    const { error: eUp } = await k.technolog.storage.from('dokumenty').upload(sciezka, new TextEncoder().encode('Hello world'), { contentType: 'text/plain' })
    expect(eUp).toBeNull()
    // Ścieżka bez wiersza w pliki_edytowalne - odmowa.
    const { error: eObcy } = await k.technolog.storage.from('dokumenty').upload(`edytowalne/${crypto.randomUUID()}/x.txt`, new TextEncoder().encode('x'))
    expect(eObcy).not.toBeNull()

    const { data: pobrany } = await k.handlowy.storage.from('dokumenty').download(sciezka)
    expect(await pobrany!.text()).toBe('Hello world')
    const anon = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
    expect((await anon.from('pliki_edytowalne').select('id').eq('id', plik)).data ?? []).toEqual([])
    expect((await anon.storage.from('dokumenty').download(sciezka)).data).toBeNull()
  })

  it('wersję edytowalną zapisuje każdy pracownik; usuwa tylko autor (albo administrator)', async () => {
    const tresc = { strony: { 1: { bloki: [blok({ typ: 'akapit', tekst: 'Hello world' })], zrodlo: 'tekst', jezyk: 'en' } }, tlumaczenie: {} }
    const { error } = await k.handlowy.from('pliki_edytowalne').update({ tresc, jezyk: 'en' }).eq('id', plik)
    expect(error).toBeNull()
    await k.handlowy.from('pliki_edytowalne').delete().eq('id', plik)
    expect((await serwis.from('pliki_edytowalne').select('id').eq('id', plik)).data).toHaveLength(1)
    const { error: eUs } = await k.handlowy.storage.from('dokumenty').remove([sciezka])
    expect(eUs).toBeNull() // remove bez uprawnień nie zwraca błędu - plik musi jednak zostać
    expect((await serwis.storage.from('dokumenty').download(sciezka)).data).not.toBeNull()
  })

  it('dziennik: wpis tylko jako autor, widoczny dla wszystkich pracowników, bez zmian i usuwania', async () => {
    const wpis = { plik_id: plik, nazwa_pliku: `test-${znacznik}.txt`, rodzaj: 'tekst', strony: [1], obszarow: 0, jezyk: 'en' }
    const { data, error } = await k.technolog.from('odczyty_plikow').insert({ ...wpis, utworzyl: id.technolog }).select('id').single()
    expect(error).toBeNull()
    const { error: eCudzy } = await k.technolog.from('odczyty_plikow').insert({ ...wpis, utworzyl: id.handlowy })
    expect(eCudzy).not.toBeNull()
    const { data: widzi } = await k.handlowy.from('odczyty_plikow').select('id, utworzyl').eq('id', data!.id)
    expect(widzi).toEqual([{ id: data!.id, utworzyl: id.technolog }])
    await k.technolog.from('odczyty_plikow').update({ koszt_pln: 0 }).eq('id', data!.id)
    await k.technolog.from('odczyty_plikow').delete().eq('id', data!.id)
    expect((await serwis.from('odczyty_plikow').select('id').eq('id', data!.id)).data).toHaveLength(1)
  })

  it('autor usuwa plik z magazynu i z bazy; historia odczytów zostaje', async () => {
    await k.technolog.storage.from('dokumenty').remove([sciezka])
    expect((await serwis.storage.from('dokumenty').download(sciezka)).data).toBeNull()
    const { error } = await k.technolog.from('pliki_edytowalne').delete().eq('id', plik)
    expect(error).toBeNull()
    expect((await serwis.from('pliki_edytowalne').select('id').eq('id', plik)).data).toEqual([])
    const { data } = await serwis.from('odczyty_plikow').select('plik_id').eq('nazwa_pliku', `test-${znacznik}.txt`)
    expect(data).toEqual([{ plik_id: null }])
    sciezka = ''; plik = ''
  })
})
