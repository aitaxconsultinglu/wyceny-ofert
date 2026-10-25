// Funkcje uśpione na dalsze etapy: kod zostaje, interfejs je ukrywa. Włącza się je tutaj (w kodzie, nie w ustawieniach
// użytkownika) - aplikacja ma jedną wersję, wszystkie pozostałe moduły są widoczne zawsze. Opis: docs/FUNKCJE.md.
export const FUNKCJE = {
  /** Zapytania → "Nowe z maila": zapytanie z całego maila (importMaila.ts, NoweZMaila.tsx). Dziś zapytanie zakłada się
   *  ręcznie, a dokumenty dodaje technolog. Dodawanie maila z ofertą (kooperacja, badania, oferty) działa niezależnie. */
  importMailaJakoZapytania: false,
  /** Automatyczne pobieranie ofert z dedykowanej skrzynki pocztowej. */
  skrzynkaDedykowana: false,
  /** Rodzaje aparatów inne niż zbiornik i wymiennik ciepła (reaktor, kolumna, separator...) - kolumna aparaty.typ zostaje. */
  inneTypyAparatow: false,
} as const
