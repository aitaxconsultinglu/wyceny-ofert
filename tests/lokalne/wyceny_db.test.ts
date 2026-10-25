// Test akceptacyjny etapu 3 na prawdziwym projekcie: reguły wyceny pilnowane przez bazę.
// Tymczasowe konta (.test) i tymczasowe zapytanie - usuwane na końcu.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env, maSupabase } from './srodowisko'

const znacznik = Math.random().toString(36).slice(2, 8)
const ROLE = { technolog: 'technolog', handlowy: 'handlowy', prezes: 'prezes' } as const
type Nazwa = keyof typeof ROLE

describe.skipIf(!maSupabase)('etap 3: reguły wyceny w bazie', () => {
  let serwis: SupabaseClient
  const k = {} as Record<Nazwa, SupabaseClient>
  const id = {} as Record<Nazwa, string>
  let zapytanie = ''
  let wycena = ''
  let aparat = ''

  beforeAll(async () => {
    serwis = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    for (const n of Object.keys(ROLE) as Nazwa[]) {
      const email = `${n}-w-${znacznik}@wyceny.test`
      await serwis.from('uprawnienia_startowe').insert({ email, rola: ROLE[n], widzi_marze: false })
      const haslo = `Test-${crypto.randomUUID()}!`
      const { data } = await serwis.auth.admin.createUser({ email, password: haslo, email_confirm: true })
      id[n] = data.user!.id
      k[n] = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
      await k[n].auth.signInWithPassword({ email, password: haslo })
    }
    const { data: z } = await k.technolog.from('zapytania').insert({ numer: "", przedmiot: `TEST wyceny ${znacznik}`, rodzaj_aparatu: "zbiornik" }).select('id, numer').single()
    zapytanie = z!.id
  }, 60_000)

  afterAll(async () => {
    if (zapytanie) await serwis.from('zapytania').delete().eq('id', zapytanie)
    for (const n of Object.keys(ROLE) as Nazwa[]) {
      if (id[n]) await serwis.auth.admin.deleteUser(id[n])
      await serwis.from('uprawnienia_startowe').delete().eq('email', `${n}-w-${znacznik}@wyceny.test`)
    }
  }, 60_000)

  it('numer ZO nadaje się automatycznie', async () => {
    const { data } = await serwis.from('zapytania').select('numer').eq('id', zapytanie).single()
    expect(data!.numer).toMatch(/^ZO\/\d{3}\/\d{4}$/)
  })

  it('równoczesne zakładanie zapytań daje różne numery ZO (bez błędu unikalności)', async () => {
    const wyniki = await Promise.all(Array.from({ length: 6 }, (_, i) =>
      k.technolog.from('zapytania').insert({ numer: '', przedmiot: `TEST równoczesne ${znacznik} ${i}`, rodzaj_aparatu: 'zbiornik' }).select('id, numer').single()))
    try {
      expect(wyniki.map((w) => w.error?.message ?? null)).toEqual(Array(6).fill(null))
      expect(new Set(wyniki.map((w) => w.data!.numer)).size).toBe(6)
    } finally {
      await serwis.from('zapytania').delete().like('przedmiot', `TEST równoczesne ${znacznik}%`)
    }
  })

  it('technolog tworzy wycenę (v1 z aparatem) i zapisuje pozycje', async () => {
    const { data, error } = await k.technolog.rpc('nowa_wycena', { p_zapytanie: zapytanie, p_nazwa: 'test' })
    expect(error).toBeNull()
    wycena = data as string
    const { data: ap } = await k.technolog.from('aparaty').select('id').eq('wycena_id', wycena).single()
    aparat = ap!.id
    const { error: e2 } = await k.technolog.rpc('zapisz_pozycje_aparatu', { p_aparat: aparat, p_pozycje: [
      { zakladka: 'materialy', sekcja: 'blachy', nazwa: 'płaszcz', ilosc: 1, jm: 'ark', cena_jedn: 10, jednostka_ceny: 'kg', masa_jedn: 100, masa_reczna: true },
      { zakladka: 'materialy', sekcja: 'blachy', nazwa: 'wypałki', ilosc: 1, jm: 'kpl', cena_jedn: 500, jednostka_ceny: 'jm' },
      { zakladka: 'robocizna', nazwa: 'spawacz', ilosc: 10, jm: 'rbh', cena_jedn: 100, jednostka_ceny: 'jm' },
    ] })
    expect(e2).toBeNull()
    const { data: poz } = await k.technolog.from('pozycje_wyceny').select('id, nazwa').eq('aparat_id', aparat)
    expect(poz).toHaveLength(3)
  })

  it('technolog bez flagi nie widzi marż; prezes widzi domyślny narzut z ustawień', async () => {
    expect((await k.technolog.from('wyceny_marze').select('*').eq('wycena_id', wycena)).data).toEqual([])
    const { data } = await k.prezes.from('wyceny_marze').select('narzut_zysk_proc').eq('wycena_id', wycena).single()
    expect(Number(data!.narzut_zysk_proc)).toBeGreaterThan(0)
  })

  it('komplet bez masy blokuje przekazanie do zatwierdzenia', async () => {
    const { error } = await k.technolog.rpc('zmien_status_wyceny', { p_wycena: wycena, p_status: 'do_zatwierdzenia' })
    expect(error?.message).toMatch(/komplet|kpl|masę/i)
  })

  it('dział handlowy zmienia cenę materiału, ale nie nazwę', async () => {
    const { data: wyp } = await k.technolog.from('pozycje_wyceny').select('id').eq('aparat_id', aparat).eq('nazwa', 'wypałki').single()
    const { error: ok } = await k.handlowy.from('pozycje_wyceny').update({ cena_jedn: 600, zrodlo_ceny: 'oferta', zrodlo_dostawca: 'X' }).eq('id', wyp!.id)
    expect(ok).toBeNull()
    const { error: zle } = await k.handlowy.from('pozycje_wyceny').update({ nazwa: 'inna' }).eq('id', wyp!.id)
    expect(zle?.message).toMatch(/Dział handlowy/)
    // technolog oznacza "cena za komplet"
    await k.technolog.from('pozycje_wyceny').update({ cena_za_komplet: true }).eq('id', wyp!.id)
  })

  it('technolog przekazuje do zatwierdzenia, ale nie może zatwierdzić', async () => {
    const { error } = await k.technolog.rpc('zmien_status_wyceny', { p_wycena: wycena, p_status: 'do_zatwierdzenia', p_podsumowanie: { koszty: 2600 } })
    expect(error).toBeNull()
    const { error: e2 } = await k.technolog.rpc('zmien_status_wyceny', { p_wycena: wycena, p_status: 'zatwierdzona', p_ceny: { cena: 1 } })
    expect(e2?.message).toMatch(/tylko prezes/)
    // w kolejce technolog nie zmieni już pozycji
    const { error: e3 } = await k.technolog.rpc('zapisz_pozycje_aparatu_sprawdzone', { p_aparat: aparat, p_pozycje: [] })
    expect(e3?.message).toMatch(/nie można już edytować/)
  })

  it('prezes zatwierdza - migawka ceny, cena widoczna dla technologa bez rozbicia', async () => {
    const { error } = await k.prezes.rpc('zmien_status_wyceny', { p_wycena: wycena, p_status: 'zatwierdzona', p_komentarz: 'ok',
      p_ceny: { koszt_calkowity: 2600, cena: 2900, cena_koncowa: 3000, cena_bez_opcji: null } })
    expect(error).toBeNull()
    const { data } = await k.technolog.rpc('cena_zatwierdzona', { p_wycena: wycena })
    expect(Number((data as { cena_koncowa: number }[])[0].cena_koncowa)).toBe(3000)
    const { data: z } = await serwis.from('zapytania').select('status').eq('id', zapytanie).single()
    expect(z!.status).toBe('zatwierdzona')
  })

  it('zatwierdzona wersja jest zamrożona (także dla prezesa); kopia tworzy v2 roboczą', async () => {
    const { error: e1 } = await k.prezes.from('wyceny').update({ narzut_zakupowy_proc: 99 }).eq('id', wycena)
    expect(e1?.message).toMatch(/zamrożona/)
    const { error: e2 } = await k.prezes.from('wyceny_marze').update({ narzut_zysk_proc: 50 }).eq('wycena_id', wycena)
    expect(e2?.message).toMatch(/zamrożona/)
    const { data: pozPrzed } = await k.technolog.from('pozycje_wyceny').select('id').eq('aparat_id', aparat)
    const { data: zmienione } = await k.technolog.from('pozycje_wyceny').update({ cena_jedn: 1 }).eq('aparat_id', aparat).select('id')
    expect(zmienione ?? []).toEqual([])   // RLS: brak zmienionych wierszy
    expect(pozPrzed).toHaveLength(3)
    // oferta dla klienta może być redagowana po zatwierdzeniu
    const { error: e3 } = await k.technolog.from('wyceny').update({ oferta: { obejmuje: ['test'] } }).eq('id', wycena)
    expect(e3).toBeNull()

    const { data: kopia, error: e4 } = await k.technolog.rpc('kopiuj_wycene', { p_wycena: wycena })
    expect(e4).toBeNull()
    const { data: v2 } = await k.technolog.from('wyceny').select('wersja, status, skopiowana_z').eq('id', kopia as string).single()
    expect(v2).toMatchObject({ wersja: 2, status: 'robocza', skopiowana_z: wycena })
    const { data: ap2 } = await k.technolog.from('aparaty').select('id, pozycje_wyceny(id)').eq('wycena_id', kopia as string)
    expect(ap2![0].pozycje_wyceny).toHaveLength(3)
  })

  it('korektę prezesa zmienia tylko prezes', async () => {
    const { data: kopie } = await serwis.from('wyceny').select('id').eq('zapytanie_id', zapytanie).eq('wersja', 2).single()
    await serwis.from('profiles').update({ widzi_marze: true }).eq('id', id.technolog)
    const { error } = await k.technolog.from('wyceny_marze').update({ korekta_prezesa_kwota: 1000 }).eq('wycena_id', kopie!.id)
    expect(error?.message).toMatch(/tylko prezes/)
    const { error: e2 } = await k.prezes.from('wyceny_marze').update({ korekta_prezesa_kwota: 1000 }).eq('wycena_id', kopie!.id)
    expect(e2).toBeNull()
  })
})
