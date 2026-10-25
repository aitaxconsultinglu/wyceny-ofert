import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { liczba } from '@/lib/format'
import { NAZWY_JEZYKOW } from '@/lib/wersjeEdytowalne'
import type { Profil } from '@/lib/types'
import { Komunikat } from '../ui/komunikat'

interface Odczyt {
  id: string; plik_id: string | null; nazwa_pliku: string; rodzaj: 'tekst' | 'ai' | 'tlumaczenie'; strony: number[]; obszarow: number
  jezyk: string | null; model: string | null; koszt_pln: number; utworzyl: string | null; utworzono: string
}
interface Wywolanie { user_id: string | null; koszt_pln: number; status: string }

const RODZAJ: Record<Odczyt['rodzaj'], string> = { tekst: 'odczyt bez AI', ai: 'odczyt AI', tlumaczenie: 'tłumaczenie AI' }
const strony = (s: number[]) => (s.length > 6 ? `${s.length} stron` : s.join(', '))

/** Dziennik modułu: kto, który plik, co (bez AI / AI / tłumaczenie), ile kosztowało; podsumowanie miesiąca na osobę. */
export function HistoriaOdczytow({ profil, ludzie }: { profil: Profil; ludzie: Record<string, string> }) {
  const [miesiac, setMiesiac] = useState(() => new Date().toISOString().slice(0, 7))
  const [odczyty, setOdczyty] = useState<Odczyt[]>([])
  const [wywolania, setWywolania] = useState<Wywolanie[]>([])
  const [blad, setBlad] = useState<string | null>(null)

  useEffect(() => {
    const [r, m] = miesiac.split('-').map(Number)
    const od = new Date(r, m - 1, 1).toISOString()
    const doDaty = new Date(r, m, 1).toISOString()
    void Promise.all([
      supabase.from('odczyty_plikow').select('*').gte('utworzono', od).lt('utworzono', doDaty).order('utworzono', { ascending: false }).limit(1000),
      // Rozliczenie AI modułu (z nieudanymi wywołaniami): administrator widzi wszystkich, pozostali - siebie.
      supabase.from('ai_uzycie').select('user_id, koszt_pln, status').in('tryb', ['odczytaj_dokument', 'przetlumacz_dokument']).gte('utworzono', od).lt('utworzono', doDaty),
    ]).then(([o, w]) => {
      setBlad(o.error ? komunikatPL(o.error.message) : null)
      setOdczyty((o.data ?? []) as Odczyt[])
      setWywolania((w.data ?? []) as Wywolanie[])
    })
  }, [miesiac])

  const osoby = [...new Set(odczyty.map((o) => o.utworzyl ?? ''))]
  const podsumowanie = osoby.map((u) => {
    const moje = odczyty.filter((o) => (o.utworzyl ?? '') === u)
    const ai = wywolania.filter((w) => (w.user_id ?? '') === u)
    return {
      u, tekst: moje.filter((o) => o.rodzaj === 'tekst').length, ai: moje.filter((o) => o.rodzaj === 'ai').length,
      tlumaczenie: moje.filter((o) => o.rodzaj === 'tlumaczenie').length, koszt: moje.reduce((s, o) => s + Number(o.koszt_pln), 0),
      rozliczenie: ai.length ? ai.reduce((s, w) => s + Number(w.koszt_pln), 0) : null, nieudane: ai.filter((w) => w.status !== 'ok').length,
    }
  }).sort((a, b) => b.koszt - a.koszt)
  const nazwa = (u: string | null) => (u ? ludzie[u] ?? 'konto usunięte' : 'konto usunięte')
  const razem = podsumowanie.reduce((s, x) => s + x.koszt, 0)

  return (
    <div className="space-y-4">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><span>Miesiąc</span>
          <input type="month" className="pole w-40" value={miesiac} onChange={(e) => e.target.value && setMiesiac(e.target.value)} /></label>
        <span className="text-sm text-slate-600">Razem AI w module: <strong>{liczba(razem, 2)} zł</strong> · odczytów: {odczyty.length}</span>
      </div>

      <section className="sekcja overflow-x-auto p-0">
        <table className="w-full border-collapse text-sm">
          <thead><tr>{['Pracownik', 'Bez AI', 'Odczyty AI', 'Tłumaczenia', 'Koszt AI', profil.rola === 'administrator' ? 'Rozliczenie AI (z nieudanymi)' : 'Rozliczenie AI'].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
          <tbody>
            {podsumowanie.map((x) => (
              <tr key={x.u}>
                <td className="komorka font-medium">{nazwa(x.u || null)}</td>
                <td className="komorka liczba">{x.tekst}</td>
                <td className="komorka liczba">{x.ai}</td>
                <td className="komorka liczba">{x.tlumaczenie}</td>
                <td className="komorka liczba">{liczba(x.koszt, 2)} zł</td>
                <td className="komorka liczba text-xs text-slate-600">{x.rozliczenie === null ? '-' : `${liczba(x.rozliczenie, 2)} zł${x.nieudane ? ` (nieudanych: ${x.nieudane})` : ''}`}</td>
              </tr>
            ))}
            {!podsumowanie.length && <tr><td className="komorka text-slate-500" colSpan={6}>Brak odczytów w tym miesiącu.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="sekcja overflow-x-auto p-0">
        <table className="w-full border-collapse text-sm">
          <thead><tr>{['Kiedy', 'Kto', 'Plik', 'Co', 'Strony', 'Język', 'Model', 'Koszt'].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
          <tbody>
            {odczyty.map((o) => (
              <tr key={o.id}>
                <td className="komorka whitespace-nowrap text-xs">{new Date(o.utworzono).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="komorka text-xs">{nazwa(o.utworzyl)}</td>
                <td className="komorka">{o.nazwa_pliku}{!o.plik_id && <span className="text-xs text-slate-400"> (usunięty)</span>}</td>
                <td className="komorka text-xs">{RODZAJ[o.rodzaj]}{o.obszarow ? `, ${o.obszarow} zazn.` : ''}</td>
                <td className="komorka text-xs">{strony(o.strony)}</td>
                <td className="komorka text-xs">{o.jezyk ? NAZWY_JEZYKOW[o.jezyk] ?? o.jezyk : ''}</td>
                <td className="komorka text-xs text-slate-500">{o.model ?? ''}</td>
                <td className="komorka liczba">{Number(o.koszt_pln) ? `${liczba(Number(o.koszt_pln), 2)} zł` : '0'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
