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
import { t } from '@/i18n'

type Zakladka = 'parametry' | 'stawki' | 'materialy' | 'gatunki' | 'uslugi' | 'mpk' | 'kursy' | 'firma' | 'zapytania' | 'ai' | 'zasoby' | 'historia'

const ZAKLADKI: { id: Zakladka; etykieta: string }[] = [
  { id: 'parametry', etykieta: t('Narzuty i parametry') },
  { id: 'stawki', etykieta: t('Stawki robocizny') },
  { id: 'materialy', etykieta: t('Kategorie materiałów i naddatki') },
  { id: 'gatunki', etykieta: t('Gatunki i gęstości') },
  { id: 'uslugi', etykieta: t('Kategorie usług') },
  { id: 'mpk', etykieta: t('MPK') },
  { id: 'kursy', etykieta: t('Kursy walut') },
  { id: 'firma', etykieta: t('Dane firmy i oferty') },
  { id: 'zapytania', etykieta: t('Zapytania do dostawców') },
  { id: 'ai', etykieta: t('AI i budżet') },
  { id: 'zasoby', etykieta: t('Zajętość planu') },
  { id: 'historia', etykieta: t('Historia zmian') },
]

const SPOSOBY_MASY = [
  { wartosc: 'blacha', etykieta: t('blacha: g × b × l × ρ') },
  { wartosc: 'krazek', etykieta: t('krążek/pierścień: π/4 (D² − d²) h ρ') },
  { wartosc: 'rura', etykieta: t('rura: π (D − s) s l ρ') },
  { wartosc: 'pret', etykieta: t('pręt: π/4 d² l ρ') },
  { wartosc: 'brak', etykieta: t('masa wpisywana ręcznie') },
]

const ZAKLADKI_USLUG = [
  { wartosc: 'kooperacja', etykieta: t('Kooperacja') },
  { wartosc: 'projekt', etykieta: t('Projekt') },
  { wartosc: 'badania', etykieta: t('Badania i odbiory') },
  { wartosc: 'transport', etykieta: t('Transport i sprzęt') },
  { wartosc: 'inne', etykieta: t('Inne') },
]

