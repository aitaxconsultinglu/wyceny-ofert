import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { liczba } from '@/lib/format'
import { cn } from '@/lib/utils'
import { kompletnosc, szablonDlaTypu, wierszElementu } from '@/lib/szablony'
import { zebraneOdczyty } from '@/lib/wycenaMaterialowa'
import { masaZParametrow } from '@/lib/odczytTekstowy'
import type { KrociecRysunku, ParametrRysunku } from '@/lib/rysunki'
import type { Aparat } from '@/lib/wyceny'
import { Button } from '../ui/button'
import { t } from '@/i18n'

/**
 * Etap 1: kompletność listy materiałów wg szablonu typu aparatu (wymiennik / zbiornik) i parametry projektu
 * odczytane z rysunków zapytania (dane projektowe, króćce, masa pusta) - obok listy materiałów.
 */
export function SzablonIParametry({ aparat, zapytanieId, masaPozycji, tylkoOdczyt, zmien }: {
  aparat: Aparat
  zapytanieId: string
  masaPozycji: number
  tylkoOdczyt: boolean
  zmien: (f: (a: Aparat) => Aparat) => void
}) {
  const szablon = szablonDlaTypu(aparat.typ)
  const [parametry, setParametry] = useState<ParametrRysunku[]>([])
  const [krocce, setKrocce] = useState<KrociecRysunku[]>([])
  const [rozwiniete, setRozwiniete] = useState(false)

  useEffect(() => {
    void zebraneOdczyty(zapytanieId).then((o) => { setParametry(o.parametry); setKrocce(o.krocce) })
  }, [zapytanieId])

  const stan = szablon ? kompletnosc(aparat.pozycje, szablon) : []
  const braki = stan.filter((x) => x.brak)
  const masaRysunku = masaZParametrow(parametry)

  function dodajBraki() {
    if (!szablon) return
    zmien((a) => ({ ...a, pozycje: [...a.pozycje, ...braki.map((b) => wierszElementu(b.element))] }))
  }

  return (
    <section className="sekcja space-y-2 p-3 text-sm">
      {szablon ? (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{t('Szablon:')}{' '}{szablon.nazwa}</span>
            <span className="text-slate-500">{stan.filter((x) => x.pozycji > 0).length} z {stan.length} {t('elementów ma pozycje')}{braki.length ? t(', brak {0} wymaganych', braki.length) : ''}</span>
            {!tylkoOdczyt && braki.length > 0 && <Button rozmiar="maly" onClick={dodajBraki}><Plus className="h-3 w-3" /> {t('Dodaj brakujące elementy')}</Button>}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {stan.map((x) => (
              <span key={x.element.kod} title={x.element.wymagany ? t('element wymagany') : t('element opcjonalny')}
                className={cn('rounded px-1.5 py-0.5 text-xs ring-1',
                  x.brak ? 'bg-red-50 text-red-800 ring-red-300' : x.pozycji === 0 ? 'bg-slate-50 text-slate-400 ring-slate-200'
                    : x.zWartoscia === x.pozycji ? 'bg-limonka-jasna text-slate-800 ring-limonka' : 'bg-amber-50 text-amber-800 ring-amber-300')}>
                {x.element.nazwa}{x.pozycji ? ` (${x.zWartoscia}/${x.pozycji})` : x.brak ? t(' - brak') : ''}
              </span>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">{t('(n/m) = pozycje z ilością i ceną / wszystkie pozycje elementu. Żółte - do uzupełnienia, czerwone - brak wymaganego elementu.')}</p>
        </div>
      ) : (
        <p className="text-slate-500">{t('Szablon materiałów jest dla wymienników i zbiorników - wybierz typ aparatu, aby sprawdzić kompletność listy.')}</p>
      )}
      <div className="border-t border-slate-100 pt-2">
        <button className="flex items-center gap-1 font-semibold" onClick={() => setRozwiniete(!rozwiniete)}>
          {rozwiniete ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {t('Parametry projektu z rysunków (')}{parametry.length}{krocce.length ? t(', króćców {0}', krocce.length) : ''})
        </button>
        <p className="text-xs text-slate-600">
          {t('Masa pusta z rysunku:')}{' '}<strong>{masaRysunku ? `${liczba(masaRysunku, 0)} kg` : 'brak'}</strong> {t('· suma mas pozycji:')}{' '}<strong>{liczba(masaPozycji, 0)} kg</strong>
          {masaRysunku && masaPozycji > 0 ? t(' ({0}% masy z rysunku)', liczba((masaPozycji / masaRysunku) * 100, 0)) : ''}
        </p>
        {rozwiniete && (
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <table className="w-full border-collapse text-xs">
              <tbody>
                {parametry.map((p, i) => <tr key={i}><td className="komorka">{p.nazwa}</td><td className="komorka">{p.wartosc} {p.jednostka ?? ''}</td></tr>)}
                {!parametry.length && <tr><td className="komorka text-slate-500">{t('Brak odczytanych parametrów - odczytaj rysunki (Wycena materiałowa albo Rysunki i listy).')}</td></tr>}
              </tbody>
            </table>
            {krocce.length > 0 && (
              <table className="w-full border-collapse text-xs">
                <thead><tr>{[t('Poz.'), t('Ilość'), t('Wielkość'), 'PN', t('Typ'), t('Przeznaczenie')].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
                <tbody>{krocce.map((k, i) => <tr key={i}><td className="komorka">{k.oznaczenie}</td><td className="komorka">{k.ilosc ?? ''}</td><td className="komorka">{k.dn ?? ''}</td><td className="komorka">{k.pn ?? ''}</td><td className="komorka">{k.przylacze ?? ''}</td><td className="komorka">{k.przeznaczenie ?? ''}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
