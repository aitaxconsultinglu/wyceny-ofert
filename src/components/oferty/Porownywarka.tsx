import { useEffect, useMemo, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useSlowniki } from '@/lib/slowniki'
import { dataPL, liczba } from '@/lib/format'
import { cn } from '@/lib/utils'
import { filtrujCeny, PUSTY_FILTR, wczytajCeny, wiekMiesiecy, type FiltrCen, type WierszCeny } from '@/lib/bazaCen'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { WykresCen } from './WykresCen'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'

export type Miara = 'cena_pln_kg' | 'cena_pln_m' | 'cena_pln_szt' | 'cena_pln_odniesienia'
export const MIARY: { id: Miara; etykieta: string }[] = [
  { id: 'cena_pln_kg', etykieta: 'PLN/kg' }, { id: 'cena_pln_m', etykieta: 'PLN/m' },
  { id: 'cena_pln_szt', etykieta: 'PLN/szt' }, { id: 'cena_pln_odniesienia', etykieta: 'PLN/jedn. odniesienia' },
]

const WYMAGANIA_SKROTY: [string, string][] = [['atest_31', '3.1'], ['ped', 'PED'], ['ut', 'UT'], ['nft', 'NFT'], ['pochodzenie_ue', 'UE'], ['udt', 'UDT']]

export function opisWymiarow(w: Pick<WierszCeny, 'd_zew' | 'd_wew' | 'grubosc' | 'szerokosc' | 'dlugosc' | 'dn' | 'pn'>) {
  const cz: string[] = []
  if (w.d_zew) cz.push(`Ø${liczba(w.d_zew)}${w.d_wew ? `/${liczba(w.d_wew)}` : ''}`)
  if (w.szerokosc) cz.push(String(liczba(w.szerokosc)))
  if (w.grubosc) cz.push(`${cz.length ? '×' : 'g'}${liczba(w.grubosc)}`)
  if (w.dlugosc) cz.push(`L${liczba(w.dlugosc)}`)
  if (w.dn) cz.push(`DN${w.dn}${w.pn ? `/PN${w.pn}` : ''}`)
  return cz.join(' ')
}

export function KolumnaWymagan({ w }: { w: Record<string, unknown> }) {
  const potw = WYMAGANIA_SKROTY.filter(([k]) => w[k] === true).map(([, s]) => s)
  const temp = w.udarnosc_temp as number | null | undefined
  return <span className="text-xs text-slate-600">{[...potw, temp ? `KV ${temp}°C` : ''].filter(Boolean).join(', ')}</span>
}

const doplaty = (w: WierszCeny) => w.doplaty.map((d) => `${d.opis} ${liczba(d.kwota)} ${w.waluta}${d.za !== 'oferta' ? `/${d.za}` : ''}`).join('; ')

