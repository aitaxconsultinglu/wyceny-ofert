import { useEffect, useRef, useState } from 'react'
import { History, Redo2, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cofnij, ponow, przejdzDo, useStanHistorii } from '@/lib/historia'
import { Button } from './button'

const godzina = (t: number) => new Date(t).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Cofnij / Ponów w nagłówku (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z) i lista kroków z możliwością cofnięcia do wybranego. */
export function PasekHistorii() {
  const h = useStanHistorii()
  const [panel, setPanel] = useState(false)
  const [blad, setBlad] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const wykonaj = async (f: () => Promise<string | null>) => { const b = await f(); setBlad(b && b !== 'Anulowano.' ? b : null) }

  useEffect(() => {
    const klawisz = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); void wykonaj(cofnij) }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); void wykonaj(ponow) }
    }
    window.addEventListener('keydown', klawisz)
    return () => window.removeEventListener('keydown', klawisz)
  }, [])
  useEffect(() => {
    if (!panel) return
    const klik = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setPanel(false) }
    document.addEventListener('mousedown', klik)
    return () => document.removeEventListener('mousedown', klik)
  }, [panel])

  if (!h.zakres) return null
  return (
    <div ref={ref} className="relative flex items-center gap-0.5">
      <Button wariant="cichy" rozmiar="maly" disabled={!h.doCofniecia} title={h.doCofniecia ? `Cofnij: ${h.doCofniecia.opis} (Ctrl+Z)` : 'Nic do cofnięcia'} onClick={() => void wykonaj(cofnij)}>
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button wariant="cichy" rozmiar="maly" disabled={!h.doPonowienia} title={h.doPonowienia ? `Ponów: ${h.doPonowienia.opis} (Ctrl+Y)` : 'Nic do ponowienia'} onClick={() => void wykonaj(ponow)}>
        <Redo2 className="h-4 w-4" />
      </Button>
      <Button wariant="cichy" rozmiar="maly" title="Historia zmian w tej sesji" disabled={!h.kroki.length} onClick={() => setPanel(!panel)}>
        <History className="h-4 w-4" />
      </Button>
      {blad && <span className="max-w-[16rem] truncate text-xs text-red-700" title={blad}>{blad}</span>}
      {panel && (
        <div className="absolute right-0 top-full z-40 mt-1 max-h-96 w-80 overflow-auto rounded-md border border-slate-200 bg-white p-1 text-xs shadow-lg">
          <p className="px-2 py-1 font-semibold text-slate-500">Historia zmian ({h.kroki.length}) - kliknij krok, żeby wrócić do stanu po nim</p>
          <button className={cn('block w-full rounded px-2 py-1 text-left hover:bg-slate-100', h.wskaznik === 0 && 'bg-limonka-jasna')} onClick={() => void wykonaj(() => przejdzDo(0))}>
            stan początkowy
          </button>
          {h.kroki.map((k, i) => (
            <button key={i} onClick={() => void wykonaj(() => przejdzDo(i + 1))}
              className={cn('flex w-full gap-2 rounded px-2 py-1 text-left hover:bg-slate-100', i + 1 === h.wskaznik && 'bg-limonka-jasna', i + 1 > h.wskaznik && 'text-slate-400')}>
              <span className="tabular-nums text-slate-400">{godzina(k.czas)}</span><span className="flex-1">{k.opis}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
