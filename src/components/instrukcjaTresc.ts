import type { Jezyk } from '@/i18n'
import type { uprawnienia } from '@/lib/types'

// Treść instrukcji w obu językach. Znaczniki w tekście: **pogrubienie**, *kursywa*.
// `gdy` - rozdział albo pozycja widoczne tylko przy danym uprawnieniu ("!" - przy jego braku).

type Uprawnienie = keyof ReturnType<typeof uprawnienia>
export type Warunek = Uprawnienie | `!${Uprawnienie}`
export type Pozycja = string | { t: string; gdy: Warunek }
export interface RozdzialInstrukcji { tytul: string; gdy?: Warunek; tekst?: Pozycja[]; lista?: Pozycja[]; kroki?: Pozycja[]; po?: Pozycja[] }

const PL: RozdzialInstrukcji[] = [
  {
    tytul: 'Do czego służy aplikacja',
    tekst: [
      'Jedno miejsce na cały proces ofertowy, w dwóch modułach: **Zapytania ofertowe i wyceny** (od zapytania klienta do oferty) i **Historyczny cennik** (cennik roboczogodzin, zakupy z Optimy, usługi kooperacyjne, projekty zrealizowane).',
      'Wycena przygotowana automatycznie jest zawsze **wstępna** - sprawdza ją technolog i dział handlowy, a cenę zatwierdza prezes.',
    ],
  },
  {
    tytul: 'Nawigacja i funkcje wspólne',
    lista: [
      'Ikony w prawym górnym rogu: **Ustawienia**, **Użytkownicy**, **Kosz**, **Instrukcja**, zmiana hasła i przełącznik języka **PL / EN** (zapamiętany na koncie). Excel i Word mają własny wybór języka.',
      '**Cofnij / Ponów** - Ctrl+Z i Ctrl+Y albo strzałki w nagłówku; bez limitu kroków, także po odświeżeniu strony. Lista kroków rozwija się pod przyciskiem.',
      '**Tabele**: kliknięcie nagłówka sortuje (Shift + klik - kilka kolumn), ikona filtra przy nagłówku filtruje (tekst, zakres liczb lub dat, lista wartości). Ustawienia tabel zapamiętują się dla Ciebie.',
      '**Usuwanie** przenosi do Kosza razem z danymi zależnymi (np. zapytanie z dokumentami, wycenami i prośbami o oferty). Z Kosza przywrócisz całość; trwale usuwa tylko prezes albo administrator, a stare pozycje kosz usuwa sam po liczbie dni z ustawień.',
      'Ścieżka nad ekranem (np. Zapytania → ZO/… → Wycena) i przycisk **Wstecz do zapytania** prowadzą z powrotem. Otwarta zakładka jest w adresie strony - skopiowany link otwiera to samo miejsce.',
    ],
  },
  {
    tytul: 'Zapytania i dokumenty',
    lista: [
      '**Nowe zapytanie** zaczyna się od **rodzaju aparatu** (pole wymagane): zbiornik albo wymiennik ciepła - kompletny, sam wkład rurowy albo część (z opisem). Od rodzaju zależą szablon elementów, rodzaje tabel na rysunkach i wymagania. Później rodzaj zmienisz tylko na karcie zapytania.',
      'Numer **ZO/nnn/rrrr** nadaje się sam (pole można zmienić, np. na numer z Optimy). **Klienta** i **osobę prowadzącą** wpisujesz na karcie zapytania - dowolnie albo z listy podpowiedzi; nowy klient i nowa osoba zapisują się na liście na przyszłość.',
      '**Dokumenty**: przeciągnij wiele plików albo cały folder. Aplikacja bez AI rozpozna typ: Zapytanie ofertowe, Projekt / rysunek złożeniowy, Lista materiałowa, Wymagania techniczne (specyfikacja, standardy, karta danych), Oferta dostawcy, Inne. Przeciągnięcie pliku na inną grupę zmienia typ.',
      'Skan zapisany w poziomie albo do góry nogami obrócisz strzałkami przy dokumencie (o 90°) - PDF bez utraty jakości.',
      'Z treści dokumentów aplikacja uzupełnia **puste** pola karty zapytania (numer zapytania klienta, termin, klient) - przy polu widać źródło (plik, strona). Twoich wpisów nie nadpisuje.',
      'Pliki do 20 MB zapisują się **bez kompresji** (pełna jakość, drobne pismo czytelne). Większe są kompresowane i sprawdzane, czy da się je odczytać. Ten sam plik drugi raz się nie zapisze. Limit jednego pliku: 50 MB.',
      'Do AI idą tylko dokumenty oznaczone jako **istotne**. Gdy wszystkie dokumenty są dodane - **Odczytaj wszystkie dane z dokumentów**: kooperacja, lista materiałowa, wstępna wycena i projekt oferty, bez AI albo z AI.',
    ],
  },
  {
    tytul: 'Kooperacja',
    lista: [
      'Zakładka **Kooperacja** (dawna karta analizy): wypełniasz ją ręcznie albo przyciskiem **Analizuj zapytanie (AI)** - przed wysłaniem zobaczysz koszt. AI czyta teksty dokumentów istotnych i wszystkie strony skanów.',
      '**Wymagania kosztotwórcze** to stała checklista (udarność, atesty, PED/CE, UDT, NDT, PWHT, antykorozja, izolacja, transport, wizja lokalna, montaż w postoju, kary…). Każdej nadaj stan, wpływ na cenę, opis i źródło; ikona cytatu rozwija fragment dokumentu.',
      '**Usługi kooperacja** - usługi do zlecenia kooperantom. Ikona samolotu przy usłudze tworzy **prośbę o ofertę** w kolejce działu handlowego (menu *Prośby o oferty*); *Zapytaj kooperantów* otwiera generator maili do kooperantów. Usługi trafiają same do zakładek Kooperacja i Badania / odbiory / transport wyceny.',
      '**Pytania do klienta i niespójności** między dokumentami są wyróżnione. AI uzupełnia tylko puste pola - **Twoje wpisy zostają**.',
    ],
  },
  {
    tytul: 'Tworzenie listy materiałowej',
    lista: [
      'Wynikiem zakładki jest **jedna kompletna lista materiałowa** zapytania - pozycje uporządkowane po numerze, króćce i dane projektowe. Z niej korzysta wycena.',
      'Jest dokument listy materiałowej: **Lista bez AI** (PDF z tekstem, arkusz Excel / CSV - bez kosztów) albo **Lista przez AI** (skan, zdjęcie) - AI czyta wszystkie strony naraz i składa jedną listę.',
      'Nie ma listy: utwórz ją z **rysunku złożeniowego** - *Lista przez AI* czyta cały arkusz (wykaz części, tabela U-rur z długościami i masami, tabela króćców, dane projektowe); *Zaznacz tabele* - przeciągnij prostokąty wokół wybranych tabel, odczytaj bez AI albo przez AI i kliknij *Dodaj do listy*.',
      'Kolejny odczyt **dopisuje się** do listy - pozycje o tym samym numerze są scalane (np. wykaz części uzupełniony długością i masą z tabeli U-rur). Zaznacz *nowy odczyt zastępuje listę*, żeby zacząć od nowa.',
      'Popraw listę w siatce (żółte wiersze z „(?)” są niepewne), **Zapisz zmiany** i **Przenieś do wyceny** - pozycje trafiają do Materiałów wybranego aparatu bez dublowania.',
    ],
  },
  {
    tytul: 'Wycena automatyczna',
    lista: [
      'Karta zapytania → **Wycena automatyczna** - jeden przycisk z wyborem trybu:',
      '*Bez AI - wycena materiałowa*: lista materiałów z odczytów rysunków (PDF z CAD czytane z warstwy tekstowej) według szablonu rodzaju aparatu, ceny z ofert do zapytania i z zakupów „Materiały”. Bez kosztów.',
      '*Z AI - pełne przygotowanie*: analiza zapytania, listy materiałów z rysunków, wstępna wycena i projekt oferty. Najpierw szacunek kosztu i potwierdzenie.',
      'Każde uruchomienie tworzy nową wersję wyceny i raport do sprawdzenia: pozycje bez ceny, ceny stare lub zastępcze, niepewne odczyty, sprawy do wyjaśnienia z klientem.',
    ],
    po: [
      '**Skąd ceny materiałów:** (1) oferty zebrane do tego zapytania, (2) zakupy z Optimy rodzaju „Materiały” - ten sam gatunek albo jego równoważnik, kołnierze tej samej wielkości DN, (3) *cena zastępcza* innego gatunku tego samego rodzaju stali, z dopiskiem w uwagach - do potwierdzenia ofertą. Śruby, uszczelki i kołnierze bez wielkości nie dostają ceny automatycznie.',
    ],
  },
  {
    tytul: 'Wycena',
    lista: [
      'Wycena należy do zapytania i ma **wersje** (v1, v2…), a wersja - aparaty. Zakładki w układzie arkusza wzorcowego: **Wycena**, **Materiały**, **Robocizna**, **Kooperacja**, **Badania / odbiory / transport**, **Podsumowanie**, **Oferta**.',
      '**Wycena** (pierwsza zakładka): opinia o zapytaniu, ocena działów, ocena ekonomiczna i przegląd oferty.',
      '**Materiały**: ręcznie, z odczytów rysunków albo z Excela. Masa liczy się z wymiarów i gęstości gatunku, naddatek technologiczny dolicza się do sum sekcji. **Znajdź cenę** pokazuje oferty do tego zapytania i zakupy „Materiały” w PLN z datą i źródłem; wybrana cena jest **kopiowana** do pozycji - późniejsza zmiana w bazie nie zmienia wyceny.',
      '**Robocizna**: pozycja = stanowisko z cennika roboczogodzin × przedział czasu (np. 7:00-15:00, dni wolne) × liczba rbh. Stawka pochodzi z **migawki cennika** zapisanej przy tworzeniu wyceny - zmiana cennika nie zmienia istniejących wycen. Stawkę można nadpisać (odchylenie od cennika jest podświetlone); gdy cennik się zmienił, wycena to pokaże i zaproponuje *Odśwież stawki z cennika*. Przykład: 10 rbh × 50 zł/rbh = 500 zł. Zamiast pozycji można liczyć wskaźnikowo: t × rbh/t × stawka średnia.',
      '**Kooperacja** i **Badania / odbiory / transport**: ceny pochodzą z ofert zebranych pod to zapytanie (rozdział „Prośby o oferty”). Przy pozycji widać stan: brak oferty, prośba wysłana, jest oferta, oferta wybrana.',
      'Sumy w zakładkach pokazują wartość dla każdej wycenianej ilości sztuk. Ostrzeżenia na podsumowaniu: brak ceny, cena starsza niż próg z ustawień, oferta bliska wygaśnięcia, pozycja kpl bez masy, termin dostawy materiału.',
      { t: 'Na podsumowaniu widzisz koszt, zysk, zaokrąglenie, korektę prezesa, cenę za kg i cenę w EUR (kurs NBP z dnia wyceny).', gdy: 'widziMarze' },
      { t: 'Na podsumowaniu widzisz koszty i cenę za kg kosztów. Zysk i korekta prezesa są ukryte; cenę końcową zobaczysz po zatwierdzeniu.', gdy: '!widziMarze' },
      '**Oferta**: sekcje rozwijane - zmieniasz kolejność, ukrywasz sekcję w wydruku, piszesz tekst z formatowaniem i zmiennymi (np. numer zapytania, cena), zapisujesz wersje treści i wybierasz język oferty (PL / EN). Word powstaje z tych sekcji; oferta z wersji niezatwierdzonej ma oznaczenie „PROJEKT OFERTY”.',
      '**Excel**: kalkulacja w układzie arkusza wzorcowego (Wycena, Robocizna, Materiały, Kooperacja, Badania-odbiory-transport) z formułami - po zmianie w Excelu sumy przeliczają się same.',
      'Gotową wersję **składasz do zatwierdzenia**. Prezes zatwierdza ją albo zwraca z komentarzem. **Zatwierdzona wersja jest zamrożona** - zmiany robisz przez *Kopiuj wersję* (powstaje nowa wersja robocza).',
    ],
  },
  {
    tytul: 'Prośby o oferty i oferty dostawców',
    lista: [
      'W zakładce Kooperacja albo Badania / odbiory / transport kliknij przy pozycji **Poproś dział handlowy o ofertę** - formularz podpowiada parametry dla kategorii (np. dla transportu wymiary i masę ładunku, miejsce dostawy). Prośba trafia do **kolejki działu handlowego** (menu *Prośby o oferty*, z licznikiem otwartych).',
      'Dział handlowy pyta dostawców i dodaje ofertę - najprościej **przeciągając mail z ofertą**: aplikacja bez AI odczyta kwoty, walutę, termin, ważność i Incoterms, a dostawcę rozpozna po domenie adresu. AI jest drugą opcją, gdy odczyt bez AI się nie uda (koszt przed wywołaniem).',
      'Oferty do pozycji są porównane: **najtańsza** i **najszybsza** są oznaczone, przeterminowane - wyszarzone. **Użyj w wycenie** wstawia cenę ze wskazaniem oferty jako źródła i zamyka prośbę.',
      { t: '**Oferty dostawców** (baza): ofertę z pliku (PDF, skan, mail, Excel) dodasz też ręcznie. Ceny w walutach przeliczają się na PLN po kursie NBP z dnia oferty. **Porównywarka** zestawia oferty na tę samą pozycję.', gdy: 'bazaOfert' },
      '**Zapytania do dostawców** (karta zapytania): generator maili do dostawców przypisanych do kategorii, z wymaganiami dla kategorii. *Wyślij* otwiera Outlook z gotowym mailem (osobny dla każdego dostawcy); status *jest oferta* pojawia się sam, gdy oferta tego dostawcy do tego ZO jest w bazie, a odmowę zaznaczasz ikoną ⊘.',
    ],
  },
  {
    tytul: 'Zatwierdzanie (prezes)',
    gdy: 'zatwierdzanie',
    tekst: [
      'Zakładka **Do zatwierdzenia** pokazuje wersje złożone przez technologów. Możesz ustawić korektę prezesa (kwotą albo procentem), zatwierdzić albo zwrócić z komentarzem. Przy zatwierdzeniu zapisuje się migawka kosztów i ceny.',
    ],
  },
  {
    tytul: 'Historyczny cennik',
    lista: [
      '**Cennik roboczogodzin** (pierwsza zakładka modułu): stanowiska ze stawkami w przedziałach czasu (7:00-15:00, 15:00-19:00, 19:00-7:00, dni wolne) albo ze stawką stałą. Zmiana stawki tworzy wersję obowiązującą od dziś - historia wersji zostaje. Wiersze można wkleić z Excela. Stawki widzą prezes, administrator i osoby z flagą „widzi narzuty i marże”; pozostali widzą listę stanowisk, a stawki - w swoich wycenach.',
      '**Zakupy Optima** w trzech zakładkach: **Materiały**, **Kooperacja**, **Transport, badania i inne**. Rodzaj kosztu przypisuje się sam: typ zamówienia (ZM - materiał, ZJ - usługa) i **reguły słów kluczowych** (zakładka Reguły). Pozycje niepewne trafiają do **Do klasyfikacji** - zaznacz kilka i przypisz rodzaj hurtem, opcjonalnie z regułą dla tych nazw. Po zmianie reguł użyj *Przeklasyfikuj wszystko* (ręczne decyzje zostają).',
      'Ceny w wycenach pochodzą **tylko z zakupów „Materiały”**. Kooperacja i badania z Optimy są do przeglądu - ich ceny w wycenie biorą się z ofert pod zapytanie (w Ustawieniach można włączyć pokazywanie ich jako orientacyjnej podpowiedzi).',
      { t: '**Import** karty dostawy: plik XLS albo wydruk PDF (bez AI). Aplikacja sprawdza, czy suma pozycji zgadza się ze stopką karty, a ponowny import tej samej karty aktualizuje dane zamiast je dublować.', gdy: 'importy' },
      { t: 'Karty dostawy importuje dział handlowy.', gdy: '!importy' },
      '**Uzupełnij masę** - pozycje bez masy, potrzebnej do ceny za kg.',
      '**Usługi kooperacyjne** - ceny kooperantów według kategorii. **Projekty zrealizowane** - zakupy i godziny pracy (import z Registo, tylko sumy według MPK i miesiąca, bez nazwisk) oraz wskaźniki rbh/t używane w nowych wycenach.',
    ],
  },
  {
    tytul: 'Wersje edytowalne (odczyt plików, tłumaczenie, Word)',
    tekst: [
      'Osobny moduł, niezwiązany z zapytaniami i wycenami: dodaj plik (PDF, skan, zdjęcie JPG / PNG, DOCX, XLSX / CSV, TXT, DXF), odczytaj go i pobierz **wersję edytowalną w Wordzie** - z nagłówkami, akapitami, listami i tabelami. Aplikacja rozpoznaje język dokumentu i może przetłumaczyć go na polski.',
    ],
    lista: [
      '**Strony**: domyślnie cały dokument. Wybierz zakres (np. „1-3, 5”) albo Ctrl+klik na numerach stron - odczyt, tłumaczenie i Word dotyczą wybranych stron. Kolor numeru: niebieski - odczyt bez AI, fioletowy - odczyt AI, zielony - przetłumaczona.',
      '**Odczytaj bez AI** - bez kosztów: PDF z warstwą tekstową (z programu, nie skan), DOCX, arkusze, TXT i teksty z DXF. Strony-skany zostaną wskazane - przycisk *Odczytaj skany przez AI* odczyta tylko je. Rysunki DWG / STEP zapisz w programie CAD jako PDF.',
      '**Odczytaj przez AI** - skany i zdjęcia, albo gdy odczyt bez AI gubi układ. Koszt i pozostały budżet widać przed odczytem; można od razu zaznaczyć tłumaczenie na polski.',
      '**Układ jak w oryginale**: Word ma format strony, marginesy, czcionki, wcięcia, odstępy, tabele (z ramkami i szerokościami kolumn), obrazy, nagłówek i stopkę strony jak oryginał. *Układ w Wordzie*: *płynny tekst* - akapity jeden pod drugim (wygodne do edycji), *dokładne położenie* - tekst w polach w miejscach oryginału na tle z liniami (formularze, karty danych); *automatycznie* - strony z gęstą siatką dostają dokładne położenie.',
      '**Zaznaczanie fragmentów**: przeciągnij myszą po podglądzie (Tekst albo Tabela), żeby odczytać tylko fragment. Gdy tabela nie mieści się na ekranie, przeciągnij do krawędzi podglądu - sam się przewinie.',
      '**Przetłumacz na polski** - tłumaczy odczytaną treść wybranych stron z zachowaniem układu (taniej niż ponowny odczyt). Numery, normy, gatunki i jednostki zostają bez zmian.',
      'Tekst niewidoczny w oryginale (np. biały albo zamazany) nie trafia do wersji edytowalnej; fragmenty narysowane krzywymi (nie tekst) trafiają jako obraz w swoim miejscu.',
      '**Historia i budżet** - kto, który plik, co odczytał (bez AI / AI / tłumaczenie) i ile to kosztowało, z podsumowaniem miesiąca na osobę.',
    ],
  },
  {
    tytul: 'Role',
    lista: [
      '**Dział technologów** - zapytania, analiza, listy materiałowe, wyceny (bez zatwierdzania), prośby o oferty.',
      '**Dział handlowy** - zapytania, baza ofert, kolejka próśb o oferty, importy z Optimy i reguły klasyfikacji, zapytania do dostawców, ceny i kooperacja w wycenie.',
      '**Prezes** - wszystko oraz zatwierdzanie wycen, korekta prezesa i cennik roboczogodzin.',
      '**Administrator** - wszystko oraz użytkownicy, ustawienia i budżet AI.',
    ],
    po: [
      'Flaga **„widzi narzuty i marże”** na koncie decyduje, czy widać zysk, korektę prezesa i stawki cennika roboczogodzin. Prezes i administrator widzą je zawsze. Uprawnień pilnuje baza danych, nie tylko ekran.',
    ],
  },
  {
    tytul: 'Logowanie i hasło',
    tekst: [
      'Konto zakłada administrator i przekazuje hasło tymczasowe. Przy pierwszym logowaniu ustawiasz własne hasło (min. 6 znaków, w tym jeden znak specjalny). Hasło zmienisz ikoną klucza w prawym górnym rogu. Jeśli go nie pamiętasz, użyj „Nie pamiętam hasła” na ekranie logowania.',
    ],
  },
  {
    tytul: 'Ustawienia (administrator)',
    gdy: 'ustawienia',
    lista: [
      '**Narzuty i parametry** - narzut zakupowy, na kooperację, zysk, zaokrąglenie ceny, progi ostrzeżeń, warunki oferty, orientacyjna cena historyczna usług. Każdą wartość można zmienić w konkretnej wycenie.',
      '**Stawki robocizny** - słownik stawek dla wycen sprzed cennika roboczogodzin; bieżące stawki są w module Historyczny cennik.',
      '**Kategorie materiałów i naddatki**, **Gatunki i gęstości** (grupy równoważności używane przy szukaniu cen), **Kategorie usług**, **MPK**.',
      '**Kursy walut** - pobierane z NBP w dni robocze; można dodać kurs ręczny. **Dane firmy i oferty** - dane do oferty, logo, klauzule.',
      '**Zapytania do dostawców** - adres skrzynki w DW, po ilu dniach „brak odpowiedzi”, teksty szablonu i biblioteka wymagań.',
      '**AI i budżet** - zużycie w miesiącu, limity (miesięczny, dzienny na osobę, liczba obrazów), modele i ceny, ostatnie wywołania.',
      '**Zajętość planu** (plan Free: 500 MB bazy, 1 GB plików) i **Historia zmian** - kto, kiedy i co zmienił.',
    ],
  },
  {
    tytul: 'Poufność',
    tekst: [
      'Dokumenty klientów, ceny, stawki i oferty dostawców są przechowywane wyłącznie w bazie aplikacji (Supabase) i dostępne tylko dla zalogowanych pracowników. Pliki pobiera się przez krótkotrwałe, podpisane linki. Do AI trafiają tylko dokumenty oznaczone jako istotne, a z rysunków - tylko zaznaczone fragmenty.',
    ],
  },
]

