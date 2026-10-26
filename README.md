# Wyceny i oferty

Aplikacja dla producenta aparatury procesowej: zapytania ofertowe klientów, wspólna baza ofert dostawców i zakupów,
wycena jedną metodą (wzorowaną na dotychczasowym arkuszu wyceny firmy), zatwierdzanie przez prezesa, kalkulacja
w Excelu i oferta w Wordzie, zakupy i dostawy po wygranym zapytaniu. Otwarte pytania: [`docs/PYTANIA.md`](docs/PYTANIA.md).
Nazwa firmy, logo i dane do oferty są wyłącznie w bazie (Ustawienia → Dane firmy) - nie w repozytorium.

- **Adres:** GitHub Pages tego repozytorium (`https://<konto>.github.io/<repozytorium>/`).
- **Frontend:** React 18 + Vite + TypeScript + Tailwind + Radix, GitHub Pages (`.github/workflows/deploy.yml`).
- **Backend:** Supabase (projekt `zrwouorevhxdtvubniwg`, eu-west-1, plan Free) - Postgres + Auth + RLS + Storage + Edge Functions.

## Dwa moduły (runda 2, od 2026-10-25)

Jedna wersja aplikacji (tryb „Etap 1” usunięty; plan rundy: [`docs/PLAN-runda2.md`](docs/PLAN-runda2.md)):

- **Zapytania ofertowe i wyceny** - zapytania (pierwsze pole: rodzaj aparatu - zbiornik albo wymiennik ciepła, z zakresem),
  dokumenty z typami i kompresją, rysunki i listy materiałowe (rodzaje tabel, własne tabele, odczyt całego dokumentu),
  karta analizy z oceną działów, wycena w układzie arkusza wzorcowego (Wycena, Materiały, Robocizna, Kooperacja,
  Badania / odbiory / transport, Podsumowanie, Oferta), prośby o oferty i kolejka działu handlowego, oferty dostawców,
  wersje edytowalne, zatwierdzanie przez prezesa.
- **Historyczny cennik** - cennik roboczogodzin (stanowiska × przedziały czasu, wersje stawek, migawka w wycenie),
  zakupy z kart dostawy Optimy (XLS albo PDF) w trzech rodzajach kosztu z regułami klasyfikacji, usługi kooperacyjne,
  projekty zrealizowane (Registo).
- Ustawienia, użytkownicy, kosz i instrukcja - w prawym górnym rogu; przełącznik PL / EN; Cofnij / Ponów.

Pełna lista funkcji z miejscem w kodzie: [`docs/FUNKCJE.md`](docs/FUNKCJE.md). Funkcje uśpione (kod zostaje, interfejs
ukrywa): `src/lib/funkcje.ts` - import całego maila jako zapytania, skrzynka dedykowana, typy aparatów inne niż zbiornik
i wymiennik.

Stawki roboczogodzin są tylko w bazie: `npm run seed:stawki` wczytuje je z `prywatne/stawki-robocizny.json` (format:
`scripts/seed/stawki-robocizny.przyklad.json`, same zera). Ceny w wycenach pochodzą wyłącznie z zakupów „Materiały”;
ceny kooperacji, badań i transportu - z ofert zebranych pod zapytanie.

## Wersje edytowalne (od 2026-10-25)

Osobny moduł w menu, niezależny od zapytań i wycen: pliki (PDF, skany, JPG / PNG, DOCX, XLSX / CSV, TXT, DXF) w tabeli
`pliki_edytowalne` i w bucket `dokumenty` pod `edytowalne/<id>/`. Odczyt bez AI (warstwa tekstowa PDF z czcionkami,
struktura DOCX / arkuszy, teksty DXF) albo przez AI (tryb `odczytaj_dokument`, wycinki ~200 DPI, koszt przed wywołaniem),
język wykrywany lokalnie, tłumaczenie na polski (`przetlumacz_dokument` albo razem z odczytem), eksport do Worda
(`src/lib/wersjeEdytowalneWord.ts`). Dziennik `odczyty_plikow` (kto, co, strony, koszt) + `ai_uzycie.plik_id`.
Podgląd deweloperski: `edytowalne-dev.html?plik=<ścieżka w folderze materiałów>`.

## Stan prac

