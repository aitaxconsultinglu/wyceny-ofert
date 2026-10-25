import { cn } from '@/lib/utils'
import type { BlokDokumentu } from '@/lib/wersjeEdytowalne'

const WYR = { lewo: 'text-left', srodek: 'text-center', prawo: 'text-right', wyjustowane: 'text-justify' } as const
const NAGL = ['text-xl', 'text-lg', 'text-base'] as const

/** Wersja edytowalna w przeglądarce - tak jak trafi do Worda (nagłówki, akapity, listy, tabele). */
export function PodgladBlokow({ bloki }: { bloki: BlokDokumentu[] }) {
  if (!bloki.length) return <p className="text-sm text-slate-500">Brak treści.</p>
  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-800">
      {bloki.map((b, i) => {
        const styl = cn(WYR[b.wyrownanie], b.pogrubiony && 'font-semibold', b.kursywa && 'italic')
        if (b.typ === 'naglowek') return <p key={i} className={cn(styl, 'font-semibold text-slate-900', NAGL[Math.min(3, Math.max(1, b.poziom)) - 1])}>{b.tekst}</p>
        if (b.typ === 'lista') return <ul key={i} className="list-disc space-y-0.5 pl-5">{b.elementy.map((e, j) => <li key={j} className="whitespace-pre-wrap">{e}</li>)}</ul>
        if (b.typ === 'tabela') {
          return (
            <div key={i} className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {b.wiersze.map((w, r) => (
                    <tr key={r} className={cn(b.naglowek_tabeli && r === 0 && 'bg-slate-100 font-semibold')}>
                      {w.map((k, c) => <td key={c} className="komorka whitespace-pre-wrap align-top">{k}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        return <p key={i} className={cn(styl, 'whitespace-pre-wrap', b.typ === 'podpis' && 'text-xs italic text-slate-600')}>{b.tekst}</p>
      })}
    </div>
  )
}
