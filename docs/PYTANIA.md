# Pytania do firmy

Nie blokują pracy - tam, gdzie trzeba było coś przyjąć, opisano założenie (*kursywą*). Odpowiedzi wpisuj pod pytaniem.
Repozytorium jest publiczne: pytania nie zawierają nazw firmy, klientów, dostawców ani oznaczeń projektów.

## Do prezesa

1. **Zatwierdzanie wycen.** Zatwierdzać może tylko rola „prezes”. Czy administrator też (np. w zastępstwie)?
   *Założenie: tylko prezes.*
2. **Kto widzi cenę końcową.** Czy technolog bez flagi „widzi marże” ma widzieć cenę końcową zatwierdzonej wyceny
   (a więc pośrednio marżę, jeśli zna koszty)? *Założenie: widzi cenę po zatwierdzeniu, bez rozbicia na zysk i korektę.*
3. **Zaokrąglenie ceny po narzucie.** W historycznych wycenach cenę zaokrąglano raz do 1000 zł, raz do 100 zł.
   *Założenie: domyślnie do 100 zł, do zmiany w ustawieniach i w wycenie.*
4. **Cena za kg w notatce dla prezesa** jest liczona od ceny przed korektą prezesa. Czy w ofercie i statystykach
   („Podobne zlecenia”) ma być liczona przed czy po korekcie? *Założenie: pokazujemy obie.*
5. **Wyceny historyczne** są wczytane jako zatwierdzone (import systemowy, bez kliknięcia prezesa), żeby zasilały
   „Podobne zlecenia” i porównania. Czy tak może zostać? *Założenie: tak; prezes widzi je w historii, nie w kolejce.*
6. **Cena w wycenie automatycznej - najnowsza czy najtańsza oferta?** *Założenie: najnowsza ważna oferta (lepiej oddaje
   bieżący rynek); oferta zebrana do tego samego zapytania ma pierwszeństwo przed historią.*
7. **Budżet AI.** Limit miesięczny i dzienny na użytkownika ustawia administrator. Jaki budżet miesięczny przyjąć na start?
   Przygotowanie jednego zapytania (analiza + rysunki) kosztuje zwykle 0,5-2,5 zł. *Założenie: limit z ustawień demo.*
8. **Odczyt całego arkusza rysunku przez AI** (droższy niż zaznaczenie samej tabeli) - dla wszystkich czy tylko dla
   administratora? *Założenie: dla wszystkich, pilnują go limity budżetu.*

## Do technologów

9. **Opisy kodów MPK** (słownik w Ustawieniach ma puste opisy): które to spawalnia, obróbka, montaż, malarnia?
10. **Docelowe stawki robocizny** i ich podział na rodzaje prac. *Wpisano wartości z przykładowych wycen, oznaczone
    „do weryfikacji”.*
11. **Wskaźnik startowy rbh/t dla typów aparatów** (np. zbiornik pionowy, wymiennik, wkład rurowy). Wycena automatyczna
    bierze medianę z projektów zrealizowanych i wcześniejszych wycen tego typu - przy braku danych robocizna zostaje pusta
    i trafia na listę do sprawdzenia. To dziś największa luka wyceny automatycznej.
12. **Naddatek na dennice** - w starym arkuszu dennice były w sekcji blach (5%), w nowej metodzie są osobną kategorią.
    *Założenie: 0% (kupowane jako gotowe wyroby).*
13. **Dopisek „+ 5 zł/kg” przy cenie jednostkowej** w jednej z notatek - opcja, dopłata, tolerancja masy?
14. **Jakość skanów rysunków.** Skany arkuszy A1 zapisane jako A4 mają drobne pismo na granicy czytelności (także dla AI).
    Czy przy zapytaniach można prosić klienta o PDF z CAD albo skany w pełnej rozdzielczości? PDF z CAD aplikacja czyta
    z warstwy tekstowej - bez AI i bez kosztów.
15. **Podpisy działów w karcie analizy.** Karta zapisuje, kto i kiedy ją zmienił, ale nie ma osobnego zatwierdzenia przez
    każdy dział (technolog, spawalnik, zaopatrzenie). Czy jest potrzebne? *Założenie: wystarcza historia zmian.*