| Etap | Zakres | Stan |
|---|---|---|
| 1. Fundament | logowanie, role, flaga marż, audyt, słowniki i ustawienia, kursy NBP, layout | gotowy |
| 2. Bazy cen | karty dostawy Optimy, oferty dostawców, porównywarka, usługi, Registo, projekty | gotowy, poza odczytem ofert przez AI (czeka na `ANTHROPIC_API_KEY`) |
| 3. Wycena | zapytania z dokumentami, metoda arkusza wyceny, zatwierdzanie, Excel, oferta Word | gotowy; 6 wycen historycznych odtworzonych co do grosza |
| 4. AI | listy z rysunków, analiza zapytania, generator zapytań, budżet AI | gotowe bez AI: rysunki (zaznaczanie, kafle, odczyt z warstwy tekstowej, siatka, Excel, przeniesienie do wyceny), karta analizy z ręczną edycją, generator zapytań do dostawców ze śledzeniem, budżet AI. Odczyt rysunków i analiza zapytania przez AI napisane i wdrożone - czekają na klucz i testy akceptacyjne |
| 5. Skrzynka | automatyczne pobieranie ofert z dedykowanej skrzynki | odłożone (decyzja klienta): zamiast tego **zapytanie z maila** (przeciągnięty .msg/.eml) i **przygotowanie automatyczne** wstępnej wyceny i oferty; skrzynka - do założenia |
| Runda 2 | dwa moduły, rodzaj aparatu, kosz, cofnij / ponów, tabele z filtrami, PL / EN, dokumenty z kompresją, rysunki (rodzaje tabel, cały dokument), wycena wg arkusza wzorcowego, oferta w sekcjach, prośby o oferty, cennik roboczogodzin, rodzaj kosztu zakupów | gotowa (fazy 0-9, [`docs/PLAN-runda2.md`](docs/PLAN-runda2.md)); test odbioru `tests/lokalne/odbior.test.ts` odtwarza arkusz wzorcowy i przykład cennika |

## Role

| Rola | Uprawnienia |
|---|---|
| technolog | zapytania, analiza, listy materiałowe, wyceny (bez zatwierdzania) |
| handlowy | zapytania, baza ofert, importy z Optimy, zapytania do dostawców, ceny i kooperacja w wycenie |
| prezes | wszystko + zatwierdzanie, korekta prezesa |
| administrator | wszystko + użytkownicy, ustawienia, budżet AI |

Flaga **„widzi narzuty i marże”**: bez niej użytkownik widzi koszty, ale nie zysk i korektę prezesa (ustawienia
oznaczone `poufne` są dla niego niewidoczne już w bazie - RLS). Prezes i administrator widzą marże zawsze.

Reguły pilnuje **baza** (RLS + triggery), nie tylko formularz. Każda zmiana trafia do `audit_log`
(zapis tylko przez triggery). Konta zakłada wyłącznie administrator (funkcja `zarzadzanie-uzytkownikami`) -
konto bez wpisu w `uprawnienia_startowe` nie dostaje profilu, więc nie widzi żadnych danych.

## Poufność - repozytorium jest publiczne

W repo **nie ma i nie może być** danych firmowych: nazwy firmy, jej klientów i dostawców, oznaczeń projektów,
dokumentów, rysunków, cen, ofert, kart dostawy, raportów Registo ani stawek. Pilnują tego:
- `.gitignore` (pdf, xls*, msg, eml, docx, zip, csv, `.env`, folder `prywatne/`),
- folder lokalny `prywatne/` (poza gitem): konfiguracja seeda (`seed.json`) i testów lokalnych (`testy.json`), logo,
  specyfikacja projektu i lista słów zakazanych (`zakazane.txt`); w repo są tylko przykłady z danymi fikcyjnymi
  (`scripts/seed/seed.przyklad.json`, `tests/lokalne/testy.przyklad.json`),
- `scripts/sprawdz-pliki.mjs` - hooki pre-commit i commit-msg (`npm run przygotuj` włącza `.githooks/`) oraz dwa kroki
  workflow (pliki repo i zbudowana aplikacja): blokuje dokumenty poza `public/`, treści wyglądające na klucze
  (`sb_secret_`, `service_role`, `sk-ant-`) i słowa z listy zakazanej (lokalnie `prywatne/zakazane.txt`, w GitHub Actions
  sekret `ZAKAZANE_SLOWA`); w logach CI pokazuje tylko dwie pierwsze litery trafienia,