export function Ustawienia() {
  const s = useSlowniki()
  const [zakladka, setZakladka] = useState<Zakladka>('parametry')
  const zakladki = ZAKLADKI

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('Ustawienia i słowniki')}</h2>
      <div className="pasek-zakladek">
        {zakladki.map((z) => (
          <button key={z.id} onClick={() => setZakladka(z.id)}
            className={cn('zakladka', (zakladka === z.id) && 'zakladka-aktywna')}>
            {z.etykieta}
          </button>
        ))}
      </div>

      {zakladka === 'parametry' && <Parametry />}

      {zakladka === 'stawki' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            {t('Stawki podpowiadane w zakładce Pracochłonność. W wycenie każdą można nadpisać ręcznie dla danego projektu. Stawka oznaczona jako')}{' '}<strong>{t('domyślna')}</strong> {t('trafia do metody wskaźnikowej (masa × rbh/t × stawka).')}
          </p>
          <TabelaSlownika
            tabela="stawki_robocizny" klucz="id" kluczGenerowany
            wiersze={s.stawki as unknown as Record<string, unknown>[]}
            nowyWiersz={() => ({ rodzaj_pracy: '', mpk_kod: null, stawka: 0, wazna_od: new Date().toISOString().slice(0, 10), aktywna: true, do_weryfikacji: false, domyslna: false, uwagi: '', kolejnosc: s.stawki.length + 1 })}
            poZapisie={s.odswiez}
            mozeUsunac={(w) => (w.domyslna ? t('Nie można usunąć stawki domyślnej - najpierw oznacz inną jako domyślną.') : null)}
            kolumny={[
              { pole: 'rodzaj_pracy', etykieta: t('Rodzaj pracy / stanowisko'), typ: 'tekst', wymagane: true, szer: 'min-w-[16rem]' },
              { pole: 'mpk_kod', etykieta: t('MPK'), typ: 'wybor', pusteNull: true, opcje: s.mpk.map((m) => ({ wartosc: m.kod, etykieta: m.opis ? `${m.kod} - ${m.opis}` : m.kod })) },
              { pole: 'stawka', etykieta: t('Stawka zł/rbh'), typ: 'liczba', wymagane: true, szer: 'w-28' },
              { pole: 'wazna_od', etykieta: t('Ważna od'), typ: 'data', wymagane: true },
              { pole: 'aktywna', etykieta: t('Aktywna'), typ: 'bool' },
              { pole: 'domyslna', etykieta: t('Domyślna'), typ: 'bool', podpowiedz: t('Stawka dla metody wskaźnikowej - tylko jedna aktywna') },
              { pole: 'do_weryfikacji', etykieta: t('Do weryfikacji'), typ: 'bool' },
              { pole: 'uwagi', etykieta: t('Uwagi'), typ: 'tekst', pusteNull: true },
              { pole: 'kolejnosc', etykieta: t('Kol.'), typ: 'liczba', szer: 'w-16' },
            ]}
          />
        </div>
      )}

      {zakladka === 'materialy' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            {t('Naddatek technologiczny [%] dodaje się do kosztu sekcji materiałów (np. blachy 5%, odkuwki i kołnierze 2%, rury 0%). W wycenie można go zmienić. Kategorie bez „do porównań” (np. materiały pomocnicze) wchodzą w koszt projektu, ale nie do porównań cen zł/kg.')}
          </p>
          <TabelaSlownika
            tabela="kategorie_materialow" klucz="kod"
            wiersze={s.kategorieMaterialow as unknown as Record<string, unknown>[]}
            nowyWiersz={() => ({ kod: '', nazwa: '', naddatek_proc: 0, sposob_masy: 'brak', jm_domyslna: 'szt', do_porownan: true, dodatkowa: true, kolejnosc: s.kategorieMaterialow.length + 1 })}
            poZapisie={s.odswiez}
            kolumny={[
              { pole: 'kod', etykieta: t('Kod'), typ: 'tekst', tylkoNowy: true, wymagane: true, szer: 'w-36' },
              { pole: 'nazwa', etykieta: t('Nazwa'), typ: 'tekst', wymagane: true, szer: 'min-w-[14rem]' },
              { pole: 'naddatek_proc', etykieta: t('Naddatek %'), typ: 'liczba', szer: 'w-24' },
              { pole: 'sposob_masy', etykieta: t('Liczenie masy'), typ: 'wybor', opcje: SPOSOBY_MASY },
              { pole: 'jm_domyslna', etykieta: t('J.m.'), typ: 'tekst', szer: 'w-16' },
              { pole: 'do_porownan', etykieta: t('Do porównań'), typ: 'bool' },
              { pole: 'kolejnosc', etykieta: t('Kol.'), typ: 'liczba', szer: 'w-16' },
            ]}
          />
        </div>
      )}

      {zakladka === 'gatunki' && (
        <div className="space-y-6">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t('Gęstości [kg/dm³]')}</h3>
            <TabelaSlownika
              tabela="rodzaje_stali" klucz="kod"
              wiersze={s.rodzajeStali as unknown as Record<string, unknown>[]}
              nowyWiersz={() => ({ kod: '', nazwa: '', gestosc: 7.85 })}
              poZapisie={s.odswiez}
              kolumny={[
                { pole: 'kod', etykieta: t('Kod'), typ: 'tekst', tylkoNowy: true, wymagane: true, szer: 'w-36' },
                { pole: 'nazwa', etykieta: t('Nazwa'), typ: 'tekst', wymagane: true },
                { pole: 'gestosc', etykieta: t('Gęstość'), typ: 'liczba', wymagane: true, szer: 'w-28' },
              ]}
            />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t('Gatunki i równoważniki')}</h3>
            <p className="text-sm text-slate-600">
              {t('Gatunki z tą samą')}{' '}<strong>{t('grupą')}</strong> {t('są traktowane jako równoważne przy wyszukiwaniu cen (np. 1.4307 ≈ 304L). Gęstość gatunku wynika z rodzaju stali.')}
            </p>
            <TabelaSlownika
              tabela="gatunki" klucz="kod"
              wiersze={s.gatunki as unknown as Record<string, unknown>[]}
              nowyWiersz={() => ({ kod: '', grupa: '', rodzaj_stali: 'weglowa', norma: '', uwagi: '' })}
              poZapisie={s.odswiez}
              kolumny={[
                { pole: 'kod', etykieta: t('Gatunek'), typ: 'tekst', tylkoNowy: true, wymagane: true, szer: 'w-36' },
                { pole: 'grupa', etykieta: t('Grupa równoważności'), typ: 'tekst', wymagane: true, szer: 'w-40' },
                { pole: 'rodzaj_stali', etykieta: t('Rodzaj stali'), typ: 'wybor', opcje: s.rodzajeStali.map((r) => ({ wartosc: r.kod, etykieta: r.nazwa })) },
                { pole: 'norma', etykieta: t('Norma'), typ: 'tekst', pusteNull: true },
                { pole: 'uwagi', etykieta: t('Uwagi'), typ: 'tekst', pusteNull: true, szer: 'min-w-[16rem]' },
              ]}
            />
          </div>
        </div>
      )}

      {zakladka === 'uslugi' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            {t('Wielkość odniesienia pozwala porównywać oferty kooperantów (malowanie zł/m², PWHT kwota za aparat albo zł/kg, NDT zł/mb...). Zakładka wskazuje, gdzie usługa trafia w wycenie.')}
          </p>
          <TabelaSlownika
            tabela="kategorie_uslug" klucz="kod"
            wiersze={s.kategorieUslug as unknown as Record<string, unknown>[]}
            nowyWiersz={() => ({ kod: '', nazwa: '', jednostka_odniesienia: 'kwota za aparat', zakladka: 'kooperacja', kolejnosc: s.kategorieUslug.length + 1 })}
            poZapisie={s.odswiez}
            kolumny={[
              { pole: 'kod', etykieta: t('Kod'), typ: 'tekst', tylkoNowy: true, wymagane: true, szer: 'w-36' },
              { pole: 'nazwa', etykieta: t('Nazwa'), typ: 'tekst', wymagane: true, szer: 'min-w-[18rem]' },
              { pole: 'jednostka_odniesienia', etykieta: t('Wielkość odniesienia'), typ: 'tekst', wymagane: true },
              { pole: 'zakladka', etykieta: t('Zakładka wyceny'), typ: 'wybor', opcje: ZAKLADKI_USLUG },
              { pole: 'kolejnosc', etykieta: t('Kol.'), typ: 'liczba', szer: 'w-16' },
            ]}
          />
        </div>
      )}

      {zakladka === 'mpk' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            {t('Kody MPK z Registo i Optimy. Uzupełnij opisy (który kod to warsztat spawalniczy, obróbka, montaż...). Nieznane kody z importu Registo dopisują się automatycznie.')}
          </p>
          <TabelaSlownika
            tabela="mpk" klucz="kod"
            wiersze={s.mpk as unknown as Record<string, unknown>[]}
            nowyWiersz={() => ({ kod: '', opis: '', aktywne: true })}
            poZapisie={s.odswiez}
            kolumny={[
              { pole: 'kod', etykieta: t('Kod'), typ: 'tekst', tylkoNowy: true, wymagane: true, szer: 'w-24', podpowiedz: t('Litera i dwie cyfry, np. P11') },
              { pole: 'opis', etykieta: t('Opis'), typ: 'tekst', pusteNull: true, szer: 'min-w-[20rem]' },
              { pole: 'aktywne', etykieta: t('Aktywne'), typ: 'bool' },
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
