import { AlertTriangle } from 'lucide-react'
import { liczba, procent, zl } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Ostrzezenie, WynikWyceny } from '@/lib/kalkulacja'
import type { Marze, Wycena } from '@/lib/wyceny'
import { PoleLiczby } from '../PoleLiczby'
import { t } from '@/i18n'

interface Props {
  wynik: WynikWyceny
  wycena: Wycena
  marze: Marze | null
  ostrzezenia: Ostrzezenie[]
  tylkoOdczyt: boolean
  jestPrezesem: boolean
  zmienMarze: (zm: Partial<Marze>) => void
  zmienWycene: (zm: Partial<Wycena>) => void
  pobierzKurs: () => void
}

const RODZAJE: Record<Ostrzezenie['rodzaj'], string> = {
  brak_ceny: t('brak ceny'), stara_cena: t('stara cena'), ryzyko_cenowe: t('ryzyko cenowe'), termin_dostawy: t('termin dostawy'), kpl_bez_masy: t('komplet bez masy'),
}

/** Podsumowanie (następca "Oceny ekonomicznej" z dotychczasowego arkusza wyceny): koszty, PLN/kg, udział, zysk, cena, korekta prezesa. */
export function Podsumowanie({ wynik, wycena, marze, ostrzezenia, tylkoOdczyt, jestPrezesem, zmienMarze, zmienWycene, pobierzKurs }: Props) {
  const wiersze: [string, { koszt: number; zl_kg: number | null; udzial: number }][] = [
    ['Robocizna', wynik.robocizna], ['Materiały', wynik.materialy], ['Kooperacja', wynik.kooperacja],
    ['Badania, odbiory, transport, projekt', wynik.badania],
  ]
  const blokadaMarz = tylkoOdczyt || (wycena.status === 'do_zatwierdzenia' && !jestPrezesem)
  return (
    <div className="space-y-4">
      <section className="sekcja space-y-2">
        <h4 className="text-sm font-semibold">{t('Ocena ekonomiczna - masa netto razem')}{' '}{liczba(wynik.masa_kg, 0)} {t('kg (')}{liczba(wynik.masa_kg / 1000, 3)} {t('t)')}</h4>
        <table className="w-full max-w-3xl border-collapse">
          <thead><tr>{['', 'PLN', t('PLN/kg'), t('Udział')].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
          <tbody>
            {wiersze.map(([n, w]) => (
              <tr key={n}><td className="komorka">{n}</td><td className="komorka liczba">{zl(w.koszt)}</td><td className="komorka liczba">{w.zl_kg !== null ? liczba(w.zl_kg, 2) : ''}</td><td className="komorka liczba">{procent(w.udzial)}</td></tr>
            ))}
            <tr className="font-semibold"><td className="komorka">{t('Koszty całkowite')}</td><td className="komorka liczba">{zl(wynik.koszty.koszt)}</td><td className="komorka liczba">{wynik.koszty.zl_kg !== null ? liczba(wynik.koszty.zl_kg, 2) : ''}</td><td className="komorka liczba">100%</td></tr>
          </tbody>
        </table>
      </section>

      {wynik.aparaty.length > 1 && (
        <section className="sekcja">
          <h4 className="mb-2 text-sm font-semibold">{t('Aparaty')}</h4>
          <table className="w-full border-collapse">
            <thead><tr>{['Aparat', 'Szt.', 'Masa szt. kg', 'Robocizna', 'Materiały', 'Kooperacja', 'Badania...', 'Koszt szt.', 'Koszt razem', ...(marze ? ['Cena szt.', 'Cena razem'] : [])].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
            <tbody>
              {wynik.aparaty.map((a, i) => (
                <tr key={i}>
                  <td className="komorka">{a.nazwa}</td><td className="komorka liczba">{liczba(a.ilosc)}</td><td className="komorka liczba">{liczba(a.masa_netto_kg / a.ilosc, 0)}</td>
                  <td className="komorka liczba">{zl(a.robocizna.wartosc)}</td><td className="komorka liczba">{zl(a.materialy.razem)}</td><td className="komorka liczba">{zl(a.kooperacja.razem)}</td>
                  <td className="komorka liczba">{zl(a.badania.razem)}</td><td className="komorka liczba">{zl(a.koszt_szt)}</td><td className="komorka liczba font-medium">{zl(a.koszt)}</td>
                  {marze && <><td className="komorka liczba">{a.cena_szt !== null ? zl(a.cena_szt) : ''}</td><td className="komorka liczba font-medium">{a.cena !== null ? zl(a.cena) : ''}</td></>}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {marze ? (
        <section className="sekcja space-y-3">
          <h4 className="text-sm font-semibold">{t('Cena')}</h4>
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <label><span className="etykieta">{t('Narzut / zysk [%]')}</span>
              <span className="block w-24 rounded border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={Number(marze.narzut_zysk_proc)} disabled={blokadaMarz} zmien={(n) => zmienMarze({ narzut_zysk_proc: n ?? 0 })} /></span></label>
            <label><span className="etykieta">{t('Zaokrąglenie ceny aparatu')}</span>
              <select className="pole w-36" disabled={blokadaMarz} value={Number(marze.zaokraglenie)} onChange={(e) => zmienMarze({ zaokraglenie: Number(e.target.value) })}>
                <option value={0}>bez</option><option value={10}>{t('do 10 zł')}</option><option value={100}>{t('do 100 zł')}</option><option value={1000}>{t('do 1000 zł')}</option>
              </select></label>
            <label title={jestPrezesem ? undefined : t('Korektę zmienia tylko prezes')}><span className="etykieta">{t('Korekta prezesa [zł]')}</span>
              <span className="block w-32 rounded border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={Number(marze.korekta_prezesa_kwota)} ujemne disabled={blokadaMarz || !jestPrezesem} zmien={(n) => zmienMarze({ korekta_prezesa_kwota: n ?? 0 })} /></span></label>
            <label><span className="etykieta">{t('Korekta prezesa [%]')}</span>
              <span className="block w-20 rounded border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={Number(marze.korekta_prezesa_proc)} ujemne disabled={blokadaMarz || !jestPrezesem} zmien={(n) => zmienMarze({ korekta_prezesa_proc: n ?? 0 })} /></span></label>
            <label><span className="etykieta">{t('Kurs EUR')}</span>
              <span className="flex items-center gap-1">
                <span className="w-24 rounded border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={wycena.kurs_eur} puste disabled={tylkoOdczyt} zmien={(n) => zmienWycene({ kurs_eur: n, kurs_eur_zrodlo: 'ręcznie', kurs_eur_data: null })} /></span>
                {!tylkoOdczyt && <button className="text-xs text-blekit-ciemny underline" onClick={pobierzKurs}>NBP</button>}
              </span>
              {wycena.kurs_eur_zrodlo && <span className="text-xs text-slate-500">{wycena.kurs_eur_zrodlo} {wycena.kurs_eur_data ?? ''}</span>}
            </label>
          </div>
          <table className="w-full max-w-2xl border-collapse text-sm">
            <tbody>
              <tr><td className="komorka">{t('Koszty całkowite')}</td><td className="komorka liczba">{zl(wynik.koszty.koszt)} PLN</td></tr>
              <tr><td className="komorka">{t('Zysk (')}{liczba(wynik.zysk_proc)}%{Number(marze.zaokraglenie) ? t(', z zaokrągleniem do {0} zł', marze.zaokraglenie) : ''})</td><td className="komorka liczba">{zl(wynik.zysk)} PLN</td></tr>
              <tr className="font-semibold"><td className="komorka">{t('Cena')}</td><td className="komorka liczba">{zl(wynik.cena)} PLN</td></tr>
              {(wynik.korekta ?? 0) !== 0 && <tr><td className="komorka">{t('Korekta prezesa')}</td><td className="komorka liczba">{zl(wynik.korekta)} PLN</td></tr>}
              <tr className="bg-limonka-jasna text-base font-bold"><td className="komorka">{t('Cena końcowa (netto)')}</td><td className="komorka liczba">{zl(wynik.cena_koncowa)} PLN</td></tr>
              <tr><td className="komorka">{t('Cena za kg')}</td><td className="komorka liczba">{wynik.cena_koncowa_zl_kg !== null ? t('{0} PLN/kg', liczba(wynik.cena_koncowa_zl_kg, 2)) : '-'}</td></tr>
              {wynik.cena_koncowa_eur !== null && <tr><td className="komorka">{t('Cena w EUR')}</td><td className="komorka liczba">{zl(wynik.cena_koncowa_eur)} EUR</td></tr>}
              {wynik.ma_opcje && (
                <tr><td className="komorka">{t('Wariant bez pozycji opcjonalnych (bez korekty)')}</td><td className="komorka liczba">{zl(wynik.cena_bez_opcji)} PLN{wynik.masa_kg ? t(' ({0} PLN/kg)', liczba((wynik.cena_bez_opcji ?? 0) / wynik.masa_kg, 2)) : ''}</td></tr>
              )}
            </tbody>
          </table>
        </section>
      ) : (
        <section className="sekcja text-sm text-slate-600">
          {t('Narzut, zysk i korekta prezesa są widoczne tylko dla osób z uprawnieniem „widzi narzuty i marże”.')}
        </section>
      )}

      <section className="sekcja space-y-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" /> {t('Ostrzeżenia (')}{ostrzezenia.length})</h4>
        {ostrzezenia.length === 0 ? <p className="text-sm text-limonka-ciemna">{t('Brak ostrzeżeń.')}</p> : (
          <ul className="space-y-1 text-sm">
            {ostrzezenia.map((o, i) => (
              <li key={i} className="flex gap-2">
                <span className={cn('znacznik shrink-0', o.rodzaj === 'ryzyko_cenowe' || o.rodzaj === 'termin_dostawy' ? 'bg-red-50 text-red-700 ring-red-300' : 'bg-amber-50 text-amber-800 ring-amber-300')}>{RODZAJE[o.rodzaj]}</span>
                <span><strong>{o.aparat}</strong> / {o.pozycja}: {o.opis}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
