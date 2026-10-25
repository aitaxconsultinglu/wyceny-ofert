import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { dataGodzinaPL } from '@/lib/format'
import { filtryNaZapytanie, wczytajStan, zapiszStan, type StanTabeli } from '@/lib/tabela'
import { Komunikat } from '../ui/komunikat'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'
import { t } from '@/i18n'

interface Wpis {
  id: number
  tabela: string
  rekord_id: string | null
  akcja: string
  user_email: string | null
  zmiany: Record<string, unknown> | null
  czas: string
}

const AKCJE: Record<string, string> = {
  insert: t('dodanie'), update: t('zmiana'), delete: t('usunięcie'), do_kosza: t('do kosza'), przywrocenie: t('przywrócenie z kosza'),
  usuniecie_trwale: t('usunięcie trwałe'), usuniecie_automatyczne: t('czyszczenie kosza'),
}
const NA_STRONIE = 100

function opisZmian(w: Wpis) {
  if (!w.zmiany) return ''
  if (w.akcja !== 'update') return JSON.stringify(w.zmiany).slice(0, 160)
  return Object.entries(w.zmiany)
    .map(([k, v]) => {
      const { z, na } = v as { z: unknown; na: unknown }
      return `${k}: ${JSON.stringify(z)} → ${JSON.stringify(na)}`
    })
    .join('; ')
    .slice(0, 300)
}

const KOLUMNY: KolumnaTabeli<Wpis>[] = [
  { id: 'czas', naglowek: t('Kiedy'), typ: 'data', pole: 'czas', wartosc: (w) => w.czas, komorka: (w) => dataGodzinaPL(w.czas), className: 'whitespace-nowrap text-slate-600' },
  { id: 'kto', naglowek: t('Kto'), typ: 'tekst', pole: 'user_email', wartosc: (w) => w.user_email, komorka: (w) => w.user_email ?? <span className="text-slate-400">system</span> },
  { id: 'tabela', naglowek: t('Tabela'), typ: 'tekst', pole: 'tabela', wartosc: (w) => w.tabela },
  { id: 'rekord', naglowek: t('Rekord'), typ: 'tekst', pole: 'rekord_id', wartosc: (w) => w.rekord_id, className: 'text-slate-600' },
  { id: 'akcja', naglowek: t('Akcja'), typ: 'lista', pole: 'akcja', wartosc: (w) => w.akcja, komorka: (w) => AKCJE[w.akcja] ?? w.akcja, wartosciFiltra: Object.keys(AKCJE) },
  { id: 'zmiany', naglowek: t('Zmiany'), typ: 'tekst', wartosc: (w) => opisZmian(w), bezFiltra: true, bezSortu: true, className: 'font-mono text-xs text-slate-600' },
]

/** Zmiany z audit_log (zapisywane triggerami - kto, kiedy, co). Duży zbiór - filtry i sortowanie wykonuje baza. */
export function HistoriaZmian() {
  const [wpisy, setWpisy] = useState<Wpis[]>([])
  const [razem, setRazem] = useState(0)
  const [stan, setStan] = useState<StanTabeli>(() => wczytajStan('audyt'))
  const [strona, setStrona] = useState(0)
  const [blad, setBlad] = useState<string | null>(null)

  useEffect(() => {
    let q = supabase.from('audit_log').select('id, tabela, rekord_id, akcja, user_email, zmiany, czas', { count: 'exact' })
    q = filtryNaZapytanie(q, KOLUMNY, stan.sort.length ? stan : { ...stan, sort: [{ kol: 'czas', kier: 'malejaco' }] })
    void q.range(strona * NA_STRONIE, strona * NA_STRONIE + NA_STRONIE - 1).then(({ data, error, count }) => {
      if (error) setBlad(komunikatPL(error.message))
      else { setBlad(null); setWpisy((data ?? []) as Wpis[]); setRazem(count ?? 0) }
    })
  }, [stan, strona])

  return (
    <div className="space-y-3">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      <Tabela id="audyt" kolumny={KOLUMNY} wiersze={wpisy} klucz={(w) => w.id} pusto={t('Brak zmian.')}
        serwer={{ stan, zmien: (s) => { setStan(s); zapiszStan('audyt', s); setStrona(0) }, razem, strona, naStronie: NA_STRONIE, zmienStrone: setStrona }} />
    </div>
  )
}
