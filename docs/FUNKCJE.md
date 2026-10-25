# Funkcje aplikacji - pełna wersja i etapy

Pełna wersja jest zachowana w kodzie i oznaczona tagiem git **`wersja-pelna-2026-10-20`**. Od tej daty aplikacja działa
domyślnie w trybie **Etap 1 - wycena materiałowa**: moduły spoza etapu są ukryte (nie usunięte). Administrator przełącza
tryb w **Ustawienia → Narzuty i parametry → Tryb aplikacji**; widoczność modułów: `src/lib/moduly.ts`.

## Etap 1 - wycena materiałowa (widoczne)

| Funkcja | Gdzie w aplikacji | Kod |
|---|---|---|
| Zapytania ofertowe, dokumenty, import zapytania z maila (treść + wybrane załączniki, filtr śmieci) | Zapytania, karta zapytania → Dokumenty | `zapytania/*`, `lib/importMaila.ts`, `lib/dokumenty.ts`, `lib/magazyn.ts` |
| Odczyt rysunków: PDF z CAD z warstwy tekstowej (bez AI, także automatyczne wykrycie wykazu części), skany przez AI (kafle, koszt przed wywołaniem) | karta zapytania → Rysunki i listy | `rysunki/*`, `lib/rysunki.ts`, `lib/rysunkiPdf.ts`, funkcja `ai` (`wyciagnij_liste_z_rysunku`) |
| Lista materiałowa i parametry projektu z tabel rysunków (wykaz części, króćce, dane projektowe) | Rysunki i listy, wycena → Materiały | `lib/odczytTekstowy.ts`, `wycena/SzablonIParametry.tsx` |
| Szablony materiałowe: wymiennik płaszczowo-rurowy, zbiornik - stały zestaw elementów, kontrola kompletności | wycena → Materiały (panel nad listą) | `lib/szablony.ts`, `wycena/SzablonIParametry.tsx` |
| Wycena materiałowa jednym przyciskiem (odczyt CAD bez AI + zapisane odczyty, szablon, ceny) | karta zapytania → Wycena materiałowa | `lib/wycenaMaterialowa.ts`, `zapytania/WycenaMaterialowa.tsx` |
| Cennik: zakupy z kart dostawy Optimy + oferty na materiały zebrane do tego zapytania | Zakupy (Optima), Oferty na materiały, wycena → Znajdź cenę | `lib/bazaCen.ts` (`cennikEtapu1`, `dobierzCene` z ceną zastępczą tej samej grupy stali), `lib/importOptima.ts`, `oferty/*` |
| Kalkulacja materiałów (masa z wymiarów, naddatki, narzut zakupowy), eksport Excel | wycena | `lib/kalkulacja.ts`, `lib/eksportExcel.ts` |
| Wersje edytowalne: odczyt plików (PDF, skany, zdjęcia, DOCX, XLSX, TXT, DXF) bez AI albo przez AI, wykrycie języka, tłumaczenie na polski, Word z formatowaniem, dziennik odczytów i kosztów | menu → Wersje edytowalne (moduł `wersjeEdytowalne`) | `edytowalne/*`, `lib/wersjeEdytowalne*.ts`, tryby AI `odczytaj_dokument`, `przetlumacz_dokument`, migracja `0020` |
| Zaznaczanie obszarów z automatycznym przewijaniem (tabele dłuższe niż ekran) | Rysunki i listy, Wersje edytowalne | `ui/ZaznaczanieObszarow.tsx` |

## Ukryte w etapie 1 (gotowe, do włączenia później)

| Funkcja | Moduł (`lib/moduly.ts`) | Kod |
|---|---|---|
| Karta analizy zapytania (wymagania kosztotwórcze, usługi, pytania, niespójności; AI `analizuj_zapytanie`) | `analiza` | `zapytania/KartaAnalizy*.tsx`, `lib/analiza.ts`, `lib/analizaZapytania.ts` |
| Przygotowanie automatyczne (analiza + rysunki + wycena z robocizną i usługami + projekt oferty + raport) | `przygotowanie` | `lib/przygotowanieAuto.ts`, `lib/przygotowanie.ts`, `scripts/przebieg-ai.ts` |
| Generator zapytań do dostawców i kooperantów (mailto, statusy odpowiedzi) | `zapytaniaDostawcow` | `zapytaniaDostawcow/*`, `lib/zapytaniaDostawcow.ts` |
| Pracochłonność (wskaźnikowo / szczegółowo), Registo, projekty zrealizowane, podobne zlecenia | `robocizna`, `projekty` | `wycena/Pracochlonnosc.tsx`, `projekty/*`, `lib/importRegisto.ts` |
| Kooperacja, badania / odbiory / transport, usługi kooperacyjne, kategorie usług | `uslugi` | `wycena/Uslugi.tsx`, `oferty/Porownywarka.tsx` (`tylkoUslugi`) |
| Oferta dla klienta w Wordzie z biblioteką klauzul, notatka dla prezesa | `oferta` | `wycena/EdytorOferty.tsx`, `lib/eksportWord.ts` |
| Zatwierdzanie wycen przez prezesa, korekta prezesa, marże | `zatwierdzanie` | `wycena/KolejkaZatwierdzania.tsx`, migracja `0008` |
| Odczyt ofert dostawców przez AI, klasyfikacja maili | (widoczne - oferty na materiały) | funkcja `ai` (`wyciagnij_oferte`, `klasyfikuj_mail`) |
| Stawki robocizny, MPK, ustawienia zapytań do dostawców | `robocizna`, `zapytaniaDostawcow` | `ustawienia/*` |

## Zawsze

Logowanie i role, RLS w bazie, audyt zmian, użytkownicy, kursy NBP, budżet AI, zajętość planu, dane firmy i logo z bazy,
strażnik poufności repozytorium (`scripts/sprawdz-pliki.mjs`), test bezpieczeństwa (`tests/lokalne/bezpieczenstwo.test.ts`).
