// Jedyne miejsce, z którego aplikacja woła Claude API. Klucz ANTHROPIC_API_KEY żyje
// wyłącznie w sekretach funkcji. Funkcja:
//  - sprawdza zalogowanego pracownika,
//  - pilnuje budżetu (miesięczny limit firmy, dzienny limit użytkownika, limity jednego wywołania),
//  - umie tylko oszacować koszt (szacuj: true) - liczy tokeny bez wywoływania modelu,
//  - zapisuje każde wywołanie w ai_uzycie (tokeny, koszt) - bez treści dokumentów.
import Anthropic from 'npm:@anthropic-ai/sdk@0.120'
import { klientSerwisowy, ktoWywoluje, NAGLOWKI_CORS, odpowiedz } from '../_wspolne/klienci.ts'
import { TRYBY, normalizujWynik, type KontekstTrybu } from './tryby.ts'

interface UstawieniaAi {
  modele: Record<string, string>
  tryby: Record<string, string>
  ceny_usd_za_mln: Record<string, { wejscie: number; wyjscie: number; cache_odczyt: number; cache_zapis: number }>
  limit_miesieczny_pln: number
  limit_dzienny_uzytkownika_pln: number
  max_stron_na_wywolanie: number
  max_obrazow_na_wywolanie: number
  kurs_usd_awaryjny: number
}

/** opis - krótka etykieta przed obrazem (np. "Kafel 3: wykaz części, wiersz 2, kolumna 1"). */
interface Obraz { media_type: 'image/jpeg' | 'image/png' | 'image/webp'; dane: string; opis?: string }
interface Zadanie {
  tryb: string
  szacuj?: boolean
  model?: 'tani' | 'standard' | 'najlepszy'
  tekst?: string
  obrazy?: Obraz[]
  /** Krótkie PDF-y (np. zeskanowana oferta) w base64 - model czyta też strony bez warstwy tekstowej. */
  pdfy?: { nazwa: string; dane: string; stron: number }[]
  metadane?: Record<string, unknown>
  zapytanie_id?: string | null
  dokument_id?: string | null
  /** Plik modułu "Wersje edytowalne" - koszt przypisany do pliku w ai_uzycie. */
  plik_id?: string | null
}

/**
 * Klucz z sekretu ANTHROPIC_API_KEY. Gdy sekret dodano w panelu pod inną nazwą (np. nazwą klucza z Claude
 * Console) - pierwszy sekret, którego wartość wygląda na klucz Claude API ("sk-ant-...").
 */
function kluczAnthropic(): string | null {
  const k = Deno.env.get('ANTHROPIC_API_KEY')?.trim()
  if (k) return k
  return Object.values(Deno.env.toObject()).map((v) => v.trim()).find((v) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(v)) ?? null
}

