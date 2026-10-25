// Widoczność modułów. Etap 1 (domyślny) = wycena materiałowa: zapytania z dokumentami, odczyt rysunków, lista materiałów
// i parametry projektu, ceny z kart dostawy Optimy i ofert na materiały zebranych do zapytania. Pozostałe moduły są
// gotowe i tylko ukryte - włącza je administrator (Ustawienia → Narzuty i parametry → Tryb aplikacji). Opis: docs/FUNKCJE.md.
import { useSlowniki } from './slowniki'

export type TrybAplikacji = 'etap1' | 'pelny'

export type Modul =
  | 'analiza'             // karta analizy zapytania (AI i ręcznie)
  | 'przygotowanie'       // "Przygotuj automatycznie" z analizą, usługami, robocizną i projektem oferty
  | 'zapytaniaDostawcow'  // generator zapytań do dostawców i kooperantów
  | 'robocizna'           // pracochłonność, stawki, MPK
  | 'uslugi'              // kooperacja, badania / odbiory / transport, usługi kooperacyjne
  | 'oferta'              // oferta dla klienta (Word), notatka dla prezesa
  | 'zatwierdzanie'       // zatwierdzanie przez prezesa
  | 'projekty'            // projekty zrealizowane, Registo
  | 'wycenaMaterialowa'   // etap 1: wycena materiałowa jednym przyciskiem
  | 'wersjeEdytowalne'    // odczyt plików do wersji edytowalnych (Word), język, tłumaczenie na polski

const ETAP1: Modul[] = ['wycenaMaterialowa', 'wersjeEdytowalne']

export function modulWidoczny(tryb: TrybAplikacji, m: Modul): boolean {
  if (tryb === 'pelny') return true
  return ETAP1.includes(m)
}

export function trybAplikacji(ustawienia: Record<string, unknown>): TrybAplikacji {
  return (ustawienia.moduly as { tryb?: TrybAplikacji } | undefined)?.tryb === 'pelny' ? 'pelny' : 'etap1'
}

/** Hook: czy moduł jest widoczny w bieżącym trybie aplikacji. */
export function useModuly() {
  const { ustawienia } = useSlowniki()
  const tryb = trybAplikacji(ustawienia)
  return { tryb, widac: (m: Modul) => modulWidoczny(tryb, m) }
}
