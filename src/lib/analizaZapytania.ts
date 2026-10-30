// Dane do analizy zapytania przez AI: teksty dokumentów oznaczonych jako istotne (wyciągnięte przy dodawaniu) i - dla
// skanów bez tekstu - obrazy WSZYSTKICH stron (rysunki: pierwsza strona; ich tabele czyta moduł listy materiałowej),
// do limitu obrazów jednego wywołania. Do API nie idą dokumenty nieistotne.
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { komunikatPL } from './config'
import { BUCKET } from './magazyn'
import { tekstDoAnalizy, type DokumentDoAnalizy } from './analiza'
import { otworzRysunek, renderujPodglad } from './rysunkiPdf'
import type { DaneAi } from './ai'
import { jestRysunkiem } from './klasyfikacjaDokumentow'
import { t } from '@/i18n'

/** Najwięcej stron skanów (obrazów) w jednym wywołaniu - limit funkcji ai; nadmiarowe strony są wymienione w planie. */
export const MAKS_SKANOW = 20
/** Rysunek z mniejszą liczbą znaków w warstwie tekstowej idzie do analizy także jako obraz. */
const MALO_TEKSTU = 1500

export interface PrzygotowanaAnaliza {
  dane: DaneAi
  dokumentow: number
  skany: string[]
  pominiete: string[]
  uciete: string[]
  znakow: number
}

interface WierszDokumentu { id: string; nazwa_pliku: string; typ: string; tekst: string | null; metadane: Record<string, unknown>; sciezka: string | null; stan: string; istotny: boolean }

export async function dokumentyZapytania(zapytanieId: string, db: SupabaseClient = supabase): Promise<WierszDokumentu[]> {
  const kolumny = 'id, nazwa_pliku, typ, tekst, metadane, sciezka, stan, istotny'
  const { data, error } = await db.from('dokumenty').select(kolumny).eq('zapytanie_id', zapytanieId).order('utworzono')
  if (error) throw new Error(komunikatPL(error.message))
  const ids = (data ?? []).map((d) => d.id)
  const { data: zal } = ids.length ? await db.from('dokumenty').select(kolumny).in('nadrzedny_id', ids).is('zapytanie_id', null) : { data: [] }
  return [...(data ?? []), ...(zal ?? [])] as WierszDokumentu[]
}

export async function przygotujAnalize(
  zapytanie: { id: string; numer: string; przedmiot: string; klient: string | null }, db: SupabaseClient = supabase,
): Promise<PrzygotowanaAnaliza> {
  const istotne = (await dokumentyZapytania(zapytanie.id, db)).filter((d) => d.istotny)
  const doTekstu: DokumentDoAnalizy[] = istotne.map((d) => ({ nazwa: d.nazwa_pliku, typ: d.typ, tekst: d.tekst, skan: Boolean(d.metadane?.skan) }))
  const przyg = tekstDoAnalizy(doTekstu)

  // Skany PDF i rysunki bez czytelnej warstwy tekstowej (napisy zamienione na krzywe): pierwsza strona jako obraz -
  // z niej model bierze wymiary i masy aparatów (szczegóły - moduł rysunków).
  const bezTekstu = (d: WierszDokumentu) => Boolean(d.metadane?.skan) || (jestRysunkiem(d.typ) && (d.tekst ?? '').trim().length < MALO_TEKSTU)
  const skany = istotne.filter((d) => bezTekstu(d) && d.sciezka && d.stan === 'zapisany' && /\.pdf$/i.test(d.nazwa_pliku))
  const obrazy: NonNullable<DaneAi['obrazy']> = []
  const pominiete = [...przyg.pominiete]
  const wyslane: string[] = []
  // Najpierw zapytanie i wymagania (wszystkie strony), potem rysunki (pierwsza strona).
  for (const d of [...skany].sort((a, b) => Number(jestRysunkiem(a.typ)) - Number(jestRysunkiem(b.typ)))) {
    if (obrazy.length >= MAKS_SKANOW) { pominiete.push(`${d.nazwa_pliku} (skan)`); continue }
    const { data, error } = await db.storage.from(BUCKET).download(d.sciezka!)
    if (error || !data) { pominiete.push(`${d.nazwa_pliku} (nie udało się pobrać)`); continue }
    const pdf = await otworzRysunek(new Uint8Array(await data.arrayBuffer()))
    const stron = jestRysunkiem(d.typ) ? 1 : pdf.numPages
    let nr = 1
    for (; nr <= stron && obrazy.length < MAKS_SKANOW; nr++) {
      const p = await renderujPodglad(pdf, nr, 1568)
      obrazy.push({ media_type: 'image/jpeg', dane: p.dataUrl.slice(p.dataUrl.indexOf(',') + 1), opis: t('Plik: {0} ({1}, strona {2} z {3})', d.nazwa_pliku, d.metadane?.skan ? 'skan' : 'rysunek', nr, pdf.numPages) })
    }
    wyslane.push(stron > 1 ? `${d.nazwa_pliku} (str. 1-${nr - 1})` : d.nazwa_pliku)
    if (nr <= stron) pominiete.push(`${d.nazwa_pliku} (str. ${nr}-${stron})`)
  }

  return {
    dane: {
      zapytanie_id: zapytanie.id,
      tekst: przyg.tekst,
      obrazy,
      metadane: { zapytanie: zapytanie.numer, przedmiot: zapytanie.przedmiot, klient: zapytanie.klient },
    },
    dokumentow: istotne.length,
    skany: wyslane,
    pominiete,
    uciete: przyg.uciete,
    znakow: przyg.tekst.length,
  }
}
