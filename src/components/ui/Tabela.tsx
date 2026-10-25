import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Filter, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  filtrAktywny, filtrujISortuj, przelaczSort, wartosciListy, wczytajStan, zapiszStan, PUSTY_STAN,
  type DefinicjaKolumny, type Filtr, type StanTabeli,
} from '@/lib/tabela'
import { t } from '@/i18n'

export interface KolumnaTabeli<T> extends DefinicjaKolumny<T> {
  naglowek: ReactNode
  /** Zawartość komórki (domyślnie wartość jako tekst) - może być polem edycji. */
  komorka?: (w: T, i: number) => ReactNode
  className?: string
  naglowekClassName?: string
  bezFiltra?: boolean
  bezSortu?: boolean
  title?: string
  /** Lista wartości filtra przy filtrowaniu po stronie bazy (w przeglądarce liczona z wierszy). */
  wartosciFiltra?: string[]
}

export interface TabelaSerwerowa {
  stan: StanTabeli
  zmien: (s: StanTabeli) => void
  razem: number
  strona: number
  naStronie: number
  zmienStrone: (n: number) => void
}

interface Props<T> {
  /** Identyfikator tabeli - zapamiętanie filtrów i sortowania per użytkownik. */
  id: string
  kolumny: KolumnaTabeli<T>[]
  wiersze: T[]
  klucz: (w: T, i: number) => string | number
  onKlik?: (w: T) => void
  klasaWiersza?: (w: T) => string | undefined
  zaznaczanie?: { zaznaczone: Set<string | number>; zmien: (s: Set<string | number>) => void }
  pusto?: ReactNode
  stopka?: ReactNode
  className?: string
  /** Filtrowanie i sortowanie robi baza (duże zbiory) - tabela tylko pokazuje i zgłasza stan. */
  serwer?: TabelaSerwerowa
  /** Pasek „X z Y wierszy · wyczyść filtry” (domyślnie widoczny). */
  bezPaska?: boolean
}

const tekstKomorki = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'tak' : 'nie') : String(v))

/**
 * Wspólna tabela aplikacji: w nagłówku każdej kolumny sortowanie (kliknięcie; Shift - kilka kolumn) i filtr zależny od typu
 * (tekst, zakres liczb, zakres dat, lista wartości z liczbą wystąpień, tak/nie). Ustawienia zapamiętane per użytkownik i tabela.
 * Edycja w komórkach, zaznaczanie wierszy i wiersze sum (stopka) działają jak w zwykłej tabeli.
 */