const EN: RozdzialInstrukcji[] = [
  {
    tytul: 'What the application is for',
    tekst: [
      'One place for the whole quotation process, in two modules: **Inquiries and quotes** (from the customer inquiry to the offer) and **Historical price list** (labour rates, Optima purchases, subcontracted services, completed projects).',
      'An automatically prepared quote is always **preliminary** - the technologist and the sales department check it, and the CEO approves the price.',
    ],
  },
  {
    tytul: 'Navigation and shared features',
    lista: [
      'Icons in the top right corner: **Settings**, **Users**, **Trash**, **Instructions**, password change and the **PL / EN** language switch (saved in your account). Excel and Word exports have their own language choice.',
      '**Undo / Redo** - Ctrl+Z and Ctrl+Y or the arrows in the header; no step limit, also after a page refresh. The list of steps opens under the button.',
      '**Tables**: clicking a header sorts (Shift + click - several columns), the filter icon next to a header filters (text, number or date range, list of values). Table settings are remembered for you.',
      '**Deleting** moves an item to the Trash together with its dependent data (e.g. an inquiry with its documents, quotes and offer requests). From the Trash you restore everything at once; only the CEO or the administrator deletes permanently, and the Trash removes old items by itself after the number of days set in the settings.',
      'The breadcrumb above the screen (e.g. Inquiries → ZO/… → Quote) and the **Back to inquiry** button lead back. The open tab is part of the page address - a copied link opens the same place.',
    ],
  },
  {
    tytul: 'Inquiries and documents',
    lista: [
      'A **new inquiry** starts with the **equipment type** (required): vessel or heat exchanger - complete, tube bundle only or a part (with a description). The type determines the element template, the table types on drawings and the requirements. Later you can change it only on the inquiry card.',
      'The **ZO/nnn/yyyy** number is assigned automatically. You enter the **customer** and the **person in charge** on the inquiry card - freely or from the suggestion list; a new customer or person is saved to the list for the future.',
      '**Documents**: drag in many files or a whole folder. Without AI the application recognises the type: Request for quotation, Design / assembly drawing, Material list, Technical requirements (specification, standards, data sheet), Supplier offer, Other. Dragging a file onto another group changes its type.',
      'A scan saved in landscape or upside down can be rotated with the arrows next to the document (by 90°) - PDFs without quality loss.',
      'From the document contents the application fills in **empty** inquiry card fields (customer inquiry number, deadline, customer) - the source (file, page) is shown. Your entries are never overwritten.',
      'Files up to 20 MB are saved **without compression** (full quality, small print stays legible). Larger files are compressed and checked for legibility. The same file is not saved twice. Limit for one file: 50 MB.',
      'Only documents marked as **relevant** are sent to AI. When all documents are added - **Read all data from the documents**: subcontracting card, material list, preliminary quote and draft offer, without AI or with AI.',
    ],
  },
  {
    tytul: 'Subcontracting',
    lista: [
      'The **Subcontracting** tab (former analysis card): fill it in manually or with **Analyse inquiry (AI)** - you see the cost before sending. AI reads the texts of relevant documents and all pages of scans.',
      '**Cost-driving requirements** are a fixed checklist (impact testing, certificates, PED/CE, UDT, NDT, PWHT, corrosion protection, insulation, transport, site visit, installation during shutdown, penalties…). Give each one a status, price impact, description and source; the quote icon shows the document passage.',
      '**Subcontracted services** - services to be ordered from subcontractors. The plane icon next to a service creates an **offer request** in the sales department queue (menu *Offer requests*); *Ask subcontractors* opens the e-mail generator. Services are added automatically to the Subcontracting and Tests / inspections / transport tabs of the quote.',
      '**Questions to the customer and inconsistencies** between documents are highlighted. AI fills in only empty fields - **your entries stay**.',
    ],
  },
  {
    tytul: 'Material list',
    lista: [
      'The result of this tab is **one complete material list** of the inquiry - items ordered by number, nozzles and design data. The quote uses it.',
      'There is a material list document: **List without AI** (PDF with text, Excel / CSV - no cost) or **List with AI** (scan, photo) - AI reads all pages at once and builds one list.',
      'There is no list: create it from the **assembly drawing** - *List with AI* reads the whole sheet (parts list, U-tube table with lengths and weights, nozzle table, design data); *Select tables* - drag rectangles around the chosen tables, read them without AI or with AI and click *Add to list*.',
      'Each further reading **is added** to the list - items with the same number are merged (e.g. the parts list completed with the length and weight from the U-tube table). Tick *a new reading replaces the list* to start over.',
      'Correct the list in the grid (yellow rows marked "(?)" are uncertain), **Save changes** and **Transfer to quote** - the items go to the Materials tab of the selected equipment without duplicates.',
    ],
  },
  {
    tytul: 'Automatic quote',
    lista: [
      'Inquiry card → **Automatic quote** - one button with a choice of mode:',
      '*Without AI - material quote*: material list from drawing readings (CAD PDFs read from the text layer) following the equipment template, prices from offers for the inquiry and from "Materials" purchases. No cost.',
      '*With AI - full preparation*: inquiry analysis, material lists from drawings, a preliminary quote and a draft offer. Cost estimate and confirmation first.',
      'Each run creates a new quote version and a report to check: items without a price, old or substitute prices, uncertain readings, issues to clarify with the customer.',
    ],
    po: [
      '**Where material prices come from:** (1) offers collected for this inquiry, (2) Optima purchases of the "Materials" type - the same grade or its equivalent, flanges of the same DN size, (3) a *substitute price* of another grade of the same steel type, with a note in the remarks - to be confirmed by an offer. Bolts, gaskets and flanges without a size do not get a price automatically.',
    ],
  },
  {
    tytul: 'Quote',
    lista: [
      'A quote belongs to an inquiry and has **versions** (v1, v2…); a version contains equipment items. Tabs follow the reference sheet: **Quote**, **Materials**, **Labour**, **Subcontracting**, **Tests / inspections / transport**, **Summary**, **Offer**.',
      '**Quote** (first tab): opinion on the inquiry, department review, economic assessment and offer review.',
      '**Materials**: manually, from drawing readings or from Excel. Weight is calculated from dimensions and grade density, the technological allowance is added to section totals. **Find price** shows offers for this inquiry and "Materials" purchases in PLN with date and source; the chosen price is **copied** to the item - a later change in the database does not change the quote.',
      '**Labour**: an item = a position from the labour rates × time band (e.g. 7:00-15:00, days off) × number of man-hours. The rate comes from the **rate snapshot** saved when the quote was created - changing the rates does not change existing quotes. You can override a rate (deviation from the price list is highlighted); when the rates have changed, the quote shows it and offers *Refresh rates from the price list*. Example: 10 h × 50 PLN/h = 500 PLN. Instead of items you can use the indicative method: t × h/t × average rate.',
      '**Subcontracting** and **Tests / inspections / transport**: prices come from offers collected for this inquiry (see "Offer requests"). Each item shows its status: no offer, request sent, offer received, offer chosen.',
      'Tab totals show the value for each quoted quantity. Warnings on the summary: missing price, price older than the threshold in the settings, supplier offer about to expire, set item without weight, material delivery time.',
      { t: 'On the summary you see cost, profit, rounding, CEO adjustment, price per kg and price in EUR (NBP rate of the quote date).', gdy: 'widziMarze' },
      { t: 'On the summary you see costs and cost per kg. Profit and the CEO adjustment are hidden; you will see the final price after approval.', gdy: '!widziMarze' },
      '**Offer**: collapsible sections - change their order, hide a section in the printout, write formatted text with variables (e.g. inquiry number, price), save content versions and choose the offer language (PL / EN). The Word document is built from these sections; an offer from an unapproved version is marked "DRAFT OFFER".',
      '**Excel**: calculation in the reference sheet layout (Quote, Labour, Materials, Subcontracting, Tests-inspections-transport) with formulas - totals recalculate after a change in Excel.',
      'You **submit** a finished version **for approval**. The CEO approves it or returns it with a comment. **An approved version is frozen** - make changes with *Copy version* (a new draft version is created).',
    ],
  },
  {
    tytul: 'Offer requests and supplier offers',
    lista: [
      'In the Subcontracting or Tests / inspections / transport tab click **Ask the sales department for an offer** next to an item - the form suggests parameters for the category (e.g. for transport the load dimensions and weight, delivery place). The request goes to the **sales department queue** (menu *Offer requests*, with a counter of open requests).',
      'The sales department asks suppliers and adds the offer - the easiest way is to **drag in the e-mail with the offer**: without AI the application reads amounts, currency, lead time, validity and Incoterms, and recognises the supplier by the address domain. AI is the second option when reading without AI fails (cost shown before the call).',
      'Offers for an item are compared: the **cheapest** and the **fastest** are marked, expired ones are greyed out. **Use in quote** inserts the price with the offer as its source and closes the request.',
      { t: '**Supplier offers** (database): you can also add an offer from a file (PDF, scan, e-mail, Excel) manually. Prices in foreign currencies are converted to PLN at the NBP rate of the offer date. The **Comparison** view lists offers for the same item.', gdy: 'bazaOfert' },
      '**Supplier requests** (inquiry card): a generator of e-mails to suppliers assigned to a category, with requirements for the category. *Send* opens Outlook with a ready e-mail (a separate one for each supplier); the *offer received* status appears by itself when that supplier\'s offer for this ZO is in the database, and you mark a refusal with the ⊘ icon.',
    ],
  },
  {
    tytul: 'Approval (CEO)',
    gdy: 'zatwierdzanie',
    tekst: [
      'The **To approve** tab shows versions submitted by technologists. You can set the CEO adjustment (as an amount or a percentage), approve, or return with a comment. On approval a snapshot of costs and the price is saved.',
    ],
  },
  {
    tytul: 'Historical price list',
    lista: [
      '**Labour rates** (first tab of the module): positions with rates per time band (7:00-15:00, 15:00-19:00, 19:00-7:00, days off) or a flat rate. Changing a rate creates a version valid from today - the version history stays. Rows can be pasted from Excel. Rates are visible to the CEO, the administrator and users with the "sees markups and margins" flag; others see the list of positions, and the rates - in their quotes.',
      '**Optima purchases** in three tabs: **Materials**, **Subcontracting**, **Transport, tests and other**. The cost type is assigned automatically: the order type (ZM - material, ZJ - service) and **keyword rules** (Rules tab). Uncertain items go to **To classify** - select several and assign the type in bulk, optionally with a rule for these names. After changing the rules use *Reclassify all* (manual decisions stay).',
      'Prices in quotes come **only from "Materials" purchases**. Subcontracting and tests from Optima are for review - their prices in a quote come from offers for the inquiry (in the Settings you can show them as an indicative hint).',
      { t: '**Import** of a delivery card: an XLS file or a PDF printout (no AI). The application checks that the item total matches the card footer, and importing the same card again updates the data instead of duplicating it.', gdy: 'importy' },
      { t: 'Delivery cards are imported by the sales department.', gdy: '!importy' },
      '**Fill in weight** - items without a weight, needed for the price per kg.',
      '**Subcontracted services** - subcontractor prices by category. **Completed projects** - purchases and working hours (import from Registo, only totals per cost centre and month, no names) and the h/t ratios used in new quotes.',
    ],
  },
  {
    tytul: 'Editable versions (file reading, translation, Word)',
    tekst: [
      'A separate module, not related to inquiries and quotes: add a file (PDF, scan, JPG / PNG photo, DOCX, XLSX / CSV, TXT, DXF), read it and download an **editable Word version** - with headings, paragraphs, lists and tables. The application recognises the document language and can translate it into Polish.',
    ],
    lista: [
      '**Pages**: the whole document by default. Enter a range (e.g. "1-3, 5") or Ctrl+click the page numbers - reading, translation and Word apply to the selected pages. Number colour: blue - read without AI, purple - read with AI, green - translated.',
      '**Read without AI** - no cost: PDFs with a text layer (from software, not scans), DOCX, spreadsheets, TXT and DXF texts. Scanned pages are pointed out - *Read the scans with AI* reads only them. Save DWG / STEP drawings as PDF in your CAD software.',
      '**Read with AI** - scans and photos, or when reading without AI loses the layout. The cost and the remaining budget are shown before reading; you can tick translation into Polish right away.',
      '**Layout as in the original**: the Word file has the page size, margins, fonts, indents, spacing, tables (with borders and column widths), images, page header and footer of the original. *Layout in Word*: *flowing text* - paragraphs one below another (convenient for editing), *exact position* - text in fields at the original positions on a background with the lines (forms, data sheets); *automatic* - pages with a dense grid get the exact position.',
      '**Selecting areas**: drag the mouse over the preview (Text or Table) to read only that area. When a table does not fit on the screen, drag to the edge of the preview - it scrolls by itself.',
      '**Translate into Polish** - translates the text of the selected pages, keeping the layout (cheaper than reading again). Numbers, standards, grades and units stay unchanged.',
      'Text that is invisible in the original (e.g. white or covered) is not included; parts drawn as curves (not text) are included as an image in their place.',
      '**History and budget** - who read which file, how (without AI / AI / translation) and what it cost, with a monthly summary per person.',
    ],
  },
  {
    tytul: 'Roles',
    lista: [
      '**Technology department** - inquiries, analysis, material lists, quotes (without approval), offer requests.',
      '**Sales department** - inquiries, offer database, offer request queue, Optima imports and classification rules, supplier requests, prices and subcontracting in quotes.',
      '**CEO** - everything plus quote approval, CEO adjustment and labour rates.',
      '**Administrator** - everything plus users, settings and the AI budget.',
    ],
    po: [
      'The **"sees markups and margins"** flag on an account decides whether profit, the CEO adjustment and the labour rates are visible. The CEO and the administrator always see them. Permissions are enforced by the database, not just the screen.',
    ],
  },
  {
    tytul: 'Login and password',
    tekst: [
      'Accounts are created by the administrator, who hands over a temporary password. At the first login you set your own password (min. 6 characters, including one special character). Change it with the key icon in the top right corner. If you forget it, use "Forgot password" on the login screen.',
    ],
  },
  {
    tytul: 'Settings (administrator)',
    gdy: 'ustawienia',
    lista: [
      '**Markups and parameters** - purchase markup, subcontracting markup, profit, price rounding, warning thresholds, offer terms, indicative historical service price. Any value can be changed in a specific quote.',
      '**Labour rates** - the rate dictionary for quotes created before the labour price list; current rates are in the Historical price list module.',
      '**Material categories and allowances**, **Grades and densities** (equivalence groups used when looking for prices), **Service categories**, **Cost centres**.',
      '**Exchange rates** - downloaded from NBP on working days; a manual rate can be added. **Company and offer data** - offer details, logo, clauses.',
      '**Supplier requests** - CC mailbox address, after how many days "no response", template texts and the requirements library.',
      '**AI and budget** - usage this month, limits (monthly, daily per person, number of images), models and prices, recent calls.',
      '**Plan usage** (Free plan: 500 MB database, 1 GB files) and **Change history** - who changed what and when.',
    ],
  },
  {
    tytul: 'Confidentiality',
    tekst: [
      'Customer documents, prices, rates and supplier offers are stored only in the application database (Supabase) and are available only to logged-in employees. Files are downloaded through short-lived signed links. Only documents marked as relevant are sent to AI, and from drawings - only the selected areas.',
    ],
  },
]

export const TRESC_INSTRUKCJI: Record<Jezyk, RozdzialInstrukcji[]> = { pl: PL, en: EN }

/** Wstęp zależny od roli i flagi marż. */
export function wstepInstrukcji(j: Jezyk, rola: string, widziMarze: boolean): string {
  if (j === 'en') return `You are logged in as **${rola}**${widziMarze ? ' and you see markups and margins.' : '. You see costs, but not profit or the CEO adjustment.'}`
  return `Jesteś zalogowany jako **${rola}**${widziMarze ? ' i widzisz narzuty oraz marże.' : '. Widzisz koszty, ale nie widzisz zysku ani korekty prezesa.'}`
}
