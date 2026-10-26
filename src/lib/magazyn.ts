// Zapis dokumentów: wiersz w tabeli `dokumenty` + plik w prywatnym bucket "dokumenty"
// (ścieżka <id dokumentu>/<nazwa>). Pobieranie wyłącznie przez krótkotrwały signed URL.
// Przed zapisem plik jest kompresowany (lib/kompresja.ts) - w Storage jest tylko wersja zoptymalizowana; plik spakowany
// gzipem ma ścieżkę z końcówką ".gz" i pobieranie go rozpakowuje. Ten sam plik (SHA-256) w zapytaniu nie zapisuje się drugi raz.
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { komunikatPL } from './config'
import type { TypDokumentu, WczytanyPlik } from './dokumenty'
import { gunzipSync } from 'fflate'
import { jestGzip } from './kompresja'
import { t } from '@/i18n'

export const BUCKET = 'dokumenty'
const WAZNOSC_LINKU_S = 60
/** Plik nieistotny (np. długie obliczenia, standard klienta) większy niż tyle MB - zapisujemy sam tekst (miejsce planu). */
export const NIEISTOTNY_TYLKO_TEKST_MB = 2

export interface Powiazanie {
  zapytanie_id?: string | null
  oferta_id?: string | null
  projekt_id?: string | null
  nadrzedny_id?: string | null
}

export interface ZapisanyDokument { id: string; nazwa_pliku: string; stan: string; sciezka: string | null }

/** Nazwa pliku bezpieczna dla Storage (bez polskich znaków i znaków specjalnych). */
export function bezpiecznaNazwa(nazwa: string) {
  const bez = nazwa.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
  return bez.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').slice(-120) || 'plik'
}

/**
 * Zapisuje dokument. Mail: nigdy cały plik .msg/.eml - tylko treść jako tekst (stan "tylko_tekst"), a załączniki
 * rekurencyjnie jako osobne dokumenty powiązane z mailem. Śmieci z maila (logo, ikony, wizytówki, podpisy) są
 * pomijane już przy odczycie, a załączniki odznaczone przy imporcie ("nie wgrywaj") - tutaj. Plik większy niż limit
 * planu albo nieistotny i większy niż NIEISTOTNY_TYLKO_TEKST_MB: zapisujemy sam tekst z czytelnym komunikatem.
 */