16. **Materiały do zakupu z wyceny.** Lista zakupowa bierze ilości z wyceny × liczba aparatów, z naddatkiem technologicznym
    kategorii (blachy 5%, odkuwki 2%). Czy dział handlowy ma zamawiać z naddatkiem, czy dokładnie wg listy?
    *Założenie: z naddatkiem kategorii.*

## Do działu handlowego

17. **Numer ZO** - nadawany w Optimie czy w aplikacji? *Założenie: aplikacja nadaje kolejny numer, pole jest edytowalne.*
18. **Osobne formaty ofert dla klientów** (np. formularz cenowy platformy zakupowej klienta) - czy są potrzebne?
19. **Wartość równa 40% ceny** obok ceny w starym arkuszu - zaliczka / przedpłata do przeniesienia do oferty?
20. **Skrzynka na oferty.** Dostawca poczty (Microsoft 365, Gmail, inny) i adres dedykowanej skrzynki (np. oferty@...),
    na którą dostawcy odpowiadają (DW w zapytaniach). W Ustawieniach jest miejsce na podłączenie - na razie maile
    wrzuca się ręcznie (przeciągnięcie .msg/.eml).
21. **Jeden mail na dostawcę.** Generator otwiera osobny mail dla każdego odbiorcy (dostawcy nie widzą się nawzajem).
    *Założenie: tak pracuje dział handlowy.*
22. **Wymagania w zapytaniach do dostawców** (atest 3.1 + PED, producent z UE, udarność, UT/NFT rur, UT odkuwek, naddatki) -
    czy są inne standardowe wymagania (blachy, kołnierze, usługi) albo różne zestawy dla różnych klientów?
23. **Ile ofert na pozycję** zbierać przed wyceną (np. minimum 2-3 dla odkuwek i rur)? *Założenie: aplikacja pokazuje
    liczbę ofert na pozycji, bez progu.*
24. **Oferty wewnętrzne innych wydziałów firmy** (np. montaż na obiekcie) - rejestrować w bazie cen jako „dostawcę
    wewnętrznego”? *Założenie: nie - koszt montażu własnego wpisuje się w wycenie.*
25. **Dostawcy bez nazwy firmy w mailu** (odpowiedź z prywatnej skrzynki) - AI wpisuje wtedy nadawcę z uwagą „nazwa firmy
    do potwierdzenia”. Proszę poprawiać nazwy takich kooperantów w Dostawcach.
26. **Zamówienia u dostawców po wygranej.** Czy zamówienia wystawia się w Optimie (wtedy w aplikacji wpisujemy numer
    zamówienia z Optimy), czy aplikacja ma nadawać własny numer? *Założenie: numer wpisywany ręcznie (np. z Optimy),
    domyślnie „<numer ZO>/Z<n>”.*
27. **Potwierdzenie dostawy.** Kto oznacza dostawę jako przyjętą (magazyn, zaopatrzenie)? Czy karta dostawy z Optimy
    ma automatycznie zamykać pozycje zamówienia? *Założenie: oznacza dział handlowy; przy imporcie karty dostawy
    aplikacja podpowiada pasujące pozycje.*
28. **Statusy zapytania.** Zapis karty analizy przesuwa zapytanie z „nowe” do „w analizie”, przygotowanie wyceny do
    „kalkulacja”. *Założenie: tak; status można zawsze zmienić ręcznie.*

## Do administratora / właściciela konta Supabase

29. **Ustawienia logowania w Supabase** wymagają roli Owner/Administrator w organizacji (konto aplikacji ma niższą rolę):
    - Sign In / Providers → **Allow new users to sign up: wyłączyć** (konta zakłada tylko administrator aplikacji),
    - URL Configuration → **Site URL** i **Redirect URLs**: adres aplikacji na GitHub Pages
      (bez tego link „nie pamiętam hasła” nie zadziała).
    *Zabezpieczenie na czas przejściowy: konto założone samodzielnie nie dostaje profilu, więc nie widzi żadnych danych
    i nie może wywołać AI (sprawdza test bezpieczeństwa).*
