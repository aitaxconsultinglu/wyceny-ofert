import { useEffect, useMemo, useState } from 'react'
import { Plus, Save, Trash2, Undo2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'

type Wiersz = Record<string, unknown>

export interface Kolumna {
  pole: string
  etykieta: string
  typ: 'tekst' | 'liczba' | 'bool' | 'wybor' | 'data'
  opcje?: { wartosc: string; etykieta: string }[]
  /** Pole klucza: wpisywane tylko w nowym wierszu (zmiana klucza zerwałaby powiązania). */
  tylkoNowy?: boolean
  wymagane?: boolean
  /** Pusta wartość zapisywana jako null (np. MPK opcjonalne). */
  pusteNull?: boolean
  szer?: string
  podpowiedz?: string
}

interface Props {
  tabela: string
  /** Klucz główny. Przy `kluczGenerowany` baza nadaje go sama (identity). */
  klucz: string
  kluczGenerowany?: boolean
  kolumny: Kolumna[]
  wiersze: Wiersz[]
  nowyWiersz: () => Wiersz
  poZapisie: () => Promise<void> | void
  /** Pozwala zablokować usunięcie wiersza (np. stawka domyślna). */
  mozeUsunac?: (w: Wiersz) => string | null
}

interface Edytowany { dane: Wiersz; nowy: boolean; zmieniony: boolean; tmp: string }

let licznik = 0
const tmpKlucz = () => `nowy-${++licznik}`

/** Edytowalna tabela słownika: zmiany zbierane lokalnie i zapisywane jednym przyciskiem. */
export function TabelaSlownika({ tabela, klucz, kluczGenerowany, kolumny, wiersze, nowyWiersz, poZapisie, mozeUsunac }: Props) {
  const zWierszy = useMemo(() => wiersze.map((w) => ({ dane: { ...w }, nowy: false, zmieniony: false, tmp: tmpKlucz() })), [wiersze])
  const [edytowane, setEdytowane] = useState<Edytowany[]>(zWierszy)
  const [blad, setBlad] = useState<string | null>(null)
  const [komunikat, setKomunikat] = useState<string | null>(null)
  const [zajety, setZajety] = useState(false)

  useEffect(() => { setEdytowane(zWierszy) }, [zWierszy])

  const zmiany = edytowane.filter((e) => e.zmieniony || e.nowy).length

  function ustaw(tmp: string, pole: string, wartosc: unknown) {
    setEdytowane((lista) => lista.map((e) => (e.tmp === tmp ? { ...e, zmieniony: true, dane: { ...e.dane, [pole]: wartosc } } : e)))
    setKomunikat(null)
  }

  async function zapisz() {
    setBlad(null); setKomunikat(null)
    for (const e of edytowane.filter((x) => x.nowy || x.zmieniony)) {
      for (const k of kolumny.filter((x) => x.wymagane)) {
        const w = e.dane[k.pole]
        if (w === null || w === undefined || String(w).trim() === '') {
          setBlad(`Uzupełnij pole „${k.etykieta}” we wszystkich zmienionych wierszach.`)
          return
        }
      }
    }
    setZajety(true)
    const przygotuj = (d: Wiersz) => {
      const wynik: Wiersz = {}
      for (const k of kolumny) {
        let w = d[k.pole]
        if (typeof w === 'string') w = w.trim()
        if (k.pusteNull && (w === '' || w === undefined)) w = null
        wynik[k.pole] = w
      }
      return wynik
    }
    for (const e of edytowane) {
      if (e.nowy) {
        const dane = przygotuj(e.dane)
        if (kluczGenerowany) delete dane[klucz]
        const { error } = await supabase.from(tabela).insert(dane)
        if (error) { setZajety(false); setBlad(komunikatPL(error.message)); return }
      } else if (e.zmieniony) {
        const dane = przygotuj(e.dane)
        delete dane[klucz]
        const { error } = await supabase.from(tabela).update(dane).eq(klucz, e.dane[klucz] as string)
        if (error) { setZajety(false); setBlad(komunikatPL(error.message)); return }
      }
    }
    setZajety(false)
    setKomunikat('Zapisano zmiany.')
    await poZapisie()
  }

  async function usun(e: Edytowany) {
    if (e.nowy) { setEdytowane((l) => l.filter((x) => x.tmp !== e.tmp)); return }
    const zakaz = mozeUsunac?.(e.dane)
    if (zakaz) { setBlad(zakaz); return }
    if (!window.confirm('Usunąć ten wpis ze słownika?')) return
    setBlad(null); setZajety(true)
    const { error } = await supabase.from(tabela).delete().eq(klucz, e.dane[klucz] as string)
    setZajety(false)
    if (error) { setBlad(komunikatPL(error.message)); return }
    await poZapisie()
  }

  const typy = { tekst: 'tekst', liczba: 'liczba', bool: 'tak_nie', wybor: 'lista', data: 'data' } as const
  const kolumnyTabeli: KolumnaTabeli<Edytowany>[] = [
    ...kolumny.map((k): KolumnaTabeli<Edytowany> => ({
      id: k.pole, naglowek: k.etykieta, title: k.podpowiedz, typ: typy[k.typ], naglowekClassName: k.szer,
      className: k.typ === 'bool' ? 'text-center' : undefined,
      wartosc: (e) => (k.typ === 'wybor' ? k.opcje?.find((o) => o.wartosc === String(e.dane[k.pole] ?? ''))?.etykieta ?? e.dane[k.pole] : e.dane[k.pole]),
      komorka: (e) => {
        const w = e.dane[k.pole]
        const zablokowane = k.tylkoNowy && !e.nowy
        return k.typ === 'bool' ? (
          <input type="checkbox" checked={Boolean(w)} onChange={(x) => ustaw(e.tmp, k.pole, x.target.checked)} />
        ) : k.typ === 'liczba' ? (
          <PoleLiczby wartosc={(w as number | null) ?? null} puste={k.pusteNull} zmien={(n) => ustaw(e.tmp, k.pole, n)} disabled={zablokowane} />
        ) : k.typ === 'wybor' ? (
          <select className="pole-komorki" value={String(w ?? '')} disabled={zablokowane} onChange={(x) => ustaw(e.tmp, k.pole, x.target.value)}>
            {k.pusteNull && <option value="">-</option>}
            {k.opcje?.map((o) => <option key={o.wartosc} value={o.wartosc}>{o.etykieta}</option>)}
          </select>
        ) : (
          <input className="pole-komorki" type={k.typ === 'data' ? 'date' : 'text'} value={String(w ?? '')} disabled={zablokowane} onChange={(x) => ustaw(e.tmp, k.pole, x.target.value)} />
        )
      },
    })),
    {
      id: '_usun', naglowek: '', typ: 'tekst', wartosc: () => '', bezFiltra: true, bezSortu: true, className: 'w-10 text-center',
      komorka: (e) => <button className="text-slate-400 hover:text-red-600" title="Usuń" onClick={() => void usun(e)}><Trash2 className="h-4 w-4" /></button>,
    },
  ]

  return (
    <div className="space-y-3">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {komunikat && <Komunikat rodzaj="sukces">{komunikat}</Komunikat>}
      <Tabela id={`slownik-${tabela}`} kolumny={kolumnyTabeli} wiersze={edytowane} klucz={(e) => e.tmp}
        klasaWiersza={(e) => (e.nowy ? 'bg-limonka-jasna/40' : e.zmieniony ? 'bg-amber-50' : undefined)} pusto="Brak wpisów." />
      <div className="flex flex-wrap gap-2">
        <Button rozmiar="maly" onClick={() => setEdytowane((l) => [...l, { dane: nowyWiersz(), nowy: true, zmieniony: false, tmp: tmpKlucz() }])}>
          <Plus className="h-4 w-4" /> Dodaj wiersz
        </Button>
        <Button rozmiar="maly" wariant="glowny" disabled={zajety || zmiany === 0} onClick={() => void zapisz()}>
          <Save className="h-4 w-4" /> Zapisz zmiany{zmiany ? ` (${zmiany})` : ''}
        </Button>
        {zmiany > 0 && (
          <Button rozmiar="maly" wariant="cichy" onClick={() => setEdytowane(zWierszy)}>
            <Undo2 className="h-4 w-4" /> Cofnij
          </Button>
        )}
      </div>
    </div>
  )
}
