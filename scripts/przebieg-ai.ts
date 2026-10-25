// Cały przebieg na prawdziwych danych, tymi samymi funkcjami co aplikacja (kosztuje AI - zwykle kilka zł):
//   npx vite-node scripts/przebieg-ai.ts mail "<plik .msg/.eml względem folderu materiałów>"
//       = "Nowe z maila" (propozycja pól, załączniki z domyślną istotnością) + "Przygotuj automatycznie"
//   npx vite-node scripts/przebieg-ai.ts zapytanie ZO/123/2026
//       = "Przygotuj automatycznie" na istniejącym zapytaniu
// Działa jako tymczasowy technolog (konto *.test, usuwane na końcu) - przez RLS i funkcję "ai" jak przeglądarka.
// Wynik zostaje w bazie (zapytanie, dokumenty, karta analizy, odczyty rysunków, wstępna wycena) - do obejrzenia w aplikacji.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../src/lib/supabase'
import { splaszczArchiwa, wczytajDane } from '../src/lib/dokumenty'
import { zapiszDokument } from '../src/lib/magazyn'
import { domyslnieIstotny, propozycjaZapytania, type KlientImportu } from '../src/lib/importMaila'
import { wykonajPrzygotowanie, zaplanujPrzygotowanie, type SlownikiPrzygotowania, type ZapytanieDoPrzygotowania } from '../src/lib/przygotowanieAuto'
import { uzupelnijKarte, type KartaAnalizy } from '../src/lib/analiza'
import { wczytajWycene } from '../src/lib/wyceny'
import type { Ustawienia } from '../src/lib/types'
import { env, maMaterialy, maSupabase, plikMaterialow } from '../tests/lokalne/srodowisko'
import { rodzajZPrzedmiotu } from '../src/lib/zapytania'

const [tryb, arg] = process.argv.slice(2)
if (!['mail', 'zapytanie'].includes(tryb) || !arg) throw new Error('Użycie: przebieg-ai.ts mail "<plik>" | zapytanie <numer ZO>')
if (!maSupabase || !maMaterialy) throw new Error('Potrzebny .env z kluczami i FOLDER_MATERIALOW.')

const start = Date.now()
const log = (...a: unknown[]) => console.log(`[${String(Math.round((Date.now() - start) / 1000)).padStart(4)} s]`, ...a)
const blad = (e: { message: string } | null, co: string) => { if (e) throw new Error(`${co}: ${e.message}`) }
const serwis = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function slowniki(): Promise<SlownikiPrzygotowania> {
  const [km, ku, g, rs, st, ust] = await Promise.all([
    supabase.from('kategorie_materialow').select('*'), supabase.from('kategorie_uslug').select('*'), supabase.from('gatunki').select('*'),
    supabase.from('rodzaje_stali').select('*'), supabase.from('stawki_robocizny').select('*'), supabase.from('ustawienia').select('klucz, wartosc'),
  ])
  return {
    kategorieMaterialow: km.data ?? [], kategorieUslug: ku.data ?? [], gatunki: g.data ?? [], rodzajeStali: rs.data ?? [], stawki: st.data ?? [],
    ustawienia: Object.fromEntries((ust.data ?? []).map((x) => [x.klucz, x.wartosc])) as unknown as Ustawienia,
  }
}

