import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { grupujDoPorownania, wczytajCeny, type WierszCeny } from '@/lib/bazaCen'
import { Komunikat } from '../ui/komunikat'
import { kolumnyCen } from './Porownywarka'
import { Tabela } from '../ui/Tabela'
import { t } from '@/i18n'

interface ZapytanieListy { id: string; numer: string; przedmiot: string }

/** Wszystkie oferty zebrane do zapytania ZO, pogrupowane wg pozycji: najlepsza cena i najkrótszy termin. */
export function OfertyDoZapytania({ zapytanieId: poczatkowe }: { zapytanieId?: string | null }) {
  const [zapytania, setZapytania] = useState<ZapytanieListy[]>([])
  const [wybrane, setWybrane] = useState<string>(poczatkowe ?? '')
  const [wiersze, setWiersze] = useState<WierszCeny[]>([])
  const [blad, setBlad] = useState<string | null>(null)

  useEffect(() => {
    void supabase.from('zapytania').select('id, numer, przedmiot').order('utworzono', { ascending: false })
      .then(({ data }) => setZapytania((data ?? []) as ZapytanieListy[]))
  }, [])

  useEffect(() => {
    if (!wybrane) { setWiersze([]); return }
    void wczytajCeny({ zapytanieId: wybrane }).then(({ wiersze: w, blad: b }) => { setWiersze(w); setBlad(b) })
  }, [wybrane])

  const grupy = useMemo(() => grupujDoPorownania(wiersze), [wiersze])
  const dostawcow = new Set(wiersze.map((w) => w.dostawca)).size

  return (
    <div className="space-y-3">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      <label className="block max-w-xl">
        <span className="etykieta">{t('Zapytanie ofertowe')}</span>
        <select className="pole" value={wybrane} onChange={(e) => setWybrane(e.target.value)}>
          <option value="">{t('- wybierz ZO -')}</option>
          {zapytania.map((z) => <option key={z.id} value={z.id}>{z.numer} - {z.przedmiot}</option>)}
        </select>
      </label>
      {wybrane && (
        <p className="text-sm text-slate-600">
          {wiersze.length} {t('pozycji ofert od')}{' '}{dostawcow} {t('dostawców,')}{' '}{grupy.length} {t('grup. Ceny w PLN wg kursu NBP z dnia oferty.')}
          <span className="ml-2 rounded bg-limonka-jasna px-1">{t('najniższa cena')}</span>
          <span className="ml-1 rounded bg-blekit-jasny px-1">{t('najkrótszy termin')}</span>
        </p>
      )}
      {grupy.map((g) => (
        <section key={g.klucz} className="sekcja space-y-2">
          <h3 className="text-sm font-semibold">{g.nazwa}</h3>
          <Tabela id="oferty-do-zapytania" kolumny={kolumnyCen({ miara: g.miara === 'kg' ? 'cena_pln_kg' : 'cena_pln_szt', najtansza: g.najtansza, najszybsza: g.najszybsza, bezZrodla: true })}
            wiersze={g.wiersze} klucz={(w) => w.klucz} bezPaska />
        </section>
      ))}
      {wybrane && grupy.length === 0 && <p className="text-sm text-slate-500">{t('Brak zatwierdzonych ofert powiązanych z tym zapytaniem.')}</p>}
    </div>
  )
}
