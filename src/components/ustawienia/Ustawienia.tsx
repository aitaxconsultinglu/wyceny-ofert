import { useState } from 'react'
import { useSlowniki } from '@/lib/slowniki'
import { cn } from '@/lib/utils'
import { TabelaSlownika } from './TabelaSlownika'
import { Parametry } from './Parametry'
import { Kursy } from './Kursy'
import { DaneFirmyPanel } from './DaneFirmy'
import { Zasoby } from './Zasoby'
import { HistoriaZmian } from './HistoriaZmian'
import { BudzetAi } from './BudzetAi'
import { UstawieniaZapytan } from './UstawieniaZapytan'

type Zakladka = 'parametry' | 'stawki' | 'materialy' | 'gatunki' | 'uslugi' | 'mpk' | 'kursy' | 'firma' | 'zapytania' | 'ai' | 'zasoby' | 'historia'

const ZAKLADKI: { id: Zakladka; etykieta: string }[] = [
  { id: 'parametry', etykieta: 'Narzuty i parametry' },
  { id: 'stawki', etykieta: 'Stawki robocizny' },
  { id: 'materialy', etykieta: 'Kategorie materiałów i naddatki' },
  { id: 'gatunki', etykieta: 'Gatunki i gęstości' },
  { id: 'uslugi', etykieta: 'Kategorie usług' },
  { id: 'mpk', etykieta: 'MPK' },
  { id: 'kursy', etykieta: 'Kursy walut' },
  { id: 'firma', etykieta: 'Dane firmy i oferty' },
  { id: 'zapytania', etykieta: 'Zapytania do dostawców' },
  { id: 'ai', etykieta: 'AI i budżet' },
  { id: 'zasoby', etykieta: 'Zajętość planu' },
  { id: 'historia', etykieta: 'Historia zmian' },
]

const SPOSOBY_MASY = [
  { wartosc: 'blacha', etykieta: 'blacha: g × b × l × ρ' },
  { wartosc: 'krazek', etykieta: 'krążek/pierścień: π/4 (D² − d²) h ρ' },
  { wartosc: 'rura', etykieta: 'rura: π (D − s) s l ρ' },
  { wartosc: 'pret', etykieta: 'pręt: π/4 d² l ρ' },
  { wartosc: 'brak', etykieta: 'masa wpisywana ręcznie' },
]

const ZAKLADKI_USLUG = [
  { wartosc: 'kooperacja', etykieta: 'Kooperacja' },
  { wartosc: 'projekt', etykieta: 'Projekt' },
  { wartosc: 'badania', etykieta: 'Badania i odbiory' },
  { wartosc: 'transport', etykieta: 'Transport i sprzęt' },
  { wartosc: 'inne', etykieta: 'Inne' },
]