/** "Nowe z maila": propozycja pól bez AI, zapis zapytania, maila i załączników (istotność domyślna jak w oknie). */
async function zMaila(sciezka: string, s: SlownikiPrzygotowania): Promise<string> {
  const nazwa = sciezka.split(/[\\/]/).pop()!
  const mail = await wczytajDane(nazwa, new Uint8Array(readFileSync(plikMaterialow(sciezka))))
  if (mail.rodzaj !== 'mail') throw new Error('To nie jest mail (.msg / .eml).')
  const mid = mail.metadane.message_id as string | null
  if (mid) {
    const { data } = await supabase.from('dokumenty').select('zapytanie_id').eq('metadane->>message_id', mid).not('zapytanie_id', 'is', null).limit(1)
    if (data?.[0]) { log(`Ten mail jest już w bazie - przygotowuję istniejące zapytanie.`); return data[0].zapytanie_id as string }
  }
  const { data: kl } = await supabase.from('klienci').select('id, nazwa, skrot, domeny').order('nazwa')
  const p = propozycjaZapytania({ temat: String(mail.metadane.temat ?? ''), od: String(mail.metadane.od ?? ''), od_email: String(mail.metadane.od_email ?? ''), data: (mail.metadane.data as string) ?? null, tekst: mail.tekst }, (kl ?? []) as KlientImportu[], s.ustawienia.firma?.domeny ?? [])
  const klient = (kl ?? []).find((k) => k.id === p.klient_id)?.nazwa
  log(`Propozycja z maila: przedmiot "${p.przedmiot}", klient ${klient ?? '(nie rozpoznano)'}${p.klient_powod ? ` - ${p.klient_powod}` : ''}, termin ofert ${p.termin_oferty ?? '-'}, nr zapytania ${p.nr_zapytania_klienta || '-'}`)
  const zalaczniki = splaszczArchiwa(mail.zalaczniki).map((z) => ({ ...z, istotny: domyslnieIstotny(z) }))
  for (const z of zalaczniki) log(`  ${z.istotny ? '[x]' : '[ ]'} ${z.nazwa} - ${z.typSugerowany}${z.metadane?.stron ? `, ${String(z.metadane.stron)} str.` : ''}${z.metadane?.skan ? ', skan' : ''}`)
  const { data: z, error } = await supabase.from('zapytania').insert({
    numer: '', przedmiot: p.przedmiot.trim() || 'Zapytanie z maila', klient_id: p.klient_id, nr_zapytania_klienta: p.nr_zapytania_klienta.trim() || null,
    termin_oferty: p.termin_oferty, zrodlo: 'mail', status: 'nowe', ...rodzajZPrzedmiotu(p.przedmiot),
  }).select('id, numer').single()
  blad(error, 'zapytanie')
  const { ostrzezenia } = await zapiszDokument({ ...mail, zalaczniki }, { zapytanie_id: z!.id }, { typ: 'korespondencja', istotny: true, limitMb: s.ustawienia.limity_planu.plik_mb }, supabase)
  log(`Zapytanie ${z!.numer}: zapisano mail i ${zalaczniki.length} załączników${ostrzezenia.length ? ` (uwagi: ${ostrzezenia.join('; ')})` : ''}`)
  return z!.id as string
}

