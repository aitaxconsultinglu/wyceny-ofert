import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { FilePlus2, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { liczba } from '@/lib/format'
import { cn } from '@/lib/utils'
import { NAZWY_JEZYKOW, numeryStron } from '@/lib/wersjeEdytowalne'
import { dodajPlik, usunPlik, type PlikEdytowalny } from '@/lib/wersjeEdytowalnePliki'
import type { Profil } from '@/lib/types'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { PlikWersji } from './PlikWersji'
import { HistoriaOdczytow } from './HistoriaOdczytow'

const ETYKIETY_RODZAJU: Record<PlikEdytowalny['rodzaj'], string> = {
  pdf: 'PDF', obraz: 'zdjęcie / skan', docx: 'Word', arkusz: 'arkusz', tekst: 'tekst', cad: 'CAD', inny: 'inny',
}
const AKCEPTOWANE = '.pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.xls,.xlsm,.csv,.txt,.md,.dxf,.dwg,.step,.stp'
const data = (d: string) => new Date(d).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })

/**
 * Moduł "Wersje edytowalne" - niezależny od zapytań i wycen: pracownik dodaje plik (PDF, skan, zdjęcie, DOCX, arkusz, DXF),
 * odczytuje go bez AI albo przez AI, tłumaczy na polski i pobiera wersję edytowalną w Wordzie. Każdy odczyt trafia do dziennika.
 */