- testy z danymi fikcyjnymi w repo; testy na prawdziwych plikach czytają je z lokalnego folderu (`FOLDER_MATERIALOW`).

Klucz serwisowy Supabase i klucz Anthropic API żyją wyłącznie w sekretach funkcji (`supabase secrets set`)
i w lokalnym `.env`. Do przeglądarki trafia tylko klucz publishable (`src/lib/config.ts`).

**Claude API:** do API idą tylko dokumenty oznaczone jako istotne, a z rysunków - tylko zaznaczone wycinki (kafle),
nie całe pliki. Logi funkcji i tabela `ai_uzycie` nie zawierają treści dokumentów. Dane przesyłane do Claude API
w ramach konta komercyjnego nie są domyślnie używane do trenowania modeli; aktualne warunki przechowywania danych
(retencji) sprawdź w dokumentacji Anthropic (Commercial Terms / Privacy) przed wdrożeniem produkcyjnym.

## Pierwsze uruchomienie (lokalnie)

```bash
npm install
npm run przygotuj                       # hook pre-commit
npx supabase login                      # konto z dostępem do organizacji projektu
npx supabase link --project-ref zrwouorevhxdtvubniwg
node scripts/przygotuj-env.mjs "C:\ścieżka\do\materiałów"   # zapisuje .env, nie wyświetla sekretów
npm run dev                             # http://localhost:5190/
npm test
npm run build
```

## Wdrażanie

- **Frontend:** każdy push na `main` buduje i publikuje GitHub Pages (Node 22, `npm ci`, strażnik, testy, build).
  Lokalnie też potrzebny jest Node 22+ (klient Supabase w testach korzysta z natywnego WebSocket).
- **Baza:** `npm run db:migracje` - stosuje brakujące pliki z `supabase/migrations/` przez Management API
  (bez hasła do bazy) i zapisuje historię w `supabase_migrations.schema_migrations` - w tym samym formacie co
  `supabase db push`. Ustawia też sekret Vault `url_projektu` dla zadań pg_cron.
- **Funkcje brzegowe:** `npm run funkcje:wdroz` (wszystkie) albo `node scripts/funkcje.mjs kursy-walut`.
- **Ustawienia Auth** (`supabase/config.toml`: wyłączona rejestracja, Site URL, Redirect URLs):
  `npx supabase config push` - wymaga roli *Administrator/Owner* w organizacji Supabase (patrz `docs/PYTANIA.md` pkt 7).
- **Pierwsze konto administratora:** `node scripts/utworz-administratora.mjs` (w swoim terminalu - hasło tymczasowe
  pojawia się tylko tam; przy pierwszym logowaniu trzeba ustawić własne). Kolejne konta zakłada się w aplikacji
  (zakładka Użytkownicy).

### Funkcje brzegowe
| Funkcja | Do czego | JWT |
|---|---|---|
| `zarzadzanie-uzytkownikami` | zakładanie kont, reset hasła, usuwanie (tylko administrator) | wymagany |
| `kursy-walut` | kursy EUR/USD z NBP (tabela A), wywoływana przez pg_cron w dni robocze i przyciskiem w ustawieniach; z datą `{ data }` - kursy z 10 dni do niej (oferta z datą starszą niż kursy w bazie) | nie (przyjmuje tylko datę) |
| `ai` | jedyne miejsce wywołań Claude API: odczyt oferty dostawcy, klasyfikacja maila, odczyt list / króćców / danych projektowych z rysunków; szacunek kosztu przed wywołaniem (liczenie tokenów, bez kosztów), budżet miesięczny i dzienny, log `ai_uzycie` | wymagany |

Klucz Anthropic wpisuje się wyłącznie jako sekret funkcji (nie w czacie ani w repo). Ustawiać sekrety może konto
z rolą *Owner* / *Administrator* w organizacji Supabase - konto z niższą rolą dostaje błąd „does not have the
necessary privileges”. Dwie drogi:
- **Panel Supabase** (właściciel): projekt → *Edge Functions* → *Secrets* → *Add new secret*:
  nazwa `ANTHROPIC_API_KEY`, wartość - klucz z Claude Console.
