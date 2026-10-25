import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { liczba } from '@/lib/format'
import { NAZWY_JEZYKOW } from '@/lib/wersjeEdytowalne'
import type { Profil } from '@/lib/types'
import { Komunikat } from '../ui/komunikat'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'

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

  type Osoba = (typeof podsumowanie)[number]
  const kolumnyOsob: KolumnaTabeli<Osoba>[] = [
    { id: 'osoba', naglowek: 'Pracownik', typ: 'lista', wartosc: (x) => nazwa(x.u || null), className: 'font-medium' },
    { id: 'tekst', naglowek: 'Bez AI', typ: 'liczba', wartosc: (x) => x.tekst },
    { id: 'ai', naglowek: 'Odczyty AI', typ: 'liczba', wartosc: (x) => x.ai },
    { id: 'tl', naglowek: 'Tłumaczenia', typ: 'liczba', wartosc: (x) => x.tlumaczenie },
    { id: 'koszt', naglowek: 'Koszt AI', typ: 'liczba', wartosc: (x) => x.koszt, komorka: (x) => `${liczba(x.koszt, 2)} zł` },
    {
      id: 'rozliczenie', naglowek: profil.rola === 'administrator' ? 'Rozliczenie AI (z nieudanymi)' : 'Rozliczenie AI', typ: 'liczba', wartosc: (x) => x.rozliczenie, className: 'text-xs text-slate-600',
      komorka: (x) => (x.rozliczenie === null ? '-' : `${liczba(x.rozliczenie, 2)} zł${x.nieudane ? ` (nieudanych: ${x.nieudane})` : ''}`),
    },
  ]
  const kolumnyOdczytow: KolumnaTabeli<Odczyt>[] = [
    { id: 'kiedy', naglowek: 'Kiedy', typ: 'data', wartosc: (o) => o.utworzono, komorka: (o) => new Date(o.utworzono).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }), className: 'whitespace-nowrap text-xs' },
    { id: 'kto', naglowek: 'Kto', typ: 'lista', wartosc: (o) => nazwa(o.utworzyl), className: 'text-xs' },
    { id: 'plik', naglowek: 'Plik', typ: 'tekst', wartosc: (o) => o.nazwa_pliku, komorka: (o) => <>{o.nazwa_pliku}{!o.plik_id && <span className="text-xs text-slate-400"> (usunięty)</span>}</> },
    { id: 'co', naglowek: 'Co', typ: 'lista', wartosc: (o) => RODZAJ[o.rodzaj], komorka: (o) => `${RODZAJ[o.rodzaj]}${o.obszarow ? `, ${o.obszarow} zazn.` : ''}`, className: 'text-xs' },
    { id: 'strony', naglowek: 'Strony', typ: 'tekst', wartosc: (o) => strony(o.strony), className: 'text-xs' },
    { id: 'jezyk', naglowek: 'Język', typ: 'lista', wartosc: (o) => (o.jezyk ? NAZWY_JEZYKOW[o.jezyk] ?? o.jezyk : null), className: 'text-xs' },
    { id: 'model', naglowek: 'Model', typ: 'lista', wartosc: (o) => o.model, className: 'text-xs text-slate-500' },
    { id: 'koszt', naglowek: 'Koszt', typ: 'liczba', wartosc: (o) => Number(o.koszt_pln), komorka: (o) => (Number(o.koszt_pln) ? `${liczba(Number(o.koszt_pln), 2)} zł` : '0') },
  ]

  return (
    <div className="space-y-4">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><span>Miesiąc</span>
          <input type="month" className="pole w-40" value={miesiac} onChange={(e) => e.target.value && setMiesiac(e.target.value)} /></label>
        <span className="text-sm text-slate-600">Razem AI w module: <strong>{liczba(razem, 2)} zł</strong> · odczytów: {odczyty.length}</span>
      </div>

      <Tabela id="historia-odczytow-osoby" kolumny={kolumnyOsob} wiersze={podsumowanie} klucz={(x) => x.u || '-'} pusto="Brak odczytów w tym miesiącu." />
      <Tabela id="historia-odczytow" kolumny={kolumnyOdczytow} wiersze={odczyty} klucz={(o) => o.id} pusto="Brak odczytów w tym miesiącu." />
    </div>
  )
}
