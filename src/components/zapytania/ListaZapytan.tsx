import { useCallback, useEffect, useMemo, useState } from 'react'
import { Mail, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { dataGodzinaPL } from '@/lib/format'
import { cn } from '@/lib/utils'
import { dniDoTerminu, etykietaRodzaju, kolorTerminu, statusZapytania, ZRODLA, type RodzajAparatu, type StatusZapytania, type ZakresWymiennika } from '@/lib/zapytania'
import { FUNKCJE } from '@/lib/funkcje'
import { ETYKIETY_STATUSU_WYCENY, type StatusWyceny } from '@/lib/wyceny'
import { doKosza } from '@/lib/kosz'
import { useOdswiezPoHistorii, useZakresHistorii } from '@/lib/historia'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'
import { NoweZMaila } from './NoweZMaila'
import { NoweZapytanie } from './NoweZapytanie'
import { ZnacznikRodzaju } from './RodzajAparatu'
import { t } from '@/i18n'

interface Wiersz {
  id: string; numer: string; przedmiot: string; status: StatusZapytania; zrodlo: string; termin_oferty: string | null
  nr_zapytania_klienta: string | null; nr_zapotrzebowania: string | null; utworzono: string
  rodzaj_aparatu: RodzajAparatu | null; zakres_wymiennika: ZakresWymiennika | null; zakres_opis: string | null
  klienci: { nazwa: string } | null
  dokumenty: { count: number }[]
  wyceny: { wersja: number; status: StatusWyceny }[]
}

const W_TOKU: StatusZapytania[] = ['nowe', 'w_analizie', 'zapytania_do_dostawcow', 'kalkulacja', 'do_zatwierdzenia', 'zatwierdzona']

export function ListaZapytan({ otworz }: { otworz: (id: string) => void }) {
  const [lista, setLista] = useState<Wiersz[]>([])
  const [tylkoWToku, setTylkoWToku] = useState(true)
  const [nowe, setNowe] = useState(false)
  const [blad, setBlad] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [zMaila, setZMaila] = useState(false)
  const [zaznaczone, setZaznaczone] = useState<Set<string | number>>(new Set())
  useZakresHistorii('zapytania')

  const wczytaj = useCallback(async () => {
    const { data, error } = await supabase.from('zapytania')
      .select('id, numer, przedmiot, status, zrodlo, rodzaj_aparatu, zakres_wymiennika, zakres_opis, termin_oferty, nr_zapytania_klienta, nr_zapotrzebowania, utworzono, klienci(nazwa), dokumenty(count), wyceny(wersja, status)')
      .order('utworzono', { ascending: false }).limit(1000)
    if (error) setBlad(komunikatPL(error.message)); else setLista((data ?? []) as unknown as Wiersz[])
  }, [])
  useEffect(() => { void wczytaj() }, [wczytaj])
  useOdswiezPoHistorii(() => void wczytaj())

  // Domyślnie: zapytania w toku, najbliższe terminy pierwsze (sortowanie z nagłówka nadpisuje tę kolejność).
  const widoczne = useMemo(() => lista
    .filter((z) => !tylkoWToku || W_TOKU.includes(z.status))
    .sort((a, b) => {
      const ta = a.termin_oferty && W_TOKU.includes(a.status) ? a.termin_oferty : '9999'
      const tb = b.termin_oferty && W_TOKU.includes(b.status) ? b.termin_oferty : '9999'
      return ta.localeCompare(tb) || b.utworzono.localeCompare(a.utworzono)
    }), [lista, tylkoWToku])

  async function usunZaznaczone() {
    const ids = [...zaznaczone].map(String)
    const numery = lista.filter((z) => ids.includes(z.id)).map((z) => z.numer)
    if (!window.confirm(t('Przenieść do kosza {0} razem z dokumentami, odczytami, analizą, wycenami i ofertami? Można je przywrócić z kosza.', ids.length === 1 ? `zapytanie ${numery[0]}` : `${ids.length} zapytań`))) return
    setBlad(null); setInfo(null)
    try {
      const ile = await doKosza('zapytanie', ids, 'zapytania', ids.length === 1 ? t('usunięcie zapytania {0}', numery[0]) : t('usunięcie {0} zapytań', ids.length))
      setInfo(t('Przeniesiono do kosza: {0}. Cofnij (Ctrl+Z) albo Kosz - przywrócenie.', ile))
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setZaznaczone(new Set()); await wczytaj()
  }

  const kolumny: KolumnaTabeli<Wiersz>[] = [
    { id: 'numer', naglowek: t('Numer'), typ: 'tekst', wartosc: (z) => z.numer, className: 'whitespace-nowrap font-medium' },
    { id: 'rodzaj', naglowek: t('Rodzaj'), typ: 'lista', wartosc: (z) => etykietaRodzaju(z.rodzaj_aparatu, z.zakres_wymiennika, z.zakres_opis), komorka: (z) => <ZnacznikRodzaju rodzaj={z.rodzaj_aparatu} zakres={z.zakres_wymiennika} opis={z.zakres_opis} /> },
    { id: 'klient', naglowek: t('Klient'), typ: 'lista', wartosc: (z) => z.klienci?.nazwa ?? null, className: 'whitespace-nowrap' },
    { id: 'przedmiot', naglowek: t('Przedmiot'), typ: 'tekst', wartosc: (z) => z.przedmiot },
    { id: 'nr_klienta', naglowek: t('Nr klienta'), typ: 'tekst', wartosc: (z) => [z.nr_zapytania_klienta, z.nr_zapotrzebowania].filter(Boolean).join(' / ') || null, className: 'whitespace-nowrap text-xs' },
    { id: 'zrodlo', naglowek: t('Źródło'), typ: 'lista', wartosc: (z) => ZRODLA[z.zrodlo] ?? z.zrodlo, className: 'text-xs' },
    {
      id: 'termin', naglowek: t('Termin oferty'), typ: 'data', wartosc: (z) => z.termin_oferty,
      komorka: (z) => {
        const dni = dniDoTerminu(z.termin_oferty)
        return (
          <span className={cn('whitespace-nowrap rounded px-1 text-sm', kolorTerminu(dni, z.status))}>
            {z.termin_oferty ? dataGodzinaPL(z.termin_oferty) : ''}
            {dni !== null && W_TOKU.includes(z.status) && <span className="ml-1 text-xs">({dni < 0 ? t('{0} dni po', -dni) : t('za {0} dni', dni)})</span>}
          </span>
        )
      },
    },
    { id: 'status', naglowek: t('Status'), typ: 'lista', wartosc: (z) => statusZapytania(z.status).etykieta, komorka: (z) => <span className={cn('znacznik whitespace-nowrap', statusZapytania(z.status).kolor)}>{statusZapytania(z.status).etykieta}</span> },
    { id: 'dok', naglowek: t('Dok.'), typ: 'liczba', wartosc: (z) => z.dokumenty[0]?.count ?? 0 },
    {
      id: 'wycena', naglowek: t('Wycena'), typ: 'lista', className: 'whitespace-nowrap text-xs',
      wartosc: (z) => { const ost = [...z.wyceny].sort((a, b) => b.wersja - a.wersja)[0]; return ost ? `v${ost.wersja} ${ETYKIETY_STATUSU_WYCENY[ost.status]}` : null },
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">{t('Zapytania ofertowe')}</h2>
        <div className="flex gap-2">
          {zaznaczone.size > 0 && <Button wariant="ostrzezenie" onClick={() => void usunZaznaczone()}><Trash2 className="h-4 w-4" /> {t('Usuń zaznaczone (')}{zaznaczone.size})</Button>}
          {FUNKCJE.importMailaJakoZapytania && <Button wariant="akcent" onClick={() => setZMaila(true)}><Mail className="h-4 w-4" /> {t('Nowe z maila')}</Button>}
          <Button wariant="glowny" onClick={() => setNowe(true)}><Plus className="h-4 w-4" /> {t('Nowe zapytanie')}</Button>
        </div>
        {FUNKCJE.importMailaJakoZapytania && <NoweZMaila otwarty={zMaila} zamknij={() => setZMaila(false)} utworzone={otworz} />}
        <NoweZapytanie otwarty={nowe} zamknij={() => setNowe(false)} utworzone={otworz} />
      </div>
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {info && <Komunikat rodzaj="sukces">{info}</Komunikat>}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={tylkoWToku} onChange={(e) => setTylkoWToku(e.target.checked)} /> {t('tylko w toku')}</label>
        <p className="text-xs text-slate-500">
          {t('Filtry i sortowanie - ikony w nagłówkach kolumn. Termin oferty:')}{' '}<span className="rounded bg-red-100 px-1">{t('po terminie')}</span> <span className="rounded bg-amber-100 px-1">{t('≤ 3 dni')}</span> <span className="rounded bg-yellow-50 px-1">{t('≤ 7 dni')}</span>
        </p>
      </div>
      <Tabela id="zapytania" kolumny={kolumny} wiersze={widoczne} klucz={(z) => z.id} onKlik={(z) => otworz(z.id)}
        zaznaczanie={{ zaznaczone, zmien: setZaznaczone }} pusto={t('Brak zapytań.')} />
    </div>
  )
}