- **Terminal** (konto z rolą Administrator): `npm run ai:klucz` - pyta o klucz w ukrytym polu, ustawia sekret w projekcie
  z `supabase link`, sprawdza listę sekretów i testuje funkcję `ai` bez kosztów (liczenie tokenów). Ręcznie:
  `npx.cmd supabase secrets set ANTHROPIC_API_KEY=... --project-ref zrwouorevhxdtvubniwg`.

Modele, ceny i limity zmienia administrator w aplikacji (**Ustawienia → AI i budżet**); tam też widać zużycie
w miesiącu i to, czy klucz jest ustawiony. Twardy limit wydatków ustaw dodatkowo w Claude Console (Workspace → Limits).

## Listy z rysunków (etap 4)

Karta zapytania → **Rysunki i listy**. Przepływ:
1. Wybór PDF-u i strony; podgląd renderuje pdf.js w przeglądarce (także strony obrócone).
2. Technolog zaznacza prostokątem obszary: wykaz części, tabela króćców, dane projektowe, tabliczka
   (opcja „cały arkusz” z ostrzeżeniem o koszcie).
3. **PDF z warstwą tekstową** (rysunek z CAD): „Odczytaj z tekstu PDF” składa tabelę z pozycji tekstu - bez AI i bez kosztów.
4. **Skan:** „Odczytaj przez AI” renderuje tylko zaznaczony obszar w ~300 DPI (albo w natywnej rozdzielczości skanu,
   jeśli wyższa; mały wycinek powiększa do ~1500 px), tnie go na kafle ≤ 1500 px z zakładką 10%, pokazuje szacowany koszt
   i po potwierdzeniu wysyła kafle do trybu `wyciagnij_liste_z_rysunku` (jedno wywołanie na obszar).
   Wynik AI zapisuje się od razu (`odczyty_rysunkow.ekstrakcja_ai`) - nie jest liczony ponownie bez decyzji użytkownika.
5. Edytowalna siatka (wykaz części / króćce / dane projektowe / uwagi do wyceny): niepewne odczyty (pewność < 0,8)
   są żółte i oznaczone „(?)”, miniatura przy wierszu pokazuje jego miejsce na rysunku. Można też wkleić tabelę ze schowka.
6. **Pobierz Excel** (zakładki Parametry, Króćce, Wykaz części, Uwagi do wyceny) i **Przenieś do wyceny**
   (pozycje do zakładki Materiały wybranego albo nowego aparatu w wersji roboczej).

**Podgląd deweloperski bez logowania:** przy `npm run dev` strona
`http://localhost:5190/rysunek-dev.html?pdf=<ścieżka pliku w folderze FOLDER_MATERIALOW>` otwiera moduł
rysunków z lokalnym PDF-em (serwer Vite serwuje wyłącznie pliki `.pdf` z tego folderu; nie trafia to do buildu).

## Zapytanie z maila i przygotowanie automatyczne

**Zapytania → Nowe z maila**: pracownik przeciąga mail klienta z Outlooka (.msg) albo plik .eml. Aplikacja proponuje pola karty
zapytania bez AI: przedmiot z tematu (bez RE/FW), klienta (po domenie nadawcy - także w przekazanym mailu - albo po nazwie
w treści), termin składania ofert i nr zapytania klienta z treści. Pokazuje załączniki z typem i znacznikiem „istotny”
(długie obliczenia > 30 str. i standardy domyślnie pominięte w analizie). Duplikat (ten sam Message-ID) - odsyła do zapytania.
Domenę nadawcy można zapamiętać przy kliencie (domyślnie nie - w przekazanym mailu bywa domena pośrednika).

**Przygotuj automatycznie** (przycisk w karcie zapytania; po imporcie z zaznaczoną opcją - od razu):
1. Analiza zapytania (AI) - karta analizy; uzupełnia puste pola karty zapytania (klient, termin, nr, ogólny przedmiot).
2. Listy materiałów z rysunków (AI) - rysunki PDF oznaczone jako istotne, do 3 stron z pliku i 8 razem: PDF z CAD jako tekst
   (tanio), skan jako kafle całego arkusza; wynik zapisuje się jako odczyt rysunku.
