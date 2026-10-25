import { useCallback, useEffect, useState } from 'react'
import { FileText, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { dataPL, liczba } from '@/lib/format'
import { cn } from '@/lib/utils'
import { nowyKlucz, zapiszOferte, type FormularzOferty as Formularz } from '@/lib/oferty'
import { otworzDokument } from '@/lib/magazyn'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { FormularzOferty } from './FormularzOferty'
import { doKosza } from '@/lib/kosz'

interface WierszOferty {
  id: string; data_oferty: string | null; numer_oferty: string | null; nr_zo: string | null; waluta: string; kurs: number
  status: string; zrodlo: string; waznosc_do: string | null; waznosc_opis: string | null; termin_realizacji: string | null
  czy_zakupiono: boolean; dokument_id: string | null
  dostawcy: { nazwa: string } | null
  zapytania: { numer: string } | null
  dokumenty: { sciezka: string | null; nazwa_pliku: string } | null
  pozycje_ofert: { wartosc: number | null; ilosc: number; cena_jedn: number }[]
}

const STATUSY: Record<string, string> = { do_przejrzenia: 'do przejrzenia', zatwierdzona: 'zatwierdzona', odrzucona: 'odrzucona' }

export function ListaOfert({ mozeEdytowac }: { mozeEdytowac: boolean }) {
  const s = useSlowniki()
  const [oferty, setOferty] = useState<WierszOferty[]>([])
  const [status, setStatus] = useState('')
  const [edytowana, setEdytowana] = useState<Formularz | null>(null)
  const [blad, setBlad] = useState<string | null>(null)

  const wczytaj = useCallback(async () => {
    let q = supabase.from('oferty_dostawcow')
      .select('id, data_oferty, numer_oferty, nr_zo, waluta, kurs, status, zrodlo, waznosc_do, waznosc_opis, termin_realizacji, czy_zakupiono, dokument_id, dostawcy(nazwa), zapytania(numer), dokumenty!oferty_dostawcow_dokument_id_fkey(sciezka, nazwa_pliku), pozycje_ofert(wartosc, ilosc, cena_jedn)')
      .order('data_oferty', { ascending: false, nullsFirst: false }).limit(500)
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) setBlad(komunikatPL(error.message))
    else setOferty((data ?? []) as unknown as WierszOferty[])
  }, [status])

  useEffect(() => { void wczytaj() }, [wczytaj])

  async function edytuj(id: string) {
    const [{ data: o }, { data: p }] = await Promise.all([
      supabase.from('oferty_dostawcow').select('*').eq('id', id).single(),
      supabase.from('pozycje_ofert').select('*').eq('oferta_id', id).order('lp'),
    ])
    if (!o) return
    setEdytowana({
      id: o.id, dostawca_id: o.dostawca_id, dostawca_nowy: null, zapytanie_id: o.zapytanie_id, nr_zo: o.nr_zo ?? '',
      numer_oferty: o.numer_oferty ?? '', data_oferty: o.data_oferty ?? '', waluta: o.waluta, kurs: Number(o.kurs),
      kurs_data: o.kurs_data, kurs_zrodlo: o.kurs_zrodlo ?? 'ręcznie', warunki_dostawy: o.warunki_dostawy ?? '', miejsce_dostawy: o.miejsce_dostawy ?? '',
      platnosc: o.platnosc ?? '', waznosc_do: o.waznosc_do ?? '', waznosc_opis: o.waznosc_opis ?? '', termin_realizacji: o.termin_realizacji ?? '',
      termin_dni: o.termin_dni, doplaty: o.doplaty ?? [], wymagania: o.wymagania ?? {}, zrodlo: o.zrodlo, czy_zakupiono: o.czy_zakupiono,
      uwagi: o.uwagi ?? '', ekstrakcja_ai: null, dokument_id: o.dokument_id,
      pozycje: (p ?? []).map((x) => ({ ...x, klucz: nowyKlucz(), ilosc: Number(x.ilosc), cena_jedn: Number(x.cena_jedn), pewnosc: null })),
    })
  }

  async function usun(o: WierszOferty) {
    if (!window.confirm(`Przenieść ofertę ${o.dostawcy?.nazwa ?? ''} z ${dataPL(o.data_oferty)} do kosza (razem z jej dokumentami)?`)) return
    try { await doKosza('oferta_dostawcy', [o.id], 'oferty'); await wczytaj() } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }

  if (edytowana) {
    return (
      <FormularzOferty poczatkowy={edytowana} anuluj={() => setEdytowana(null)}
        zapisz={async (f, st) => { await zapiszOferte(f, s, st); setEdytowana(null); await wczytaj() }} />
    )
  }

  return (
    <div className="space-y-3">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      <div className="flex items-end gap-3">
        <label><span className="etykieta">Status</span>
          <select className="pole w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">wszystkie</option>
            {Object.entries(STATUSY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse">
          <thead><tr>
            {['Data', 'Dostawca', 'Nr oferty', 'ZO', 'Pozycji', 'Wartość', 'Termin', 'Ważność', 'Źródło', 'Status', ''].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}
          </tr></thead>
          <tbody>
            {oferty.map((o) => {
              const wartosc = o.pozycje_ofert.reduce((s2, p) => s2 + Number(p.wartosc ?? p.ilosc * p.cena_jedn), 0)
              return (
                <tr key={o.id}>
                  <td className="komorka whitespace-nowrap">{dataPL(o.data_oferty)}</td>
                  <td className="komorka font-medium">{o.dostawcy?.nazwa}</td>
                  <td className="komorka text-sm">{o.numer_oferty}</td>
                  <td className="komorka whitespace-nowrap text-sm">{o.zapytania?.numer ?? o.nr_zo}</td>
                  <td className="komorka liczba">{o.pozycje_ofert.length}</td>
                  <td className="komorka liczba whitespace-nowrap">{liczba(wartosc, 2)} {o.waluta}</td>
                  <td className="komorka text-xs">{o.termin_realizacji}</td>
                  <td className="komorka whitespace-nowrap text-xs">{o.waznosc_do ? dataPL(o.waznosc_do) : o.waznosc_opis}</td>
                  <td className="komorka text-xs">{o.zrodlo}{o.czy_zakupiono ? ', zakupiono' : ''}</td>
                  <td className="komorka"><span className={cn('znacznik', o.status === 'zatwierdzona' ? 'bg-limonka-jasna text-limonka-ciemna ring-limonka' : o.status === 'do_przejrzenia' ? 'bg-amber-50 text-amber-800 ring-amber-300' : 'bg-slate-100 text-slate-600 ring-slate-300')}>{STATUSY[o.status]}</span></td>
                  <td className="komorka">
                    <div className="flex justify-end gap-1">
                      {o.dokumenty?.sciezka && (
                        <Button rozmiar="maly" title={`Otwórz ${o.dokumenty.nazwa_pliku}`} onClick={() => void otworzDokument(o.dokumenty!.sciezka!).catch((e) => setBlad(String(e.message ?? e)))}>
                          <FileText className="h-4 w-4" />
                        </Button>
                      )}
                      {mozeEdytowac && <Button rozmiar="maly" title="Popraw" onClick={() => void edytuj(o.id)}><Pencil className="h-4 w-4" /></Button>}
                      {mozeEdytowac && <Button rozmiar="maly" wariant="ostrzezenie" title="Usuń" onClick={() => void usun(o)}><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                  </td>
                </tr>
              )
            })}
            {oferty.length === 0 && <tr><td colSpan={11} className="komorka text-center text-slate-500">Brak ofert.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