/** Kolumny pozycji cen (porównywarka, oferty do zapytania) - wspólne dla tabel z filtrami w nagłówkach. */
export function kolumnyCen(o: { miara?: Miara; najlepsza?: number | null; najtansza?: string | null; najszybsza?: string | null; bezZrodla?: boolean }): KolumnaTabeli<WierszCeny>[] {
  const miara = o.miara ?? 'cena_pln_kg'
  return [
    ...(o.bezZrodla ? [] : [{ id: 'zrodlo', naglowek: 'Źródło', typ: 'lista' as const, wartosc: (w: WierszCeny) => (w.zrodlo === 'oferta' ? 'oferta' : 'zakup'), className: 'text-xs' }]),
    { id: 'data', naglowek: 'Data', typ: 'data', wartosc: (w) => w.data, komorka: (w) => dataPL(w.data), className: 'whitespace-nowrap' },
    { id: 'dostawca', naglowek: 'Dostawca', typ: 'lista', wartosc: (w) => w.dostawca, className: 'max-w-[12rem] truncate font-medium' },
    { id: 'opis', naglowek: 'Opis', typ: 'tekst', wartosc: (w) => w.opis, className: 'max-w-[22rem] text-sm' },
    { id: 'gatunek', naglowek: 'Gatunek', typ: 'lista', wartosc: (w) => w.gatunek, className: 'whitespace-nowrap' },
    { id: 'wymiary', naglowek: 'Wymiary', typ: 'tekst', wartosc: (w) => opisWymiarow(w) || null, className: 'whitespace-nowrap text-xs' },
    { id: 'ilosc', naglowek: 'Ilość', typ: 'liczba', wartosc: (w) => w.ilosc, komorka: (w) => `${liczba(w.ilosc)} ${w.jm ?? ''}`, className: 'whitespace-nowrap' },
    { id: 'cena', naglowek: 'Cena oryg.', typ: 'liczba', wartosc: (w) => w.cena_jedn, komorka: (w) => `${liczba(w.cena_jedn, 2)} ${w.waluta}`, className: 'whitespace-nowrap' },
    {
      id: 'miara', naglowek: MIARY.find((m) => m.id === miara)!.etykieta, typ: 'liczba', wartosc: (w) => w[miara], className: 'whitespace-nowrap font-medium',
      komorka: (w) => (
        <span className={cn('px-1', ((o.najlepsza !== undefined && w[miara] !== null && w[miara] === o.najlepsza) || o.najtansza === w.klucz) && 'bg-limonka-jasna')}>
          {w[miara] !== null ? liczba(w[miara]!, 2) : <span className="text-slate-300">-</span>}
          {miara === 'cena_pln_odniesienia' && w.jednostka_odniesienia && <span className="ml-1 text-xs text-slate-500">/{w.jednostka_odniesienia}</span>}
        </span>
      ),
    },
    { id: 'termin', naglowek: 'Termin', typ: 'tekst', wartosc: (w) => w.termin, className: 'whitespace-nowrap text-xs', komorka: (w) => <span className={cn(o.najszybsza === w.klucz && 'bg-blekit-jasny px-1')}>{w.termin}{w.termin_dni ? ` (${w.termin_dni} dni)` : ''}</span> },
    { id: 'waznosc', naglowek: 'Ważność', typ: 'data', wartosc: (w) => w.waznosc_do, komorka: (w) => (w.waznosc_do ? dataPL(w.waznosc_do) : w.waznosc_opis), className: 'whitespace-nowrap text-xs' },
    { id: 'warunki', naglowek: 'Warunki', typ: 'tekst', wartosc: (w) => w.warunki, className: 'text-xs' },
    { id: 'wymagania', naglowek: 'Wymagania', typ: 'tekst', wartosc: (w) => Object.entries(w.wymagania ?? {}).filter(([, v]) => v === true).map(([k]) => k).join(' ') || null, komorka: (w) => <KolumnaWymagan w={w.wymagania} /> },
    { id: 'doplaty', naglowek: 'Dopłaty', typ: 'tekst', wartosc: (w) => doplaty(w) || null, className: 'text-xs' },
    { id: 'zo', naglowek: 'ZO', typ: 'lista', wartosc: (w) => w.nr_zo, className: 'whitespace-nowrap text-xs' },
  ]
}