3. Wstępna wycena (nowa wersja „Wstępna - przygotowana automatycznie”): aparaty z karty, materiały z odczytów (przypisane
   do aparatu po oznaczeniu w nazwie pliku), ceny z bazy (ta sama kategoria, gatunek z równoważnikami, wymiary ±15%;
   kolejność: ważne oferty → zakupy → przeterminowane oferty; dla cen za kg bez dopasowania wymiarów - cena przybliżona),
   usługi z karty w zakładkach wg kategorii, robocizna wskaźnikowa (mediana rbh/t z podobnych projektów i wycen,
   domyślna stawka), masa netto z karty albo suma mas z list.
4. Projekt oferty - klauzule dobrane do wymagań kosztotwórczych (tagi klauzul), zmienne ({zakres_NDT}, {temp_udarnosci},
   {gatunki}, {masa_kg}...), termin z karty, warunki domyślne. Oferta z wersji niezatwierdzonej ma znak „PROJEKT OFERTY”.
5. Raport w karcie analizy: wykonane kroki i **lista do sprawdzenia** (pozycje bez ceny, stare i przybliżone ceny, niepewne
   odczyty, brak masy / wskaźnika rbh/t, wymagania do wyjaśnienia, niespójności, pytania bez odpowiedzi).

Przed wywołaniem AI - plan z kosztem każdego wywołania do potwierdzenia. Bez klucza AI kroki 1-2 są pomijane, a wycena
powstaje z karty analizy wypełnionej ręcznie i zapisanych odczytów rysunków. Zapytanie przechodzi do statusu „kalkulacja”.

Podgląd okna importu bez logowania: `http://localhost:5190/import-dev.html?mail=<plik .msg/.eml w folderze materiałów>`.

## Karta analizy zapytania (etap 4)

Karta zapytania → **Karta analizy** - następca zakładki „Opinia o zapytaniu” z dotychczasowego arkusza wyceny. Jedna karta na zapytanie
(`analizy_zapytan`), edytuje każdy pracownik:
1. Podsumowanie przedmiotu (ilości, masa, wymiary, miejsce i warunki dostawy, terminy, postój, ważność, gwarancja, płatność,
   dokumenty oferty) i aparaty. **Uzupełnij kartę zapytania** wpisuje termin złożenia oferty i nr zapytania klienta (tylko puste
   pola), **Szkic wyceny z aparatami** tworzy nową wersję wyceny z aparatami z karty.
2. Wymagania kosztotwórcze - stała checklista z §7.2 (materiał/udarność, atesty, PED/JN/CE, UDT, NDT, próba, PWHT,
   sekafenowanie, antykorozja, izolacja, transport, wizja, montaż/postój, prawa autorskie, kary, „odpowiedniki”) plus własne;
   każde ze stanem, wpływem na cenę, opisem, źródłem (plik, strona) i cytatem.
3. Usługi do zapytań - źródło dla generatora zapytań do kooperantów (**Zapytaj kooperantów**).
4. Odczyty list z rysunków, 5. pytania do klienta i niespójności, 6. dokumenty istotne / do pominięcia,
   7. ocena działów (kompletność dokumentacji, ocena technologiczna i spawalnicza, terminy zakupu materiałów).

**Analizuj zapytanie (AI)**: do trybu `analizuj_zapytanie` idą teksty dokumentów oznaczonych jako istotne (ta sama treść
w kilku plikach - raz) i pierwsze strony skanów (najwyżej 6). Przed wysłaniem szacunek kosztu i potwierdzenie. Wynik
uzupełnia kartę: puste pola i nowe pozycje list - **poprawki człowieka mają pierwszeństwo**; surowa odpowiedź modelu
zostaje w `ekstrakcja_ai`. Karta trafia też do zakładki „Analiza” kalkulacji Excel. Pierwszy zapis przesuwa zapytanie
ze statusu „nowe” do „w analizie”.

Podgląd bez logowania (dane fikcyjne, symulacja odpowiedzi AI): `http://localhost:5190/analiza-dev.html`.

## Zapytania do dostawców (etap 4)

