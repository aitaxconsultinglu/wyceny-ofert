// Codzienne czyszczenie kosza (pg_cron): wpisy starsze niż ustawienie "kosz.dni" są usuwane trwale razem z plikami
// w Storage. Wywołanie nie przyjmuje żadnych danych i robi tylko to, co i tak zrobiłby harmonogram - dlatego działa
// bez tokenu użytkownika (verify_jwt = false), jak kursy-walut.
import { klientSerwisowy, NAGLOWKI_CORS, odpowiedz } from '../_wspolne/klienci.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: NAGLOWKI_CORS })
  const db = klientSerwisowy()
  const { data, error } = await db.rpc('kosz_do_wyczyszczenia')
  if (error) return odpowiedz({ error: error.message }, 500)
  const wpisy = (data ?? []) as { id: string; pliki: string[]; rodzaj: string; rekord_id: string; opis: string; zapytanie_id: string | null }[]
  let plikow = 0
  for (const w of wpisy) {
    if (w.pliki?.length) {
      const { error: e } = await db.storage.from('dokumenty').remove(w.pliki)
      if (e) { console.log(JSON.stringify({ kosz: w.id, blad: e.message })); continue }
      plikow += w.pliki.length
    }
    await db.from('kosz').delete().eq('id', w.id)
    await db.from('audit_log').insert({
      tabela: 'kosz', rekord_id: w.rekord_id, akcja: 'usuniecie_automatyczne', zapytanie_id: w.zapytanie_id,
      zmiany: { rodzaj: w.rodzaj, opis: w.opis, plikow: w.pliki?.length ?? 0 },
    })
  }
  return odpowiedz({ usunieto: wpisy.length, plikow })
})
