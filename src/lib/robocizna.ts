import { t } from '@/i18n'

// Robocizna szczegółowa: pozycje "stanowisko × przedział czasu × ilość rbh × stawka" (jak rozliczenie robocizny w SAP).
// Przedział i osoba wyceniająca są zapisane w `dodatkowe` pozycji wyceny - bez zmiany struktury pozycji.

export interface PrzedzialCzasu { kod: string; nazwa: string }

/** Domyślne przedziały czasu pracy (cennik roboczogodzin może je rozszerzyć). */
export const PRZEDZIALY_CZASU: PrzedzialCzasu[] = [
  { kod: '7-15', nazwa: '7:00-15:00' },
  { kod: '15-19', nazwa: '15:00-19:00' },
  { kod: '19-7', nazwa: '19:00-7:00' },
  { kod: 'wolne', nazwa: t('dni wolne') },
]

export interface DodatkoweRobocizny { przedzial?: string | null; technolog?: string | null; /** Stanowisko z cennika roboczogodzin (migawka wyceny). */ stanowisko_id?: number | null }

export const przedzialPozycji = (dodatkowe: Record<string, unknown> | undefined) => (dodatkowe as DodatkoweRobocizny | undefined)?.przedzial ?? null

/** Odchylenie stawki w wycenie od stawki ze słownika / cennika (null = brak odniesienia). */
export function odchylenieStawki(stawka: number, wzorcowa: number | null | undefined): number | null {
  if (wzorcowa === null || wzorcowa === undefined) return null
  return Math.round((stawka - wzorcowa) * 100) / 100
}