Karta zapytania → **Zapytania do dostawców** (tworzy dział handlowy, prezes, administrator; technolog widzi status):
1. Źródło pozycji: wersja wyceny (materiały i kooperacja, ilość × liczba aparatów), zapisany odczyt rysunku albo
   usługi z karty analizy.
   Pozycje są pogrupowane według kategorii; domyślnie zaznaczone są te bez ceny z oferty / zakupu.
2. **Przygotuj zapytanie** dla kategorii: temat `ZO/nnn/rrrr – <kategoria>`, wymagania z biblioteki (domyślne dla
   kategorii: atest 3.1 + PED i producent UE we wstępie, udarność −45 °C, UT, NFT, naddatki), termin oferty
   (domyślnie +5 dni roboczych), odbiorcy - dostawcy z bazy przypisani do kategorii albo adres wpisany ręcznie.
   Treść jest generowana z szablonu i można ją poprawić ręcznie.
3. Po zapisie każdy odbiorca ma przycisk **Wyślij**: otwiera Outlooka (`mailto:`) z tematem, treścią i DW na
   dedykowaną skrzynkę, osobny mail dla każdego dostawcy. Zbyt długa treść trafia do schowka.
4. Status odbiorcy: nie wysłane / wysłane / brak odpowiedzi po X dniach / **jest oferta** (wylicza się sam, gdy w bazie
   jest oferta tego dostawcy do tego ZO) / odmowa. Wszystkie zapytania z filtrem statusu: **Oferty dostawców → Wysłane zapytania**.

Szablon, biblioteka wymagań, adres do DW i liczba dni: **Ustawienia → Zapytania do dostawców** (administrator).
Podgląd ekranów bez logowania (dane fikcyjne): `http://localhost:5190/zapytania-dev.html` przy `npm run dev`.

## Dane testowe (seed) i testy lokalne

`npx vite-node scripts/seed/seed.ts [kroki]` czyta pliki z folderu materiałów (`FOLDER_MATERIALOW` w `.env`) według lokalnej
konfiguracji `prywatne/seed.json` (format: `scripts/seed/seed.przyklad.json`) i zapisuje je do Supabase kluczem serwisowym.
Kroki: `firma` (dane firmy, domeny poczty, opis dla AI i logo w ustawieniach), `klienci`, `zapytania` (z dokumentami do bucketu), `teksty` (uzupełnia teksty
dokumentów zapisanych bez tekstu, np. DOCX z wcześniejszych przebiegów), `karty` (karty dostawy Optimy),
`registo` (tylko sumy godzin), `wyceny` (arkusze, stare kalkulacje i notatki jako zatwierdzone wyceny historyczne), `oferty` (odczyt ofert przez AI - wymaga klucza; kurs NBP z dnia oferty, a gdy nazwy dostawcy nie ma
w tekście PDF - drugi odczyt z samego PDF-u, bo bywa tylko w logo), `stan`. Bez argumentu - wszystkie. Ponowne uruchomienie
nie dubluje danych: pozycje kart dostawy są aktualizowane po kluczu, miesiąc Registo jest podmieniany, a zapytania,
dokumenty i wyceny już obecne w bazie są pomijane.

`npm run test:lokalne` - testy na prawdziwych plikach i na projekcie Supabase (pomijane bez `.env`): RLS, reguły wycen
w bazie (zatwierdza tylko prezes, zamrożenie, kopia = nowa wersja), importy Optimy i Registo, odtworzenie wycen
historycznych nową metodą oraz eksport Excel / notatka / oferta z każdej zatwierdzonej wyceny; rysunki: render skanu
w 300 DPI i kafle, tabele danych projektowych i króćców z warstwy tekstowej PDF-u wektorowego, zapis odczytu (RLS, audyt bez
surowej odpowiedzi modelu) i przeniesienie do wyceny; zapytania do dostawców (RLS, wysłanie, „jest oferta” z bazy ofert,
odmowa); równoczesne nadawanie numerów ZO; karta analizy (do AI tylko dokumenty istotne, RLS, audyt, usługi jako
źródło zapytań); przygotowanie automatyczne bez AI (karta + odczyt rysunku → wstępna wycena, oferta, raport).
Z `.env` pliki testów idą po kolei (konta tymczasowe i limity Supabase Auth).
Testy AI na życzenie obejmują też analizę zapytania z seeda (`tests/lokalne/analiza_ai.test.ts`: wizja lokalna, montaż
w postoju, izolacja, dwa systemy malarskie, niespójność UDT / CE). Pliki i oczekiwania - `prywatne/testy.json`.