export async function zapiszDokument(
  plik: WczytanyPlik,
  powiazanie: Powiazanie,
  opcje: { typ?: TypDokumentu; istotny?: boolean; limitMb: number; pominPlik?: boolean; bezKompresji?: boolean },
  db: SupabaseClient = supabase,
): Promise<{ dokument: ZapisanyDokument | null; ostrzezenia: string[] }> {
  const ostrzezenia: string[] = []
  const mail = plik.rodzaj === 'mail'
  // Kompresja przed sprawdzeniem limitu - skan 60 MB po przekodowaniu zwykle się mieści. Mail zapisuje sam tekst.
  const { kompresujPlik, sha256 } = await import('./kompresja')
  const k = mail || opcje.pominPlik || opcje.bezKompresji
    ? { dane: plik.dane, mime: plik.mime, metoda: 'brak' as const, rozmiar_oryginalny: plik.rozmiar, rozmiar_zapisany: plik.rozmiar, hash: await sha256(plik.dane), test: '' }
    : await kompresujPlik(plik.nazwa, plik.mime, plik.dane)
  // Duplikat: ten sam plik już jest w tym zapytaniu (albo ofercie) - ostrzeżenie zamiast drugiej kopii.
  const gdzie = powiazanie.zapytanie_id ? { kolumna: 'zapytanie_id', id: powiazanie.zapytanie_id } : powiazanie.oferta_id ? { kolumna: 'oferta_id', id: powiazanie.oferta_id } : null
  if (gdzie && !mail) {
    const { data: dup } = await db.from('dokumenty').select('id, nazwa_pliku').eq(gdzie.kolumna, gdzie.id).eq('hash', k.hash).limit(1)
    if (dup?.length) return { dokument: null, ostrzezenia: [t('{0}: ten sam plik jest już w dokumentach ({1}) - nie zapisano drugi raz.', plik.nazwa, dup[0].nazwa_pliku)] }
  }
  const zaDuzy = k.rozmiar_zapisany > opcje.limitMb * 1024 * 1024
  const istotny = opcje.istotny ?? plik.istotny ?? !['standard_klienta', 'korespondencja'].includes(opcje.typ ?? plik.typSugerowany)
  const duzyNieistotny = !mail && !istotny && !!plik.tekst.trim() && plik.rozmiar > NIEISTOTNY_TYLKO_TEKST_MB * 1024 * 1024
  const stan = mail ? 'tylko_tekst' : opcje.pominPlik || duzyNieistotny ? 'tylko_tekst' : zaDuzy ? 'pominiety_limit' : 'zapisany'
  if (zaDuzy && !mail) ostrzezenia.push(t('{0}: plik ma {1} MB (po kompresji) - powyżej limitu {2} MB na jeden plik. Zapisano tylko wyciągnięty tekst; zmniejsz plik albo podziel go.', plik.nazwa, (k.rozmiar_zapisany / 1024 / 1024).toFixed(1), opcje.limitMb))
  else if (duzyNieistotny) ostrzezenia.push(t('{0}: nieistotny plik {1} MB - zapisano sam tekst (oszczędność miejsca).', plik.nazwa, (plik.rozmiar / 1024 / 1024).toFixed(1)))
  const odznaczone = plik.zalaczniki.filter((z) => z.wgraj === false).map((z) => ({ nazwa: z.nazwa, rozmiar: z.rozmiar, powod: 'odznaczony przy imporcie' }))
  const metadane = odznaczone.length ? { ...plik.metadane, pominiete_zalaczniki: [...((plik.metadane.pominiete_zalaczniki as unknown[]) ?? []), ...odznaczone] } : plik.metadane

  const { data, error } = await db.from('dokumenty').insert({
    ...powiazanie,
    nazwa_pliku: plik.nazwa,
    typ: opcje.typ ?? plik.typSugerowany,
    mime: stan === 'zapisany' ? k.mime : plik.mime,
    rozmiar: plik.rozmiar,
    rozmiar_oryginalny: plik.rozmiar,
    rozmiar_zapisany: stan === 'zapisany' ? k.rozmiar_zapisany : 0,
    metoda_kompresji: stan === 'zapisany' ? k.metoda : 'brak',
    hash: k.hash,
    stan,
    istotny,
    tekst: plik.tekst || null,
    metadane: stan === 'zapisany' && k.metoda !== 'brak' ? { ...metadane, kompresja: k.test } : metadane,
  }).select('id, nazwa_pliku, stan, sciezka').single()
  if (error) {
    if (/dokumenty_message_id/.test(error.message)) throw new Error(t('Ten mail jest już w bazie (ten sam Message-ID): {0}', plik.nazwa))
    throw new Error(komunikatPL(error.message))
  }
  const dokument = data as ZapisanyDokument

  if (stan === 'zapisany') {
    const sciezka = `${dokument.id}/${bezpiecznaNazwa(plik.nazwa)}${k.metoda === 'gzip' ? '.gz' : ''}`
    const { error: bladPliku } = await db.storage.from(BUCKET).upload(sciezka, k.dane, { contentType: k.metoda === 'gzip' ? 'application/gzip' : k.mime, upsert: false })
    if (bladPliku) {
      ostrzezenia.push(`${plik.nazwa}: nie udało się zapisać pliku (${komunikatPL(bladPliku.message)}). Zapisano tylko tekst.`)
      await db.from('dokumenty').update({ stan: 'tylko_tekst' }).eq('id', dokument.id)
      dokument.stan = 'tylko_tekst'
    } else {
      await db.from('dokumenty').update({ sciezka }).eq('id', dokument.id)
      dokument.sciezka = sciezka
    }
  }

  for (const zal of plik.zalaczniki.filter((z) => z.wgraj !== false)) {
    try {
      const { ostrzezenia: o } = await zapiszDokument(zal, { nadrzedny_id: dokument.id }, { limitMb: opcje.limitMb }, db)
      ostrzezenia.push(...o)
    } catch (e) {
      ostrzezenia.push(e instanceof Error ? e.message : String(e))
    }
  }
  return { dokument, ostrzezenia }
}

/** Otwiera dokument przez signed URL ważny 60 s (plik spakowany gzipem - po rozpakowaniu, z pamięci przeglądarki). */
export async function otworzDokument(sciezka: string, mime = 'application/octet-stream') {
  if (sciezka.endsWith('.gz')) {
    const url = URL.createObjectURL(new Blob([(await pobierzBajty(sciezka)).slice()], { type: mime }))
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
    return
  }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(sciezka, WAZNOSC_LINKU_S)
  if (error || !data) throw new Error(komunikatPL(error?.message ?? 'Nie udało się utworzyć linku.'))
  window.open(data.signedUrl, '_blank', 'noopener')
}

export async function pobierzBajty(sciezka: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(BUCKET).download(sciezka)
  if (error || !data) throw new Error(komunikatPL(error?.message ?? 'Nie udało się pobrać pliku.'))
  const bajty = new Uint8Array(await data.arrayBuffer())
  // Plik zapisany gzipem (kompresja przy zapisie) - oddajemy treść oryginalną.
  return sciezka.endsWith('.gz') && jestGzip(bajty) ? gunzipSync(bajty) : bajty
}