/** Wyszukiwarka i porównywarka cen: oferty + zakupy, sortowanie po cenie znormalizowanej. */
export function Porownywarka({ tylkoUslugi = false }: { tylkoUslugi?: boolean }) {
  const s = useSlowniki()
  const [wszystkie, setWszystkie] = useState<WierszCeny[]>([])
  const [filtr, setFiltr] = useState<FiltrCen>(PUSTY_FILTR)
  const [miara, setMiara] = useState<Miara>(tylkoUslugi ? 'cena_pln_odniesienia' : 'cena_pln_kg')
  const [blad, setBlad] = useState<string | null>(null)
  const [ladowanie, setLadowanie] = useState(true)

  useEffect(() => {
    void wczytajCeny({ zakupy: true }).then(({ wiersze, blad: b }) => {
      setWszystkie(wiersze); setBlad(b); setLadowanie(false)
    })
  }, [])

  const dzis = new Date().toISOString().slice(0, 10)
  const progMies = s.ustawienia.wiek_ceny_ostrzezenie_mies
  const wynik = useMemo(() => {
    const zakres = tylkoUslugi ? wszystkie.filter((w) => w.kategoria_uslugi) : wszystkie.filter((w) => !w.kategoria_uslugi)
    return filtrujCeny(zakres, filtr, s.gatunki, dzis).sort((a, b) => {
      const x = a[miara]; const y = b[miara]
      if (x === null && y === null) return (b.data ?? '').localeCompare(a.data ?? '')
      if (x === null) return 1
      if (y === null) return -1
      return x - y
    })
  }, [wszystkie, filtr, miara, s.gatunki, tylkoUslugi, dzis])

  const ust = (zm: Partial<FiltrCen>) => setFiltr((f) => ({ ...f, ...zm }))
  const kategorie = tylkoUslugi
    ? s.kategorieUslug.map((k) => ({ wartosc: `u:${k.kod}`, etykieta: `${k.nazwa} (${k.jednostka_odniesienia})` }))
    : s.kategorieMaterialow.filter((k) => k.do_porownan).map((k) => ({ wartosc: `m:${k.kod}`, etykieta: k.nazwa }))
  const najlepsza = wynik.find((w) => w[miara] !== null)?.[miara] ?? null

  return (
    <div className="space-y-3">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      <section className="sekcja flex flex-wrap items-end gap-3">
        <label><span className="etykieta">Szukaj</span>
          <input className="pole w-56" placeholder="opis, dostawca, ZO..." value={filtr.tekst} onChange={(e) => ust({ tekst: e.target.value })} /></label>
        <label><span className="etykieta">Kategoria</span>
          <select className="pole w-56" value={filtr.kategoria} onChange={(e) => ust({ kategoria: e.target.value })}>
            <option value="">wszystkie</option>
            {kategorie.map((k) => <option key={k.wartosc} value={k.wartosc}>{k.etykieta}</option>)}
          </select></label>
        {!tylkoUslugi && (
          <>
            <label><span className="etykieta">Gatunek (z równoważnikami)</span>
              <input className="pole w-40" list="lista-gatunkow" placeholder="np. P355NL1" value={filtr.gatunek} onChange={(e) => ust({ gatunek: e.target.value })} />
              <datalist id="lista-gatunkow">{s.gatunki.map((g) => <option key={g.kod} value={g.kod} />)}</datalist></label>
            <label><span className="etykieta">Ø zewn. [mm]</span>
              <span className="block w-24 rounded-md border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={filtr.d_zew} puste zmien={(n) => ust({ d_zew: n })} /></span></label>
            <label><span className="etykieta">Grubość [mm]</span>
              <span className="block w-24 rounded-md border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={filtr.grubosc} puste zmien={(n) => ust({ grubosc: n })} /></span></label>
            <label><span className="etykieta">Tolerancja ±%</span>
              <span className="block w-16 rounded-md border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={filtr.tolerancja_proc} zmien={(n) => ust({ tolerancja_proc: n ?? 0 })} /></span></label>
          </>
        )}
        <label><span className="etykieta">Dostawca</span>
          <input className="pole w-40" value={filtr.dostawca} onChange={(e) => ust({ dostawca: e.target.value })} /></label>
        <label><span className="etykieta">Od daty</span>
          <input type="date" className="pole w-40" value={filtr.od} onChange={(e) => ust({ od: e.target.value })} /></label>
        <div className="flex flex-col gap-1 text-sm">
          <label className="flex items-center gap-1"><input type="checkbox" checked={filtr.tylkoWazne} onChange={(e) => ust({ tylkoWazne: e.target.checked })} /> tylko ważne oferty</label>
          {!tylkoUslugi && <label className="flex items-center gap-1"><input type="checkbox" checked={filtr.udarnosc45} onChange={(e) => ust({ udarnosc45: e.target.checked })} /> udarność −45 °C</label>}
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <label className="flex items-center gap-1"><input type="checkbox" checked={filtr.zrodla.oferta} onChange={(e) => ust({ zrodla: { ...filtr.zrodla, oferta: e.target.checked } })} /> oferty</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={filtr.zrodla.zakup} onChange={(e) => ust({ zrodla: { ...filtr.zrodla, zakup: e.target.checked } })} /> zakupy (Optima)</label>
        </div>
        <label><span className="etykieta">Sortuj wg</span>
          <select className="pole w-44" value={miara} onChange={(e) => setMiara(e.target.value as Miara)}>
            {MIARY.map((m) => <option key={m.id} value={m.id}>{m.etykieta}</option>)}
          </select></label>
        <Button rozmiar="maly" wariant="cichy" onClick={() => setFiltr(PUSTY_FILTR)}><RotateCcw className="h-3 w-3" /> wyczyść</Button>
      </section>

      {ladowanie ? <p className="text-sm text-slate-500">Wczytywanie...</p> : (
        <>
          <p className="text-xs text-slate-500">
            {wynik.length} pozycji. <span className="rounded bg-amber-100 px-1">Żółte</span> - cena starsza niż {progMies} mies.,
            <span className="ml-1 rounded bg-red-100 px-1">czerwone</span> - oferta po terminie ważności. Ceny w PLN wg kursu z dnia oferty.
          </p>
          {wynik.length > 1 && wynik.length <= 400 && <WykresCen wiersze={wynik} miara={miara} />}
          <Tabela id={tylkoUslugi ? 'porownywarka-uslug' : 'porownywarka'} kolumny={kolumnyCen({ miara, najlepsza })} wiersze={wynik} klucz={(w) => w.klucz}
            klasaWiersza={(w) => { const wiek = wiekMiesiecy(w.data); return w.zrodlo === 'oferta' && !!w.waznosc_do && w.waznosc_do < dzis ? 'bg-red-50' : wiek !== null && wiek >= progMies ? 'bg-amber-50' : undefined }}
            pusto="Brak pozycji spełniających kryteria." />
        </>
      )}
    </div>
  )
}