30. ~~Sekret `ANTHROPIC_API_KEY`~~ - *załatwione: nowy klucz pod właściwą nazwą (2026-10-19).*
31. **Lista e-maili pierwszych użytkowników i ich role.**
32. **Nazwa repozytorium i adres aplikacji.** Adres GitHub Pages zawiera nazwę repozytorium. Po zmianie nazwy repozytorium
    trzeba uaktualnić Site URL i Redirect URLs w Supabase (pkt 29).

## Etap 1 - wycena materiałowa (do technologów i działu handlowego)

33. **Masy elementów.** Rysunki złożeniowe z CAD w przykładowych zapytaniach mają tabelę materiałów (element → gatunek),
    tabelę króćców i dane projektowe (w tym masę pustą), ale nie mają wykazu części z masami. Skąd dziś bierzecie masy
    płaszcza, den, ścian sitowych: z własnego zestawienia, z wymiarów na rysunku, od klienta?
    *Założenie: technolog wpisuje wymiary albo masę w zakładce Materiały; aplikacja liczy masę z wymiarów i porównuje sumę z masą pustą z rysunku.*
34. **Typowe udziały mas elementów** w masie pustej (np. dla zbiornika: płaszcz, dna, dach, konstrukcja; dla wymiennika:
    płaszcz, ściany sitowe, rurki, dennice, kołnierze). Pozwoliłyby rozdzielić masę pustą z rysunku na elementy już przy
    pierwszej wycenie. *Założenie: aplikacja nie zgaduje mas - pozycje bez masy są na liście do uzupełnienia.*
35. **Szablony elementów.** Czy lista elementów jest kompletna i w dobrej kolejności?
    Wymiennik: króćce, kołnierze, ściany sitowe, rurki, płaszcz, dennice/pokrywy komór, przegrody, ściągi i odległościówki,
    podpory, wzmocnienia, śruby, uszczelki, inne. Zbiornik: króćce, kołnierze, włazy, płaszcz, dno, dach, konstrukcja wsporcza,
    podesty i drabiny, wzmocnienia, śruby, uszczelki, inne.
36. **Ceny zastępcze.** Gdy gatunku z rysunku nie ma w zakupach z Optimy, materiał na kg dostaje cenę innego gatunku tego samego
    rodzaju stali (np. blacha SA516 wg zakupu S235JR), z dopiskiem „potwierdź ofertą”. Czy tak może być w wycenie wstępnej,
    czy lepiej zostawić pozycję bez ceny? *Założenie: cena zastępcza z dopiskiem.*
37. **Zakupy stali węglowej w Optimie.** Wczytane karty dostawy to głównie stal nierdzewna; dla aparatów z SA516 / A105 / A106
    brakuje cen kołnierzy, rur i dennic. Czy można wczytać karty dostawy z innych lat / zleceń ze stalą węglową?
38. **Rury króćców.** Tabela króćców podaje średnicę i grubość, ale nie długość. Czy przyjmujecie standardową długość
    (np. 150-300 mm wg DN), czy zawsze z rysunku? *Założenie: długość wpisuje technolog.*
39. **Śruby i uszczelki** - wyceniane kompletami na króciec (wg DN i PN) czy jedną kwotą na aparat?
    *Założenie: jedna pozycja na aparat, cena z oferty albo ręcznie.*
40. **Dawne oznaczenia gatunków** (Fe37, Fe360, St3S) dodano do słownika jako równoważniki S235JR. Czy na rysunkach
    zdarzają się inne stare oznaczenia, które trzeba dopisać?

## Runda 2

41. **Widoczność cennika roboczogodzin.** Stawki widzą prezes, administrator i konta z flagą „widzi narzuty i marże”;
    pozostali widzą nazwy stanowisk, a w wycenie dostają migawkę stawek (koszt robocizny i tak jest widoczny).
    *Założenie: tak - patrz docs/PLAN-runda2.md, decyzja 1.*
42. **Kosz.** Usunięte zapytanie trafia do kosza w całości (dokumenty, odczyty, analiza, wyceny, oferty zebrane pod zapytanie);
    trwałe usunięcie - prezes i administrator, po wpisaniu numeru ZO. Automatyczne czyszczenie po 30 dniach.
    *Założenie: 30 dni, zmiana w Ustawieniach.*
