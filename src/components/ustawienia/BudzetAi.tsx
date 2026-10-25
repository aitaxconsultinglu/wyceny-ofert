import { useCallback, useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { supabase, wywolajFunkcje } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { dataGodzinaPL, liczba } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { zapiszUstawienia } from './zapiszUstawienie'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'
import { t } from '@/i18n'

type Poziom = 'tani' | 'standard' | 'najlepszy'
interface Cennik { wejscie: number; wyjscie: number; cache_odczyt: number; cache_zapis: number }
interface UstawieniaAi {
  modele: Record<Poziom, string>
  tryby: Record<string, Poziom>
  ceny_usd_za_mln: Record<string, Cennik>
  limit_miesieczny_pln: number
  limit_dzienny_uzytkownika_pln: number
  max_stron_na_wywolanie: number
  max_obrazow_na_wywolanie: number
  kurs_usd_awaryjny: number
}
interface Zuzycie { miesiac_pln: number; dzis_uzytkownik_pln: number; wywolan_miesiac: number; limit_miesieczny_pln: number; limit_dzienny_pln: number }
interface Wywolanie { id: number; user_id: string | null; tryb: string; model: string | null; tokeny_wejscie: number; tokeny_wyjscie: number; koszt_pln: number; obrazow: number; status: string; komunikat: string | null; czas_ms: number | null; utworzono: string }

const TRYBY: Record<string, string> = {
  klasyfikuj_mail: t('Klasyfikacja maili'), normalizuj_pozycje: t('Normalizacja pozycji'), wyciagnij_oferte: t('Odczyt ofert dostawców'),
  wyciagnij_liste_z_rysunku: t('Listy z rysunków'), analizuj_zapytanie: t('Analiza zapytania'), zaproponuj_klauzule: t('Propozycja klauzul'),
  odczytaj_dokument: t('Wersje edytowalne - odczyt'), przetlumacz_dokument: t('Wersje edytowalne - tłumaczenie'),
}
const POZIOMY: Record<Poziom, string> = { tani: t('tani'), standard: t('standardowy'), najlepszy: t('najlepszy (na żądanie)') }
const STATUSY: Record<string, string> = { ok: t('ok'), blad: t('błąd'), odmowa_budzetu: t('odmowa - budżet'), odmowa_modelu: t('odmowa modelu') }

/** Ustawienia → AI i budżet: zużycie w miesiącu, limity, modele i ceny, ostatnie wywołania (administrator). */
export function BudzetAi() {
  const [ai, setAi] = useState<UstawieniaAi | null>(null)
  const [zuzycie, setZuzycie] = useState<Zuzycie | null>(null)
  const [wywolania, setWywolania] = useState<Wywolanie[]>([])
  const [ludzie, setLudzie] = useState<Record<string, string>>({})
  const [klucz, setKlucz] = useState<'sprawdzanie' | 'jest' | 'brak' | 'blad'>('sprawdzanie')
  const [zmieniony, setZmieniony] = useState(false)
  const [blad, setBlad] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const wczytaj = useCallback(async () => {
    const poczatek = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const [u, z, w, l] = await Promise.all([
      supabase.from('ustawienia').select('wartosc').eq('klucz', 'ai').single(),
      supabase.rpc('ai_zuzycie'),
      supabase.from('ai_uzycie').select('*').gte('utworzono', poczatek).order('utworzono', { ascending: false }).limit(500),
      supabase.rpc('lista_pracownikow'),
    ])
    const e = [u, z, w].find((x) => x.error)?.error
    if (e) setBlad(komunikatPL(e.message))
    setAi(u.data?.wartosc as UstawieniaAi)
    setZuzycie((z.data as Zuzycie[] | null)?.[0] ?? null)
    setWywolania((w.data ?? []) as Wywolanie[])
    setLudzie(Object.fromEntries(((l.data ?? []) as { id: string; nazwa: string }[]).map((x) => [x.id, x.nazwa])))
    setZmieniony(false)
  }, [])
  useEffect(() => { void wczytaj() }, [wczytaj])

  // Status klucza: liczenie tokenów nic nie kosztuje i nie wysyła żadnego dokumentu.
  useEffect(() => {
    void wywolajFunkcje('ai', { tryb: 'klasyfikuj_mail', szacuj: true, tekst: 'test' }).then(({ blad: b }) =>
      setKlucz(!b ? 'jest' : /klucz claude api nie jest ustawiony/i.test(b) ? 'brak' : 'blad'))
  }, [])

  if (!ai) return <p className="text-sm text-slate-500">{blad ?? t('Wczytywanie...')}</p>
  const ust = (zm: Partial<UstawieniaAi>) => { setAi({ ...ai, ...zm }); setZmieniony(true); setInfo(null) }
  const ustCene = (model: string, pole: keyof Cennik, v: number) =>
    ust({ ceny_usd_za_mln: { ...ai.ceny_usd_za_mln, [model]: { ...ai.ceny_usd_za_mln[model], [pole]: v } } })

  async function zapisz() {
    if (!ai) return
    const brakCennika = Object.values(ai.modele).filter((m) => !ai.ceny_usd_za_mln[m])
    if (brakCennika.length) { setBlad(t('Uzupełnij cennik dla: {0}.', brakCennika.join(', '))); return }
    const b = await zapiszUstawienia({ ai })
    if (b) setBlad(b); else { setBlad(null); setInfo(t('Zapisano ustawienia AI.')); await wczytaj() }
  }

  const proc = zuzycie && zuzycie.limit_miesieczny_pln > 0 ? (zuzycie.miesiac_pln / zuzycie.limit_miesieczny_pln) * 100 : 0
  const wgTrybu = Object.entries(wywolania.reduce<Record<string, { n: number; pln: number }>>((acc, w) => {
    acc[w.tryb] ??= { n: 0, pln: 0 }
    acc[w.tryb].n += w.status === 'ok' ? 1 : 0
    acc[w.tryb].pln += Number(w.koszt_pln)
    return acc
  }, {})).sort((a, b) => b[1].pln - a[1].pln)
  const modeleWCenniku = [...new Set([...Object.values(ai.modele), ...Object.keys(ai.ceny_usd_za_mln)])]

  const kolumnyWywolan: KolumnaTabeli<Wywolanie>[] = [
    { id: 'kiedy', naglowek: t('Kiedy'), typ: 'data', wartosc: (w) => w.utworzono, komorka: (w) => dataGodzinaPL(w.utworzono), className: 'whitespace-nowrap text-xs' },
    { id: 'kto', naglowek: t('Kto'), typ: 'lista', wartosc: (w) => (w.user_id ? ludzie[w.user_id] ?? '-' : 'import (seed)'), className: 'text-xs' },
    { id: 'funkcja', naglowek: t('Funkcja'), typ: 'lista', wartosc: (w) => TRYBY[w.tryb] ?? w.tryb, className: 'text-xs' },
    { id: 'model', naglowek: t('Model'), typ: 'lista', wartosc: (w) => w.model, className: 'font-mono text-xs' },
    { id: 'tokeny', naglowek: t('Tokeny we / wy'), typ: 'liczba', wartosc: (w) => w.tokeny_wejscie, komorka: (w) => `${liczba(w.tokeny_wejscie, 0)} / ${liczba(w.tokeny_wyjscie, 0)}`, className: 'text-xs' },
    { id: 'obrazy', naglowek: t('Obrazy'), typ: 'liczba', wartosc: (w) => w.obrazow || null, className: 'text-xs' },
    { id: 'koszt', naglowek: t('Koszt [zł]'), typ: 'liczba', wartosc: (w) => Number(w.koszt_pln), komorka: (w) => liczba(w.koszt_pln, 2), className: 'text-xs' },
    { id: 'czas', naglowek: t('Czas'), typ: 'liczba', wartosc: (w) => w.czas_ms, komorka: (w) => (w.czas_ms ? `${liczba(w.czas_ms / 1000, 1)} s` : ''), className: 'text-xs' },
    { id: 'status', naglowek: t('Status'), typ: 'lista', wartosc: (w) => STATUSY[w.status] ?? w.status, className: 'text-xs' },
  ]

  return (
    <div className="space-y-4">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {info && <Komunikat rodzaj="sukces">{info}</Komunikat>}
      {klucz === 'brak' && (
        <Komunikat rodzaj="ostrzezenie">
          {t('Klucz Claude API nie jest ustawiony - odczyt ofert, list z rysunków i analiza zapytań nie działają. Klucz wpisuje się w swoim terminalu (nie w aplikacji):')}{' '}<code className="text-xs">{t('npx supabase secrets set ANTHROPIC_API_KEY=... --project-ref zrwouorevhxdtvubniwg')}</code>{t('. Twardy limit wydatków ustaw też w Claude Console (Workspace → Limits).')}
        </Komunikat>
      )}

      <section className="sekcja max-w-3xl space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{t('Zużycie AI w tym miesiącu')}</h3>
          <span className="text-xs text-slate-500">{t('Klucz Claude API:')}{' '}{klucz === 'jest' ? 'ustawiony' : klucz === 'brak' ? 'brak' : klucz === 'blad' ? t('nie udało się sprawdzić') : t('sprawdzanie...')}</span>
        </div>
        {zuzycie && (
          <>
            <div className="flex justify-between text-sm">
              <span>{liczba(zuzycie.wywolan_miesiac, 0)} {t('wywołań')}</span>
              <span className={cn('tabular-nums', proc >= 80 && 'font-semibold text-red-700')}>
                {liczba(zuzycie.miesiac_pln, 2)} {t('zł z')}{' '}{liczba(zuzycie.limit_miesieczny_pln, 0)} {t('zł (')}{liczba(proc, 1)}%)
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div className={cn('h-full rounded-full', proc >= 100 ? 'bg-red-500' : proc >= 80 ? 'bg-amber-400' : 'bg-limonka')} style={{ width: `${Math.min(100, proc)}%` }} />
            </div>
            <p className="text-xs text-slate-500">{t('Po przekroczeniu limitu funkcja AI odmawia z komunikatem - podnieś limit poniżej. Koszt przeliczany po kursie USD z NBP.')}</p>
          </>
        )}
        {wgTrybu.length > 0 && (
          <table className="mt-2 w-full border-collapse text-sm">
            <thead><tr>{[t('Funkcja'), t('Wywołań'), t('Koszt [zł]')].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
            <tbody>{wgTrybu.map(([t, x]) => <tr key={t}><td className="komorka">{TRYBY[t] ?? t}</td><td className="komorka liczba">{x.n}</td><td className="komorka liczba">{liczba(x.pln, 2)}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section className="sekcja max-w-3xl space-y-3">
        <h3 className="font-semibold">{t('Limity')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {([
            ['limit_miesieczny_pln', t('Limit miesięczny firmy [zł]')], ['limit_dzienny_uzytkownika_pln', t('Limit dzienny na użytkownika [zł]')],
            ['max_obrazow_na_wywolanie', t('Maks. obrazów (kafli) w jednym wywołaniu')], ['max_stron_na_wywolanie', t('Maks. stron PDF w jednym wywołaniu')],
            ['kurs_usd_awaryjny', t('Kurs USD, gdy brak kursu NBP')],
          ] as [keyof UstawieniaAi, string][]).map(([k, et]) => (
            <label key={k}><span className="etykieta">{et}</span>
              <PoleLiczby className="pole" wartosc={ai[k] as number} zmien={(v) => ust({ [k]: v ?? 0 } as Partial<UstawieniaAi>)} />
            </label>
          ))}
        </div>
      </section>

      <section className="sekcja max-w-3xl space-y-3">
        <h3 className="font-semibold">{t('Modele i ceny')}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(POZIOMY) as Poziom[]).map((p) => (
            <label key={p}><span className="etykieta">{t('Model')}{' '}{POZIOMY[p]}</span>
              <input className="pole font-mono text-xs" value={ai.modele[p]} onChange={(e) => ust({ modele: { ...ai.modele, [p]: e.target.value.trim() } })} />
            </label>
          ))}
        </div>
        <table className="w-full border-collapse text-sm">
          <thead><tr>{[t('Funkcja'), t('Model')].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
          <tbody>
            {Object.keys(TRYBY).map((t) => (
              <tr key={t}>
                <td className="komorka">{TRYBY[t]}</td>
                <td className="komorka">
                  <select className="pole-komorki" value={ai.tryby[t] ?? 'standard'} onChange={(e) => ust({ tryby: { ...ai.tryby, [t]: e.target.value as Poziom } })}>
                    {(Object.keys(POZIOMY) as Poziom[]).map((p) => <option key={p} value={p}>{POZIOMY[p]} ({ai.modele[p]})</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-slate-500">{t('Ceny w USD za 1 mln tokenów - sprawdź aktualny cennik Anthropic przed zmianą modelu.')}</p>
        <table className="w-full border-collapse text-sm">
          <thead><tr>{[t('Model'), t('Wejście'), t('Wyjście'), t('Odczyt cache'), t('Zapis cache')].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
          <tbody>
            {modeleWCenniku.map((m) => {
              const c = ai.ceny_usd_za_mln[m] ?? { wejscie: 0, wyjscie: 0, cache_odczyt: 0, cache_zapis: 0 }
              return (
                <tr key={m} className={cn(!ai.ceny_usd_za_mln[m] && 'bg-amber-50')}>
                  <td className="komorka font-mono text-xs">{m}</td>
                  {(['wejscie', 'wyjscie', 'cache_odczyt', 'cache_zapis'] as (keyof Cennik)[]).map((k) => (
                    <td key={k} className="komorka"><PoleLiczby className="pole-komorki w-20 text-right" wartosc={c[k]} zmien={(v) => ustCene(m, k, v ?? 0)} /></td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        <Button wariant="glowny" disabled={!zmieniony} onClick={() => void zapisz()}><Save className="h-4 w-4" /> {t('Zapisz ustawienia AI')}</Button>
      </section>

      <section className="sekcja space-y-2">
        <h3 className="font-semibold">{t('Ostatnie wywołania (ten miesiąc)')}</h3>
        <Tabela id="wywolania-ai" kolumny={kolumnyWywolan} wiersze={wywolania} klucz={(w) => w.id} klasaWiersza={(w) => (w.status !== 'ok' ? 'text-amber-800' : undefined)} pusto={t('Brak wywołań w tym miesiącu.')} />
      </section>
    </div>
  )
}
