// Cennik roboczogodzin z lokalnego pliku prywatne/stawki-robocizny.json (poza repozytorium) -> Supabase (klucz serwisowy
// z .env). Stanowiska dopasowane po nazwie (nowe - dodane), stawki jako wersja obowiązująca od dziś, wpisy oznaczone
// „do weryfikacji”. Można uruchamiać wielokrotnie - ta sama wersja dnia jest nadpisywana, nie dublowana.
//   npm run seed:stawki [ścieżka-pliku]
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const KORZEN = join(import.meta.dirname, '..')
const env = Object.fromEntries(readFileSync(join(KORZEN, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const plik = process.argv[2] ?? join(KORZEN, 'prywatne', 'stawki-robocizny.json')
if (!existsSync(plik)) {
  console.error(`Brak pliku ${plik} - skopiuj scripts/seed/stawki-robocizny.przyklad.json do prywatne/ i wpisz stawki.`)
  process.exit(1)
}
const { stanowiska } = JSON.parse(readFileSync(plik, 'utf8'))
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const dzis = new Date().toISOString().slice(0, 10)

const { data: przedzialy, error: e0 } = await db.from('przedzialy_czasu').select('kod')
if (e0) throw new Error(e0.message)
const kody = new Set(przedzialy.map((p) => p.kod))
const { data: obecne } = await db.from('cennik_robocizny').select('id, nazwa').eq('aktywne', true)

let nowych = 0
let stawek = 0
for (const [i, s] of stanowiska.entries()) {
  const tryb = s.stala !== undefined ? 'stala' : 'przedzialy'
  let id = obecne.find((x) => x.nazwa.toLowerCase() === s.nazwa.toLowerCase())?.id
  if (id) {
    const { error } = await db.from('cennik_robocizny').update({ tryb, do_weryfikacji: true, kolejnosc: i + 1 }).eq('id', id)
    if (error) throw new Error(error.message)
  } else {
    const { data, error } = await db.from('cennik_robocizny').insert({ nazwa: s.nazwa, tryb, do_weryfikacji: true, kolejnosc: i + 1 }).select('id').single()
    if (error) throw new Error(error.message)
    id = data.id
    nowych++
  }
  const wpisy = tryb === 'stala' ? [[null, s.stala]] : Object.entries(s.stawki ?? {})
  for (const [kod, stawka] of wpisy) {
    if (kod !== null && !kody.has(kod)) throw new Error(`${s.nazwa}: nieznany przedział "${kod}" (kody: ${[...kody].join(', ')})`)
    // Wersja z dzisiejszą datą: aktualizacja, gdy już jest (ponowne uruchomienie), inaczej nowa.
    let q = db.from('cennik_robocizny_stawki').select('id').eq('stanowisko_id', id).eq('wazna_od', dzis)
    q = kod === null ? q.is('przedzial_kod', null) : q.eq('przedzial_kod', kod)
    const { data: jest } = await q
    const { error } = jest?.length
      ? await db.from('cennik_robocizny_stawki').update({ stawka }).eq('id', jest[0].id)
      : await db.from('cennik_robocizny_stawki').insert({ stanowisko_id: id, przedzial_kod: kod, stawka, wazna_od: dzis })
    if (error) throw new Error(error.message)
    stawek++
  }
}
console.log(`Cennik roboczogodzin: ${stanowiska.length} stanowisk (nowych ${nowych}), ${stawek} stawek od ${dzis} - oznaczone „do weryfikacji”.`)