43. **Cofnij / Ponów w edytorach z przyciskiem Zapisz** (wycena, odczyt rysunku, karta analizy, oferta) cofa zmiany w edytorze;
    do bazy trafiają po Zapisz. Ekrany zapisujące od razu (cennik, klasyfikacja zakupów, typy dokumentów, kosz) cofają w bazie.
    *Założenie: tak - jak w programach biurowych.*
44. **Język oferty** wybiera się w ofercie (PL/EN), domyślnie język interfejsu. Klauzule bez wersji angielskiej trafiają
    do oferty EN po polsku, z ostrzeżeniem. *Założenie: tak.*
45. **Rodzaj aparatu starych zapytań.** Migracja ustawia go z aparatów i przedmiotu (zbiornik / wymiennik / wkład rurowy);
    zapytania, których nie da się przypisać (np. separator), dostają ekran wyboru przy pierwszym wejściu.
46. **Przedziały czasu cennika** (7-15, 15-19, 19-7, dni wolne) - stawka „stała” dla stanowisk rozliczanych jedną stawką.
    W wycenie domyślny przedział to 7-15. *Założenie: tak.*
47. **Klasyfikacja zakupów.** Typ zamówienia ZM - materiał, ZJ - usługa dzielona słownikiem na kooperację i transport/badania/inne;
    dopłaty z karty (atest, transport, kurier) - „Transport, badania i inne”; materiały pomocnicze (narzędzia, ścierniwa) -
    „Materiały”, ale bez udziału w wyszukiwaniu cen (jak dziś). *Założenie: tak.*
48. **Orientacyjna cena historyczna kooperacji** - domyślnie wyłączona; po włączeniu pokazuje się tylko jako dopisek przy pozycji.
49. **Kompresja plików.** Zapisujemy tylko wersję zoptymalizowaną (oryginał zostaje na dysku pracownika); gdy test czytelności
    nie przejdzie - oryginał. Limit 50 MB na plik (Ustawienia → Limity planu).
50. **Prośby o oferty** nie wysyłają maili z serwera; dział handlowy widzi kolejkę z licznikiem w menu, a zapytania do kooperantów
    generuje jak dotąd (mailto).
51. **Kolejność faz.** Na prośbę zamawiającego najpierw moduł wycen (faza 7), potem rysunki (faza 6), dokumenty (faza 5),
    kooperacja i prośby o oferty (faza 8), a historyczny cennik (faza 4) na końcu. Do czasu fazy 4 robocizna szczegółowa
    bierze stawki ze słownika stawek (Ustawienia); stanowisko, przedział czasu i technolog są już zapisywane w pozycjach.
52. **Ocena działów** (kompletność dokumentacji, ocena technologiczna i spawalnicza, terminy zakupów, problemy) ma jedno
    źródło - kartę analizy; zakładka Wycena edytuje te same dane. „Data i podpis” to zapis kto / kiedy przy bloku.
53. **Odczyt całego dokumentu (AI)** czyta najwyżej 10 pierwszych stron pliku (koszt); dalsze strony - zaznaczeniem.
    Wynik strony dzieli się na osobne odczyty: wykaz części, króćce, dane projektowe, uwagi i tabele własne (np. badania).
54. **Kilka tabel na jednym arkuszu.** Do wyceny automatycznej bierzemy najnowszy odczyt każdej nazwanej tabeli strony
    (dawniej: najnowszy odczyt strony). Ta sama lista z innego pliku (kopia rysunku) - nadal raz.
55. **Przeniesienie do wyceny**: wykaz części do Materiałów, króćce jako rura króćca + kołnierz, tabela „Badania i wymagania”
    do zakładki Badania. Dane projektowe trafiają do parametrów projektu (jak dotąd, z odczytów). Pozycja usunięta
    z odczytu zostaje w wycenie (komunikat przy przeniesieniu) - nie kasujemy pozycji, które mogły dostać cenę.
56. **Obrazy JPG / PNG** otwierają się jak jednostronicowy skan (200 DPI przyjęte do wymiarów strony); odczyt bez AI
    jest możliwy tylko dla PDF z warstwą tekstową.
