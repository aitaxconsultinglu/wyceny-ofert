import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Copy, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { dataGodzinaPL, zl } from '@/lib/format'
import { cn } from '@/lib/utils'
import { STATUSY_ZAPYTANIA, ZRODLA, etykietaRodzaju, type RodzajAparatu, type StatusZapytania, type ZakresWymiennika } from '@/lib/zapytania'
import { ZmianaRodzaju, ZnacznikRodzaju } from './RodzajAparatu'
import { doKosza } from '@/lib/kosz'
import { useOdswiezPoHistorii, useZakresHistorii } from '@/lib/historia'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'
import { ETYKIETY_STATUSU_WYCENY, KOLORY_STATUSU_WYCENY, type StatusWyceny } from '@/lib/wyceny'
import { uprawnienia, type Profil } from '@/lib/types'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { DokumentyZapytania } from './DokumentyZapytania'
import { OfertyDoZapytania } from '../oferty/OfertyDoZapytania'
import { KartaAnalizy } from './KartaAnalizy'
import { RysunkiZapytania } from '../rysunki/RysunkiZapytania'
import { ZapytaniaDoDostawcow } from '../zapytaniaDostawcow/ZapytaniaDoDostawcow'
import { PrzygotowanieAutomatyczne } from './PrzygotowanieAutomatyczne'
import { FLAGA_PRZYGOTUJ } from './NoweZMaila'
import { WycenaMaterialowa } from './WycenaMaterialowa'
import { t } from '@/i18n'

interface Zapytanie {
  id: string; numer: string; klient_id: string | null; przedmiot: string; nr_zapytania_klienta: string | null
  nr_zapotrzebowania: string | null; zrodlo: string; link_platformy: string | null; termin_oferty: string | null
  termin_pytan: string | null; prowadzacy: string | null; status: StatusZapytania; uwagi: string | null; zmodyfikowano: string
  rodzaj_aparatu: RodzajAparatu | null; zakres_wymiennika: ZakresWymiennika | null; zakres_opis: string | null
}
interface WersjaWyceny { id: string; wersja: number; nazwa: string | null; status: StatusWyceny; utworzono: string; zatwierdzono: string | null; skopiowana_z: string | null }

type Zakladka = 'dokumenty' | 'rysunki' | 'analiza' | 'wyceny' | 'dostawcy' | 'oferty' | 'historia'

