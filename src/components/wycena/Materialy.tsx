import { useEffect, useState } from 'react'
import { FileSearch, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { pozycjeZOdczytu, scalZOdczytem, zmienioneWZrodle, zrodloPozycji, type OdczytDoPrzeniesienia } from '@/lib/przeniesienieOdczytu'
import { useSlowniki } from '@/lib/slowniki'
import { liczba, zl } from '@/lib/format'
import { cn } from '@/lib/utils'
import { policzAparat, policzPozycje, type ParametryKalk } from '@/lib/kalkulacja'
import { klucz, type Aparat, type PozycjaWyceny } from '@/lib/wyceny'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { ZrodloCeny } from './ZrodloCeny'
import { SzablonIParametry } from './SzablonIParametry'
import { t } from '@/i18n'

interface Props {
  aparat: Aparat
  par: ParametryKalk
  tylkoOdczyt: boolean
  zmien: (f: (a: Aparat) => Aparat) => void
  znajdz: (p: PozycjaWyceny) => void
  importuj: () => void
  /** Zapytanie wyceny - parametry projektu z rysunków (etap 1). */
  zapytanieId?: string
}

export function nowaPozycjaMaterialu(sekcja: string, jm = 'szt'): PozycjaWyceny {
  return { klucz: klucz(), lp: 0, zakladka: 'materialy', sekcja, nazwa: '', ilosc: 1, jm, cena_jedn: 0, jednostka_ceny: 'kg', zrodlo_ceny: 'recznie', masa_reczna: false, dodatkowe: {} }
}

/** Zakładka Materiały (dla 1 szt.): sekcje kategorii, masa z wymiarów, naddatek %, źródło ceny. */
export function Materialy({ aparat, par, tylkoOdczyt, zmien, znajdz, importuj, zapytanieId }: Props) {
  const s = useSlowniki()
  const koszty = policzAparat(aparat, par)
  const pozycje = aparat.pozycje.filter((p) => p.zakladka === 'materialy')
  const kolejnosc = s.kategorieMaterialow.map((k) => k.kod)
  const sekcje = [...new Set([...pozycje.map((p) => p.sekcja ?? 'inne')])].sort((a, b) => kolejnosc.indexOf(a) - kolejnosc.indexOf(b))
  const wolne = s.kategorieMaterialow.filter((k) => !sekcje.includes(k.kod))

  // Odczyty rysunków, z których pochodzą pozycje - wykrycie zmian w źródle po przeniesieniu.
  const idsOdczytow = [...new Set(aparat.pozycje.map((p) => zrodloPozycji(p)?.odczyt_id).filter((x): x is string => !!x))].sort().join(',')
  const [odczyty, setOdczyty] = useState<OdczytDoPrzeniesienia[]>([])
  useEffect(() => {
    if (!idsOdczytow) { setOdczyty([]); return }
    void supabase.from('odczyty_rysunkow').select('id, nazwa_pliku, strona, nazwa, rodzaj_tabeli, obszary, wynik').in('id', idsOdczytow.split(','))
      .then(({ data }) => setOdczyty((data ?? []) as OdczytDoPrzeniesienia[]))
  }, [idsOdczytow])
  const zmienione = zmienioneWZrodle(aparat.pozycje, odczyty)
  const aktualizuj = () => zmien((a) => {
    const obecne = new Set(a.pozycje.map((p) => { const z = zrodloPozycji(p); return z ? `${z.odczyt_id}|${z.wiersz}` : '' }))
    const zOdczytow = odczyty.flatMap((o) => pozycjeZOdczytu(o)).filter((p) => obecne.has(`${zrodloPozycji(p)!.odczyt_id}|${zrodloPozycji(p)!.wiersz}`))
    return { ...a, pozycje: scalZOdczytem(a.pozycje, zOdczytow).pozycje }
  })

  const ustPoz = (kl: string, zm: Partial<PozycjaWyceny>) => zmien((a) => ({ ...a, pozycje: a.pozycje.map((p) => (p.klucz === kl ? { ...p, ...zm } : p)) }))
  const usun = (kl: string) => zmien((a) => ({ ...a, pozycje: a.pozycje.filter((p) => p.klucz !== kl) }))
  const dodaj = (sekcja: string) => {
    const kat = s.kategorieMaterialow.find((k) => k.kod === sekcja)
    zmien((a) => ({ ...a, pozycje: [...a.pozycje, nowaPozycjaMaterialu(sekcja, kat?.jm_domyslna ?? 'szt')] }))
  }

  const liczbowa = (p: PozycjaWyceny, pole: keyof PozycjaWyceny, szer = 'w-14') => (
    <td className={cn('komorka', szer)}>
      <PoleLiczby wartosc={(p[pole] as number | null | undefined) ?? null} puste disabled={tylkoOdczyt} zmien={(n) => ustPoz(p.klucz, { [pole]: n })} />
    </td>
  )

  return (
    <div className="space-y-4">
      {zmienione.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t('{0} pozycji zmieniło się w odczytach rysunków po przeniesieniu: {1}.', zmienione.length, zmienione.slice(0, 5).map((p) => p.nazwa).join(', ') + (zmienione.length > 5 ? '...' : ''))}
          {!tylkoOdczyt && <Button rozmiar="maly" onClick={aktualizuj}><RefreshCw className="h-3 w-3" /> {t('Zaktualizować z odczytów?')}</Button>}
          <span className="text-xs">{t('Ceny i źródła cen zostaną bez zmian.')}</span>
        </div>
      )}
      {zapytanieId && <SzablonIParametry aparat={aparat} zapytanieId={zapytanieId} masaPozycji={koszty.materialy.masa_brutto} tylkoOdczyt={tylkoOdczyt} zmien={zmien} />}
      <div className="flex flex-wrap items-center gap-2">
        {!tylkoOdczyt && (
          <>
            <select className="pole w-64" value="" onChange={(e) => e.target.value && dodaj(e.target.value)}>
              <option value="">{t('+ dodaj sekcję materiałów...')}</option>
              {wolne.map((k) => <option key={k.kod} value={k.kod}>{k.nazwa}</option>)}
            </select>
            <Button rozmiar="maly" onClick={importuj}>{t('Import listy materiałowej (Excel)')}</Button>
          </>
        )}
        <span className="text-xs text-slate-500">
          {t('Masa liczona z wymiarów (kursywa) albo wpisana. Koszt = masa × zł/kg, metry × zł/m albo ilość × cena; wpisanie kosztu zastępuje obliczenie.')}
        </span>
      </div>

      {sekcje.map((sekcja) => {
        const kat = s.kategorieMaterialow.find((k) => k.kod === sekcja)
        const podsum = koszty.materialy.sekcje.find((x) => x.sekcja === sekcja)
        const wiersze = pozycje.filter((p) => (p.sekcja ?? 'inne') === sekcja)
        return (
          <section key={sekcja} className="sekcja space-y-2 p-3">
            <h4 className="text-sm font-semibold">{kat?.nazwa ?? sekcja}</h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1500px] border-collapse">
                <thead><tr>
                  {[t('Lp'), t('Przeznaczenie'), t('Rodzaj'), t('Gatunek'), t('φ zew'), t('φ wew'), 'g', 'b', 'l', 'DN', 'PN', t('Ilość'), t('J.m.'), t('Masa jedn. kg'), t('Masa całk. kg'), t('Cena'), t('za'), t('Koszt PLN'), t('Źródło ceny'), t('Opcj.'), t('Uwagi'), ''].map((n) => (
                    <th key={n} className="komorka-naglowek whitespace-nowrap">{n}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {wiersze.map((p, i) => {
                    const w = policzPozycje(p, par)
                    const kplBezMasy = p.jm.toLowerCase().replace('.', '') === 'kpl' && !w.masa_jedn && !p.cena_za_komplet
                    return (
                      <tr key={p.klucz} className={cn(p.pewnosc !== null && p.pewnosc !== undefined && p.pewnosc < 0.8 && 'bg-amber-50', p.opcjonalna && 'text-slate-500')}>
                        <td className="komorka w-8 text-center text-xs text-slate-500">{i + 1}</td>
                        <td className="komorka min-w-[11rem]">
                          <div className="flex items-center gap-1">
                            <input className="pole-komorki" disabled={tylkoOdczyt} value={p.nazwa} onChange={(e) => ustPoz(p.klucz, { nazwa: e.target.value })} />
                            {zrodloPozycji(p) && <span title={t('Źródło: {0}', zrodloPozycji(p)!.opis)} className={cn('shrink-0', zmienione.includes(p) ? 'text-amber-600' : 'text-slate-400')}><FileSearch className="h-3.5 w-3.5" /></span>}
                          </div>
                        </td>
                        <td className="komorka w-28"><input className="pole-komorki" disabled={tylkoOdczyt} value={p.rodzaj ?? ''} onChange={(e) => ustPoz(p.klucz, { rodzaj: e.target.value || null })} /></td>
                        <td className="komorka w-28"><input className="pole-komorki" list="gatunki-wyceny" disabled={tylkoOdczyt} value={p.gatunek ?? ''} onChange={(e) => ustPoz(p.klucz, { gatunek: e.target.value || null })} /></td>
                        {liczbowa(p, 'd_zew')}{liczbowa(p, 'd_wew')}{liczbowa(p, 'grubosc')}{liczbowa(p, 'szerokosc')}{liczbowa(p, 'dlugosc', 'w-16')}
                        <td className="komorka w-12"><input className="pole-komorki" disabled={tylkoOdczyt} value={p.dn ?? ''} onChange={(e) => ustPoz(p.klucz, { dn: e.target.value || null })} /></td>
                        <td className="komorka w-12"><input className="pole-komorki" disabled={tylkoOdczyt} value={p.pn ?? ''} onChange={(e) => ustPoz(p.klucz, { pn: e.target.value || null })} /></td>
                        <td className="komorka w-16"><PoleLiczby wartosc={p.ilosc} disabled={tylkoOdczyt} zmien={(n) => ustPoz(p.klucz, { ilosc: n ?? 0 })} /></td>
                        <td className="komorka w-14">
                          <select className="pole-komorki" disabled={tylkoOdczyt} value={p.jm} onChange={(e) => ustPoz(p.klucz, { jm: e.target.value })}>
                            {['szt', 'ark', 'kpl', 'm', 'kg'].map((j) => <option key={j}>{j}</option>)}
                            {!['szt', 'ark', 'kpl', 'm', 'kg'].includes(p.jm) && <option>{p.jm}</option>}
                          </select>
                        </td>
                        <td className={cn('komorka w-20', w.masa_z_wymiarow && !p.masa_reczna && 'italic text-slate-500', kplBezMasy && 'bg-amber-100')}
                          title={w.masa_z_wymiarow ? t('Z wymiarów - wpisz, aby nadpisać') : p.masa_reczna ? t('Wpisana ręcznie - wyczyść, aby liczyć z wymiarów') : undefined}>
                          <PoleLiczby wartosc={p.masa_reczna ? p.masa_jedn ?? null : w.masa_jedn !== null ? Math.round(w.masa_jedn * 1000) / 1000 : null} puste disabled={tylkoOdczyt || p.jm === 'kg'}
                            zmien={(n) => ustPoz(p.klucz, n === null ? { masa_reczna: false, masa_jedn: null } : { masa_reczna: true, masa_jedn: n })} />
                        </td>
                        <td className="komorka liczba w-20 text-sm">{w.masa_calk ? liczba(w.masa_calk, 1) : ''}</td>
                        <td className="komorka w-20"><PoleLiczby wartosc={p.cena_jedn} disabled={tylkoOdczyt} zmien={(n) => ustPoz(p.klucz, { cena_jedn: n ?? 0, zrodlo_ceny: 'recznie', zrodlo_data: null, zrodlo_waznosc_do: null, zrodlo_dostawca: null, zrodlo_opis: null, zrodlo_id: null, zrodlo_termin_dni: null })} /></td>
                        <td className="komorka w-16">
                          <select className="pole-komorki text-xs" disabled={tylkoOdczyt} value={p.jednostka_ceny} onChange={(e) => ustPoz(p.klucz, { jednostka_ceny: e.target.value as PozycjaWyceny['jednostka_ceny'] })}>
                            <option value="kg">{t('zł/kg')}</option><option value="m">{t('zł/m')}</option><option value="jm">{t('zł/')}{p.jm}</option>
                          </select>
                        </td>
                        <td className={cn('komorka w-24', (p.wartosc_reczna === null || p.wartosc_reczna === undefined) && 'italic')} title={t('Wpisz, aby zastąpić obliczenie; wyczyść, aby liczyć')}>
                          <PoleLiczby wartosc={p.wartosc_reczna ?? Math.round(w.koszt * 100) / 100} puste disabled={tylkoOdczyt}
                            zmien={(n) => ustPoz(p.klucz, { wartosc_reczna: n })} />
                        </td>
                        <td className="komorka w-40"><ZrodloCeny p={p} wiekMies={s.ustawienia.wiek_ceny_ostrzezenie_mies} tylkoOdczyt={tylkoOdczyt} onZnajdz={() => znajdz(p)} /></td>
                        <td className="komorka w-14 text-center text-xs">
                          <label title={t('Pozycja opcjonalna (wariant oferty bez niej)')}><input type="checkbox" disabled={tylkoOdczyt} checked={!!p.opcjonalna} onChange={(e) => ustPoz(p.klucz, { opcjonalna: e.target.checked, wariant: e.target.checked ? p.wariant ?? 'wariant' : null })} /></label>
                          {p.jm === 'kpl' && <label className="ml-1" title={t('Cena za komplet - bez masy')}><input type="checkbox" disabled={tylkoOdczyt} checked={!!p.cena_za_komplet} onChange={(e) => ustPoz(p.klucz, { cena_za_komplet: e.target.checked })} /> kpl</label>}
                        </td>
                        <td className="komorka min-w-[8rem]"><input className="pole-komorki" disabled={tylkoOdczyt} value={p.uwagi ?? ''} onChange={(e) => ustPoz(p.klucz, { uwagi: e.target.value || null })} /></td>
                        <td className="komorka w-8 text-center">{!tylkoOdczyt && <button className="text-slate-400 hover:text-red-600" onClick={() => usun(p.klucz)}><Trash2 className="h-4 w-4" /></button>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              {!tylkoOdczyt ? <Button rozmiar="maly" wariant="cichy" onClick={() => dodaj(sekcja)}><Plus className="h-3 w-3" /> {t('wiersz')}</Button> : <span />}
              {podsum && (
                <div className="flex flex-wrap items-center gap-4">
                  <span>{t('Suma:')}{' '}<strong>{zl(podsum.koszt)}</strong></span>
                  <span className="flex items-center gap-1">{t('naddatek')}
                    <span className="w-14 rounded border border-slate-300 px-1"><PoleLiczby wartosc={podsum.naddatek_proc} disabled={tylkoOdczyt}
                      zmien={(n) => zmien((a) => ({ ...a, naddatki: { ...a.naddatki, [sekcja]: n ?? 0 } }))} /></span>% = {zl(podsum.naddatek)}
                  </span>
                  <span>{t('Razem:')}{' '}<strong>{zl(podsum.razem)}</strong></span>
                  <span className="text-slate-500">{t('masa {0} kg', liczba(podsum.masa, 1))}</span>
                </div>
              )}
            </div>
          </section>
        )
      })}
      <datalist id="gatunki-wyceny">{s.gatunki.map((g) => <option key={g.kod} value={g.kod} />)}</datalist>

      <section className="sekcja flex flex-wrap gap-6 text-sm">
        <span>{t('Koszt materiałów (z naddatkami):')}{' '}<strong>{zl(koszty.materialy.koszt)} PLN</strong></span>
        <span>{t('Masa brutto:')}{' '}<strong>{liczba(koszty.materialy.masa_brutto, 1)} kg</strong> ({liczba(koszty.materialy.masa_brutto / 1000, 3)} {t('t)')}</span>
        <span>{t('Narzut zakupowy')}{' '}{liczba(par.narzut_zakupowy_proc)}%: <strong>{zl(koszty.materialy.narzut_zakupowy)}</strong></span>
        <span>{t('Materiały z narzutem:')}{' '}<strong>{zl(koszty.materialy.razem)} PLN</strong> {t('(1 szt.)')}</span>
        {aparat.ilosc !== 1 && <span>{t('dla {0} szt.:', liczba(aparat.ilosc))}{' '}<strong>{zl(koszty.materialy.razem * aparat.ilosc)} PLN</strong>{' · '}{t('masa brutto {0} kg', liczba(koszty.materialy.masa_brutto * aparat.ilosc, 1))}</span>}
      </section>
    </div>
  )
}
