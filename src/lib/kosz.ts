// Kosz: usuwanie rekordów (zapytania z całą zawartością, dokumenty, odczyty, wersje wycen, oferty, importy, zapytania
// do dostawców, pliki wersji edytowalnych) przez funkcje bazy - uprawnienia sprawdza baza. Usunięcie to krok historii:
// Cofnij przywraca z kosza.
import { supabase } from './supabase'
import { komunikatPL } from './config'
import { BUCKET } from './magazyn'
import { zapiszKrok } from './historia'
import { t } from '@/i18n'

export type RodzajKosza = 'zapytanie' | 'dokument' | 'odczyt_rysunku' | 'wycena' | 'oferta_dostawcy' | 'import_optima'
  | 'import_registo' | 'zapytanie_do_dostawcy' | 'plik_edytowalny'

export const ETYKIETY_KOSZA: Record<RodzajKosza, string> = {
  zapytanie: t('zapytanie ofertowe'), dokument: t('dokument'), odczyt_rysunku: t('odczyt rysunku'), wycena: t('wersja wyceny'),
  oferta_dostawcy: t('oferta dostawcy'), import_optima: t('import karty dostawy'), import_registo: t('import Registo'),
  zapytanie_do_dostawcy: t('zapytanie do dostawców'), plik_edytowalny: t('plik (wersje edytowalne)'),
}

export interface WpisKosza {
  id: string; rodzaj: RodzajKosza; rekord_id: string; opis: string; zapytanie_id: string | null; numer_zo: string | null
  pliki: string[]; rozmiar: number; usunal: string | null; usunieto: string
}

/** Przeniesienie rekordów do kosza; krok historii (zakres) pozwala cofnąć. Zwraca liczbę przeniesionych. */
export async function doKosza(rodzaj: RodzajKosza, ids: string[], zakres: string | null, opis?: string): Promise<number> {
  const kroki: { rodzaj: string; id: string; koszId: string }[] = []
  for (const id of ids) {
    const { data, error } = await supabase.rpc('przenies_do_kosza', { p_rodzaj: rodzaj, p_id: id })
    if (error) {
      if (kroki.length && zakres) zapiszKrok(zakres, { opis: opis ?? t('usunięcie: {0}', ETYKIETY_KOSZA[rodzaj]), czas: Date.now(), kosz: kroki })
      throw new Error(komunikatPL(error.message))
    }
    kroki.push({ rodzaj, id, koszId: data as string })
  }
  if (kroki.length && zakres) zapiszKrok(zakres, { opis: opis ?? t('usunięcie: {0}{1}', ETYKIETY_KOSZA[rodzaj], kroki.length > 1 ? ` (${kroki.length})` : ''), czas: Date.now(), kosz: kroki })
  return kroki.length
}

export async function przywroc(koszId: string) {
  const { error } = await supabase.rpc('przywroc_z_kosza', { p_kosz: koszId })
  if (error) throw new Error(komunikatPL(error.message))
}

/** Trwałe usunięcie (prezes / administrator); dla zapytania - z wpisanym numerem ZO. Kasuje też pliki ze Storage. */
export async function usunTrwale(koszId: string, potwierdzenie: string | null) {
  const { data, error } = await supabase.rpc('usun_z_kosza_trwale', { p_kosz: koszId, p_potwierdzenie: potwierdzenie })
  if (error) throw new Error(komunikatPL(error.message))
  const pliki = (data as string[] | null) ?? []
  for (let i = 0; i < pliki.length; i += 100) {
    const { error: e } = await supabase.storage.from(BUCKET).remove(pliki.slice(i, i + 100))
    if (e) throw new Error(t('Wpis usunięty, ale nie wszystkie pliki: {0}', komunikatPL(e.message)))
  }
  return pliki.length
}