/** "2026-11-09T12:00:00+01:00" -> wartość pola datetime-local w czasie lokalnym. */
function doPola(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const zPola = (v: string) => (v ? new Date(v).toISOString() : null)

export function KartaZapytania({ id, profil, zamknij, otworzWycene }: { id: string; profil: Profil; zamknij: () => void; otworzWycene: (id: string) => void }) {
  const up = uprawnienia(profil)
  const [materialowa, setMaterialowa] = useState(false)
  const [z, setZ] = useState<Zapytanie | null>(null)
  const [klienci, setKlienci] = useState<{ id: string; nazwa: string }[]>([])
  const [ludzie, setLudzie] = useState<{ id: string; nazwa: string }[]>([])
  const [wersje, setWersje] = useState<WersjaWyceny[]>([])
  const [ceny, setCeny] = useState<Record<string, number | null>>({})
  const [zakladka, setZakladka] = useState<Zakladka>('dokumenty')
  // Przejście z karty analizy do zapytań do dostawców otwiera generator z usługami z karty.
  const [generatorZAnalizy, setGeneratorZAnalizy] = useState(false)
  // Zapytanie założone z maila z opcją "od razu przygotuj" - okno otwiera się samo.
  const [przygotowanie, setPrzygotowanie] = useState<'reczne' | 'po_imporcie' | null>(() => {
    try {
      if (sessionStorage.getItem(FLAGA_PRZYGOTUJ) === id) { sessionStorage.removeItem(FLAGA_PRZYGOTUJ); return 'po_imporcie' }
    } catch { /* bez sessionStorage - przycisk w nagłówku */ }
    return null
  })
  const [zmieniony, setZmieniony] = useState(false)
  const [blad, setBlad] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [zmianaRodzaju, setZmianaRodzaju] = useState(false)
  const [historia, setHistoria] = useState<{ id: number; tabela: string; akcja: string; user_email: string | null; czas: string; zmiany: Record<string, unknown> }[]>([])

  const wczytaj = useCallback(async () => {
    const [{ data, error }, kl, lu, wy] = await Promise.all([
      supabase.from('zapytania').select('*').eq('id', id).single(),
      supabase.from('klienci').select('id, nazwa').order('nazwa'),
      supabase.rpc('lista_pracownikow'),
      supabase.from('wyceny').select('id, wersja, nazwa, status, utworzono, zatwierdzono, skopiowana_z').eq('zapytanie_id', id).order('wersja', { ascending: false }),
    ])
    if (error) { setBlad(komunikatPL(error.message)); return }
    setZ(data as Zapytanie); setZmieniony(false)
    setKlienci(kl.data ?? []); setLudzie((lu.data ?? []) as { id: string; nazwa: string }[])
    const w = (wy.data ?? []) as WersjaWyceny[]
    setWersje(w)
    const c: Record<string, number | null> = {}
    for (const x of w.filter((x) => x.status === 'zatwierdzona')) {
      const { data: cz } = await supabase.rpc('cena_zatwierdzona', { p_wycena: x.id })
      c[x.id] = (cz as { cena_koncowa: number }[] | null)?.[0]?.cena_koncowa ?? null
    }
    setCeny(c)
  }, [id])
  useEffect(() => { void wczytaj() }, [wczytaj])
  // Usunięcia w karcie (dokumenty, odczyty, wersje wycen) - kroki do cofnięcia w zakresie tego zapytania.
  useZakresHistorii(`zapytanie:${id}`)
  useOdswiezPoHistorii(() => void wczytaj())

  useEffect(() => {
    if (zakladka !== 'historia') return
    void supabase.from('audit_log').select('id, tabela, akcja, user_email, czas, zmiany').eq('zapytanie_id', id).order('czas', { ascending: false }).limit(200)
      .then(({ data }) => setHistoria((data ?? []) as typeof historia))
  }, [zakladka, id])

  if (!z) return <p className="text-slate-500">{blad ?? t('Wczytywanie...')}</p>
  const ust = (zm: Partial<Zapytanie>) => { setZ({ ...z, ...zm }); setZmieniony(true); setInfo(null) }

  async function zapisz() {
    if (!z) return
    setBlad(null)
    const { id: _id, zmodyfikowano: _m, ...dane } = z
    void _id; void _m
    const { error } = await supabase.from('zapytania').update(dane).eq('id', z.id)
    if (error) { setBlad(komunikatPL(error.message)); return }
    setInfo(t('Zapisano.')); await wczytaj()
  }

  async function dodajKlienta() {
    const nazwa = window.prompt(t('Nazwa nowego klienta:'))
    if (!nazwa?.trim()) return
    const { data, error } = await supabase.from('klienci').insert({ nazwa: nazwa.trim() }).select('id, nazwa').single()
    if (error) { setBlad(komunikatPL(error.message)); return }
    setKlienci([...klienci, data].sort((a, b) => a.nazwa.localeCompare(b.nazwa)))
    ust({ klient_id: data.id })
  }

  async function nowaWycena() {
    const { data, error } = await supabase.rpc('nowa_wycena', { p_zapytanie: id, p_nazwa: null })
    if (error) { setBlad(komunikatPL(error.message)); return }
    if (z && ['nowe', 'w_analizie', 'zapytania_do_dostawcow'].includes(z.status)) await supabase.from('zapytania').update({ status: 'kalkulacja' }).eq('id', id)
    otworzWycene(data as string)
  }

  async function usunZapytanie() {
    if (!z || !window.confirm(t('Przenieść zapytanie {0} do kosza razem z dokumentami, odczytami, analizą, wycenami i ofertami? Można je przywrócić z kosza.', z.numer))) return
    try { await doKosza('zapytanie', [z.id], 'zapytania', t('usunięcie zapytania {0}', z.numer)); zamknij() } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }
  async function usunWersje(w: WersjaWyceny) {
    if (!window.confirm(t('Przenieść wycenę v{0} do kosza?', w.wersja))) return
    try { await doKosza('wycena', [w.id], `zapytanie:${id}`, t('usunięcie wyceny v{0}', w.wersja)); await wczytaj() } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }

  async function kopiuj(w: WersjaWyceny) {
    const { data, error } = await supabase.rpc('kopiuj_wycene', { p_wycena: w.id })
    if (error) { setBlad(komunikatPL(error.message)); return }
    otworzWycene(data as string)
  }

  async function zapiszRodzaj(r: { rodzaj: RodzajAparatu | null; zakres: ZakresWymiennika | null; opis: string }) {
    if (!z || !r.rodzaj) return
    if (z.rodzaj_aparatu && (z.rodzaj_aparatu !== r.rodzaj || z.zakres_wymiennika !== r.zakres) && !window.confirm(
      t('Zmienić rodzaj na „{0}”? Zmieni się szablon elementów i kategorie tabel rysunków. Dane (dokumenty, odczyty, wyceny) zostają.', etykietaRodzaju(r.rodzaj, r.zakres, r.opis)))) return
    const { error } = await supabase.from('zapytania').update({
      rodzaj_aparatu: r.rodzaj, zakres_wymiennika: r.rodzaj === 'wymiennik' ? r.zakres ?? 'kompletny' : null,
      zakres_opis: r.rodzaj === 'wymiennik' && r.zakres === 'czesc' ? r.opis.trim() || null : null,
    }).eq('id', z.id)
    if (error) { setBlad(komunikatPL(error.message)); return }
    setZmianaRodzaju(false); setInfo(t('Zapisano rodzaj aparatu.')); await wczytaj()
  }

  // Stare zapytanie bez rodzaju: najpierw wybór (od rodzaju zależą szablony, tabele rysunków i wymagania).
  if (!z.rodzaj_aparatu) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Button rozmiar="maly" wariant="cichy" onClick={zamknij}><ArrowLeft className="h-4 w-4" /> {t('Lista')}</Button>
        <section className="sekcja space-y-3">
          <h2 className="text-lg font-semibold">{z.numer} · {z.przedmiot}</h2>
          <p className="text-sm text-slate-600">{t('To zapytanie nie ma jeszcze rodzaju aparatu. Wybierz go - od rodzaju zależą szablon elementów, kategorie tabel rysunków i wymagania.')}</p>
          {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
          <ZmianaRodzaju poczatkowy={{ rodzaj: null, zakres: null, opis: '' }} zapisz={(r) => void zapiszRodzaj(r)} />
        </section>
      </div>
    )
  }

  const kolumnyWycen: KolumnaTabeli<WersjaWyceny>[] = [
    { id: 'wersja', naglowek: t('Wersja'), typ: 'liczba', wartosc: (w) => w.wersja, className: 'font-medium text-left', komorka: (w) => <>v{w.wersja}{w.skopiowana_z && <span className="ml-1 text-xs text-slate-400">{t('(kopia)')}</span>}</> },
    { id: 'nazwa', naglowek: t('Nazwa'), typ: 'tekst', wartosc: (w) => w.nazwa },
    { id: 'status', naglowek: t('Status'), typ: 'lista', wartosc: (w) => ETYKIETY_STATUSU_WYCENY[w.status], komorka: (w) => <span className={cn('znacznik', KOLORY_STATUSU_WYCENY[w.status])}>{ETYKIETY_STATUSU_WYCENY[w.status]}</span> },
    { id: 'utworzono', naglowek: t('Utworzono'), typ: 'data', wartosc: (w) => w.utworzono, komorka: (w) => dataGodzinaPL(w.utworzono), className: 'text-sm' },
    { id: 'zatwierdzono', naglowek: t('Zatwierdzono'), typ: 'data', wartosc: (w) => w.zatwierdzono, komorka: (w) => dataGodzinaPL(w.zatwierdzono), className: 'text-sm' },
    { id: 'cena', naglowek: t('Cena końcowa'), typ: 'liczba', wartosc: (w) => ceny[w.id] ?? null, komorka: (w) => (ceny[w.id] != null ? `${zl(ceny[w.id])} zł` : '') },
    {
      id: 'akcje', naglowek: '', typ: 'tekst', wartosc: () => '', bezFiltra: true, bezSortu: true,
      komorka: (w) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button rozmiar="maly" title={t('Skopiuj jako nową wersję')} onClick={() => void kopiuj(w)}><Copy className="h-4 w-4" /> {t('Kopiuj')}</Button>
          <Button rozmiar="maly" wariant="cichy" title={t('Przenieś wersję do kosza')} onClick={() => void usunWersje(w)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ]
  type WpisHistorii = (typeof historia)[number]
  const kolumnyHistorii: KolumnaTabeli<WpisHistorii>[] = [
    { id: 'czas', naglowek: t('Kiedy'), typ: 'data', wartosc: (h) => h.czas, komorka: (h) => dataGodzinaPL(h.czas), className: 'whitespace-nowrap text-sm' },
    { id: 'kto', naglowek: t('Kto'), typ: 'lista', wartosc: (h) => h.user_email ?? 'system', className: 'text-sm' },
    { id: 'co', naglowek: t('Co'), typ: 'lista', wartosc: (h) => `${h.tabela} - ${h.akcja}`, className: 'text-sm' },
    {
      id: 'zmiany', naglowek: t('Zmiany'), typ: 'tekst', className: 'font-mono text-xs text-slate-600',
      wartosc: (h) => (h.akcja === 'update' ? Object.entries(h.zmiany ?? {}).map(([k, v]) => `${k}: ${JSON.stringify((v as { z: unknown }).z)} → ${JSON.stringify((v as { na: unknown }).na)}`).join('; ').slice(0, 300) : ''),
    },
  ]

  const pole = 'pole'
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button rozmiar="maly" wariant="cichy" onClick={zamknij}><ArrowLeft className="h-4 w-4" /> {t('Lista')}</Button>
        <h2 className="text-lg font-semibold">{z.numer}</h2>
        <span className="text-slate-600">{z.przedmiot}</span>
        <ZnacznikRodzaju rodzaj={z.rodzaj_aparatu} zakres={z.zakres_wymiennika} opis={z.zakres_opis} />
        <button className="text-xs text-slate-500 underline" onClick={() => setZmianaRodzaju(!zmianaRodzaju)}>{t('zmień rodzaj')}</button>
        <span className="ml-auto" />
        <Button rozmiar="maly" wariant="cichy" title={t('Przenieś zapytanie do kosza')} onClick={() => void usunZapytanie()}><Trash2 className="h-4 w-4" /> {t('Usuń')}</Button>
        {(
          <Button rozmiar="maly" wariant="akcent" onClick={() => setMaterialowa(true)}
            title={t('Lista materiałów i parametry z rysunków, ceny z kart dostawy Optimy i ofert do tego zapytania')}>
            <Sparkles className="h-4 w-4" /> {t('Wycena materiałowa')}
          </Button>
        )}
        {(
          <Button rozmiar="maly" wariant="akcent" onClick={() => setPrzygotowanie('reczne')}
            title={t('Analiza zapytania, listy z rysunków, wstępna wycena i projekt oferty - do weryfikacji')}>
            <Sparkles className="h-4 w-4" /> {t('Przygotuj automatycznie')}
          </Button>
        )}
      </div>
      {(
        <WycenaMaterialowa otwarty={materialowa} zamknij={() => setMaterialowa(false)} zapytanie={{ id, numer: z.numer, przedmiot: z.przedmiot, status: z.status, rodzaj_aparatu: z.rodzaj_aparatu, zakres_wymiennika: z.zakres_wymiennika, zakres_opis: z.zakres_opis }}
          otworzWycene={otworzWycene} poZakonczeniu={() => void wczytaj()} />
      )}
      <PrzygotowanieAutomatyczne
        otwarty={!!przygotowanie} odRazu={przygotowanie === 'po_imporcie'} zamknij={() => setPrzygotowanie(null)}
        zapytanie={{ id, numer: z.numer, przedmiot: z.przedmiot, klient: klienci.find((k) => k.id === z.klient_id)?.nazwa ?? null, klient_id: z.klient_id, nr_zapytania_klienta: z.nr_zapytania_klienta, termin_oferty: z.termin_oferty, status: z.status }}
        widziMarze={up.widziMarze} otworzWycene={otworzWycene} otworzZakladke={(k) => { setGeneratorZAnalizy(false); setZakladka(k) }}
        poZakonczeniu={() => void wczytaj()}
      />
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {info && <Komunikat rodzaj="sukces">{info}</Komunikat>}
      {zmianaRodzaju && (
        <section className="sekcja space-y-2">
          <p className="text-sm text-slate-600">{t('Zmiana rodzaju zmienia szablon elementów i kategorie tabel rysunków (dane nie są kasowane).')}</p>
          <ZmianaRodzaju poczatkowy={{ rodzaj: z.rodzaj_aparatu, zakres: z.zakres_wymiennika, opis: z.zakres_opis ?? '' }} zapisz={(r) => void zapiszRodzaj(r)} />
        </section>
      )}

      <section className="sekcja space-y-3">
        <div className="flex flex-wrap gap-3">
          <label className="w-40"><span className="etykieta">{t('Numer ZO')}</span><input className={pole} value={z.numer} onChange={(e) => ust({ numer: e.target.value })} /></label>
          <label className="min-w-[20rem] flex-1"><span className="etykieta">{t('Przedmiot zapytania')}</span><input className={pole} value={z.przedmiot} onChange={(e) => ust({ przedmiot: e.target.value })} /></label>
          <label className="w-64"><span className="etykieta">{t('Klient')}</span>
            <div className="flex gap-1">
              <select className={pole} value={z.klient_id ?? ''} onChange={(e) => ust({ klient_id: e.target.value || null })}>
                <option value="">-</option>{klienci.map((k) => <option key={k.id} value={k.id}>{k.nazwa}</option>)}
              </select>
              <Button rozmiar="maly" title={t('Nowy klient')} onClick={() => void dodajKlienta()}><Plus className="h-3 w-3" /></Button>
            </div></label>
          <label className="w-48"><span className="etykieta">{t('Status')}</span>
            <select className={pole} value={z.status} onChange={(e) => ust({ status: e.target.value as StatusZapytania })}>
              {STATUSY_ZAPYTANIA.map((s) => <option key={s.id} value={s.id}>{s.etykieta}</option>)}
            </select></label>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="w-48"><span className="etykieta">{t('Nr zapytania klienta')}</span><input className={pole} value={z.nr_zapytania_klienta ?? ''} onChange={(e) => ust({ nr_zapytania_klienta: e.target.value || null })} /></label>
          <label className="w-48"><span className="etykieta">{t('Nr zapotrzebowania')}</span><input className={pole} value={z.nr_zapotrzebowania ?? ''} onChange={(e) => ust({ nr_zapotrzebowania: e.target.value || null })} /></label>
          <label className="w-44"><span className="etykieta">{t('Źródło')}</span>
            <select className={pole} value={z.zrodlo} onChange={(e) => ust({ zrodlo: e.target.value })}>
              {Object.entries(ZRODLA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></label>
          {z.zrodlo === 'platforma' && (
            <label className="w-72"><span className="etykieta">{t('Link do platformy')}</span><input className={pole} value={z.link_platformy ?? ''} onChange={(e) => ust({ link_platformy: e.target.value || null })} /></label>
          )}
          <label className="w-56"><span className="etykieta">{t('Termin złożenia oferty')}</span><input type="datetime-local" className={pole} value={doPola(z.termin_oferty)} onChange={(e) => ust({ termin_oferty: zPola(e.target.value) })} /></label>
          <label className="w-56"><span className="etykieta">{t('Termin zadawania pytań')}</span><input type="datetime-local" className={pole} value={doPola(z.termin_pytan)} onChange={(e) => ust({ termin_pytan: zPola(e.target.value) })} /></label>
          <label className="w-56"><span className="etykieta">{t('Osoba prowadząca')}</span>
            <select className={pole} value={z.prowadzacy ?? ''} onChange={(e) => ust({ prowadzacy: e.target.value || null })}>
              <option value="">-</option>{ludzie.map((l) => <option key={l.id} value={l.id}>{l.nazwa}</option>)}
            </select></label>
        </div>
        <label className="block"><span className="etykieta">{t('Uwagi')}</span><textarea className="pole h-16" value={z.uwagi ?? ''} onChange={(e) => ust({ uwagi: e.target.value || null })} /></label>
        <Button wariant="glowny" disabled={!zmieniony} onClick={() => void zapisz()}><Save className="h-4 w-4" /> {t('Zapisz zapytanie')}</Button>
      </section>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {([['dokumenty', t('Dokumenty')], ['rysunki', t('Rysunki i listy')], ['analiza', t('Karta analizy')], ['wyceny', t('Wyceny ({0})', wersje.length)], ['dostawcy', t('Zapytania do dostawców')], ['oferty', t('Oferty dostawców')], ['historia', t('Historia zmian')]] as [Zakladka, string][]).map(([k, et]) => (
          <button key={k} onClick={() => { setZakladka(k); setGeneratorZAnalizy(false) }}
            className={cn('-mb-px rounded-t-md border px-3 py-1.5 text-sm', zakladka === k ? 'border-slate-200 border-b-white bg-white font-medium' : 'border-transparent text-slate-600 hover:bg-slate-100')}>{et}</button>
        ))}
      </div>

      {zakladka === 'dokumenty' && <DokumentyZapytania zapytanieId={id} numer={z.numer} profil={profil} />}
      {zakladka === 'rysunki' && <RysunkiZapytania zapytanieId={id} numer={z.numer} profil={profil} otworzWycene={otworzWycene} />}
      {zakladka === 'analiza' && (
        <KartaAnalizy
          zapytanie={{ id, numer: z.numer, przedmiot: z.przedmiot, klient: klienci.find((k) => k.id === z.klient_id)?.nazwa ?? null, nr_zapytania_klienta: z.nr_zapytania_klienta, termin_oferty: z.termin_oferty, status: z.status }}
          profil={profil} otworzWycene={otworzWycene} poZmianieZapytania={() => void wczytaj()}
          otworzZakladke={(k) => { setGeneratorZAnalizy(k === 'dostawcy'); setZakladka(k) }}
        />
      )}
      {zakladka === 'dostawcy' && <ZapytaniaDoDostawcow zapytanieId={id} numer={z.numer} profil={profil} zrodloStartowe={generatorZAnalizy ? 'analiza' : undefined} />}
      {zakladka === 'oferty' && <OfertyDoZapytania zapytanieId={id} />}
      {zakladka === 'wyceny' && (
        <div className="space-y-3">
          <Button wariant="glowny" onClick={() => void nowaWycena()}><Plus className="h-4 w-4" /> {t('Nowa wycena')}</Button>
          <Tabela id="wersje-wycen" kolumny={kolumnyWycen} wiersze={wersje} klucz={(w) => w.id} onKlik={(w) => otworzWycene(w.id)} pusto={t('Brak wycen - kliknij „Nowa wycena”.')} />
          {!up.widziMarze && <p className="text-xs text-slate-500">{t('Cenę końcową widać dopiero po zatwierdzeniu przez prezesa.')}</p>}
        </div>
      )}
      {zakladka === 'historia' && (
        <Tabela id="historia-zapytania" kolumny={kolumnyHistorii} wiersze={historia} klucz={(h) => h.id} pusto={t('Brak zmian.')} />
      )}
    </div>
  )
}
