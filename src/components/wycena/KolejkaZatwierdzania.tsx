import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { dataGodzinaPL, liczba, zl } from '@/lib/format'
import { Komunikat } from '../ui/komunikat'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'
import { t } from '@/i18n'

interface Wiersz {
  id: string; wersja: number; nazwa: string | null; zlozono: string | null; podsumowanie: { koszty?: number; masa_kg?: number } | null
  zapytania: { numer: string; przedmiot: string; termin_oferty: string | null; klienci: { nazwa: string } | null } | null
  wyceny_marze: { narzut_zysk_proc: number; korekta_prezesa_kwota: number } | null
}

/** Kolejka prezesa: wyceny przekazane do zatwierdzenia. */
export function KolejkaZatwierdzania({ otworz }: { otworz: (wycenaId: string) => void }) {
  const [lista, setLista] = useState<Wiersz[]>([])
  const [blad, setBlad] = useState<string | null>(null)
  useEffect(() => {
    void supabase.from('wyceny')
      .select('id, wersja, nazwa, zlozono, podsumowanie, zapytania(numer, przedmiot, termin_oferty, klienci(nazwa)), wyceny_marze(narzut_zysk_proc, korekta_prezesa_kwota)')
      .eq('status', 'do_zatwierdzenia').order('zlozono')
      .then(({ data, error }) => { if (error) setBlad(komunikatPL(error.message)); else setLista((data ?? []) as unknown as Wiersz[]) })
  }, [])
  const kolumny: KolumnaTabeli<Wiersz>[] = [
    { id: 'zo', naglowek: t('Zapytanie'), typ: 'tekst', wartosc: (w) => w.zapytania?.numer ?? null, className: 'whitespace-nowrap font-medium' },
    { id: 'klient', naglowek: t('Klient'), typ: 'lista', wartosc: (w) => w.zapytania?.klienci?.nazwa ?? null },
    { id: 'przedmiot', naglowek: t('Przedmiot'), typ: 'tekst', wartosc: (w) => w.zapytania?.przedmiot ?? null },
    { id: 'wersja', naglowek: t('Wersja'), typ: 'tekst', wartosc: (w) => `v${w.wersja}${w.nazwa ? ` ${w.nazwa}` : ''}` },
    { id: 'zlozono', naglowek: t('Przekazano'), typ: 'data', wartosc: (w) => w.zlozono, komorka: (w) => dataGodzinaPL(w.zlozono), className: 'whitespace-nowrap text-sm' },
    { id: 'termin', naglowek: t('Termin oferty'), typ: 'data', wartosc: (w) => w.zapytania?.termin_oferty ?? null, komorka: (w) => dataGodzinaPL(w.zapytania?.termin_oferty), className: 'whitespace-nowrap text-sm' },
    { id: 'koszty', naglowek: t('Koszty'), typ: 'liczba', wartosc: (w) => w.podsumowanie?.koszty ?? null, komorka: (w) => (w.podsumowanie?.koszty !== undefined ? zl(w.podsumowanie.koszty) : '') },
    { id: 'masa', naglowek: t('Masa kg'), typ: 'liczba', wartosc: (w) => w.podsumowanie?.masa_kg ?? null, komorka: (w) => (w.podsumowanie?.masa_kg ? liczba(w.podsumowanie.masa_kg, 0) : '') },
    { id: 'narzut', naglowek: t('Narzut'), typ: 'liczba', wartosc: (w) => w.wyceny_marze?.narzut_zysk_proc ?? null, komorka: (w) => (w.wyceny_marze ? `${liczba(w.wyceny_marze.narzut_zysk_proc)}%` : '') },
  ]
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('Wyceny do zatwierdzenia')}</h2>
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      <Tabela id="kolejka-zatwierdzania" kolumny={kolumny} wiersze={lista} klucz={(w) => w.id} onKlik={(w) => otworz(w.id)} pusto={t('Brak wycen czekających na zatwierdzenie.')} />
    </div>
  )
}
