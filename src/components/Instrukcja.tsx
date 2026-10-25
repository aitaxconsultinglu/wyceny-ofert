import type { ReactNode } from 'react'
import { ETYKIETY_ROLI, uprawnienia, type Profil } from '@/lib/types'

function Rozdzial({ tytul, children }: { tytul: string; children: ReactNode }) {
  return (
    <section className="sekcja space-y-2 text-sm leading-relaxed text-slate-700">
      <h3 className="text-base font-semibold text-slate-900">{tytul}</h3>
      {children}
    </section>
  )
}

/** Krótka instrukcja dla użytkowników - rozbudowywana z każdym etapem. */
export function Instrukcja({ profil }: { profil: Profil }) {
  const up = uprawnienia(profil)
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h2 className="text-lg font-semibold">Instrukcja</h2>
      <p className="text-sm text-slate-600">
        Jesteś zalogowany jako <strong>{ETYKIETY_ROLI[profil.rola]}</strong>
        {up.widziMarze ? ' i widzisz narzuty oraz marże.' : '. Widzisz koszty, ale nie widzisz zysku ani korekty prezesa.'}
      </p>

      <Rozdzial tytul="Do czego służy aplikacja">
        <p>
          Jedno miejsce na cały proces ofertowy: zapytania od klientów z dokumentami, analiza wymagań kosztotwórczych,
          listy materiałowe z rysunków, wspólna baza ofert od dostawców i kooperantów, zakupy historyczne z Optimy,
          wycena jedną metodą (jak dotychczasowy arkusz wyceny), zatwierdzenie ceny przez prezesa oraz kalkulacja w Excelu i oferta w Wordzie.
        </p>
        <p className="text-slate-500">
          To wersja demonstracyjna: wycena przygotowana automatycznie jest zawsze <strong>wstępna</strong> - sprawdza ją technolog i dział handlowy,
          a zatwierdza prezes.
        </p>
      </Rozdzial>

      {(
        <Rozdzial tytul="Wycena materiałowa z rysunków krok po kroku">
          <p>
            Aplikacja ma dwa moduły: <strong>Zapytania ofertowe i wyceny</strong> (od zapytania do oferty) i <strong>Historyczny cennik</strong>
            (zakupy z Optimy, usługi, projekty zrealizowane). Nowe zapytanie zaczyna się od wyboru rodzaju aparatu - zbiornik albo wymiennik ciepła;
            od niego zależy szablon elementów i wymagania.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li><strong>Zapytanie</strong> - „Nowe zapytanie”: rodzaj aparatu, przedmiot, klient; dokumenty dodaje technolog w zakładce Dokumenty.</li>
            <li><strong>Rysunki</strong> - w zakładce Dokumenty rysunki PDF mają typ „rysunek”. Rysunki z CAD są czytane z warstwy tekstowej
              bez kosztu AI. Skan (sam obraz) odczytaj w zakładce „Rysunki i listy” - tam AI, z kosztem pokazanym przed wywołaniem.</li>
            <li><strong>Oferty na materiały specyficzne</strong> (dennice, rurki, odkuwki, kołnierze) - dodaj w „Oferty na materiały”
              z przypisaniem do tego zapytania. Mają pierwszeństwo przed cenami z Optimy.</li>
            <li><strong>„Wycena materiałowa”</strong> na karcie zapytania - szablon wynika z rodzaju aparatu zapytania. Aplikacja odczyta tabelę materiałów,
              tabelę króćców i dane projektowe, ułoży listę wg szablonu i dobierze ceny.</li>
            <li><strong>Uzupełnij</strong> w zakładce Materiały: wymiary albo masy (pozycje z ilością 0), długości rur króćców,
              brakujące ceny (Znajdź cenę). Panel szablonu nad listą pokazuje, których elementów brakuje, a „Parametry projektu” -
              dane z rysunku i masę pustą do porównania z sumą mas pozycji.</li>
            <li><strong>Excel</strong> - eksport kalkulacji materiałów.</li>
          </ol>
          <p>
            <strong>Skąd ceny:</strong> (1) oferty zebrane do tego zapytania, (2) karty dostawy Optimy (ceny z przeszłych zleceń) - ten sam gatunek
            lub jego równoważnik ze słownika, kołnierze tej samej wielkości DN. Gdy gatunku z rysunku nie ma w zakupach, materiał wyceniany na kg
            dostaje <em>cenę zastępczą</em> innego gatunku tego samego rodzaju stali (np. blacha SA516 wg zakupów S235JR) z dopiskiem w uwagach -
            taką cenę trzeba potwierdzić ofertą. Śruby, uszczelki i kołnierze bez wielkości nie dostają ceny automatycznie.
          </p>
        </Rozdzial>
      )}

      <Rozdzial tytul="Wersje edytowalne (odczyt plików, tłumaczenie, Word)">
        <p>
          Osobny moduł, niezwiązany z zapytaniami i wycenami: dodaj plik (PDF, skan, zdjęcie JPG / PNG, DOCX, XLSX / CSV, TXT, DXF),
          odczytaj go i pobierz <strong>wersję edytowalną w Wordzie</strong> - z nagłówkami, akapitami, listami i tabelami. Aplikacja rozpoznaje język
          dokumentu i może przetłumaczyć go na polski.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Odczytaj bez AI</strong> - bez kosztów: PDF z warstwą tekstową (z programu, nie skan), DOCX, arkusze, TXT i teksty z DXF.
            Rysunki DWG / STEP zapisz w programie CAD jako PDF.</li>
          <li><strong>Odczytaj przez AI</strong> - skany i zdjęcia, albo gdy odczyt bez AI gubi układ. Koszt i pozostały budżet widać przed odczytem;
            można od razu zaznaczyć tłumaczenie na polski.</li>
          <li><strong>Zaznaczanie fragmentów</strong>: przeciągnij myszą po podglądzie (Tekst albo Tabela). Gdy tabela nie mieści się na ekranie,
            przeciągnij do krawędzi podglądu - sam się przewinie (działa też kółko myszy w trakcie zaznaczania). Tak samo w Rysunkach.</li>
          <li><strong>Przetłumacz na polski</strong> - tłumaczy odczytaną treść (taniej niż ponowny odczyt). Numery, normy, gatunki i jednostki
            zostają bez zmian.</li>
          <li><strong>Historia i budżet</strong> - kto, który plik, co odczytał (bez AI / AI / tłumaczenie) i ile to kosztowało, z podsumowaniem miesiąca na osobę.</li>
        </ul>
      </Rozdzial>

      <Rozdzial tytul="Role">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Dział technologów</strong> - zapytania, analiza, listy materiałowe, wyceny (bez zatwierdzania).</li>
          <li><strong>Dział handlowy</strong> - zapytania, baza ofert, importy z Optimy, zapytania do dostawców, ceny i kooperacja w wycenie.</li>
          <li><strong>Prezes</strong> - wszystko oraz zatwierdzanie wycen i korekta prezesa.</li>
          <li><strong>Administrator</strong> - wszystko oraz użytkownicy, ustawienia i budżet AI.</li>
        </ul>
        <p>
          Flaga <strong>„widzi narzuty i marże”</strong> na koncie decyduje, czy widać zysk i korektę prezesa. Prezes
          i administrator widzą je zawsze. Uprawnień pilnuje baza danych, nie tylko ekran.
        </p>
      </Rozdzial>

      <Rozdzial tytul="Logowanie i hasło">
        <p>
          Konto zakłada administrator i przekazuje hasło tymczasowe. Przy pierwszym logowaniu ustawiasz własne hasło
          (min. 6 znaków, w tym jeden znak specjalny). Hasło zmienisz ikoną klucza w prawym górnym rogu.
          Jeśli go nie pamiętasz, użyj „Nie pamiętam hasła” na ekranie logowania.
        </p>
      </Rozdzial>

      <Rozdzial tytul="Skąd się co bierze">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Ceny materiałów i usług</strong> mają dwa źródła: (1) <em>historia</em> - zakupy z kart dostawy Optimy i wcześniejsze
            oferty dostawców; (2) <em>oferty bieżące</em> - zebrane przez dział handlowy do tego zapytania. Wycena automatyczna bierze najpierw
            ofertę do tego zapytania, potem ważną ofertę z bazy, potem ostatni zakup, na końcu ofertę przeterminowaną. Przy każdej pozycji widać
            źródło (oferta / zakup / ręcznie), dostawcę i datę.</li>
          <li><strong>Robocizna</strong> - wskaźnik rbh/t: mediana z projektów zrealizowanych (Registo) i zatwierdzonych wycen tego samego typu aparatu;
            stawka zł/rbh z Ustawień. Gdy danych brak, pole jest puste i trafia na listę do sprawdzenia.</li>
          <li><strong>Masy</strong> - z wymiarów i gęstości gatunku (Ustawienia → Gatunki), z list materiałowych rysunków albo z karty analizy.</li>
          <li><strong>Wymagania, usługi, terminy, pytania do klienta</strong> - z dokumentów zapytania (karta analizy: AI albo ręcznie).</li>
          <li><strong>Narzuty, zysk, zaokrąglenie, warunki oferty, dane firmy i logo</strong> - z Ustawień; w konkretnej wycenie można je zmienić.</li>
          <li><strong>Kursy walut</strong> - NBP (oferta w EUR liczy się po kursie z dnia oferty).</li>
        </ul>
      </Rozdzial>

      <Rozdzial tytul="Jak przygotować pliki i maile (miejsce w bazie)">
        <ul className="list-disc space-y-1 pl-5">
          <li>Z maila aplikacja zapisuje <strong>treść jako tekst</strong> i <strong>zaznaczone załączniki</strong> - nigdy całego pliku .msg/.eml.</li>
          <li>Logo, ikony i obrazki ze stopki, wizytówki (.vcf), podpisy cyfrowe (.p7s), zaproszenia (.ics), winmail.dat są pomijane automatycznie -
            lista pominiętych jest widoczna w oknie importu. Każdy inny załącznik, który nie jest dokumentem zapytania (reklama, katalog, regulamin),
            odznacz w kolumnie <em>wgraj</em>.</li>
          <li>Pliki nieistotne dla wyceny (długie obliczenia, standardy klienta) większe niż 2 MB zapisują się <strong>jako sam tekst</strong> - dalej
            można je przeszukać, a nie zajmują miejsca. Limit jednego pliku to 50 MB (plan Free: 1 GB na wszystkie pliki).</li>
          <li>Rysunki: najlepiej <strong>PDF z CAD</strong> (aplikacja czyta tekst bez AI i bez kosztów). Skan - w pełnej rozdzielczości, jeden arkusz
            na stronę, bez obrotu; arkusz A1 zapisany jako A4 bywa nieczytelny także dla AI.</li>
          <li>Archiwa ZIP są rozpakowywane - wgraj tylko te pliki z archiwum, które są potrzebne. Duplikat maila (ten sam Message-ID) nie wgra się drugi raz.</li>
          <li>Do AI idą tylko dokumenty oznaczone jako <strong>istotne</strong> - oznaczaj jako istotne specyfikację, rysunki, formularz ofertowy, kartę danych;
            ogólne standardy i regulaminy zostaw nieistotne (taniej i dokładniej).</li>
        </ul>
      </Rozdzial>

      <Rozdzial tytul="Zapytania">
        <ul className="list-disc space-y-1 pl-5">
          <li>Zapytanie dostaje numer <strong>ZO/nnn/rrrr</strong> automatycznie (pole można zmienić, np. na numer z Optimy).</li>
          <li>Na karcie zapytania dodajesz dokumenty klienta: rysunki, specyfikacje, maile (.msg/.eml), arkusze. Pliki trafiają
            do prywatnego magazynu, a podgląd otwiera się przez krótkotrwały link.</li>
        </ul>
      </Rozdzial>

      <Rozdzial tytul="Nowe zapytanie z maila i przygotowanie automatyczne">
        <ul className="list-disc space-y-1 pl-5">
          <li>Zapytania → <strong>Nowe z maila</strong>: przeciągnij wiadomość klienta z Outlooka. Aplikacja podpowie przedmiot, klienta,
            termin i numer zapytania oraz pokaże załączniki - sprawdź typy i zaznacz, które są istotne (długie obliczenia domyślnie pominięte).</li>
          <li>Z zaznaczonym <em>Od razu przygotuj automatycznie</em> po utworzeniu zapytania otworzy się okno przygotowania. W karcie zapytania
            jest też przycisk <strong>Przygotuj automatycznie</strong>.</li>
          <li>Przygotowanie robi kolejno: analizę zapytania (AI), listy materiałów z rysunków (AI), wstępną wycenę z cenami z bazy ofert i zakupów
            oraz projekt oferty. Przed wywołaniem AI zobaczysz koszt. Każde uruchomienie tworzy nową wersję wyceny.</li>
          <li>Wynik jest <strong>wstępny</strong> - raport w karcie analizy pokazuje, co sprawdzić: pozycje bez ceny, ceny stare i przybliżone,
            niepewne odczyty z rysunków, robociznę z podobnych zleceń, sprawy do wyjaśnienia z klientem. Wycenę i tak zatwierdza prezes.</li>
        </ul>
      </Rozdzial>

      <Rozdzial tytul="Karta analizy zapytania">
        <ul className="list-disc space-y-1 pl-5">
          <li>Następca „Opinii o zapytaniu” z arkusza wyceny. Wypełniasz ją ręcznie albo przyciskiem <strong>Analizuj zapytanie (AI)</strong> -
            do AI idą tylko dokumenty oznaczone jako istotne; przed wysłaniem zobaczysz koszt.</li>
          <li><strong>Wymagania kosztotwórcze</strong> to stała checklista (udarność, atesty, PED/CE, UDT, NDT, PWHT, antykorozja, izolacja,
            transport, wizja lokalna, montaż w postoju, kary...). Każdej nadaj stan: wymagane / nie dotyczy / do wyjaśnienia, wpływ na cenę,
            opis i źródło (plik, strona). Ikona cytatu rozwija dosłowny fragment dokumentu.</li>
          <li>AI uzupełnia tylko puste pola i dopisuje nowe pozycje list - <strong>Twoje wpisy zostają</strong>. Kolejna analiza niczego nie nadpisze.</li>
          <li><strong>Usługi do zapytań</strong> - przycisk <em>Zapytaj kooperantów</em> otwiera generator zapytań z tymi usługami.</li>
          <li>Z podsumowania: <em>Uzupełnij kartę zapytania</em> (termin złożenia oferty, nr zapytania klienta) i <em>Szkic wyceny z aparatami</em>.</li>
          <li>Pytania do klienta bez odpowiedzi i niespójności między dokumentami są wyróżnione. Karta trafia też do zakładki „Analiza” kalkulacji w Excelu.</li>
        </ul>
      </Rozdzial>

      <Rozdzial tytul="Listy z rysunków">
        <ul className="list-disc space-y-1 pl-5">
          <li>Karta zapytania → <strong>Rysunki i listy</strong> → przy pliku PDF kliknij <em>Odczytaj listę</em> i wybierz stronę.</li>
          <li>Wybierz rodzaj (wykaz części, tabela króćców, dane projektowe, tabliczka) i <strong>przeciągnij myszą prostokąt</strong> wokół
            tabeli. Można zaznaczyć kilka obszarów; kliknięty obszar usuniesz krzyżykiem przy etykiecie.</li>
          <li>Rysunek z CAD (z warstwą tekstową): <em>Odczytaj z tekstu PDF</em> - bez AI i bez kosztów. Sprawdź kolumny, bo układy tabel bywają nietypowe.</li>
          <li>Skan: <em>Odczytaj przez AI</em>. Do AI idą tylko zaznaczone fragmenty w wysokiej rozdzielczości, pocięte na kafle.
            Przed wysłaniem zobaczysz szacowany koszt i musisz go potwierdzić. Wynik zapisuje się od razu.</li>
          <li>W siatce popraw odczyt: <span className="rounded bg-amber-100 px-1">żółte</span> wiersze z dopiskiem „(?)” są niepewne -
            sprawdź je z rysunkiem (miniatura przy wierszu pokazuje to miejsce) i zatwierdź znakiem ✓. Tabelę można też wkleić z Excela.</li>
          <li><strong>Pobierz Excel</strong> daje zakładki Parametry, Króćce, Wykaz części, Uwagi do wyceny. <strong>Przenieś do wyceny</strong>
            dopisuje wykaz części do zakładki Materiały wybranego aparatu (ceny uzupełnij przyciskiem „Znajdź cenę”).</li>
          <li>Zaznacz <em>sprawdzony z rysunkiem</em> i zapisz - na liście odczytów widać, które są przejrzane.</li>
        </ul>
      </Rozdzial>

      <Rozdzial tytul="Zapytania do dostawców">
        <ul className="list-disc space-y-1 pl-5">
          <li>Karta zapytania → <strong>Zapytania do dostawców</strong> → <em>Nowe zapytanie do dostawców</em> (dział handlowy). Wybierz źródło:
            wersję wyceny, odczyt rysunku albo usługi z karty analizy. Pozycje są pogrupowane według kategorii (odkuwki, rury, blachy, usługi...).</li>
          <li>Zaznacz pozycje i kliknij <em>Przygotuj zapytanie</em> przy kategorii. Temat ma numer ZO, wymagania są podpowiedziane dla
            kategorii (atest 3.1 + PED, udarność, UT, NFT, naddatki), odbiorcy to dostawcy z bazy przypisani do kategorii - można dopisać adres.
            Treść możesz poprawić przed zapisem.</li>
          <li>Po zapisie kliknij <strong>Wyślij</strong> przy każdym odbiorcy - otworzy się Outlook z gotowym mailem (każdy dostawca dostaje
            osobny mail, kopia idzie na skrzynkę ofert). Jeśli maila jednak nie wysłano, cofnij oznaczenie strzałką.</li>
          <li>Status: <em>jest oferta</em> pojawia się sam, gdy oferta tego dostawcy do tego ZO jest w bazie ofert; <em>brak odpowiedzi</em> -
            po kilku dniach od wysłania; odmowę dostawcy zaznaczasz ikoną ⊘. Wszystkie zapytania: Oferty dostawców → Wysłane zapytania.</li>
        </ul>
      </Rozdzial>

      <Rozdzial tytul="Wycena">
        <ul className="list-disc space-y-1 pl-5">
          <li>Wycena należy do zapytania i ma <strong>wersje</strong> (v1, v2…). Każda wersja zawiera aparaty, a w każdym aparacie
            zakładki jak w dotychczasowym arkuszu wyceny: Materiały, Pracochłonność, Kooperacja, Badania / odbiory / transport, Podsumowanie.</li>
          <li><strong>Materiały</strong> wpisujesz ręcznie albo przez <em>Import listy materiałowej (Excel)</em>. Masa liczy się z wymiarów
            i gęstości gatunku; naddatek technologiczny dolicza się do sumy sekcji (blachy, odkuwki, kołnierze, pręty).</li>
          <li><strong>Znajdź cenę</strong> szuka w bazie ofert i zakupów (z gatunkami równoważnymi) i pokazuje ceny w PLN z datą i źródłem.
            Wybrana cena jest <strong>kopiowana</strong> do pozycji razem ze źródłem i datą - późniejsza zmiana oferty w bazie nie zmienia wyceny.</li>
          <li><strong>Pracochłonność</strong>: wskaźnikowo (t × rbh/t × stawka) albo szczegółowo (rbh według rodzaju pracy). Panel
            „Podobne zlecenia” pokazuje rbh/t ze zrealizowanych projektów (Registo) i z wcześniejszych wycen.</li>
          <li>Ostrzeżenia na podsumowaniu: brak ceny, cena starsza niż próg z ustawień, oferta dostawcy bliska wygaśnięcia,
            pozycja kpl bez masy, termin dostawy materiału.</li>
          {up.widziMarze
            ? <li>Na podsumowaniu widzisz koszt, zysk, zaokrąglenie, korektę prezesa, cenę za kg i cenę w EUR (kurs NBP z dnia wyceny).</li>
            : <li>Na podsumowaniu widzisz koszty i cenę za kg kosztów. Zysk i korekta prezesa są ukryte; cenę końcową zobaczysz po zatwierdzeniu.</li>}
          <li>Gotową wersję <strong>składasz do zatwierdzenia</strong>. Prezes zatwierdza ją albo zwraca z komentarzem.
            <strong> Zatwierdzona wersja jest zamrożona</strong> - zmiany robisz przez <em>Kopiuj wersję</em> (powstaje nowa wersja robocza).</li>
          <li>Pobierasz <strong>kalkulację w Excelu</strong> (zakładki jak w dotychczasowym arkuszu, osobne dla każdego aparatu), <strong>notatkę dla prezesa</strong>
            (układ dawnego „Wycena.docx”) i <strong>ofertę dla klienta</strong> w Wordzie z klauzulami z biblioteki. Oferta z wersji
            niezatwierdzonej ma oznaczenie „PROJEKT OFERTY”.</li>
        </ul>
      </Rozdzial>

      {up.zatwierdzanie && (
        <Rozdzial tytul="Zatwierdzanie (prezes)">
          <p>
            Zakładka <strong>Do zatwierdzenia</strong> pokazuje wersje złożone przez technologów. Możesz ustawić korektę prezesa (kwotą
            albo procentem), zatwierdzić albo zwrócić z komentarzem. Przy zatwierdzeniu zapisuje się migawka kosztów i ceny.
          </p>
        </Rozdzial>
      )}

      <Rozdzial tytul="Baza cen i projekty">
        <ul className="list-disc space-y-1 pl-5">
          {up.bazaOfert && <li><strong>Oferty dostawców</strong> - dodajesz ofertę z pliku (PDF, skan, mail, Excel) albo ręcznie. AI odczytuje
            dostawcę, warunki i pozycje do formularza - sprawdzasz i zatwierdzasz. Gdy nazwa firmy jest tylko w logo albo mail przyszedł z prywatnej
            skrzynki, pole dostawcy może być puste albo zawierać nadawcę „do potwierdzenia” - wybierz dostawcę z listy. Ceny w walutach są przeliczane
            na PLN po kursie NBP z dnia oferty (dla starszej oferty kurs z tamtego dnia pobiera się sam).</li>}
          <li><strong>Porównywarka</strong> zestawia oferty na tę samą pozycję (np. odkuwkę) w PLN, z datą, ważnością i terminem dostawy.</li>
          <li><strong>Zakupy (Optima)</strong> - pozycje z kart dostawy. {up.importy ? 'Import karty dostawy sprawdza, czy suma pozycji zgadza się ze stopką karty.' : 'Importuje je dział handlowy.'}</li>
          <li><strong>Usługi kooperacyjne</strong> - ceny kooperantów (cięcie, gięcie, obróbka, NDT, antykorozja…) według kategorii.</li>
          <li><strong>Projekty zrealizowane</strong> - zakupy i godziny pracy (import z Registo, tylko sumy według MPK i miesiąca, bez nazwisk)
            oraz wskaźniki rbh/t używane w nowych wycenach.</li>
        </ul>
      </Rozdzial>

      {up.ustawienia && (
        <Rozdzial tytul="Ustawienia (administrator)">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Narzuty i parametry</strong> - domyślny narzut zakupowy (5% / 10%), na kooperację, zysk (10% / 15%), zaokrąglenie ceny, progi ostrzeżeń, warunki oferty. Każdą wartość można zmienić w konkretnej wycenie.</li>
            <li><strong>Stawki robocizny</strong> - zł/rbh według rodzaju pracy i MPK. Wartości startowe są oznaczone „do weryfikacji”.</li>
            <li><strong>Kategorie materiałów</strong> - naddatki technologiczne i wzór liczenia masy z wymiarów.</li>
            <li><strong>Gatunki i gęstości</strong> - grupy równoważności (np. 1.4307 ≈ 304L) używane przy wyszukiwaniu cen.</li>
            <li><strong>Kursy walut</strong> - pobierane z NBP w dni robocze; można dodać kurs ręczny.</li>
            <li><strong>Zapytania do dostawców</strong> - adres skrzynki w DW, po ilu dniach „brak odpowiedzi”, teksty szablonu i biblioteka
              wymagań (które są domyślnie zaznaczone dla danej kategorii).</li>
            <li><strong>AI i budżet</strong> - zużycie AI w miesiącu, limity (miesięczny, dzienny na osobę, liczba obrazów), modele i ceny,
              ostatnie wywołania; widać też, czy klucz Claude API jest ustawiony.</li>
            <li><strong>Zajętość planu</strong> - ile miejsca zajmują baza i pliki (plan Free: 500 MB bazy, 1 GB plików).</li>
            <li><strong>Historia zmian</strong> - kto, kiedy i co zmienił.</li>
          </ul>
        </Rozdzial>
      )}

      <Rozdzial tytul="Poufność">
        <p>
          Dokumenty klientów, ceny i oferty dostawców są przechowywane wyłącznie w bazie aplikacji (Supabase) i dostępne tylko
          dla zalogowanych pracowników. Pliki pobiera się przez krótkotrwałe, podpisane linki. Do AI trafiają tylko dokumenty
          oznaczone jako istotne, a z rysunków - tylko zaznaczone fragmenty.
        </p>
      </Rozdzial>
    </div>
  )
}
