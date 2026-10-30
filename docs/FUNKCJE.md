# Funkcje aplikacji

Jedna wersja aplikacji (od rundy 2). Nawigacja: dwa moduły - **Zapytania ofertowe i wyceny** oraz **Historyczny cennik**;
Ustawienia, Użytkownicy, Kosz i Instrukcja - ikony w prawym górnym rogu; przełącznik języka **PL / EN** (zapamiętany
w profilu). Funkcje uśpione: `src/lib/funkcje.ts`. Plan i decyzje rundy 2: [`PLAN-runda2.md`](PLAN-runda2.md), założenia:
[`PYTANIA.md`](PYTANIA.md) (sekcja „Runda 2”).

## Moduł 1: Zapytania ofertowe i wyceny

| Funkcja | Gdzie w aplikacji | Kod |
|---|---|---|
| Zapytanie z wymaganym rodzajem aparatu (zbiornik / wymiennik ciepła z zakresem: kompletny, wkład rurowy, część); klient i osoba prowadząca wpisywane dowolnie na karcie zapytania (nowi zapisują się na listach podpowiedzi) | Zapytania → Nowe zapytanie, karta zapytania | `zapytania/NoweZapytanie.tsx`, `zapytania/KartaZapytania.tsx`, `ui/PoleZPodpowiedziami.tsx`, migracje `0021`, `0035` |
| Dokumenty: przeciągnięcie wielu plików i folderów, sześć typów = grup (Zapytanie ofertowe, Projekt / rysunek złożeniowy, Lista materiałowa, Wymagania techniczne, Oferta dostawcy, Inne), przeciągnięcie na grupę zmienia typ, obracanie skanów i obrazów o 90°, „Odczytaj wszystkie dane z dokumentów” | karta zapytania → Dokumenty | `zapytania/DokumentyZapytania.tsx`, `lib/klasyfikacjaDokumentow.ts`, `lib/obrotDokumentu.ts`, migracje `0027`, `0033`, `0034` |
| Typ dokumentu i pola karty zapytania bez AI (nr zapytania, termin, klient - tylko puste, ze źródłem „plik, str.”), dane projektowe z arkusza danych | jw. | `lib/klasyfikacjaDokumentow.ts`, `lib/polaZDokumentow.ts` |
| Pliki do 20 MB zapisywane bez kompresji (pełna jakość); większe - kompresja z testem czytelności (PDF: struktura / strony skanu, obrazy: WebP / JPEG, reszta: gzip); SHA-256, duplikaty, limit 50 MB | jw. | `lib/kompresja.ts`, `lib/magazyn.ts` |
| Tworzenie listy materiałowej: jedna lista na zapytanie z dokumentu listy materiałowej (bez AI: PDF z tekstem, arkusz; AI: cały dokument naraz) albo z rysunku złożeniowego (AI: cały arkusz - wykaz części, tabela U-rur, króćce, dane projektowe; albo zaznaczone tabele); strony i odczyty scalane po numerze pozycji, edycja w siatce, przeniesienie do wyceny | karta zapytania → Tworzenie listy materiałowej | `rysunki/ListaMaterialowa.tsx`, `lib/listaMaterialowa.ts`, `rysunki/*`, migracja `0032` |
| Zaznaczanie tabel na rysunku: rodzaje tabel wg rodzaju aparatu, własne tabele, odczyt bez AI (warstwa tekstowa PDF z CAD) i przez AI (kafle ~300 DPI, koszt przed wywołaniem), „Dodaj do listy” | lista materiałowa → Zaznacz tabele | `rysunki/OdczytRysunku.tsx`, `lib/odczytTekstowy.ts`, `lib/rysunki.ts`, funkcja `ai` |
| Przeniesienie odczytu do wyceny bez dublowania (klucz: odczyt + wiersz), źródło przy pozycji, „pozycje zmieniły się w odczytach - zaktualizować?” | odczyt → Przenieś do wyceny, wycena → Materiały | `lib/przeniesienieOdczytu.ts`, `rysunki/PrzeniesDoWyceny.tsx` |
| Kooperacja (dawna karta analizy): wymagania kosztotwórcze, usługi kooperacja (prośba o ofertę do działu handlowego przy usłudze), pytania do klienta i niespójności; AI `analizuj_zapytanie` czyta wszystkie strony skanów | karta zapytania → Kooperacja | `zapytania/KartaAnalizy*.tsx`, `lib/analiza.ts`, `lib/analizaZapytania.ts` |
| Wycena automatyczna: bez AI (materiały z odczytów i cennika) albo z AI (analiza, rysunki, wycena, projekt oferty) - raport do sprawdzenia | karta zapytania → Wycena automatyczna | `zapytania/WycenaAutomatyczna.tsx`, `lib/wycenaMaterialowa.ts`, `lib/przygotowanieAuto.ts` |
| Wycena w układzie arkusza wzorcowego: Wycena (opinia o zapytaniu, ocena działów z terminami zakupu wg materiałów wyceny i podpowiedzią z ofert, ocena ekonomiczna, przegląd oferty), Materiały, Robocizna, Kooperacja, Badania / odbiory / transport, Podsumowanie, Oferta; ścieżka i „Wstecz do zapytania”, zakładki w adresie | wycena | `wycena/EdytorWyceny.tsx`, `wycena/Opinia.tsx`, `lib/kalkulacja.ts`, `lib/adres.ts` |
| Robocizna: stanowisko z cennika × przedział czasu × rbh (migawka cennika w wycenie, odchylenia, „przywróć / odśwież stawki”) albo metoda wskaźnikowa | wycena → Robocizna | `wycena/Pracochlonnosc.tsx`, `lib/cennikRobocizny.ts`, `lib/robocizna.ts` |
| Oferta dla klienta: sekcje rozwijane (kolejność, ukrywanie w wydruku, tekst z formatowaniem, zmienne, wersje treści, PL / EN), Word | wycena → Oferta | `wycena/EdytorOferty.tsx`, `lib/ofertaKlienta.ts`, `lib/eksportWord.ts` |
| Excel w układzie arkusza wzorcowego, z formułami, w wybranym języku | wycena → Excel | `lib/eksportExcel.ts` |
| Prośby o oferty (kooperacja, badania, transport): prośba z parametrami wg kategorii, kolejka działu handlowego z licznikiem, stan pozycji (brak oferty / prośba / oferta / wybrana) | wycena → Kooperacja / Badania, menu → Prośby o oferty | `prosby/*`, `wycena/OfertyUslug.tsx`, `lib/prosby.ts`, migracje `0028`, `0029` |
| Mail z ofertą: odczyt ceny bez AI (kwoty, waluta, termin, ważność, Incoterms, dostawca po domenie), AI jako druga opcja; porównanie ofert (najtańsza / najszybsza, przeterminowane), „Użyj w wycenie” | jw., Oferty dostawców | `oferty/DodajOferte.tsx`, `wycena/ZnajdzCene.tsx` |
| Generator zapytań do dostawców i kooperantów (mailto, statusy odpowiedzi) | karta zapytania → Zapytania do dostawców | `zapytaniaDostawcow/*` |
| Zatwierdzanie przez prezesa, korekta prezesa, marże | Do zatwierdzenia, wycena → Wycena / Podsumowanie | `wycena/KolejkaZatwierdzania.tsx`, migracja `0008` |
| Wersje edytowalne: wybór stron (domyślnie cały dokument), odczyt bez AI albo przez AI, język, tłumaczenie z zachowaniem układu, Word w układzie oryginału (wymiary i marginesy strony, czcionki, wcięcia, odstępy, tabele z ramkami i szerokościami kolumn, obrazy, nagłówek / stopka; tryb „dokładne położenie” dla formularzy), dziennik kosztów | menu → Wersje edytowalne | `edytowalne/*`, `lib/wersjeEdytowalne*.ts` |

