import { useState } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { liczba } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  PROG_PEWNOSCI, nowaPozycjaRysunku, type KrociecRysunku, type ObszarZrodlowy, type ParametrRysunku, type PozycjaRysunku, type WynikRysunku,
} from '@/lib/rysunki'
import type { KategoriaMaterialu } from '@/lib/types'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { TabeleWlasne } from './TabeleWlasne'
import { t } from '@/i18n'

export type ZakladkaSiatki = 'pozycje' | 'krocce' | 'parametry' | 'uwagi' | 'tabele'

interface Props {
  wynik: WynikRysunku
  zmien: (w: WynikRysunku) => void
  kategorie: KategoriaMaterialu[]
  zakladka: ZakladkaSiatki
  setZakladka: (z: ZakladkaSiatki) => void
  /** Podgląd bieżącej strony - do miniatur źródła wiersza. */
  podglad: { dataUrl: string; szer: number; wys: number; strona: number } | null
  pokaz: (o: ObszarZrodlowy) => void
  tylkoOdczyt: boolean
}

/** Miniatura fragmentu strony (wycinek podglądu przez CSS - bez ponownego renderu). */
function Wycinek({ podglad, o, pokaz }: { podglad: NonNullable<Props['podglad']>; o: ObszarZrodlowy; pokaz: () => void }) {
  const szer = 150
  const wys = Math.max(12, Math.min(90, szer * (o.h * podglad.wys) / (o.w * podglad.szer)))
  return (
    <button
      title={t('Pokaż na rysunku')} onClick={pokaz}
      className="block rounded border border-slate-300 hover:border-blekit-ciemny"
      style={{
        width: szer, height: wys, backgroundImage: `url(${podglad.dataUrl})`, backgroundRepeat: 'no-repeat',
        backgroundSize: `${100 / o.w}% ${100 / o.h}%`,
        backgroundPosition: `${o.w < 1 ? (o.x / (1 - o.w)) * 100 : 0}% ${o.h < 1 ? (o.y / (1 - o.h)) * 100 : 0}%`,
      }}
    />
  )
}

function Pewnosc({ p, potwierdz, tylkoOdczyt }: { p: number; potwierdz: () => void; tylkoOdczyt: boolean }) {
  const niepewny = p < PROG_PEWNOSCI
  return (
    <span className="flex items-center gap-1 whitespace-nowrap text-xs">
      <span className={niepewny ? 'font-semibold text-amber-700' : 'text-slate-500'}>{Math.round(p * 100)}%{niepewny && ' (?)'}</span>
      {niepewny && !tylkoOdczyt && (
        <button title={t('Sprawdzone - zgodne z rysunkiem')} className="text-slate-400 hover:text-emerald-600" onClick={potwierdz}><Check className="h-3.5 w-3.5" /></button>
      )}
    </span>
  )
}

