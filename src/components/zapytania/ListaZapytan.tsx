import { useCallback, useEffect, useMemo, useState } from 'react'
import { Mail, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { dataGodzinaPL } from '@/lib/format'
import { cn } from '@/lib/utils'
import { dniDoTerminu, kolorTerminu, statusZapytania, RODZAJE_APARATU, STATUSY_ZAPYTANIA, ZRODLA, type RodzajAparatu, type StatusZapytania, type ZakresWymiennika } from '@/lib/zapytania'
import { FUNKCJE } from '@/lib/funkcje'
import { ETYKIETY_STATUSU_WYCENY, type StatusWyceny } from '@/lib/wyceny'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { NoweZMaila } from './NoweZMaila'
import { NoweZapytanie } from './NoweZapytanie'
import { ZnacznikRodzaju } from './RodzajAparatu'

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
  const [filtr, setFiltr] = useState({ tekst: '', status: 'w_toku', rodzaj: '' })
  const [nowe, setNowe] = useState(false)
  const [blad, setBlad] = useState<string | null>(null)
  const [zMaila, setZMaila] = useState(false)

  const wczytaj = useCallback(async () => {
    const { data, error } = await supabase.from('zapytania')
      .select('id, numer, przedmiot, status, zrodlo, rodzaj_aparatu, zakres_wymiennika, zakres_opis, termin_oferty, nr_zapytania_klienta, nr_zapotrzebowania, utworzono, klienci(nazwa), dokumenty(count), wyceny(wersja, status)')
      .order('utworzono', { ascending: false }).limit(1000)
    if (error) setBlad(komunikatPL(error.message)); else setLista((data ?? []) as unknown as Wiersz[])
  }, [])
  useEffect(() => { void wczytaj() }, [wczytaj])

  const widoczne = useMemo(() => lista
    .filter((z) => filtr.status === 'wszystkie' || (filtr.status === 'w_toku' ? W_TOKU.includes(z.status) : z.status === filtr.status))
    .filter((z) => !filtr.rodzaj || (filtr.rodzaj === 'brak' ? !z.rodzaj_aparatu : z.rodzaj_aparatu === filtr.rodzaj))
    .filter((z) => !filtr.tekst || `${z.numer} ${z.przedmiot} ${z.klienci?.nazwa ?? ''} ${z.nr_zapytania_klienta ?? ''} ${z.nr_zapotrzebowania ?? ''}`.toLowerCase().includes(filtr.tekst.toLowerCase()))
    .sort((a, b) => {
      // W toku: najpierw najbliższe terminy.
      const ta = a.termin_oferty && W_TOKU.includes(a.status) ? a.termin_oferty : '9999'
      const tb = b.termin_oferty && W_TOKU.includes(b.status) ? b.termin_oferty : '9999'
      return ta.localeCompare(tb) || b.utworzono.localeCompare(a.utworzono)
    }), [lista, filtr])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">Zapytania ofertowe</h2>
        <div className="flex gap-2">
          {FUNKCJE.importMailaJakoZapytania && <Button wariant="akcent" onClick={() => setZMaila(true)}><Mail className="h-4 w-4" /> Nowe z maila</Button>}
          <Button wariant="glowny" onClick={() => setNowe(true)}><Plus className="h-4 w-4" /> Nowe zapytanie</Button>
        </div>
        {FUNKCJE.importMailaJakoZapytania && <NoweZMaila otwarty={zMaila} zamknij={() => setZMaila(false)} utworzone={otworz} />}
        <NoweZapytanie otwarty={nowe} zamknij={() => setNowe(false)} utworzone={otworz} />
      </div>
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      <div className="flex flex-wrap items-end gap-3">
        <label><span className="etykieta">Szukaj</span><input className="pole w-64" placeholder="numer, przedmiot, klient..." value={filtr.tekst} onChange={(e) => setFiltr({ ...filtr, tekst: e.target.value })} /></label>
        <label><span className="etykieta">Status</span>
          <select className="pole w-56" value={filtr.status} onChange={(e) => setFiltr({ ...filtr, status: e.target.value })}>
            <option value="w_toku">w toku</option><option value="wszystkie">wszystkie</option>
            {STATUSY_ZAPYTANIA.map((s) => <option key={s.id} value={s.id}>{s.etykieta}</option>)}
          </select></label>
        <label><span className="etykieta">Rodzaj</span>
          <select className="pole w-44" value={filtr.rodzaj} onChange={(e) => setFiltr({ ...filtr, rodzaj: e.target.value })}>
            <option value="">wszystkie</option>{RODZAJE_APARATU.map((r) => <option key={r.id} value={r.id}>{r.etykieta}</option>)}<option value="brak">nie wybrano</option>
          </select></label>
        <p className="pb-2 text-xs text-slate-500">
          Termin oferty: <span className="rounded bg-red-100 px-1">po terminie</span> <span className="rounded bg-amber-100 px-1">≤ 3 dni</span> <span className="rounded bg-yellow-50 px-1">≤ 7 dni</span>
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse">
          <thead><tr>{['Numer', 'Rodzaj', 'Klient', 'Przedmiot', 'Nr klienta', 'Źródło', 'Termin oferty', 'Status', 'Dok.', 'Wycena'].map((n) => <th key={n} className="komorka-naglowek whitespace-nowrap">{n}</th>)}</tr></thead>
          <tbody>
            {widoczne.map((z) => {
              const dni = dniDoTerminu(z.termin_oferty)
              const ost = [...z.wyceny].sort((a, b) => b.wersja - a.wersja)[0]
              const st = statusZapytania(z.status)
              return (
                <tr key={z.id} className="cursor-pointer hover:bg-slate-50" onClick={() => otworz(z.id)}>
                  <td className="komorka whitespace-nowrap font-medium">{z.numer}</td>
                  <td className="komorka"><ZnacznikRodzaju rodzaj={z.rodzaj_aparatu} zakres={z.zakres_wymiennika} opis={z.zakres_opis} /></td>
                  <td className="komorka whitespace-nowrap">{z.klienci?.nazwa}</td>
                  <td className="komorka">{z.przedmiot}</td>
                  <td className="komorka whitespace-nowrap text-xs">{[z.nr_zapytania_klienta, z.nr_zapotrzebowania].filter(Boolean).join(' / ')}</td>
                  <td className="komorka text-xs">{ZRODLA[z.zrodlo]}</td>
                  <td className={cn('komorka whitespace-nowrap text-sm', kolorTerminu(dni, z.status))}>
                    {z.termin_oferty ? dataGodzinaPL(z.termin_oferty) : ''}
                    {dni !== null && W_TOKU.includes(z.status) && <span className="ml-1 text-xs">({dni < 0 ? `${-dni} dni po` : `za ${dni} dni`})</span>}
                  </td>
                  <td className="komorka"><span className={cn('znacznik whitespace-nowrap', st.kolor)}>{st.etykieta}</span></td>
                  <td className="komorka liczba">{z.dokumenty[0]?.count ?? 0}</td>
                  <td className="komorka whitespace-nowrap text-xs">{ost ? `v${ost.wersja} ${ETYKIETY_STATUSU_WYCENY[ost.status]}` : ''}</td>
                </tr>
              )
            })}
            {widoczne.length === 0 && <tr><td colSpan={10} className="komorka text-center text-slate-500">Brak zapytań.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