Test odbioru rundy 2 (`tests/lokalne/odbior.test.ts`, konfiguracja `odbior` w `prywatne/testy.json`): arkusz wzorcowy
odtworzony w nowym układzie (formuły Excela przeliczone, cena w EUR), przykład stawki z cennika roboczogodzin, trzy
zapytania z folderu materiałów (typy dokumentów bez AI, pola ze źródłem, kompresja, limit 50 MB) - dane testowe usuwane
na końcu.

Testy akceptacyjne AI z §7.1 (`tests/lokalne/rysunki_ai.test.ts`) wywołują prawdziwe Claude API, więc uruchamia się je
tylko na życzenie i przy ustawionym kluczu: `AI_TESTY=1 npm run test:lokalne` (koszt rzędu złotówki).

Cały przebieg na prawdziwym mailu albo zapytaniu - te same funkcje co aplikacja, jako tymczasowy technolog (konto `*.test`
usuwane na końcu), wynik zostaje w bazie do obejrzenia w aplikacji (koszt AI zwykle kilka zł):
- `npx vite-node scripts/przebieg-ai.ts mail "<plik .msg/.eml z folderu materiałów>"` - „Nowe z maila” + „Przygotuj automatycznie”,
- `npx vite-node scripts/przebieg-ai.ts zapytanie ZO/123/2026` - „Przygotuj automatycznie” na istniejącym zapytaniu.

Schematy odpowiedzi AI (structured outputs) mogą mieć najwyżej 16 pól „wartość albo null”. Dlatego model zapisuje brak
jako wartość pustą (`""`, `0`, `"brak"`), a funkcja `ai` zamienia ją na `null` przed zwróceniem wyniku (test pilnuje limitu).

## Limity planu Free i przenośność

Plan Free: 500 MB bazy, 1 GB plików, limit pliku 50 MB, projekt usypiany po tygodniu bez aktywności (wznowienie w panelu
Supabase). Zajętość widać w **Ustawienia → Zajętość planu** (ostrzeżenie od 80%).

Cała konfiguracja (schemat, RLS, buckety, funkcje, cron) jest w migracjach i skryptach. **Przeniesienie na plan Pro
albo własny serwer (Supabase w Dockerze):**
1. Nowy projekt (Pro) albo `supabase start` / self-hosting wg dokumentacji Supabase (docker compose).
2. `npx supabase link --project-ref <nowy-ref>` (self-hosting: `supabase db push --db-url <url>`).
3. `npm run db:migracje` i `npm run funkcje:wdroz`; sekrety: `npx supabase secrets set ANTHROPIC_API_KEY=...`.
4. `npx supabase config push` (ustawienia Auth z `supabase/config.toml`).
5. Dane: `pg_dump`/`pg_restore` schematu `public` + `auth` i skopiowanie bucketu `dokumenty`
   (albo ponowne załadowanie skryptami `scripts/seed/`).
6. Adres i klucz publishable: zmienne repozytorium `SUPABASE_URL` i `SUPABASE_ANON_KEY` (Settings → Variables)
   albo wartości domyślne w `src/lib/config.ts`. Kod aplikacji się nie zmienia.
7. Po przejściu na Pro zaktualizuj limity w ustawieniach (klucz `limity_planu`).

## Struktura

```
src/lib/          config, supabase, typy, formatowanie, słowniki (kontekst), obliczenia
src/components/   ekrany; ustawienia/ - zakładki ustawień, ui/ - przyciski, dialogi
supabase/         migrations/ (kolejno), functions/ (Deno), config.toml
scripts/          migracje, wdrażanie funkcji, .env, konto administratora, strażnik poufności, seed/
tests/            testy repo; tests/lokalne/ - testy na prawdziwych plikach (pomijane bez FOLDER_MATERIALOW i prywatne/testy.json)
docs/             pytania do firmy
prywatne/         TYLKO lokalnie (w .gitignore): konfiguracja seeda i testów, logo, specyfikacja, lista słów zakazanych
```