function koszt(usage: Record<string, number | null | undefined>, ceny: UstawieniaAi['ceny_usd_za_mln'][string]) {
  const we = usage.input_tokens ?? 0
  const wy = usage.output_tokens ?? 0
  const odczyt = usage.cache_read_input_tokens ?? 0
  const zapis = usage.cache_creation_input_tokens ?? 0
  return (we * ceny.wejscie + wy * ceny.wyjscie + odczyt * ceny.cache_odczyt + zapis * ceny.cache_zapis) / 1_000_000
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: NAGLOWKI_CORS })
  const start = Date.now()
  const serwisowy = klientSerwisowy()
  // Najpierw cała treść żądania: odpowiedź bez jej odczytania (np. 401 przy wygasłej sesji) zostawia
  // przeglądarkę wysyłającą kafle (~1 MB) bez końca - fetch nigdy się nie kończy.
  let zadanie: Zadanie | null = null
  try { zadanie = await req.json() } catch { /* niżej 400 */ }
  const kto = await ktoWywoluje(req, serwisowy, { dopuscSerwis: true })
  if (!kto) return odpowiedz({ error: 'Brak autoryzacji - zaloguj się ponownie.' }, 401)
  if (!zadanie) return odpowiedz({ error: 'Nieprawidłowe dane wywołania.' }, 400)
  const definicja = TRYBY[zadanie.tryb]
  if (!definicja) return odpowiedz({ error: `Nieznany tryb AI: ${zadanie.tryb}` }, 400)

  const [{ data: ust }, { data: fir }, { data: kmat }, { data: kusl }, { data: usd }] = await Promise.all([
    serwisowy.from('ustawienia').select('wartosc').eq('klucz', 'ai').single(),
    serwisowy.from('ustawienia').select('wartosc').eq('klucz', 'firma').maybeSingle(),
    serwisowy.from('kategorie_materialow').select('kod, nazwa').order('kolejnosc'),
    serwisowy.from('kategorie_uslug').select('kod, nazwa, jednostka_odniesienia').order('kolejnosc'),
    serwisowy.from('kursy_walut').select('kurs').eq('waluta', 'USD').order('data', { ascending: false }).limit(1).maybeSingle(),
  ])
  const ai = ust?.wartosc as UstawieniaAi
  const kursUsd = Number(usd?.kurs ?? ai.kurs_usd_awaryjny ?? 4)
  const poziom = zadanie.model ?? ai.tryby[zadanie.tryb] ?? 'standard'
  const model = ai.modele[poziom]
  const ceny = ai.ceny_usd_za_mln[model]
  if (!model || !ceny) return odpowiedz({ error: `Brak modelu lub cennika dla poziomu "${poziom}" - uzupełnij ustawienia AI.` }, 500)

  const obrazy = zadanie.obrazy ?? []
  if (obrazy.length > ai.max_obrazow_na_wywolanie) {
    return odpowiedz({ error: `Za dużo obrazów w jednym wywołaniu (${obrazy.length}, limit ${ai.max_obrazow_na_wywolanie}). Zaznacz mniejszy obszar albo mniej stron.` }, 400)
  }
  const pdfy = zadanie.pdfy ?? []
  const stronPdf = pdfy.reduce((s, p) => s + (p.stron || 1), 0)
  if (stronPdf > ai.max_stron_na_wywolanie) {
    return odpowiedz({ error: `Za dużo stron PDF w jednym wywołaniu (${stronPdf}, limit ${ai.max_stron_na_wywolanie}).` }, 400)
  }
  const tekst = (zadanie.tekst ?? '').slice(0, 400_000)
  if (!tekst.trim() && !obrazy.length && !pdfy.length) return odpowiedz({ error: 'Brak treści do analizy.' }, 400)

  const zapisz = (dane: Record<string, unknown>) =>
    serwisowy.from('ai_uzycie').insert({
      user_id: kto.id, tryb: zadanie.tryb, model, obrazow: obrazy.length,
      zapytanie_id: zadanie.zapytanie_id ?? null, dokument_id: zadanie.dokument_id ?? null, plik_id: zadanie.plik_id ?? null,
      czas_ms: Date.now() - start, ...dane,
    })

  // Budżet: miesięczny limit firmy i dzienny limit użytkownika (kilkaset wywołań miesięcznie - suma po stronie funkcji).
  const teraz = new Date()
  const poczatekMiesiaca = new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth(), 1)).toISOString()
  const poczatekDnia = new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth(), teraz.getUTCDate())).toISOString()
  const { data: uzycia } = await serwisowy.from('ai_uzycie').select('koszt_pln, user_id, utworzono').gte('utworzono', poczatekMiesiaca)
  const z = {
    miesiac_pln: (uzycia ?? []).reduce((s, u) => s + Number(u.koszt_pln), 0),
    dzis_uzytkownik_pln: (uzycia ?? []).filter((u) => u.user_id === kto.id && u.utworzono >= poczatekDnia).reduce((s, u) => s + Number(u.koszt_pln), 0),
  }
  if (Number(z.miesiac_pln) >= ai.limit_miesieczny_pln) {
    await zapisz({ status: 'odmowa_budzetu', komunikat: 'limit miesięczny' })
    return odpowiedz({ error: `Wyczerpany miesięczny budżet AI (${ai.limit_miesieczny_pln} zł). Administrator może podnieść limit w Ustawieniach.` }, 402)
  }
  if (!kto.serwis && Number(z.dzis_uzytkownik_pln) >= ai.limit_dzienny_uzytkownika_pln) {
    await zapisz({ status: 'odmowa_budzetu', komunikat: 'limit dzienny użytkownika' })
    return odpowiedz({ error: `Wyczerpany Twój dzienny limit AI (${ai.limit_dzienny_uzytkownika_pln} zł). Spróbuj jutro albo poproś administratora o podniesienie limitu.` }, 402)
  }

  const klucz = kluczAnthropic()
  if (!klucz) return odpowiedz({ error: 'Klucz Claude API nie jest ustawiony (supabase secrets set ANTHROPIC_API_KEY=...).' }, 503)
  const claude = new Anthropic({ apiKey: klucz })

  // Nazwa i profil firmy z ustawień (repozytorium nie zawiera danych firmy).
  const firma = (fir?.wartosc ?? {}) as { nazwa?: string; opis_dzialalnosci?: string; domeny?: string[] }
  const kontekst: KontekstTrybu = {
    kategorieMaterialow: kmat ?? [], kategorieUslug: kusl ?? [],
    firma: { nazwa: firma.nazwa?.trim() || 'firma', opis: firma.opis_dzialalnosci?.trim() ?? '', domeny: firma.domeny ?? [] },
  }
  const system = [{ type: 'text' as const, text: definicja.instrukcja(kontekst), cache_control: { type: 'ephemeral' as const } }]
  const metadane = zadanie.metadane ? `Metadane: ${JSON.stringify(zadanie.metadane)}\n\n` : ''
  const tresc: Anthropic.ContentBlockParam[] = [
    ...pdfy.map((p) => ({ type: 'document' as const, title: p.nazwa, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: p.dane } })),
    ...obrazy.flatMap((o): Anthropic.ContentBlockParam[] => [
      ...(o.opis ? [{ type: 'text' as const, text: o.opis.slice(0, 200) }] : []),
      { type: 'image' as const, source: { type: 'base64' as const, media_type: o.media_type, data: o.dane } },
    ]),
    { type: 'text', text: `${metadane}<dokument>\n${tekst || '(treść tylko na obrazach powyżej)'}\n</dokument>` },
  ]
  const wiadomosci: Anthropic.MessageParam[] = [{ role: 'user', content: tresc }]
  const schemat = definicja.schemat(kontekst)

  if (zadanie.szacuj) {
    try {
      const licz = await claude.messages.countTokens({ model, system, messages: wiadomosci })
      // Odczyt z tłumaczeniem w tym samym wywołaniu zwraca treść dwa razy.
      const wyjscie = definicja.szacunekWyjscia * (zadanie.metadane?.tlumacz_na_polski ? 2 : 1)
      const usd = koszt({ input_tokens: licz.input_tokens, output_tokens: wyjscie }, ceny)
      return odpowiedz({
        szacunek: true, model, tokeny_wejscie: licz.input_tokens, tokeny_wyjscie_szac: wyjscie,
        koszt_usd: usd, koszt_pln: usd * kursUsd,
        pozostalo_miesiac_pln: ai.limit_miesieczny_pln - Number(z.miesiac_pln),
      })
    } catch (e) {
      return odpowiedz({ error: `Nie udało się oszacować kosztu: ${e instanceof Error ? e.message : String(e)}` }, 502)
    }
  }

  // Wywołanie modelu trwa do ~2 minut, a połączenie, którym przez ~60 s nic nie płynie, jest zamykane - wynik by przepadł,
  // choć model go przygotował i koszt naliczono. Dlatego odpowiedź idzie strumieniem: co 10 s spacja (dozwolona przed JSON),
  // na końcu wynik. Błędy tej fazy mają status HTTP 200 i pole "error" (klient sprawdza pole, nie tylko status).
  const wywolajModel = async (): Promise<Record<string, unknown>> => {
    try {
      // Sonnet / Opus: server-side fallback przy odmowie klasyfikatora bezpieczeństwa (fallbacks: "default").
      const zFallbackiem = !model.includes('haiku')
      const parametry: Record<string, unknown> = {
        model,
        max_tokens: definicja.maxTokens,
        system,
        messages: wiadomosci,
        output_config: { effort: definicja.effort, format: { type: 'json_schema', schema: schemat } },
        ...(zFallbackiem ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
      }
      // deno-lint-ignore no-explicit-any
      const odp = await (claude.beta.messages.create as any)(parametry) as Anthropic.Beta.BetaMessage
      const usage = odp.usage as unknown as Record<string, number>
      const usdKoszt = koszt(usage, ceny)
      const wspolne = {
        tokeny_wejscie: usage.input_tokens ?? 0, tokeny_wyjscie: usage.output_tokens ?? 0,
        tokeny_cache_odczyt: usage.cache_read_input_tokens ?? 0, tokeny_cache_zapis: usage.cache_creation_input_tokens ?? 0,
        koszt_usd: usdKoszt, koszt_pln: usdKoszt * kursUsd,
      }
      if (odp.stop_reason === 'refusal') {
        await zapisz({ ...wspolne, status: 'odmowa_modelu', komunikat: odp.stop_details?.category ?? 'refusal' })
        return { error: 'Model odmówił przetworzenia dokumentu. Spróbuj ponownie albo wprowadź dane ręcznie.', status_http: 422 }
      }
      if (odp.stop_reason === 'max_tokens') {
        await zapisz({ ...wspolne, status: 'blad', komunikat: 'max_tokens' })
        return { error: 'Odpowiedź przekroczyła limit długości - podziel dokument na mniejsze części.', status_http: 422 }
      }
      const blok = odp.content.find((b) => b.type === 'text') as { text: string } | undefined
      let wynik: unknown
      try { wynik = normalizujWynik(schemat, JSON.parse(blok?.text ?? '')) } catch {
        await zapisz({ ...wspolne, status: 'blad', komunikat: 'nieprawidłowy JSON' })
        return { error: 'Model zwrócił nieprawidłową odpowiedź. Spróbuj ponownie.', status_http: 502 }
      }
      await zapisz({ ...wspolne, status: 'ok', model: odp.model })
      // W logach funkcji tylko metadane - nigdy treść dokumentu.
      console.log(JSON.stringify({ tryb: zadanie.tryb, model: odp.model, ...wspolne, czas_ms: Date.now() - start }))
      return { wynik, model: odp.model, koszt_pln: wspolne.koszt_pln, tokeny: wspolne }
    } catch (e) {
      const komunikat = e instanceof Anthropic.APIError ? `${e.status}: ${e.message}`.slice(0, 300) : String(e).slice(0, 300)
      await zapisz({ status: 'blad', komunikat })
      return { error: `Błąd Claude API (${komunikat}).`, status_http: e instanceof Anthropic.RateLimitError ? 429 : 502 }
    }
  }
  const enc = new TextEncoder()
  const strumien = new ReadableStream<Uint8Array>({
    async start(k) {
      const puls = setInterval(() => k.enqueue(enc.encode(' ')), 10_000)
      try { k.enqueue(enc.encode(JSON.stringify(await wywolajModel()))) } finally { clearInterval(puls); k.close() }
    },
  })
  return new Response(strumien, { headers: { ...NAGLOWKI_CORS, 'Content-Type': 'application/json' } })
})