57. **Kompresja - wyniki na przykładowych folderach** (raport z testu lokalnego): pliki z zapytań są już dobrze spakowane -
    rysunki z CAD bez zmian (0%), skan oferty -17% (przekodowanie stron), PDF-y z warstwą tekstową -0..6% (struktura),
    DOCX/XLSX -14..20% (gzip); razem na folder 0,1-8%. Skany zapisane jako obraz dwukolorowy (CCITT/JBIG2) są mniejsze niż
    JPEG - zostają w oryginale. Odczyt po kompresji sprawdzony: ta sama liczba znaków i elementów tekstu, kafle się renderują.
58. **TIFF, DWG, DXF** - tylko przechowanie (bez podglądu i odczytu); DXF / pliki tekstowe zapisują się spakowane gzipem
    przy zysku > 10%, pobranie i otwarcie rozpakowuje je automatycznie.
59. **Kompresja obrazów JPG / PNG** (WebP / JPEG jakości 0,9, dłuższy bok do 6000 px) działa w przeglądarce; nazwa pliku
    zostaje oryginalna, format zapisu jest w kolumnie mime. DPI z metadanych obrazu nie jest odczytywane (przyjmujemy 200 DPI).
60. **Pola karty zapytania z dokumentów** (bez AI): numer zapytania klienta, termin składania ofert, klient (po słowniku) -
    tylko puste pola, ze źródłem „plik, str. N” pod polem; ręczna zmiana pola usuwa znacznik źródła. Arkusz danych PDF
    z warstwą tekstową daje odczyt „Dane projektowe z arkusza danych” do sprawdzenia w zakładce rysunków.
61. **Prośby o oferty**: stan pozycji usługi (brak oferty / prośba wysłana / oferta otrzymana / wybrana) liczy się z prośby
    zapisanej w pozycji i z ofert do niej; bez prośby - z ofert do zapytania w tej kategorii usługi. Prośby się nie usuwa
    (status „anulowana”); usunięte zapytanie zabiera prośby do kosza i przywraca je razem z ofertami.
62. **Porównanie ofert usług** - okno „Znajdź cenę” przy pozycji: domyślnie tylko oferty do tego zapytania (najtańsza i
    najszybsza oznaczone, przeterminowane na czerwono), wybór kopiuje cenę i źródło do wyceny i zapisuje wybraną ofertę
    w prośbie. Zakupy z Optimy nie są źródłem cen usług.
63. **Mail z ofertą** czyta się najpierw bez AI (kwoty z walutą i jm, „ilość × cena”, termin, ważność, Incoterms; dostawca
    po domenie nadawcy z kontaktów dostawców); odczyt AI zostaje jako druga opcja z szacunkiem kosztu.
64. **Cennik roboczogodzin** - stawki wczytane lokalnie z prywatne/stawki-robocizny.json (`npm run seed:stawki`), oznaczone
    „do weryfikacji”. Zmiana stawki tworzy wersję od dziś (historia przy stanowisku). Dotychczasowe stawki ze słownika
    przeszły do cennika jako stawki stałe; starsze wyceny (bez migawki) dalej biorą stawki ze słownika.
65. **Migawka cennika** zapisuje się przy tworzeniu wyceny (także kopii wersji). Technolog bez flagi marż nie widzi cennika,
    ale widzi stawki w swojej wycenie (jak dotąd - koszt robocizny jest w wycenie). „Odśwież stawki z cennika” najpierw
    zapisuje zmiany wyceny.
66. **Rodzaj kosztu zakupów**: reguły słów kluczowych (PL/EN) edytuje dział handlowy, prezes i administrator w zakładce
    „Reguły klasyfikacji” modułu Historyczny cennik (Ustawienia są tylko dla administratora). Przy obecnych danych bufor
    „Do klasyfikacji” jest pusty po dopisaniu słowa „spawalnicz”.
67. **Karty dostawy w PDF** (wydruk z Optimy) czytają się bez AI tym samym parserem co XLS - wszystkie przykładowe karty
    mają sumę pozycji zgodną ze stopką.
68. **Odbiór rundy 2** (`tests/lokalne/odbior.test.ts`): arkusz wzorcowy odtworzony w nowym układzie (formuły przeliczone,
    cena w EUR po kursie z arkusza), przykład stawki z cennika i trzy zapytania z folderu materiałów. W tych zapytaniach
    pola karty bez AI znalazły tylko klienta - numeru zapytania i terminu nie ma w tekście dokumentów (bywają tylko w mailu).
