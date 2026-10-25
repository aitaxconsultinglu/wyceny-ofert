import { useState } from 'react'
import { Cylinder, Save, Thermometer } from 'lucide-react'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import { RODZAJE_APARATU, ZAKRESY_WYMIENNIKA, etykietaRodzaju, type RodzajAparatu, type ZakresWymiennika } from '@/lib/zapytania'

export const IkonaRodzaju = ({ rodzaj, className }: { rodzaj: RodzajAparatu | null | undefined; className?: string }) =>
  rodzaj === 'zbiornik' ? <Cylinder className={cn('h-4 w-4 text-blekit-ciemny', className)} />
    : rodzaj === 'wymiennik' ? <Thermometer className={cn('h-4 w-4 text-amber-700', className)} /> : null

export function ZnacznikRodzaju({ rodzaj, zakres, opis }: { rodzaj: RodzajAparatu | null; zakres?: ZakresWymiennika | null; opis?: string | null }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-xs', !rodzaj && 'text-red-700')}>
      <IkonaRodzaju rodzaj={rodzaj} />{etykietaRodzaju(rodzaj, zakres, opis)}
    </span>
  )
}

export interface WyborRodzaju { rodzaj: RodzajAparatu | null; zakres: ZakresWymiennika | null; opis: string }

/** Wybór rodzaju aparatu: zbiornik albo wymiennik ciepła (z zakresem). Pierwsze pole nowego zapytania i karta zapytania. */
export function PoleRodzajuAparatu({ wartosc, zmien, disabled }: { wartosc: WyborRodzaju; zmien: (w: WyborRodzaju) => void; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {RODZAJE_APARATU.map((r) => (
          <button key={r.id} type="button" disabled={disabled}
            onClick={() => zmien({ rodzaj: r.id, zakres: r.id === 'wymiennik' ? wartosc.zakres ?? 'kompletny' : null, opis: r.id === 'wymiennik' ? wartosc.opis : '' })}
            className={cn('flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-semibold',
              wartosc.rodzaj === r.id ? 'border-limonka-ciemna bg-limonka-jasna text-slate-900' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400')}>
            <IkonaRodzaju rodzaj={r.id} className="h-5 w-5" /> {r.etykieta}
          </button>
        ))}
      </div>
      {wartosc.rodzaj === 'wymiennik' && (
        <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-2 text-sm">
          <span className="etykieta">Zakres</span>
          {ZAKRESY_WYMIENNIKA.map((z) => (
            <label key={z.id} className="flex items-start gap-2">
              <input type="radio" className="mt-1" disabled={disabled} checked={(wartosc.zakres ?? 'kompletny') === z.id} onChange={() => zmien({ ...wartosc, zakres: z.id })} />
              <span><strong>{z.etykieta}</strong> <span className="text-xs text-slate-500">- {z.opis}</span></span>
            </label>
          ))}
          {wartosc.zakres === 'czesc' && (
            <input className="pole" disabled={disabled} placeholder="jaka część (np. komora rozdzielcza, wężownica)" value={wartosc.opis} onChange={(e) => zmien({ ...wartosc, opis: e.target.value })} />
          )}
        </div>
      )}
    </div>
  )
}

/** Wybór rodzaju z przyciskiem zapisu (karta zapytania) - zapis dopiero po zatwierdzeniu, nie przy każdym kliknięciu. */
export function ZmianaRodzaju({ poczatkowy, zapisz }: { poczatkowy: WyborRodzaju; zapisz: (w: WyborRodzaju) => void }) {
  const [w, setW] = useState(poczatkowy)
  return (
    <div className="space-y-2">
      <PoleRodzajuAparatu wartosc={w} zmien={setW} />
      <Button wariant="glowny" rozmiar="maly" disabled={!w.rodzaj} onClick={() => zapisz(w)}><Save className="h-3 w-3" /> Zapisz rodzaj</Button>
    </div>
  )
}