export function WersjeEdytowalne({ profil, id, otworz }: { profil: Profil; id: string | null; otworz: (id: string | null) => void }) {
  const s = useSlowniki()
  const [zakladka, setZakladka] = useState<'pliki' | 'historia'>('pliki')
  const [pliki, setPliki] = useState<PlikEdytowalny[]>([])
  const [koszty, setKoszty] = useState<Record<string, number>>({})
  const [ludzie, setLudzie] = useState<Record<string, string>>({})
  const [filtr, setFiltr] = useState('')
  const [zajety, setZajety] = useState<string | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  const [nadPolem, setNadPolem] = useState(false)
  const wybor = useRef<HTMLInputElement>(null)

  const wczytaj = useCallback(async () => {
    const [p, o, l] = await Promise.all([
      supabase.from('pliki_edytowalne').select('*').order('utworzono', { ascending: false }).limit(500),
      supabase.from('odczyty_plikow').select('plik_id, koszt_pln').not('plik_id', 'is', null),
      supabase.rpc('lista_pracownikow'),
    ])
    if (p.error) setBlad(komunikatPL(p.error.message))
    setPliki((p.data ?? []) as PlikEdytowalny[])
    const k: Record<string, number> = {}
    for (const r of o.data ?? []) k[r.plik_id as string] = (k[r.plik_id as string] ?? 0) + Number(r.koszt_pln)
    setKoszty(k)
    setLudzie(Object.fromEntries(((l.data ?? []) as { id: string; nazwa: string }[]).map((x) => [x.id, x.nazwa])))
  }, [])
  useEffect(() => { void wczytaj() }, [wczytaj])

  async function dodaj(lista: FileList | File[]) {
    setBlad(null)
    const bledy: string[] = []
    let ostatni: PlikEdytowalny | null = null
    const tablica = Array.from(lista)
    for (const [i, f] of tablica.entries()) {
      setZajety(`Zapisywanie ${i + 1}/${tablica.length}: ${f.name}...`)
      try { ostatni = await dodajPlik(f, s.ustawienia.limity_planu?.plik_mb ?? 20) } catch (e) { bledy.push(e instanceof Error ? e.message : String(e)) }
    }
    setZajety(null)
    if (bledy.length) setBlad(bledy.join(' '))
    await wczytaj()
    if (tablica.length === 1 && ostatni) otworz(ostatni.id)
  }
  function upusc(e: DragEvent) {
    e.preventDefault(); setNadPolem(false)
    if (e.dataTransfer.files.length) void dodaj(e.dataTransfer.files)
  }
  async function usun(p: PlikEdytowalny) {
    if (!window.confirm(`Usunąć plik „${p.nazwa_pliku}” i jego wersję edytowalną? Historia odczytów zostaje.`)) return
    try { await usunPlik(p); await wczytaj() } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }

  const otwarty = id ? pliki.find((p) => p.id === id) : null
  if (id && otwarty) return <PlikWersji key={otwarty.id} plik={otwarty} zamknij={() => { otworz(null); void wczytaj() }} />
  const widoczne = pliki.filter((p) => !filtr || p.nazwa_pliku.toLowerCase().includes(filtr.toLowerCase()))
  const mozeUsunac = (p: PlikEdytowalny) => profil.rola === 'administrator' || p.utworzyl === profil.id

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Wersje edytowalne</h2>
        <div className="flex rounded-md border border-slate-200 text-sm">
          <button className={cn('px-3 py-1', zakladka === 'pliki' && 'bg-slate-800 text-white')} onClick={() => setZakladka('pliki')}>Pliki</button>
          <button className={cn('px-3 py-1', zakladka === 'historia' && 'bg-slate-800 text-white')} onClick={() => setZakladka('historia')}>Historia i budżet</button>
        </div>
      </div>
      <p className="text-sm text-slate-600">
        Odczyt plików i przerabianie ich na wersje edytowalne w Wordzie, z rozpoznaniem języka i tłumaczeniem na polski - niezależnie od zapytań i wycen.
        PDF z warstwą tekstową, DOCX, arkusze, TXT i DXF czytane są <strong>bez AI</strong> (bez kosztów); skany i zdjęcia - przez AI, z kosztem pokazanym przed odczytem.
      </p>
      {id && !otwarty && pliki.length > 0 && <Komunikat rodzaj="ostrzezenie">Nie ma takiego pliku (mógł zostać usunięty).</Komunikat>}
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {zajety && <Komunikat rodzaj="info">{zajety}</Komunikat>}

      {zakladka === 'historia' ? <HistoriaOdczytow profil={profil} ludzie={ludzie} /> : (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setNadPolem(true) }} onDragLeave={() => setNadPolem(false)} onDrop={upusc}
            className={cn('flex flex-wrap items-center gap-3 rounded-lg border-2 border-dashed p-4 text-sm', nadPolem ? 'border-limonka bg-limonka-jasna' : 'border-slate-300 bg-white')}
          >
            <Button wariant="glowny" disabled={!!zajety} onClick={() => wybor.current?.click()}><FilePlus2 className="h-4 w-4" /> Dodaj pliki</Button>
            <span className="text-slate-600">albo przeciągnij je tutaj · PDF, skany, JPG / PNG, DOCX, XLSX / CSV, TXT, DXF · do {s.ustawienia.limity_planu?.plik_mb ?? 20} MB</span>
            <input ref={wybor} type="file" multiple accept={AKCEPTOWANE} className="hidden" onChange={(e) => { if (e.target.files?.length) void dodaj(e.target.files); e.target.value = '' }} />
            <input className="pole ml-auto w-64" placeholder="Szukaj pliku..." value={filtr} onChange={(e) => setFiltr(e.target.value)} />
          </div>
          <div className="sekcja overflow-x-auto p-0">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>{['Plik', 'Rodzaj', 'Stron', 'Język', 'Wersja edytowalna', 'Koszt AI', 'Dodał', 'Dodano', ''].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr>
              </thead>
              <tbody>
                {widoczne.map((p) => {
                  const odczytane = numeryStron(p.tresc?.strony ?? {}).length
                  const pl = numeryStron(p.tresc?.tlumaczenie ?? {}).length
                  return (
                    <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => otworz(p.id)}>
                      <td className="komorka font-medium text-slate-900">{p.nazwa_pliku}</td>
                      <td className="komorka">{ETYKIETY_RODZAJU[p.rodzaj]}</td>
                      <td className="komorka liczba">{p.stron ?? ''}</td>
                      <td className="komorka">{p.jezyk ? NAZWY_JEZYKOW[p.jezyk] ?? p.jezyk : ''}</td>
                      <td className="komorka text-xs">{odczytane ? `${odczytane} str.${pl ? `, po polsku ${pl}` : ''}` : <span className="text-slate-400">brak</span>}</td>
                      <td className="komorka liczba">{koszty[p.id] ? `${liczba(koszty[p.id], 2)} zł` : ''}</td>
                      <td className="komorka text-xs">{p.utworzyl ? ludzie[p.utworzyl] ?? '' : ''}</td>
                      <td className="komorka text-xs">{data(p.utworzono)}</td>
                      <td className="komorka" onClick={(e) => e.stopPropagation()}>
                        {mozeUsunac(p) && <button title="Usuń plik" className="text-slate-400 hover:text-red-600" onClick={() => void usun(p)}><Trash2 className="h-4 w-4" /></button>}
                      </td>
                    </tr>
                  )
                })}
                {!widoczne.length && <tr><td className="komorka text-slate-500" colSpan={9}>{pliki.length ? 'Brak plików pasujących do wyszukiwania.' : 'Nie dodano jeszcze żadnych plików.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