69. **Nie zrobione w rundzie 2** (do decyzji): tabele edytowalne (Materiały, Robocizna, Usługi, siatka odczytu, cennik)
    nie mają filtrów w nagłówkach - tylko tabele przeglądowe; zakładka Robocizna pokazuje stałe przedziały czasu (przedział
    dodany w cenniku nie pojawi się w wycenie); „elementy zapasowe” nie zostały dodane; odczyt całego dokumentu przez AI
    i odczyt oferty przez AI nie były testowane płatnym wywołaniem.
70. **Instrukcja** jest w obu językach (treść w `src/components/instrukcjaTresc.ts`); przykład stawki w instrukcji
    jest fikcyjny.
71. **Wersje edytowalne - cały dokument i układ** (2026-10-29): odczyt, tłumaczenie i Word obejmują domyślnie wszystkie
    strony (wybór stron zakresem albo Ctrl+klik). Word odtwarza stronę oryginału: wymiary, marginesy, czcionki (fonty PDF
    bez nazwy - Arial / Times wg rodzaju), odstęp znaków, wcięcia, odstępy, tabele, obrazy, nagłówek i stopkę. Formularze
    z gęstą siatką linii dostają „dokładne położenie” (pola na tle strony bez tekstu). Tekst niewidoczny w PDF (biały,
    zamazany) jest pomijany; napisy narysowane krzywymi trafiają jako obraz. Kursywa fontów bez nazwy nie jest rozpoznawana.
72. **Strony czytane przez AI** mają układ płynny z położeniem bloków podanym przez model (przybliżone); układ dokładny
    jest tylko dla odczytu bez AI (wymaga warstwy tekstowej do wycięcia tekstu z tła).
73. **Lista materiałowa zapytania** (2026-10-30): jedna lista na zapytanie (odczyt o rodzaju „lista_materialowa”), złożona
    z dokumentu listy albo rysunku złożeniowego; kolejne odczyty dopisują się (pozycje o tym samym numerze są scalane, np.
    wykaz części i tabela U-rur) albo zastępują listę. Wycena automatyczna i „Przenieś do wyceny” biorą materiały z tej listy.
74. **Typy dokumentów** uproszczone do sześciu; stare typy zostały w słowniku jako nieaktywne (kosz i historia), dokumenty
    dostały nowe typy (rysunki → projekt, specyfikacje / standardy / karty danych → wymagania, korespondencja → zapytanie,
    obliczenia → inne). Arkusz danych rozpoznawany po nazwie / treści - dane projektowe czytane z niego jak dotąd.
75. **Kompresja** tylko dla plików powyżej 20 MB; mniejsze zapisywane bez zmian.
76. **Kooperacja**: ocena działów, podsumowanie i aparaty z analizy zostają w danych karty (wycena, wycena automatyczna),
    ale nie są pokazywane w zakładce. Maile wysłane z generatora zapytań nie trafiają do aplikacji (brak skrzynki) - prośbę
    do działu handlowego tworzy przycisk przy usłudze w Kooperacji albo w wycenie.
77. **Terminy zakupu materiałów**: grupy z kategorii materiałów wyceny (bez materiałów - wg rodzaju aparatu), podpowiedź
    z najdłuższego terminu dostawy w ofertach do zapytania.
78. **Wersje edytowalne - poprawki po teście (2026-10-30)**: strona z warstwą tekstową (nawet krótka - spis treści,
    podpisy rysunków) nie jest już skanem; „Odczytaj przez AI” czyta takie strony silnikiem bez AI, a do AI wysyła tylko
    skany. Akapity: wcięcie wiszące / pierwszego wiersza i wyrównanie liczone z całego akapitu, twarde złamania tylko tam,
    gdzie są w oryginale. Tłumaczenie zachowuje pogrubienia wewnątrz akapitów (znaczniki [b] / [i]) i podział stron
    (dłuższy tekst - czcionka i odstępy strony mniejsze, najwyżej o 20%). Wcześniejsze odczyty trzeba powtórzyć.