export function Ustawienia() {
  const s = useSlowniki()
  const [zakladka, setZakladka] = useState<Zakladka>('parametry')
  const zakladki = ZAKLADKI

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Ustawienia i słowniki</h2>
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {zakladki.map((z) => (
          <button key={z.id} onClick={() => setZakladka(z.id)}
            className={cn('-mb-px rounded-t-md border px-3 py-1.5 text-sm',
              zakladka === z.id ? 'border-slate-200 border-b-white bg-white font-medium' : 'border-transparent text-slate-600 hover:bg-slate-100')}>
            {z.etykieta}
          </button>
        ))}
      </div>

      {zakladka === 'parametry' && <Parametry />}

      {zakladka === 'stawki' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Stawki podpowiadane w zakładce Pracochłonność. W wycenie każdą można nadpisać ręcznie dla danego projektu.
            Stawka oznaczona jako <strong>domyślna</strong> trafia do metody wskaźnikowej (masa × rbh/t × stawka).
          </p>
          <TabelaSlownika
            tabela="stawki_robocizny" klucz="id" kluczGenerowany
            wiersze={s.stawki as unknown as Record<string, unknown>[]}
            nowyWiersz={() => ({ rodzaj_pracy: '', mpk_kod: null, stawka: 0, wazna_od: new Date().toISOString().slice(0, 10), aktywna: true, do_weryfikacji: false, domyslna: false, uwagi: '', kolejnosc: s.stawki.length + 1 })}
            poZapisie={s.odswiez}
            mozeUsunac={(w) => (w.domyslna ? 'Nie można usunąć stawki domyślnej - najpierw oznacz inną jako domyślną.' : null)}
            kolumny={[
              { pole: 'rodzaj_pracy', etykieta: 'Rodzaj pracy / stanowisko', typ: 'tekst', wymagane: true, szer: 'min-w-[16rem]' },
              { pole: 'mpk_kod', etykieta: 'MPK', typ: 'wybor', pusteNull: true, opcje: s.mpk.map((m) => ({ wartosc: m.kod, etykieta: m.opis ? `${m.kod} - ${m.opis}` : m.kod })) },
              { pole: 'stawka', etykieta: 'Stawka zł/rbh', typ: 'liczba', wymagane: true, szer: 'w-28' },
              { pole: 'wazna_od', etykieta: 'Ważna od', typ: 'data', wymagane: true },
              { pole: 'aktywna', etykieta: 'Aktywna', typ: 'bool' },
              { pole: 'domyslna', etykieta: 'Domyślna', typ: 'bool', podpowiedz: 'Stawka dla metody wskaźnikowej - tylko jedna aktywna' },
              { pole: 'do_weryfikacji', etykieta: 'Do weryfikacji', typ: 'bool' },
              { pole: 'uwagi', etykieta: 'Uwagi', typ: 'tekst', pusteNull: true },
              { pole: 'kolejnosc', etykieta: 'Kol.', typ: 'liczba', szer: 'w-16' },
            ]}
          />
        </div>
      )}

      {zakladka === 'materialy' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Naddatek technologiczny [%] dodaje się do kosztu sekcji materiałów (np. blachy 5%, odkuwki i kołnierze 2%, rury 0%).
            W wycenie można go zmienić. Kategorie bez „do porównań” (np. materiały pomocnicze) wchodzą w koszt projektu, ale nie do porównań cen zł/kg.
          </p>
          <TabelaSlownika
            tabela="kategorie_materialow" klucz="kod"
            wiersze={s.kategorieMaterialow as unknown as Record<string, unknown>[]}
            nowyWiersz={() => ({ kod: '', nazwa: '', naddatek_proc: 0, sposob_masy: 'brak', jm_domyslna: 'szt', do_porownan: true, dodatkowa: true, kolejnosc: s.kategorieMaterialow.length + 1 })}
            poZapisie={s.odswiez}
            kolumny={[
              { pole: 'kod', etykieta: 'Kod', typ: 'tekst', tylkoNowy: true, wymagane: true, szer: 'w-36' },
              { pole: 'nazwa', etykieta: 'Nazwa', typ: 'tekst', wymagane: true, szer: 'min-w-[14rem]' },
              { pole: 'naddatek_proc', etykieta: 'Naddatek %', typ: 'liczba', szer: 'w-24' },
              { pole: 'sposob_masy', etykieta: 'Liczenie masy', typ: 'wybor', opcje: SPOSOBY_MASY },
              { pole: 'jm_domyslna', etykieta: 'J.m.', typ: 'tekst', szer: 'w-16' },
              { pole: 'do_porownan', etykieta: 'Do porównań', typ: 'bool' },
              { pole: 'kolejnosc', etykieta: 'Kol.', typ: 'liczba', szer: 'w-16' },
            ]}
          />
        </div>
      )}

      {zakladka === 'gatunki' && (
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Gęstości [kg/dm³]</h3>
            <TabelaSlownika
              tabela="rodzaje_stali" klucz="kod"
              wiersze={s.rodzajeStali as unknown as Record<string, unknown>[]}
              nowyWiersz={() => ({ kod: '', nazwa: '', gestosc: 7.85 })}
              poZapisie={s.odswiez}
              kolumny={[
                { pole: 'kod', etykieta: 'Kod', typ: 'tekst', tylkoNowy: true, wymagane: true, szer: 'w-36' },
                { pole: 'nazwa', etykieta: 'Nazwa', typ: 'tekst', wymagane: true },
                { pole: 'gestosc', etykieta: 'Gęstość', typ: 'liczba', wymagane: true, szer: 'w-28' },
              ]}
            />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Gatunki i równoważniki</h3>
            <p className="text-sm text-slate-600">
              Gatunki z tą samą <strong>grupą</strong> są traktowane jako równoważne przy wyszukiwaniu cen (np. 1.4307 ≈ 304L).
              Gęstość gatunku wynika z rodzaju stali.
            </p>
            <TabelaSlownika
              tabela="gatunki" klucz="kod"
              wiersze={s.gatunki as unknown as Record<string, unknown>[]}
              nowyWiersz={() => ({ kod: '', grupa: '', rodzaj_stali: 'weglowa', norma: '', uwagi: '' })}
              poZapisie={s.odswiez}
              kolumny={[
                { pole: 'kod', etykieta: 'Gatunek', typ: 'tekst', tylkoNowy: true, wymagane: true, szer: 'w-36' },
                { pole: 'grupa', etykieta: 'Grupa równoważności', typ: 'tekst', wymagane: true, szer: 'w-40' },
                { pole: 'rodzaj_stali', etykieta: 'Rodzaj stali', typ: 'wybor', opcje: s.rodzajeStali.map((r) => ({ wartosc: r.kod, etykieta: r.nazwa })) },
                { pole: 'norma', etykieta: 'Norma', typ: 'tekst', pusteNull: true },
                { pole: 'uwagi', etykieta: 'Uwagi', typ: 'tekst', pusteNull: true, szer: 'min-w-[16rem]' },
              ]}
            />
          </div>
        </div>
      )}

      {zakladka === 'uslugi' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Wielkość odniesienia pozwala porównywać oferty kooperantów (malowanie zł/m², PWHT kwota za aparat albo zł/kg, NDT zł/mb...).
            Zakładka wskazuje, gdzie usługa trafia w wycenie.
          </p>
          <TabelaSlownika
            tabela="kategorie_uslug" klucz="kod"
            wiersze={s.kategorieUslug as unknown as Record<string, unknown>[]}
            nowyWiersz={() => ({ kod: '', nazwa: '', jednostka_odniesienia: 'kwota za aparat', zakladka: 'kooperacja', kolejnosc: s.kategorieUslug.length + 1 })}
            poZapisie={s.odswiez}
            kolumny={[
              { pole: 'kod', etykieta: 'Kod', typ: 'tekst', tylkoNowy: true, wymagane: true, szer: 'w-36' },
              { pole: 'nazwa', etykieta: 'Nazwa', typ: 'tekst', wymagane: true, szer: 'min-w-[18rem]' },
              { pole: 'jednostka_odniesienia', etykieta: 'Wielkość odniesienia', typ: 'tekst', wymagane: true },
              { pole: 'zakladka', etykieta: 'Zakładka wyceny', typ: 'wybor', opcje: ZAKLADKI_USLUG },
              { pole: 'kolejnosc', etykieta: 'Kol.', typ: 'liczba', szer: 'w-16' },
            ]}
          />
        </div>
      )}

      {zakladka === 'mpk' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Kody MPK z Registo i Optimy. Uzupełnij opisy (który kod to warsztat spawalniczy, obróbka, montaż...).
            Nieznane kody z importu Registo dopisują się automatycznie.
          </p>
          <TabelaSlownika
            tabela="mpk" klucz="kod"
            wiersze={s.mpk as unknown as Record<string, unknown>[]}
            nowyWiersz={() => ({ kod: '', opis: '', aktywne: true })}
            poZapisie={s.odswiez}
            kolumny={[
              { pole: 'kod', etykieta: 'Kod', typ: 'tekst', tylkoNowy: true, wymagane: true, szer: 'w-24', podpowiedz: 'Litera i dwie cyfry, np. P11' },
              { pole: 'opis', etykieta: 'Opis', typ: 'tekst', pusteNull: true, szer: 'min-w-[20rem]' },
              { pole: 'aktywne', etykieta: 'Aktywne', typ: 'bool' },
            ]}
          />
        </div>
      )}

      {zakladka === 'kursy' && <Kursy />}
      {zakladka === 'firma' && <DaneFirmyPanel />}
      {zakladka === 'zapytania' && <UstawieniaZapytan />}
      {zakladka === 'ai' && <BudzetAi />}
      {zakladka === 'zasoby' && <Zasoby />}
      {zakladka === 'historia' && <HistoriaZmian />}
    </div>
  )
}
