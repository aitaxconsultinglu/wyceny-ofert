// Zapis dokumentów: wiersz w tabeli `dokumenty` + plik w prywatnym bucket "dokumenty"
// (ścieżka <id dokumentu>/<nazwa>). Pobieranie wyłącznie przez krótkotrwały signed URL.
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { komunikatPL } from './config'
import type { TypDokumentu, WczytanyPlik } from './dokumenty'
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
  opcje: { typ?: TypDokumentu; istotny?: boolean; limitMb: number; pominPlik?: boolean },
  db: SupabaseClient = supabase,
): Promise<{ dokument: ZapisanyDokument; ostrzezenia: string[] }> {
  const ostrzezenia: string[] = []
  const mail = plik.rodzaj === 'mail'
  const zaDuzy = plik.rozmiar > opcje.limitMb * 1024 * 1024
  const istotny = opcje.istotny ?? plik.istotny ?? !['standard_klienta', 'korespondencja'].includes(opcje.typ ?? plik.typSugerowany)
  const duzyNieistotny = !mail && !istotny && !!plik.tekst.trim() && plik.rozmiar > NIEISTOTNY_TYLKO_TEKST_MB * 1024 * 1024
  const stan = mail ? 'tylko_tekst' : opcje.pominPlik || duzyNieistotny ? 'tylko_tekst' : zaDuzy ? 'pominiety_limit' : 'zapisany'
  if (zaDuzy && !mail) ostrzezenia.push(`${plik.nazwa}: plik ma ${(plik.rozmiar / 1024 / 1024).toFixed(1)} MB - powyżej limitu ${opcje.limitMb} MB planu. Zapisano tylko wyciągnięty tekst.`)
  else if (duzyNieistotny) ostrzezenia.push(`${plik.nazwa}: nieistotny plik ${(plik.rozmiar / 1024 / 1024).toFixed(1)} MB - zapisano sam tekst (oszczędność miejsca).`)
  const odznaczone = plik.zalaczniki.filter((z) => z.wgraj === false).map((z) => ({ nazwa: z.nazwa, rozmiar: z.rozmiar, powod: 'odznaczony przy imporcie' }))
  const metadane = odznaczone.length ? { ...plik.metadane, pominiete_zalaczniki: [...((plik.metadane.pominiete_zalaczniki as unknown[]) ?? []), ...odznaczone] } : plik.metadane

  const { data, error } = await db.from('dokumenty').insert({
    ...powiazanie,
    nazwa_pliku: plik.nazwa,
    typ: opcje.typ ?? plik.typSugerowany,
    mime: plik.mime,
    rozmiar: plik.rozmiar,
    stan,
    istotny,
    tekst: plik.tekst || null,
    metadane,
  }).select('id, nazwa_pliku, stan, sciezka').single()
  if (error) {
    if (/dokumenty_message_id/.test(error.message)) throw new Error(t('Ten mail jest już w bazie (ten sam Message-ID): {0}', plik.nazwa))
    throw new Error(komunikatPL(error.message))
  }
  const dokument = data as ZapisanyDokument

  if (stan === 'zapisany') {
    const sciezka = `${dokument.id}/${bezpiecznaNazwa(plik.nazwa)}`
    const { error: bladPliku } = await db.storage.from(BUCKET).upload(sciezka, plik.dane, { contentType: plik.mime, upsert: false })
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

/** Otwiera dokument przez signed URL ważny 60 s. */
export async function otworzDokument(sciezka: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(sciezka, WAZNOSC_LINKU_S)
  if (error || !data) throw new Error(komunikatPL(error?.message ?? 'Nie udało się utworzyć linku.'))
  window.open(data.signedUrl, '_blank', 'noopener')
}

export async function pobierzBajty(sciezka: string): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(BUCKET).download(sciezka)
  if (error || !data) throw new Error(komunikatPL(error?.message ?? 'Nie udało się pobrać pliku.'))
  return new Uint8Array(await data.arrayBuffer())
}
