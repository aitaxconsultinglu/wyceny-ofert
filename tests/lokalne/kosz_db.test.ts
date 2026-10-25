// Kosz na prawdziwym projekcie: zapytanie z dokumentem (plik w Storage), odczytem, analizą, wyceną (aparat, pozycja),
// ofertą zebraną pod zapytanie i zapytaniem do dostawców -> kosz -> przywrócenie z tymi samymi id -> trwałe usunięcie
// z plikami. Uprawnienia: autor w statusie "nowe", zatwierdzone wyceny tylko prezes, trwale tylko prezes z numerem ZO.
// Dane fikcyjne, konta tymczasowe (.test).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, maSupabase } from './srodowisko'

const znacznik = Math.random().toString(36).slice(2, 8)

describe.skipIf(!maSupabase)('kosz: usunięcie, przywrócenie, trwałe usunięcie', () => {
  let serwis: SupabaseClient
  const k = {} as Record<'technolog' | 'prezes', SupabaseClient>
  const id = {} as Record<'technolog' | 'prezes', string>
  const r = {} as Record<'zapytanie' | 'dokument' | 'odczyt' | 'wycena' | 'aparat' | 'oferta' | 'zd' | 'dostawca', string>
  let numer = ''
  let sciezka = ''
  let kosz = ''

  beforeAll(async () => {
    serwis = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    for (const n of ['technolog', 'prezes'] as const) {
      const email = `${n}-ko-${znacznik}@wyceny.test`
      await serwis.from('uprawnienia_startowe').insert({ email, rola: n, widzi_marze: n === 'prezes' })
      const haslo = `Test-${crypto.randomUUID()}!`
      const { data } = await serwis.auth.admin.createUser({ email, password: haslo, email_confirm: true })
      id[n] = data.user!.id
      k[n] = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
      await k[n].auth.signInWithPassword({ email, password: haslo })
    }
    const t = k.technolog
    const { data: z } = await t.from('zapytania').insert({ numer: '', przedmiot: `TEST kosz ${znacznik}`, rodzaj_aparatu: 'zbiornik' }).select('id, numer').single()
    r.zapytanie = z!.id; numer = z!.numer
    const { data: d } = await t.from('dokumenty').insert({ zapytanie_id: r.zapytanie, nazwa_pliku: 'test.txt', typ: 'inne', stan: 'zapisany' }).select('id').single()
    r.dokument = d!.id
    sciezka = `${r.dokument}/test.txt`
    await t.storage.from('dokumenty').upload(sciezka, new TextEncoder().encode('kosz'))
    await t.from('dokumenty').update({ sciezka }).eq('id', r.dokument)
    const { data: o } = await t.from('odczyty_rysunkow').insert({ zapytanie_id: r.zapytanie, dokument_id: r.dokument, nazwa_pliku: 'test.txt', strona: 1 }).select('id').single()
    r.odczyt = o!.id
    await t.from('analizy_zapytan').insert({ zapytanie_id: r.zapytanie, dane: { test: znacznik } })
    const { data: w } = await t.rpc('nowa_wycena', { p_zapytanie: r.zapytanie, p_nazwa: 'test' })
    r.wycena = w as string
    const { data: a } = await t.from('aparaty').insert({ wycena_id: r.wycena, lp: 1, nazwa: 'Zbiornik', ilosc: 1 }).select('id, typ').single()
    r.aparat = a!.id
    expect(a!.typ).toBe('zbiornik') // typ z rodzaju zapytania
    await t.rpc('zapisz_pozycje_aparatu_sprawdzone', { p_aparat: r.aparat, p_pozycje: [{ lp: 1, zakladka: 'materialy', sekcja: 'blachy', nazwa: 'Płaszcz', ilosc: 1, jm: 'kg', cena_jedn: 5, jednostka_ceny: 'kg', dodatkowe: {} }] })
    const { data: dos } = await serwis.from('dostawcy').insert({ nazwa: `TEST dostawca ${znacznik}` }).select('id').single()
    r.dostawca = dos!.id
    const { data: of } = await serwis.from('oferty_dostawcow').insert({ dostawca_id: r.dostawca, zapytanie_id: r.zapytanie, data_oferty: '2026-10-01' }).select('id').single()
    r.oferta = of!.id
    await serwis.from('pozycje_ofert').insert({ oferta_id: r.oferta, lp: 1, opis: 'blacha', ilosc: 1, jm: 'kg', cena_jedn: 5 })
    const { data: zd } = await serwis.from('zapytania_dostawcow').insert({ zapytanie_id: r.zapytanie, kategoria: 'blachy', temat: 'test', tresc: 'test' }).select('id').single()
    r.zd = zd!.id
  }, 90_000)

  afterAll(async () => {
    if (kosz) await serwis.from('kosz').delete().eq('id', kosz)
    await serwis.from('kosz').delete().like('opis', `%${znacznik}%`)
    if (r.zapytanie) { await serwis.from('oferty_dostawcow').delete().eq('zapytanie_id', r.zapytanie); await serwis.from('zapytania').delete().eq('id', r.zapytanie) }
    if (sciezka) await serwis.storage.from('dokumenty').remove([sciezka])
    if (r.dostawca) await serwis.from('dostawcy').delete().eq('id', r.dostawca)
    for (const n of ['technolog', 'prezes'] as const) {
      if (id[n]) await serwis.auth.admin.deleteUser(id[n])
      await serwis.from('uprawnienia_startowe').delete().eq('email', `${n}-ko-${znacznik}@wyceny.test`)
    }
  }, 90_000)

  const policz = async () => Object.fromEntries(await Promise.all(([
    ['zapytania', 'id', r.zapytanie], ['dokumenty', 'id', r.dokument], ['odczyty_rysunkow', 'id', r.odczyt], ['analizy_zapytan', 'zapytanie_id', r.zapytanie],
    ['wyceny', 'id', r.wycena], ['aparaty', 'id', r.aparat], ['pozycje_wyceny', 'aparat_id', r.aparat], ['oferty_dostawcow', 'id', r.oferta],
    ['pozycje_ofert', 'oferta_id', r.oferta], ['zapytania_dostawcow', 'id', r.zd],
  ] as const).map(async ([t, kol, v]) => [t, (await serwis.from(t).select('*', { count: 'exact', head: true }).eq(kol, v)).count])))

  it('zatwierdzona wycena: technolog nie usunie zapytania, prezes tak', async () => {
    await serwis.from('wyceny').update({ status: 'zatwierdzona' }).eq('id', r.wycena)
    const { error } = await k.technolog.rpc('przenies_do_kosza', { p_rodzaj: 'zapytanie', p_id: r.zapytanie })
    expect(error?.message).toMatch(/uprawnie/i)
    await serwis.from('wyceny').update({ status: 'robocza' }).eq('id', r.wycena)
  })

  it('autor przenosi zapytanie do kosza - znika z bazy z całą zawartością, plik zostaje', async () => {
    const przed = await policz()
    expect(przed).toEqual(Object.fromEntries(Object.keys(przed).map((t) => [t, 1])))
    const { data, error } = await k.technolog.rpc('przenies_do_kosza', { p_rodzaj: 'zapytanie', p_id: r.zapytanie })
    expect(error).toBeNull()
    kosz = data as string
    expect(Object.values(await policz()).every((n) => n === 0)).toBe(true)
    const { data: wpis } = await k.technolog.from('kosz').select('rodzaj, numer_zo, pliki').eq('id', kosz).single()
    expect(wpis).toEqual({ rodzaj: 'zapytanie', numer_zo: numer, pliki: [sciezka] })
    expect((await serwis.storage.from('dokumenty').download(sciezka)).data).not.toBeNull()
  })

  it('przywrócenie odtwarza wszystko z tymi samymi id', async () => {
    const { error } = await k.technolog.rpc('przywroc_z_kosza', { p_kosz: kosz })
    expect(error).toBeNull()
    expect(Object.values(await policz()).every((n) => n === 1)).toBe(true)
    const { data: of } = await serwis.from('oferty_dostawcow').select('zapytanie_id').eq('id', r.oferta).single()
    expect(of!.zapytanie_id).toBe(r.zapytanie)
    const { data: audyt } = await serwis.from('audit_log').select('akcja').eq('tabela', 'kosz').eq('rekord_id', r.zapytanie)
    expect((audyt ?? []).map((a) => a.akcja).sort()).toEqual(['do_kosza', 'przywrocenie'])
    kosz = ''
  })

  it('trwałe usunięcie: tylko prezes i tylko z numerem ZO; zwraca pliki do skasowania', async () => {
    const { data } = await k.technolog.rpc('przenies_do_kosza', { p_rodzaj: 'zapytanie', p_id: r.zapytanie })
    kosz = data as string
    expect((await k.technolog.rpc('usun_z_kosza_trwale', { p_kosz: kosz, p_potwierdzenie: numer })).error).not.toBeNull()
    expect((await k.prezes.rpc('usun_z_kosza_trwale', { p_kosz: kosz, p_potwierdzenie: 'zły numer' })).error?.message).toMatch(/wpisz jego numer/i)
    const { data: pliki, error } = await k.prezes.rpc('usun_z_kosza_trwale', { p_kosz: kosz, p_potwierdzenie: numer })
    expect(error).toBeNull()
    expect(pliki).toEqual([sciezka])
    const { error: eS } = await k.prezes.storage.from('dokumenty').remove(pliki as string[])
    expect(eS).toBeNull()
    expect((await serwis.storage.from('dokumenty').download(sciezka)).data).toBeNull()
    expect((await serwis.from('kosz').select('id').eq('id', kosz)).data).toEqual([])
    kosz = ''; sciezka = ''; r.zapytanie = ''
  })
})
