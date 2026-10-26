import { ArrowLeft, ArrowRight, Plus, Trash2, X } from 'lucide-react'
import { tabelaWlasna, type TabelaWlasna } from '@/lib/rysunki'
import { Button } from '../ui/button'
import { t } from '@/i18n'

/**
 * Własne tabele odczytu: dowolny zestaw kolumn (zmiana nazwy, dodanie, usunięcie, przesunięcie kolumny) i wierszy.
 * Kolumny zapisują się w odczycie razem z wierszami.
 */
export function TabeleWlasne({ tabele, zmien, tylkoOdczyt }: { tabele: TabelaWlasna[]; zmien: (t: TabelaWlasna[]) => void; tylkoOdczyt: boolean }) {
  const ust = (i: number, zm: Partial<TabelaWlasna>) => zmien(tabele.map((x, j) => (j === i ? { ...x, ...zm } : x)))
  const przesunKolumne = (i: number, k: number, kier: -1 | 1) => {
    const tb = tabele[i]
    const n = k + kier
    if (n < 0 || n >= tb.kolumny.length) return
    const zamien = <T,>(l: T[]) => { const c = [...l]; [c[k], c[n]] = [c[n], c[k]]; return c }
    ust(i, { kolumny: zamien(tb.kolumny), wiersze: tb.wiersze.map(zamien) })
  }
  return (
    <div className="space-y-3">
      {tabele.map((tb, i) => (
        <section key={tb.id} className="space-y-1 rounded-lg border border-slate-200 bg-white p-2">
          <div className="flex items-center gap-2">
            <input className="pole w-72 text-sm font-semibold" value={tb.nazwa} disabled={tylkoOdczyt} onChange={(e) => ust(i, { nazwa: e.target.value })} />
            <span className="text-xs text-slate-500">{t('{0} kol. · {1} wierszy', tb.kolumny.length, tb.wiersze.length)}</span>
            {!tylkoOdczyt && <button className="ml-auto text-slate-400 hover:text-red-600" title={t('Usuń tabelę')} onClick={() => { if (window.confirm(t('Usunąć tabelę {0}?', tb.nazwa))) zmien(tabele.filter((_, j) => j !== i)) }}><Trash2 className="h-4 w-4" /></button>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {tb.kolumny.map((k, ki) => (
                    <th key={ki} className="komorka-naglowek text-xs">
                      <div className="flex items-center gap-0.5">
                        <input className="pole-komorki min-w-[6rem] text-xs font-semibold" value={k} disabled={tylkoOdczyt}
                          onChange={(e) => ust(i, { kolumny: tb.kolumny.map((x, j) => (j === ki ? e.target.value : x)) })} />
                        {!tylkoOdczyt && (
                          <>
                            <button className="text-slate-400 hover:text-slate-700" title={t('Przesuń w lewo')} onClick={() => przesunKolumne(i, ki, -1)}><ArrowLeft className="h-3 w-3" /></button>
                            <button className="text-slate-400 hover:text-slate-700" title={t('Przesuń w prawo')} onClick={() => przesunKolumne(i, ki, 1)}><ArrowRight className="h-3 w-3" /></button>
                            <button className="text-slate-400 hover:text-red-600" title={t('Usuń kolumnę')} onClick={() => ust(i, { kolumny: tb.kolumny.filter((_, j) => j !== ki), wiersze: tb.wiersze.map((w) => w.filter((_, j) => j !== ki)) })}><X className="h-3 w-3" /></button>
                          </>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="komorka-naglowek w-8">
                    {!tylkoOdczyt && <button title={t('Dodaj kolumnę')} className="text-slate-500 hover:text-blekit-ciemny" onClick={() => ust(i, { kolumny: [...tb.kolumny, `${t('Kolumna')} ${tb.kolumny.length + 1}`], wiersze: tb.wiersze.map((w) => [...w, '']) })}><Plus className="h-3.5 w-3.5" /></button>}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tb.wiersze.map((w, wi) => (
                  <tr key={wi} className={w.some((k) => k.includes('(?)')) ? 'bg-amber-50' : undefined}>
                    {tb.kolumny.map((_, ki) => (
                      <td key={ki} className="komorka">
                        <input className="pole-komorki text-xs" value={w[ki] ?? ''} disabled={tylkoOdczyt}
                          onChange={(e) => ust(i, { wiersze: tb.wiersze.map((x, j) => (j === wi ? tb.kolumny.map((__, c) => (c === ki ? e.target.value : x[c] ?? '')) : x)) })} />
                      </td>
                    ))}
                    <td className="komorka w-8">{!tylkoOdczyt && <button title={t('Usuń wiersz')} className="text-slate-400 hover:text-red-600" onClick={() => ust(i, { wiersze: tb.wiersze.filter((_, j) => j !== wi) })}><Trash2 className="h-3.5 w-3.5" /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!tylkoOdczyt && <Button rozmiar="maly" onClick={() => ust(i, { wiersze: [...tb.wiersze, tb.kolumny.map(() => '')] })}><Plus className="h-3 w-3" /> {t('wiersz')}</Button>}
        </section>
      ))}
      {tabele.length === 0 && <p className="text-sm text-slate-500">{t('Brak własnych tabel - zaznacz fragment jako „Własna tabela” i odczytaj go, albo dodaj pustą tabelę.')}</p>}
      {!tylkoOdczyt && (
        <Button rozmiar="maly" onClick={() => zmien([...tabele, tabelaWlasna([], { nazwa: t('Nowa tabela'), kolumny: [t('Kolumna 1'), t('Kolumna 2')] })])}>
          <Plus className="h-3 w-3" /> {t('Pusta tabela')}
        </Button>
      )}
    </div>
  )
}