export function SiatkaOdczytu({ wynik, zmien, kategorie, zakladka, setZakladka, podglad, pokaz, tylkoOdczyt }: Props) {
  const [nowaUwaga, setNowaUwaga] = useState('')
  const pt = (v: string | null, f: (s: string | null) => void, szer = 'w-24') => (
    <input className={cn('pole-komorki text-xs', szer)} value={v ?? ''} disabled={tylkoOdczyt} onChange={(e) => f(e.target.value || null)} />
  )
  const l = (v: number | null, f: (n: number | null) => void) => (
    <PoleLiczby className="pole-komorki w-16 text-right text-xs" wartosc={v} puste disabled={tylkoOdczyt} zmien={f} />
  )
  const zrodlo = (o: ObszarZrodlowy | null) => (o && podglad && o.strona === podglad.strona ? <Wycinek podglad={podglad} o={o} pokaz={() => pokaz(o)} /> : null)
  const usunBtn = (f: () => void) => !tylkoOdczyt && (
    <button title={t('Usuń wiersz')} className="text-slate-400 hover:text-red-600" onClick={f}><Trash2 className="h-3.5 w-3.5" /></button>
  )

  const ustP = (i: number, z: Partial<PozycjaRysunku>) => zmien({ ...wynik, pozycje: wynik.pozycje.map((p, j) => (j === i ? { ...p, ...z } : p)) })
  const ustK = (i: number, z: Partial<KrociecRysunku>) => zmien({ ...wynik, krocce: wynik.krocce.map((p, j) => (j === i ? { ...p, ...z } : p)) })
  const ustR = (i: number, z: Partial<ParametrRysunku>) => zmien({ ...wynik, parametry: wynik.parametry.map((p, j) => (j === i ? { ...p, ...z } : p)) })
  const masa = wynik.pozycje.reduce((s, p) => s + (p.masa_calk ?? (p.masa_jedn ?? 0) * (p.ilosc ?? 0)), 0)
  const niepewnych = (l: { pewnosc: number }[]) => l.filter((x) => x.pewnosc < PROG_PEWNOSCI).length

  const ZAKLADKI: [ZakladkaSiatki, string, number, number][] = [
    ['pozycje', t('Wykaz części'), wynik.pozycje.length, niepewnych(wynik.pozycje)],
    ['krocce', t('Króćce'), wynik.krocce.length, niepewnych(wynik.krocce)],
    ['parametry', t('Dane projektowe'), wynik.parametry.length, niepewnych(wynik.parametry)],
    ['uwagi', t('Uwagi do wyceny'), wynik.uwagi.length, 0],
    ['tabele', t('Własne tabele'), (wynik.tabele ?? []).length, 0],
  ]

  return (
    <div className="space-y-2">
      <div className="pasek-zakladek-jasny">
        {ZAKLADKI.map(([k, et, n, nie]) => (
          <button key={k} onClick={() => setZakladka(k)}
            className={cn('zakladka', (zakladka === k) && 'zakladka-aktywna')}>
            {et} ({n}){nie > 0 && <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">{nie} {t('do sprawdzenia')}</span>}
          </button>
        ))}
      </div>

      {zakladka === 'pozycje' && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse">
            <thead><tr>{[t('Poz.'), t('Nazwa'), t('Ilość'), t('J.m.'), t('Materiał'), t('Norma'), t('Wymiary'), t('Masa jedn. [kg]'), t('Masa całk. [kg]'), t('Kategoria'), t('Uwagi'), t('Pewność'), t('Na rysunku'), ''].map((n) => <th key={n} className="komorka-naglowek text-xs">{n}</th>)}</tr></thead>
            <tbody>
              {wynik.pozycje.map((p, i) => (
                <tr key={i} className={cn(p.pewnosc < PROG_PEWNOSCI && 'bg-amber-50')}>
                  <td className="komorka">{pt(p.poz, (v) => ustP(i, { poz: v ?? '' }), 'w-12')}</td>
                  <td className="komorka">{pt(p.nazwa, (v) => ustP(i, { nazwa: v ?? '' }), 'w-56')}</td>
                  <td className="komorka">{l(p.ilosc, (v) => ustP(i, { ilosc: v }))}</td>
                  <td className="komorka">{pt(p.jm, (v) => ustP(i, { jm: v ?? 'szt' }), 'w-12')}</td>
                  <td className="komorka">{pt(p.material, (v) => ustP(i, { material: v }), 'w-28')}</td>
                  <td className="komorka">{pt(p.norma, (v) => ustP(i, { norma: v }), 'w-28')}</td>
                  <td className="komorka">{pt(p.wymiary, (v) => ustP(i, { wymiary: v }), 'w-28')}</td>
                  <td className="komorka">{l(p.masa_jedn, (v) => ustP(i, { masa_jedn: v }))}</td>
                  <td className="komorka">{l(p.masa_calk, (v) => ustP(i, { masa_calk: v }))}</td>
                  <td className="komorka">
                    <select className="pole-komorki w-32 text-xs" value={p.sekcja} disabled={tylkoOdczyt} onChange={(e) => ustP(i, { sekcja: e.target.value })}>
                      {kategorie.map((k) => <option key={k.kod} value={k.kod}>{k.nazwa}</option>)}
                      {!kategorie.some((k) => k.kod === p.sekcja) && <option value={p.sekcja}>{p.sekcja}</option>}
                    </select>
                  </td>
                  <td className="komorka">{pt(p.uwagi, (v) => ustP(i, { uwagi: v }), 'w-40')}</td>
                  <td className="komorka"><Pewnosc p={p.pewnosc} tylkoOdczyt={tylkoOdczyt} potwierdz={() => ustP(i, { pewnosc: 1 })} /></td>
                  <td className="komorka">{zrodlo(p.obszar_zrodlowy)}</td>
                  <td className="komorka">{usunBtn(() => zmien({ ...wynik, pozycje: wynik.pozycje.filter((_, j) => j !== i) }))}</td>
                </tr>
              ))}
              {wynik.pozycje.length === 0 && <tr><td colSpan={14} className="komorka text-center text-sm text-slate-500">{t('Brak pozycji - zaznacz wykaz części na rysunku i odczytaj go, wklej tabelę albo dodaj wiersze ręcznie.')}</td></tr>}
            </tbody>
          </table>
          <div className="flex items-center justify-between gap-2 p-2">
            {!tylkoOdczyt && <Button rozmiar="maly" onClick={() => zmien({ ...wynik, pozycje: [...wynik.pozycje, nowaPozycjaRysunku(wynik.pozycje.length + 1)] })}><Plus className="h-3 w-3" /> {t('wiersz')}</Button>}
            {masa > 0 && <span className="text-xs text-slate-600">{t('Suma mas z wykazu:')}{' '}<strong>{liczba(masa, 1)} kg</strong> {t('(porównaj z masą na rysunku)')}</span>}
          </div>
        </div>
      )}

      {zakladka === 'krocce' && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse">
            <thead><tr>{[t('Oznaczenie'), t('Ilość'), t('DN / rozmiar'), t('PN / klasa'), t('Przyłącze'), t('Przeznaczenie'), t('Uwagi'), t('Pewność'), t('Na rysunku'), ''].map((n) => <th key={n} className="komorka-naglowek text-xs">{n}</th>)}</tr></thead>
            <tbody>
              {wynik.krocce.map((k, i) => (
                <tr key={i} className={cn(k.pewnosc < PROG_PEWNOSCI && 'bg-amber-50')}>
                  <td className="komorka">{pt(k.oznaczenie, (v) => ustK(i, { oznaczenie: v ?? '' }), 'w-16')}</td>
                  <td className="komorka">{l(k.ilosc, (v) => ustK(i, { ilosc: v }))}</td>
                  <td className="komorka">{pt(k.dn, (v) => ustK(i, { dn: v }), 'w-20')}</td>
                  <td className="komorka">{pt(k.pn, (v) => ustK(i, { pn: v }), 'w-20')}</td>
                  <td className="komorka">{pt(k.przylacze, (v) => ustK(i, { przylacze: v }), 'w-24')}</td>
                  <td className="komorka">{pt(k.przeznaczenie, (v) => ustK(i, { przeznaczenie: v }), 'w-36')}</td>
                  <td className="komorka">{pt(k.uwagi, (v) => ustK(i, { uwagi: v }), 'w-72')}</td>
                  <td className="komorka"><Pewnosc p={k.pewnosc} tylkoOdczyt={tylkoOdczyt} potwierdz={() => ustK(i, { pewnosc: 1 })} /></td>
                  <td className="komorka">{zrodlo(k.obszar_zrodlowy)}</td>
                  <td className="komorka">{usunBtn(() => zmien({ ...wynik, krocce: wynik.krocce.filter((_, j) => j !== i) }))}</td>
                </tr>
              ))}
              {wynik.krocce.length === 0 && <tr><td colSpan={10} className="komorka text-center text-sm text-slate-500">{t('Brak króćców.')}</td></tr>}
            </tbody>
          </table>
          {!tylkoOdczyt && (
            <div className="p-2"><Button rozmiar="maly" onClick={() => zmien({ ...wynik, krocce: [...wynik.krocce, { oznaczenie: `N${wynik.krocce.length + 1}`, ilosc: 1, dn: null, pn: null, przylacze: null, przeznaczenie: null, uwagi: null, pewnosc: 1, obszar_zrodlowy: null }] })}><Plus className="h-3 w-3" /> {t('wiersz')}</Button></div>
          )}
        </div>
      )}

      {zakladka === 'parametry' && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse">
            <thead><tr>{[t('Parametr'), t('Przestrzeń'), t('Wartość'), t('Jednostka'), t('Pewność'), ''].map((n) => <th key={n} className="komorka-naglowek text-xs">{n}</th>)}</tr></thead>
            <tbody>
              {wynik.parametry.map((p, i) => (
                <tr key={i} className={cn(p.pewnosc < PROG_PEWNOSCI && 'bg-amber-50')}>
                  <td className="komorka">{pt(p.nazwa, (v) => ustR(i, { nazwa: v ?? '' }), 'w-64')}</td>
                  <td className="komorka">{pt(p.przestrzen, (v) => ustR(i, { przestrzen: v }), 'w-24')}</td>
                  <td className="komorka">{pt(p.wartosc, (v) => ustR(i, { wartosc: v ?? '' }), 'w-56')}</td>
                  <td className="komorka">{pt(p.jednostka, (v) => ustR(i, { jednostka: v }), 'w-16')}</td>
                  <td className="komorka"><Pewnosc p={p.pewnosc} tylkoOdczyt={tylkoOdczyt} potwierdz={() => ustR(i, { pewnosc: 1 })} /></td>
                  <td className="komorka">{usunBtn(() => zmien({ ...wynik, parametry: wynik.parametry.filter((_, j) => j !== i) }))}</td>
                </tr>
              ))}
              {wynik.parametry.length === 0 && <tr><td colSpan={6} className="komorka text-center text-sm text-slate-500">{t('Brak danych projektowych.')}</td></tr>}
            </tbody>
          </table>
          {!tylkoOdczyt && (
            <div className="p-2"><Button rozmiar="maly" onClick={() => zmien({ ...wynik, parametry: [...wynik.parametry, { nazwa: '', przestrzen: null, wartosc: '', jednostka: null, pewnosc: 1 }] })}><Plus className="h-3 w-3" /> {t('wiersz')}</Button></div>
          )}
        </div>
      )}

      {zakladka === 'uwagi' && (
        <div className="space-y-1 rounded-lg border border-slate-200 bg-white p-2">
          {wynik.uwagi.map((u, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="pole text-sm" value={u} disabled={tylkoOdczyt} onChange={(e) => zmien({ ...wynik, uwagi: wynik.uwagi.map((x, j) => (j === i ? e.target.value : x)) })} />
              {usunBtn(() => zmien({ ...wynik, uwagi: wynik.uwagi.filter((_, j) => j !== i) }))}
            </div>
          ))}
          {wynik.uwagi.length === 0 && <p className="text-sm text-slate-500">{t('Wymagania kosztotwórcze z rysunku (PWHT, zakres badań, próby, antykorozja...).')}</p>}
          {!tylkoOdczyt && (
            <div className="flex gap-2">
              <input className="pole text-sm" placeholder={t('Nowa uwaga do wyceny')} value={nowaUwaga} onChange={(e) => setNowaUwaga(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && nowaUwaga.trim()) { zmien({ ...wynik, uwagi: [...wynik.uwagi, nowaUwaga.trim()] }); setNowaUwaga('') } }} />
              <Button rozmiar="maly" disabled={!nowaUwaga.trim()} onClick={() => { zmien({ ...wynik, uwagi: [...wynik.uwagi, nowaUwaga.trim()] }); setNowaUwaga('') }}><Plus className="h-3 w-3" /> {t('dodaj')}</Button>
            </div>
          )}
        </div>
      )}

      {zakladka === 'tabele' && <TabeleWlasne tabele={wynik.tabele ?? []} tylkoOdczyt={tylkoOdczyt} zmien={(tb) => zmien({ ...wynik, tabele: tb })} />}
    </div>
  )
}