async function przygotuj(id: string, s: SlownikiPrzygotowania) {
  const { data: r, error } = await supabase.from('zapytania').select('id, numer, przedmiot, klient_id, nr_zapytania_klienta, termin_oferty, status, klienci(nazwa)').eq('id', id).single()
  blad(error, 'zapytanie')
  const zr = r as unknown as Omit<ZapytanieDoPrzygotowania, 'klient'> & { klienci: { nazwa: string } | null }
  const z: ZapytanieDoPrzygotowania = { ...zr, klient: zr.klienci?.nazwa ?? null }
  log(`Przygotuj automatycznie: ${z.numer} "${z.przedmiot}"`)

  const plan = await zaplanujPrzygotowanie(z, { analiza: true, rysunki: true }, (o) => log(`  ${o}`), supabase)
  log(`Plan: ${plan.zadania.length} wywołań AI, szacunek ${plan.koszt_pln.toFixed(2)} zł`)
  for (const t of plan.zadania) log(`  - ${t.opis}: ${t.koszt_pln?.toFixed(3) ?? '?'} zł`)
  for (const p of plan.pominiete) log(`  (pominięte) ${p}`)
  if (!plan.aiDostepne) throw new Error(plan.uwaga ?? 'AI niedostępne')

  const raport = await wykonajPrzygotowanie(z, plan, { wycena: true, oferta: true }, s, false, (o) => log(`  ${o}`), supabase)
  log(`Raport: koszt AI ${raport.koszt_pln.toFixed(2)} zł`)
  for (const k of raport.kroki) log(`  ${k.stan.padEnd(9)} ${k.nazwa}: ${k.opis}`)

  // Co dostaje pracownik do weryfikacji.
  const { data: an } = await supabase.from('analizy_zapytan').select('dane').eq('zapytanie_id', id).single()
  const karta: KartaAnalizy = uzupelnijKarte(an?.dane as Partial<KartaAnalizy>)
  const pd = karta.podsumowanie
  log(`Karta: ${pd.przedmiot} | klient ${pd.klient} | nr ${pd.nr_zapytania_klienta} | termin ofert ${pd.termin_oferty} | realizacja ${pd.termin_realizacji} | dostawa ${pd.warunki_dostawy} ${pd.miejsce_dostawy}`)
  for (const a of karta.aparaty) log(`  aparat: ${a.nazwa} (${a.typ ?? '?'}) x${a.ilosc}, ${a.masa_kg ?? '?'} kg, Ø${a.srednica_mm ?? '?'} H${a.wysokosc_mm ?? '?'} L${a.dlugosc_mm ?? '?'}, ${a.material ?? '?'}`)
  log(`  wymagane: ${karta.wymagania.filter((w) => w.stan === 'wymagane').map((w) => `${w.kod}${w.wplyw === 'wysoki' ? '!' : ''}`).join(', ')}`)
  log(`  do wyjaśnienia: ${karta.wymagania.filter((w) => w.stan === 'do_wyjasnienia').map((w) => w.kod).join(', ') || '-'}`)
  for (const u of karta.uslugi) log(`  usługa: ${u.opis} [${u.kategoria ?? '-'}]${u.ilosc ? ` ${u.ilosc} ${u.jm}` : ''}`)
  for (const n of karta.niespojnosci) log(`  niespójność: ${n.opis}`)
  log(`  pytań do klienta: ${karta.pytania.length}`)
  if (raport.wycena_id) {
    const w = await wczytajWycene(raport.wycena_id, supabase)
    for (const a of w.aparaty) {
      const mat = a.pozycje.filter((p) => p.zakladka === 'materialy')
      log(`Wycena v${w.wycena.wersja}, ${a.nazwa}: masa ${a.masa_netto_kg ?? '?'} kg, materiałów ${mat.length} (z ceną ${mat.filter((p) => p.cena_jedn).length}), pozostałych ${a.pozycje.length - mat.length}, rbh/t ${a.wskaznik_rbh_t ?? '-'}, stawka ${a.stawka_wskaznikowa ?? '-'}`)
    }
  }
  const wg = raport.weryfikacja.reduce<Record<string, number>>((m, p) => ({ ...m, [p.rodzaj]: (m[p.rodzaj] ?? 0) + 1 }), {})
  log(`Do weryfikacji: ${raport.weryfikacja.length} punktów - ${Object.entries(wg).map(([k, n]) => `${k} ${n}`).join(', ')}`)
}

// Tymczasowy technolog: konto *.test z profilem nadanym przez uprawnienia startowe, usuwane na końcu
// (autor w zapisanych wierszach zmienia się wtedy na pusty - jak dla danych z seeda).
const email = `przebieg-${Math.random().toString(36).slice(2, 8)}@wyceny.test`
blad((await serwis.from('uprawnienia_startowe').insert({ email, rola: 'technolog', widzi_marze: false })).error, 'uprawnienia')
const haslo = `Test-${crypto.randomUUID()}!`
const { data: konto, error: ek } = await serwis.auth.admin.createUser({ email, password: haslo, email_confirm: true })
blad(ek, 'konto')
try {
  blad((await supabase.auth.signInWithPassword({ email, password: haslo })).error, 'logowanie')
  const s = await slowniki()
  const id = tryb === 'mail' ? await zMaila(arg, s) : (await supabase.from('zapytania').select('id').eq('numer', arg).single()).data?.id
  if (!id) throw new Error(`Nie ma zapytania ${arg}`)
  await przygotuj(id as string, s)
} finally {
  await supabase.auth.signOut().catch(() => undefined)
  await serwis.auth.admin.deleteUser(konto.user!.id)
  await serwis.from('uprawnienia_startowe').delete().eq('email', email)
}
