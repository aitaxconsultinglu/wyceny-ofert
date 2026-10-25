# Plan - runda 2

Zakres: jedna wersja aplikacji z dwoma modułami (Zapytania ofertowe i wyceny / Historyczny cennik), dwujęzyczność PL/EN,
rodzaj aparatu w zapytaniu (zbiornik / wymiennik ciepła), dokumenty z klasyfikacją bez AI i kompresją, rysunki z kategoriami
tabel wg rodzaju, wycena w układzie arkusza wyceny (Opinia / Pracochłonność / Materiały / Kooperacja / Badania), cennik
roboczogodzin, podział zakupów Optimy na trzy rodzaje, prośby o oferty i oferty z maila, Cofnij/Ponów, wspólna tabela
z filtrami, kosz. Repozytorium publiczne: stawki, kwoty i nazwy firm tylko w `prywatne/` i w bazie.

Fazy kończą się: `npm run typecheck`, `npm test`, `npm run build`, `npm run sprawdz-pliki`, commit, push na main (deploy).

## Stan wyjściowy (z kodu)

- Moduły etapu 1 nie są usunięte - ukrywa je `src/lib/moduly.ts` (`widac(...)`). Powrót do wersji pełnej = usunięcie
  bramek, bez cofania commitów. Poprawki etapu 1 (wycena materiałowa, szablony, ceny zastępcze, odczyt CAD bez AI) zostają.
- Migracje kończą się na `0020_wersje_edytowalne.sql` (moduł z poprzedniej rundy), więc nowe migracje zaczynają się od **0021**
  (prompt mówi "0020_* i dalej" - 0020 jest zajęte).
- Wyceny: `wyceny → aparaty → pozycje_wyceny`, jedna logika liczenia w `kalkulacja.ts`; arkusze wyceny (w tym wzorcowy arkusz rundy 2)
  są odtwarzane co do grosza przez `importArkuszaWyceny.ts` i test lokalny - zostaje i dostaje nowy układ zakładek.
- Stawki robocizny: `stawki_robocizny` czyta każdy pracownik (RLS `jest_pracownikiem`), zmienia administrator; wartości w repo
  są zerami, prawdziwe wpisane w bazie.
- Zakupy Optimy: `zakupy.rodzaj` = material / usluga / doplata / pomocnicze, typ zamówienia ZM / ZJ z karty.

## Decyzje i sprzeczności z promptem (wybrana bezpieczniejsza wersja)

1. **Widoczność stawek** (7.1): prompt chce stawek tylko dla flagi "widzi narzuty i marże", dziś czyta je każdy pracownik.
   Technolog bez flagi widzi koszty wyceny (także robocizny), więc i tak wylicza stawkę z kosztu. Przyjmuję: tabela stawek
   cennika czytelna w RLS tylko dla prezesa, administratora i flagi; nowa wycena dostaje **migawkę stawek** przez funkcję
   `security definer` (każdy pracownik), więc liczenie wyceny działa bez flagi. Edycja cennika: prezes i administrator.
2. **Kosz** (10.3): zamiast kolumny `usunieto_at` w kilkunastu tabelach i warunku w każdym zapytaniu - **kosz jako migawka**:
   usunięcie zapisuje całe drzewo rekordów (zapytanie z dokumentami, odczytami, analizą, wycenami, aparatami, pozycjami,
   zapytaniami do dostawców, prośbami, ofertami zebranymi pod zapytanie) do tabeli `kosz` (jsonb) i usuwa wiersze; pliki w
   Storage zostają do trwałego usunięcia. Przywrócenie odtwarza wiersze z tymi samymi id (funkcja `security definer` w trybie
   systemowym, żeby strażniki zamrożonych wycen nie blokowały). Zalety: RLS i wszystkie zapytania aplikacji bez zmian,
   unikalne numery ZO nie są blokowane przez kosz (kolizja przy przywróceniu - komunikat). Audyt zapisuje usunięcie i przywrócenie.
3. **Cofnij / Ponów** (10.1): dwa rodzaje edycji w aplikacji -
   - edytory z przyciskiem "Zapisz" (wycena, siatka odczytu rysunku, karta analizy, oferta): Cofnij/Ponów działa na stanie
     edytora (migawki z kompresją różnic, stos w IndexedDB per wycena / odczyt), zapis do bazy jak dotąd przyciskiem Zapisz;
   - ekrany zapisujące od razu (cennik roboczogodzin, klasyfikacja zakupów, typy dokumentów, kosz, usuwanie): komendy z operacją
     odwrotną zapisywane do bazy (`src/lib/historia.ts`), z kontrolą `zmodyfikowano` przed cofnięciem (konflikt - ostrzeżenie).
   Jedna warstwa (`useHistoria`), jeden stos per zakres (zapytanie / wycena / cennik), bez limitu głębokości.
4. **Tłumaczenia** (3): własny słownik bez zależności - kluczem jest tekst polski (`t('Zapisz')`), `en.ts` mapuje go na angielski,
   typ klucza to `keyof typeof EN`, więc TypeScript nie przepuści tekstu bez tłumaczenia; test sprawdza kompletność i brak
   pustych wartości. Szybsze przeniesienie ~1500 tekstów niż sztuczne klucze, a kod nadal czyta się po polsku.
   Słowniki z bazy: kolumna `nazwa_en` (kategorie materiałów i usług, rodzaje stali, typy dokumentów, rodzaje tabel,
   stanowiska), klauzule oferty: `tekst_en`. Brak EN - pokazujemy PL.