## Moduł 2: Historyczny cennik

| Funkcja | Gdzie w aplikacji | Kod |
|---|---|---|
| Cennik roboczogodzin: stanowiska × przedziały czasu albo stawka stała, wersje stawek, wklejanie ze schowka; stawki poufne (prezes, administrator, flaga marż) | Cennik roboczogodzin | `cennik/CennikRobocizny.tsx`, `lib/cennikRobocizny.ts`, migracja `0030`, `npm run seed:stawki` |
| Zakupy Optima w trzech rodzajach kosztu (materiały / kooperacja / transport, badania i inne), bufor „Do klasyfikacji”, przypisanie hurtowe z regułą, reguły słów kluczowych, „Przeklasyfikuj wszystko” | Zakupy Optima | `zakupy/Zakupy.tsx`, migracja `0031` |
| Import karty dostawy: XLS albo wydruk PDF (warstwa tekstowa, bez AI), kontrola sumy ze stopką | Zakupy Optima → Import | `lib/importOptima.ts`, `lib/importOptimaPdf.ts` |
| Ceny w wycenach tylko z zakupów „Materiały”; orientacyjna cena historyczna usług (Ustawienia, domyślnie wyłączona) | wycena → Znajdź cenę | `lib/bazaCen.ts` |
| Usługi kooperacyjne (porównywarka), projekty zrealizowane (Registo) | Usługi kooperacyjne, Projekty zrealizowane | `oferty/Porownywarka.tsx`, `projekty/*` |

## Wspólne

| Funkcja | Kod |
|---|---|
| Tabele z filtrami i sortowaniem w nagłówkach (tekst, liczba, data, lista, tak / nie; Shift - kilka kolumn), zapamiętane per użytkownik | `ui/Tabela.tsx`, `lib/tabela.ts` |
| Cofnij / Ponów bez limitu, przetrwa odświeżenie (IndexedDB), pasek w nagłówku | `lib/historia.ts`, `ui/PasekHistorii.tsx` |
| Kosz: usuwanie z migawką rekordu i zależnych danych, przywrócenie z tymi samymi id, trwałe usunięcie (prezes / administrator, numer ZO), automatyczne czyszczenie po N dniach | `kosz/Kosz.tsx`, `lib/kosz.ts`, migracje `0022`, `0023`, `0029`, funkcja `czysc-kosz` |
| Dwujęzyczność PL / EN: interfejs, słowniki (`nazwa_en`), eksporty, prompty AI bez założenia języka, test spójności kluczy | `src/i18n`, `lib/terminy.ts`, migracje `0024`, `0025` |
| Logowanie i role, RLS, audyt, kursy NBP, budżet AI, zajętość planu, dane firmy z bazy, strażnik poufności repozytorium | `scripts/sprawdz-pliki.mjs`, `tests/lokalne/bezpieczenstwo.test.ts` |

## Uśpione (`src/lib/funkcje.ts`)

| Funkcja | Flaga | Kod |
|---|---|---|
| Zapytanie z całego maila (Zapytania → Nowe z maila) | `importMailaJakoZapytania` | `zapytania/NoweZMaila.tsx`, `lib/importMaila.ts` |
| Skrzynka dedykowana (automatyczne pobieranie ofert) | `skrzynkaDedykowana` | - |
| Rodzaje aparatów inne niż zbiornik i wymiennik ciepła | `inneTypyAparatow` | `aparaty.typ`, `lib/wyceny.ts` (`TYPY_APARATOW`) |