export function Tabela<T>({ id, kolumny, wiersze, klucz, onKlik, klasaWiersza, zaznaczanie, pusto, stopka, className, serwer, bezPaska }: Props<T>) {
  const [stanLokalny, setStanLokalny] = useState<StanTabeli>(() => (serwer ? PUSTY_STAN : wczytajStan(id)))
  const [otwarty, setOtwarty] = useState<string | null>(null)
  const stan = serwer?.stan ?? stanLokalny
  const zmienStan = (s: StanTabeli) => {
    if (serwer) serwer.zmien(s)
    else { setStanLokalny(s); zapiszStan(id, s) }
  }
  const widoczne = useMemo(() => (serwer ? wiersze : filtrujISortuj(wiersze, kolumny, stan)), [serwer, wiersze, kolumny, stan])
  const aktywnych = Object.entries(stan.filtry).filter(([k, f]) => kolumny.some((x) => x.id === k) && filtrAktywny(f)).length
  const razem = serwer?.razem ?? wiersze.length
  const kluczeWidocznych = widoczne.map((w, i) => klucz(w, i))
  const wszystkieZaznaczone = !!zaznaczanie && kluczeWidocznych.length > 0 && kluczeWidocznych.every((k) => zaznaczanie.zaznaczone.has(k))

  return (
    <div className={cn('space-y-1', className)}>
      {!bezPaska && (aktywnych > 0 || stan.sort.length > 0 || serwer || (zaznaczanie && zaznaczanie.zaznaczone.size > 0)) && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span>{serwer ? t('{0} z {1} wierszy (strona {2})', widoczne.length, razem, serwer.strona + 1) : t('{0} z {1} wierszy', widoczne.length, razem)}</span>
          {zaznaczanie && zaznaczanie.zaznaczone.size > 0 && <span>{t('· zaznaczonych:')}{' '}{zaznaczanie.zaznaczone.size}</span>}
          {(aktywnych > 0 || stan.sort.length > 0) && (
            <button className="inline-flex items-center gap-1 text-blekit-ciemny underline" onClick={() => zmienStan(PUSTY_STAN)}>
              <X className="h-3 w-3" /> {t('wyczyść filtry i sortowanie')}
            </button>
          )}
          {serwer && (
            <span className="ml-auto flex items-center gap-1">
              <button className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-40" disabled={serwer.strona === 0} onClick={() => serwer.zmienStrone(serwer.strona - 1)} title={t('Poprzednia strona')}><ChevronLeft className="h-4 w-4" /></button>
              <button className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-40" disabled={(serwer.strona + 1) * serwer.naStronie >= razem} onClick={() => serwer.zmienStrone(serwer.strona + 1)} title={t('Następna strona')}><ChevronRight className="h-4 w-4" /></button>
            </span>
          )}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {zaznaczanie && (
                <th className="komorka-naglowek w-8">
                  <input type="checkbox" aria-label={t('Zaznacz wszystkie widoczne')} checked={wszystkieZaznaczone} onChange={(e) => {
                    const s = new Set(zaznaczanie.zaznaczone)
                    for (const k of kluczeWidocznych) { if (e.target.checked) s.add(k); else s.delete(k) }
                    zaznaczanie.zmien(s)
                  }} />
                </th>
              )}
              {kolumny.map((k) => {
                const sort = stan.sort.find((s) => s.kol === k.id)
                const nrSortu = stan.sort.length > 1 && sort ? stan.sort.indexOf(sort) + 1 : null
                const filtr = stan.filtry[k.id]
                return (
                  <th key={k.id} className={cn('komorka-naglowek relative whitespace-nowrap', k.naglowekClassName)} title={k.title}>
                    <div className="flex items-center gap-1">
                      {k.bezSortu ? <span>{k.naglowek}</span> : (
                        <button className="inline-flex items-center gap-1 uppercase hover:text-slate-900" title={t('Sortuj (Shift - kilka kolumn)')}
                          onClick={(e) => zmienStan(przelaczSort(stan, k.id, e.shiftKey))}>
                          {k.naglowek}
                          {sort ? (sort.kier === 'rosnaco' ? <ArrowUp className="h-3 w-3 text-blekit-ciemny" /> : <ArrowDown className="h-3 w-3 text-blekit-ciemny" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                          {nrSortu && <span className="text-[10px] text-blekit-ciemny">{nrSortu}</span>}
                        </button>
                      )}
                      {!k.bezFiltra && (
                        <button className={cn('ml-auto rounded p-0.5 hover:bg-slate-200', filtrAktywny(filtr) ? 'bg-blekit-jasny text-blekit-ciemny' : 'opacity-40 hover:opacity-100')}
                          title={t('Filtr')} aria-label={t('Filtr kolumny')} aria-expanded={otwarty === k.id} onClick={() => setOtwarty(otwarty === k.id ? null : k.id)}>
                          <Filter className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {otwarty === k.id && (
                      <PanelFiltra kolumna={k} filtr={filtr} wiersze={wiersze} zamknij={() => setOtwarty(null)}
                        zmien={(f) => { const filtry = { ...stan.filtry }; if (f) filtry[k.id] = f; else delete filtry[k.id]; zmienStan({ ...stan, filtry }); if (serwer) serwer.zmienStrone(0) }} />
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {widoczne.map((w, i) => {
              const kl = kluczeWidocznych[i]
              return (
                <tr key={kl} className={cn(onKlik && 'cursor-pointer hover:bg-slate-50', zaznaczanie?.zaznaczone.has(kl) && 'bg-blekit-jasny/40', klasaWiersza?.(w))}
                  onClick={onKlik ? () => onKlik(w) : undefined}>
                  {zaznaczanie && (
                    <td className="komorka w-8" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={t('Zaznacz wiersz')} checked={zaznaczanie.zaznaczone.has(kl)} onChange={(e) => {
                        const s = new Set(zaznaczanie.zaznaczone); if (e.target.checked) s.add(kl); else s.delete(kl); zaznaczanie.zmien(s)
                      }} />
                    </td>
                  )}
                  {kolumny.map((k) => (
                    <td key={k.id} className={cn('komorka', k.typ === 'liczba' && 'liczba', k.className)}>{k.komorka ? k.komorka(w, i) : tekstKomorki(k.wartosc(w))}</td>
                  ))}
                </tr>
              )
            })}
            {widoczne.length === 0 && (
              <tr><td colSpan={kolumny.length + (zaznaczanie ? 1 : 0)} className="komorka text-center text-slate-500">
                {wiersze.length || serwer ? (aktywnych ? t('Brak wierszy pasujących do filtrów.') : pusto ?? t('Brak danych.')) : pusto ?? t('Brak danych.')}
              </td></tr>
            )}
          </tbody>
          {stopka && <tfoot>{stopka}</tfoot>}
        </table>
      </div>
    </div>
  )
}

/** Panel filtra kolumny - zależny od typu; zamyka się kliknięciem obok albo Esc. */
function PanelFiltra<T>({ kolumna, filtr, wiersze, zmien, zamknij }: {
  kolumna: KolumnaTabeli<T>; filtr: Filtr | undefined; wiersze: T[]; zmien: (f: Filtr | null) => void; zamknij: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const klik = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) zamknij() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') zamknij() }
    document.addEventListener('mousedown', klik)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', klik); document.removeEventListener('keydown', esc) }
  }, [zamknij])
  const [szukaj, setSzukaj] = useState('')
  const lista = useMemo(() => (kolumna.typ === 'lista'
    ? (kolumna.wartosciFiltra ? kolumna.wartosciFiltra.map((wartosc) => ({ wartosc, ile: null as number | null })) : wartosciListy(wiersze, kolumna))
    : []), [kolumna, wiersze])
  const liczba = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))

  return (
    <div ref={ref} className="absolute left-0 top-full z-30 mt-1 w-64 space-y-2 rounded-md border border-slate-200 bg-white p-2 text-xs font-normal normal-case tracking-normal text-slate-700 shadow-lg"
      onClick={(e) => e.stopPropagation()}>
      {kolumna.typ === 'tekst' && (() => {
        const f = filtr?.typ === 'tekst' ? filtr : { typ: 'tekst' as const, tryb: 'zawiera' as const, wartosc: '' }
        return (
          <>
            <select className="pole py-1 text-xs" value={f.tryb} onChange={(e) => zmien({ ...f, tryb: e.target.value as typeof f.tryb })}>
              <option value="zawiera">zawiera</option><option value="zaczyna">{t('zaczyna się od')}</option><option value="rowna">{t('równa się')}</option>
            </select>
            <input autoFocus className="pole py-1 text-xs" value={f.wartosc} onChange={(e) => zmien({ ...f, wartosc: e.target.value })} />
          </>
        )
      })()}
      {kolumna.typ === 'liczba' && (() => {
        const f = filtr?.typ === 'liczba' ? filtr : { typ: 'liczba' as const, tryb: 'zakres' as const, od: null, do: null }
        return (
          <>
            <select className="pole py-1 text-xs" value={f.tryb} onChange={(e) => zmien({ ...f, tryb: e.target.value as typeof f.tryb })}>
              <option value="zakres">{t('od - do')}</option><option value="wieksze">{t('większe niż')}</option><option value="mniejsze">{t('mniejsze niż')}</option>
            </select>
            <div className="flex gap-1">
              {f.tryb !== 'mniejsze' && <input autoFocus className="pole py-1 text-xs" inputMode="decimal" placeholder={f.tryb === 'wieksze' ? '>' : 'od'} defaultValue={f.od ?? ''} onChange={(e) => zmien({ ...f, od: liczba(e.target.value) })} />}
              {f.tryb !== 'wieksze' && <input className="pole py-1 text-xs" inputMode="decimal" placeholder={f.tryb === 'mniejsze' ? '<' : 'do'} defaultValue={f.do ?? ''} onChange={(e) => zmien({ ...f, do: liczba(e.target.value) })} />}
            </div>
          </>
        )
      })()}
      {kolumna.typ === 'data' && (() => {
        const f = filtr?.typ === 'data' ? filtr : { typ: 'data' as const, od: null, do: null }
        return (
          <div className="space-y-1">
            <label className="flex items-center gap-1">od <input type="date" className="pole py-1 text-xs" value={f.od ?? ''} onChange={(e) => zmien({ ...f, od: e.target.value || null })} /></label>
            <label className="flex items-center gap-1">do <input type="date" className="pole py-1 text-xs" value={f.do ?? ''} onChange={(e) => zmien({ ...f, do: e.target.value || null })} /></label>
          </div>
        )
      })()}
      {kolumna.typ === 'lista' && (() => {
        const f = filtr?.typ === 'lista' ? filtr : { typ: 'lista' as const, wartosci: [] as string[] }
        const widoczne = lista.filter((x) => !szukaj || x.wartosc.toLowerCase().includes(szukaj.toLowerCase()))
        return (
          <>
            {lista.length > 8 && <input autoFocus className="pole py-1 text-xs" placeholder={t('szukaj...')} value={szukaj} onChange={(e) => setSzukaj(e.target.value)} />}
            <div className="max-h-56 space-y-0.5 overflow-auto">
              {widoczne.map((x) => (
                <label key={x.wartosc} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={f.wartosci.includes(x.wartosc)} onChange={(e) => zmien({ ...f, wartosci: e.target.checked ? [...f.wartosci, x.wartosc] : f.wartosci.filter((v) => v !== x.wartosc) })} />
                  <span className="flex-1 truncate">{x.wartosc}</span>{x.ile !== null && <span className="text-slate-400">{x.ile}</span>}
                </label>
              ))}
            </div>
          </>
        )
      })()}
      {kolumna.typ === 'tak_nie' && (
        <div className="flex gap-3">
          {([['tak', true], ['nie', false]] as const).map(([et, v]) => (
            <label key={et} className="flex items-center gap-1"><input type="radio" checked={filtr?.typ === 'tak_nie' && filtr.wartosc === v} onChange={() => zmien({ typ: 'tak_nie', wartosc: v })} /> {et}</label>
          ))}
        </div>
      )}
      <div className="flex justify-between border-t border-slate-100 pt-1">
        <button className="text-blekit-ciemny underline" onClick={() => zmien(null)}>{t('wyczyść')}</button>
        <button className="underline" onClick={zamknij}>zamknij</button>
      </div>
    </div>
  )
}