5. **Import maila jako zapytania**: kod zostaje, wyłączony flagą w `src/lib/funkcje.ts` (`importMailaJakoZapytania: false`).
   Dodawanie maila z ofertą (kooperacja, badania, oferty) zostaje i jest rozbudowane.
6. **Moduły w nawigacji** - moduł 1 "Zapytania ofertowe i wyceny": Zapytania, Wersje edytowalne, Oferty dostawców (zebrane pod
   zapytania), Prośby o oferty (kolejka działu handlowego), Do zatwierdzenia. Moduł 2 "Historyczny cennik": Cennik roboczogodzin,
   Zakupy Optima - Materiały / Kooperacja / Transport, badania i inne, Do klasyfikacji, Usługi (porównywarka), Projekty
   zrealizowane (Registo), Importy (karty dostawy, Registo). Ustawienia, Kosz, Instrukcja - poza modułami (prawy róg).
   Oferty dostawców zostają w module 1, bo są zbierane pod zapytanie i używane w wycenie.
7. **Kompresja PDF w przeglądarce** (5.3): bez ciężkich bibliotek PDF w przeglądarce przyjmuję `pdf-lib` (przepisanie ze
   strumieniami obiektów, bez nieużywanych obiektów) i przekodowanie obrazów skanów tylko wtedy, gdy obraz ma > 300 DPI
   efektywnie (w dół do 300 DPI, JPEG). Warstwa tekstowa nie jest ruszana; test czytelności porównuje liczbę znaków tekstu
   i DPI obrazów przed/po; przy niepowodzeniu zapisujemy oryginał (`metoda_kompresji = 'brak'`).
8. **Karty dostawy z "Przykładowe karty dostawy"** są w PDF, a import Optimy czyta XLS. Faza 4 dodaje odczyt karty dostawy
   z PDF (warstwa tekstowa, bez AI); jeśli układ PDF okaże się nieczytelny - zapiszę to w raporcie i przetestuję na XLS.
9. **Rodzaj aparatu**: `zapytania.rodzaj_aparatu` (zbiornik | wymiennik) + `zakres_wymiennika` (kompletny | wiazka | czesc)
   + `zakres_opis`. `aparaty.typ` zostaje (stare wartości), nowe aparaty dostają typ z zapytania. Migracja ustawia rodzaj
   z istniejących aparatów / przedmiotu; nieustalone - ekran wyboru przy wejściu.
10. **Prośby o oferty** - nowa tabela `prosby_o_oferte`, kolejka w module 1 z licznikiem w menu; bez wysyłki maili z serwera.

## Fazy, pliki, migracje, ryzyka

| Faza | Zakres | Główne pliki | Migracje | Ryzyka |
|---|---|---|---|---|
| 0 | plan, założenia | `docs/PLAN-runda2.md`, `docs/PYTANIA.md` | - | - |
| 1 | jedna wersja, dwa moduły, rodzaj aparatu | `App.tsx`, `lib/moduly.ts` → `lib/funkcje.ts`, `KartaZapytania`, `ListaZapytan`, nowe zapytanie, `EdytorWyceny`, `WycenaMaterialowa`, `PrzygotowanieAutomatyczne` | 0021 rodzaj aparatu | stare zapytania bez rodzaju |
| 2 | Tabela z filtrami, Cofnij/Ponów, kosz | `ui/Tabela.tsx`, `lib/historia.ts`, `lib/kosz.ts`, `components/kosz/*`, przepięcie wszystkich tabel | 0022 kosz (+ cron czyszczenia) | liczba tabel do przepięcia; przywracanie z triggerami |
| 3 | PL/EN | `lib/i18n.ts`, `i18n/en.ts`, wszystkie komponenty, eksporty, prompty AI, `lib/terminy.ts`, regexy PL/EN | 0023 `nazwa_en`, język w profilu | objętość tekstów |
| 4 | cennik roboczogodzin, zakupy w 3 rodzajach | `cennik/*`, `lib/cennikRobocizny.ts`, `lib/klasyfikacjaZakupow.ts`, `importOptima.ts`, `scripts/seed-stawki.mjs` | 0024 cennik + migawka, 0025 rodzaj kosztu + reguły | migracja stawek bez psucia starych wycen |
| 5 | dokumenty | `lib/klasyfikacjaDokumentow.ts`, `lib/kompresja.ts`, `DokumentyZapytania` | 0026 typy dokumentów, kolumny kompresji, limit | kompresja PDF w przeglądarce |
| 6 | rysunki i listy | `rysunki/*`, `lib/rodzajeTabel.ts`, tryb AI całego dokumentu | 0027 rodzaje tabel, kolumny odczytu | koszt AI - tylko szacunek w testach |
| 7 | wycena wg arkusza | zakładki Wycena/Materiały/Robocizna/Kooperacja/Badania/Podsumowanie/Oferta, `eksportExcel` z formułami | 0028 pozycje robocizny (stanowisko, przedział), opinia | zgodność z 6 wycenami historycznymi |
| 8 | prośby, mail z ofertą | `prosby/*`, `lib/ofertaZMaila.ts` | 0029 prośby | odczyt cen bez AI |
| 9 | odbiór | testy lokalne arkusza wzorcowego i trzech zapytań, dokumentacja | - | - |

Każda faza zostawia działającą aplikację; większe fazy (2, 3, 7) mogą mieć kilka commitów.
