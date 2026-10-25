// Klucz "publishable" jest z założenia jawny - dostępu do danych pilnuje RLS po stronie
// Supabase, a nie utajnienie tego ciągu. Klucz serwisowy NIGDY tu nie trafia.
// Celowo || zamiast ??: nieustawiona zmienna w GitHub Actions podstawia pusty ciąg,
// a nie undefined, więc ?? nie sięgnęłoby po wartość domyślną.
// Przeniesienie na plan Pro / własny serwer = zmiana tych dwóch wartości (albo zmiennych
// SUPABASE_URL i SUPABASE_ANON_KEY w ustawieniach repozytorium), bez zmian w kodzie.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://zrwouorevhxdtvubniwg.supabase.co'

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_a1UOUEVM_K5E7PFvGvdOOg_UDvE6nAD'

import { t, tDowolny } from '@/i18n'

export const MIN_DLUGOSC_HASLA = 6
const ZNAKI_SPECJALNE = /[^A-Za-z0-9]/

/** Zwraca komunikat o błędzie albo null, gdy hasło spełnia wymagania. */
export function sprawdzHaslo(haslo: string): string | null {
  if (haslo.length < MIN_DLUGOSC_HASLA) {
    return t('Hasło musi mieć co najmniej {0} znaków.', MIN_DLUGOSC_HASLA)
  }
  if (!ZNAKI_SPECJALNE.test(haslo)) {
    return t('Hasło musi zawierać co najmniej jeden znak specjalny (np. ! @ # ? -).')
  }
  return null
}

// Supabase zwraca część komunikatów po angielsku - tłumaczymy je na język interfejsu; komunikaty bazy (po polsku,
// z funkcji i triggerów) przechodzą przez słownik EN_BAZA.
const KOMUNIKATY: [RegExp, string][] = [
  [/different from the old password/i, t('Nowe hasło musi różnić się od dotychczasowego.')],
  [/should be at least (\d+) characters/i, t('Hasło jest za krótkie.')],
  [/invalid login credentials/i, t('Nieprawidłowy login lub hasło.')],
  [/email rate limit exceeded/i, t('Za dużo wiadomości w krótkim czasie. Spróbuj ponownie za kilka minut.')],
  [/you can only request this after (\d+) seconds/i, t('Odczekaj chwilę przed kolejną próbą.')],
  [/token has expired or is invalid/i, t('Link wygasł lub został już użyty. Poproś o nowy.')],
  [/password is known to be weak|pwned/i, t('To hasło wyciekło w znanych naruszeniach danych. Wybierz inne.')],
  [/already been registered|already registered/i, t('Konto z tym adresem już istnieje.')],
  [/duplicate key value/i, t('Taki wpis już istnieje.')],
  [/violates foreign key constraint/i, t('Wpis jest używany gdzie indziej - nie można go usunąć ani zmienić klucza.')],
  [/row-level security|permission denied/i, t('Brak uprawnień do tej operacji.')],
  [/failed to fetch|network/i, t('Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie - nic nie zostało utracone.')],
  [/JWT expired/i, t('Sesja wygasła. Zaloguj się ponownie.')],
]

export function komunikatPL(wiadomosc: string) {
  for (const [wzorzec, tlumaczenie] of KOMUNIKATY) {
    if (wzorzec.test(wiadomosc)) return tlumaczenie
  }
  return tDowolny(wiadomosc)
}
