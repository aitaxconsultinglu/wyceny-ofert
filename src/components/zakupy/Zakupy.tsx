import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Trash2, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { dataGodzinaPL, dataPL, liczba, zl } from '@/lib/format'
import { cn } from '@/lib/utils'
import { wierszeZPliku } from '@/lib/arkuszLeniwie'
import { parsujKarteDostawy, type KartaDostawy } from '@/lib/importOptima'
import { wierszeKartyZPdf } from '@/lib/importOptimaPdf'
import { dodajRekord, useOdswiezPoHistorii, usunRekordy, useZakresHistorii, zmienRekordy } from '@/lib/historia'
import { uprawnienia, type Profil } from '@/lib/types'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'
import { t } from '@/i18n'

export type RodzajKosztu = 'materialy' | 'kooperacja' | 'transport_inne'
export const ETYKIETY_RODZAJU_KOSZTU: Record<RodzajKosztu, string> = {
  materialy: t('Materiały'), kooperacja: t('Kooperacja'), transport_inne: t('Transport, badania i inne'),
}

interface Zakup {
  id: number; numer_karty: string; nr_zamowienia: string; typ_zamowienia: string; dostawca_nazwa: string | null; nazwa: string
  ilosc: number; jm: string | null; cena_jedn: number; wartosc: number; data_dostawy: string | null; status: string | null
  rodzaj: string; kategoria: string | null; kategoria_uslugi: string | null; gatunek: string | null
  masa_kg: number | null; masa_zrodlo: string | null; cena_kg: number | null; poprawiona_recznie: boolean
  rodzaj_kosztu: RodzajKosztu | null; rodzaj_reczny: boolean; klasyfikacja_powod: string | null
}
interface ImportOptimy {
  id: string; numer_karty: string; nazwa_pliku: string | null; suma_stopka: number | null; suma_pozycji: number | null; zgodna: boolean | null
  liczba_pozycji: number | null; nowych: number | null; zaktualizowanych: number | null; usunietych: number | null; utworzono: string
}
interface Regula { id: number; wzorzec: string; rodzaj_kosztu: RodzajKosztu; typ_zamowienia: string | null; priorytet: number; opis: string | null; aktywna: boolean }

type Widok = RodzajKosztu | 'do_klasyfikacji' | 'masa' | 'reguly' | 'historia'

/** Kolejka "uzupełnij masę": materiały bez masy, dla których porównanie zł/kg ma sens. */
export const wymagaMasy = (z: Pick<Zakup, 'rodzaj' | 'masa_kg' | 'jm' | 'kategoria'>) =>
  z.rodzaj === 'material' && z.masa_kg === null && (['kpl', 'usł'].includes(String(z.jm).toLowerCase()) || ['blachy', 'odkuwki'].includes(z.kategoria ?? ''))

/** Reguła "dokładnie ta nazwa" (zapamiętanie decyzji z bufora) - znaki specjalne wyrażenia regularnego zamaskowane. */
export const regulaDlaNazwy = (nazwa: string) => `^${nazwa.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}$`

/**
 * Zakupy z kart dostawy Optimy (moduł Historyczny cennik) w trzech rodzajach kosztu: materiały (zasilają bazę cen wycen),
 * kooperacja oraz transport, badania i inne (tylko do przeglądu). Pozycje niepewne - bufor „Do klasyfikacji” z przypisaniem
 * hurtowym i opcją zapamiętania reguły. Reguły słów kluczowych PL/EN, „Przeklasyfikuj wszystko” (decyzje ręczne zostają).
 */
export function Zakupy({ profil }: { profil: Profil }) {
  const s = useSlowniki()
  const up = uprawnienia(profil)
  const edycja = up.importy
  const [widok, setWidok] = useState<Widok>('materialy')
  const [zakupy, setZakupy] = useState<Zakup[]>([])
  const [importy, setImporty] = useState<ImportOptimy[]>([])
  const [reguly, setReguly] = useState<Regula[]>([])
  const [zaznaczone, setZaznaczone] = useState<Set<string | number>>(new Set())
  const [hurt, setHurt] = useState<{ rodzaj: RodzajKosztu; regula: boolean }>({ rodzaj: 'kooperacja', regula: false })
  const [podglad, setPodglad] = useState<(KartaDostawy & { plik: string }) | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  const [komunikat, setKomunikat] = useState<string | null>(null)
  const [zajety, setZajety] = useState(false)
  useZakresHistorii('zakupy')

  const wczytaj = useCallback(async () => {
    const [z, i, r] = await Promise.all([
      supabase.from('zakupy').select('*').order('data_dostawy', { ascending: false, nullsFirst: false }).order('numer_karty').limit(10000),
      supabase.from('importy_optima').select('*').order('utworzono', { ascending: false }).limit(100),
      supabase.from('reguly_klasyfikacji').select('*').order('priorytet', { ascending: false }).order('id'),
    ])
    if (z.error) setBlad(komunikatPL(z.error.message))
    setZakupy((z.data ?? []) as Zakup[])
    setImporty((i.data ?? []) as ImportOptimy[])
    setReguly((r.data ?? []) as Regula[])
  }, [])
  useEffect(() => { void wczytaj() }, [wczytaj])
  useOdswiezPoHistorii(() => void wczytaj())
  useEffect(() => { setZaznaczone(new Set()) }, [widok])

  async function wczytajPlik(pliki: FileList | null) {
    const p = pliki?.[0]
    if (!p) return
    setBlad(null); setKomunikat(null)
    try {
      const dane = new Uint8Array(await p.arrayBuffer())
      let wiersze
      if (/\.pdf$/i.test(p.name)) {
        // Karta wydrukowana do PDF: warstwa tekstowa w układzie kolumn wydruku XLS (bez AI).
        const { otworzRysunek, infoStrony, tekstStrony } = await import('@/lib/rysunkiPdf')
        const pdf = await otworzRysunek(dane)
        const strony = []
        for (let i = 1; i <= pdf.numPages; i++) strony.push({ elementy: await tekstStrony(pdf, i), szerPt: (await infoStrony(pdf, i)).szerPt })
        wiersze = wierszeKartyZPdf(strony)
      } else wiersze = await wierszeZPliku(dane)
      setPodglad({ ...parsujKarteDostawy(wiersze), plik: p.name })
    } catch (e) { setBlad(t('Nie udało się odczytać pliku: {0}', e instanceof Error ? e.message : String(e))) }
  }

  async function zapiszImport() {
    if (!podglad) return
    setZajety(true); setBlad(null)
    const pozycje = podglad.pozycje.map((p) => ({ ...p, pewnosc: undefined }))
    const { error } = await supabase.rpc('importuj_karte_dostawy', {
      p_naglowek: { numer_karty: podglad.numer_karty, nazwa_pliku: podglad.plik, suma_stopka: podglad.suma_stopka, suma_pozycji: podglad.suma_pozycji, zgodna: podglad.zgodna },
      p_pozycje: pozycje,
    })
    setZajety(false)
    if (error) { setBlad(komunikatPL(error.message)); return }
    const { data: ost } = await supabase.from('importy_optima').select('*').eq('numer_karty', podglad.numer_karty).order('utworzono', { ascending: false }).limit(1).single()
    setKomunikat(t('Zaimportowano kartę {0}: nowych {1}, zaktualizowanych {2}, usuniętych {3}. Projekt utworzony / zaktualizowany w „Projektach zrealizowanych”.', podglad.numer_karty, ost?.nowych ?? '?', ost?.zaktualizowanych ?? '?', ost?.usunietych ?? '?'))
    setPodglad(null); setWidok('materialy')
    await wczytaj()
  }

  async function zmienZakupy(ids: number[], zm: Partial<Zakup>, opis: string) {
    setBlad(null)
    try { await zmienRekordy('zakupy', opis, 'zakupy', ids, zm); await wczytaj() } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }

  /** Przypisanie rodzaju zaznaczonym (decyzja ręczna) i opcjonalnie reguła "ta nazwa" dla każdej nazwy. */
  async function przypiszHurtem() {
    const ids = [...zaznaczone].map(Number)
    if (!ids.length) return
    await zmienZakupy(ids, { rodzaj_kosztu: hurt.rodzaj, rodzaj_reczny: true }, t('rodzaj kosztu: {0} ({1} poz.)', ETYKIETY_RODZAJU_KOSZTU[hurt.rodzaj], ids.length))
    if (hurt.regula) {
      const nazwy = [...new Set(zakupy.filter((z) => zaznaczone.has(z.id)).map((z) => z.nazwa.trim()))]
      for (const n of nazwy) {
        try { await dodajRekord('zakupy', t('reguła: {0}', n), 'reguly_klasyfikacji', { wzorzec: regulaDlaNazwy(n), rodzaj_kosztu: hurt.rodzaj, priorytet: 200, opis: t('nazwa: {0}', n) }) } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
      }
    }
    setKomunikat(t('Przypisano {0} pozycji{1}.', ids.length, hurt.regula ? t(' i zapamiętano reguły dla nazw') : ''))
    setZaznaczone(new Set())
    await wczytaj()
  }

  async function przeklasyfikuj() {
    if (!window.confirm(t('Przeklasyfikować wszystkie zakupy wg reguł? Pozycje z ręczną decyzją zostaną bez zmian.'))) return
    const { data, error } = await supabase.rpc('przeklasyfikuj_zakupy')
    if (error) { setBlad(komunikatPL(error.message)); return }
    setKomunikat(t('Przeklasyfikowano: zmieniono {0} pozycji.', data ?? 0))
    await wczytaj()
  }

  async function ustawMase(z: Zakup, masa: number | null) {
    await zmienZakupy([z.id], { masa_kg: masa, masa_zrodlo: masa === null ? null : 'reczna', poprawiona_recznie: true }, t('masa: {0}', z.nazwa))
  }

  const zaRodzajem = useMemo(() => ({
    materialy: zakupy.filter((z) => z.rodzaj_kosztu === 'materialy'),
    kooperacja: zakupy.filter((z) => z.rodzaj_kosztu === 'kooperacja'),
    transport_inne: zakupy.filter((z) => z.rodzaj_kosztu === 'transport_inne'),
    do_klasyfikacji: zakupy.filter((z) => !z.rodzaj_kosztu),
    masa: zakupy.filter(wymagaMasy),
  }), [zakupy])

  const kolumny: KolumnaTabeli<Zakup>[] = [
    { id: 'data', naglowek: t('Data'), typ: 'data', wartosc: (z) => z.data_dostawy, komorka: (z) => dataPL(z.data_dostawy) || z.status, className: 'whitespace-nowrap text-xs' },
    { id: 'dostawca', naglowek: t('Dostawca'), typ: 'lista', wartosc: (z) => z.dostawca_nazwa, className: 'max-w-[12rem] truncate text-xs' },
    { id: 'nazwa', naglowek: t('Nazwa'), typ: 'tekst', wartosc: (z) => z.nazwa, className: 'max-w-[22rem] text-sm' },
    { id: 'ilosc', naglowek: t('Ilość'), typ: 'liczba', wartosc: (z) => z.ilosc, komorka: (z) => `${liczba(z.ilosc)} ${z.jm ?? ''}`, className: 'whitespace-nowrap text-right text-sm' },
    { id: 'cena', naglowek: t('Cena jedn.'), typ: 'liczba', wartosc: (z) => z.cena_jedn, komorka: (z) => zl(z.cena_jedn), className: 'whitespace-nowrap text-right text-sm' },
    { id: 'wartosc', naglowek: t('Wartość'), typ: 'liczba', wartosc: (z) => z.wartosc, komorka: (z) => zl(z.wartosc), className: 'whitespace-nowrap text-right text-sm' },
    { id: 'zamowienie', naglowek: t('Zamówienie'), typ: 'tekst', wartosc: (z) => z.nr_zamowienia, className: 'whitespace-nowrap text-xs' },
    {
      id: 'rodzaj', naglowek: t('Rodzaj kosztu'), typ: 'lista', wartosc: (z) => (z.rodzaj_kosztu ? ETYKIETY_RODZAJU_KOSZTU[z.rodzaj_kosztu] : t('do klasyfikacji')), className: 'text-xs',
      komorka: (z) => (edycja
        ? <select className="pole-komorki text-xs" value={z.rodzaj_kosztu ?? ''} title={z.klasyfikacja_powod ?? undefined}
            onChange={(e) => void zmienZakupy([z.id], { rodzaj_kosztu: (e.target.value || null) as RodzajKosztu | null, rodzaj_reczny: true }, t('rodzaj kosztu: {0}', z.nazwa))}>
            <option value="">{t('do klasyfikacji')}</option>
            {(Object.keys(ETYKIETY_RODZAJU_KOSZTU) as RodzajKosztu[]).map((k) => <option key={k} value={k}>{ETYKIETY_RODZAJU_KOSZTU[k]}</option>)}
          </select>
        : <span title={z.klasyfikacja_powod ?? undefined}>{z.rodzaj_kosztu ? ETYKIETY_RODZAJU_KOSZTU[z.rodzaj_kosztu] : t('do klasyfikacji')}</span>),
    },
    { id: 'karta', naglowek: t('Projekt (karta)'), typ: 'lista', wartosc: (z) => z.numer_karty, className: 'whitespace-nowrap text-xs' },
    {
      id: 'reczny', naglowek: t('Ręcznie'), typ: 'tak_nie', wartosc: (z) => z.rodzaj_reczny, className: 'text-center text-xs',
      komorka: (z) => (z.rodzaj_reczny
        ? <button className="text-blekit-ciemny underline" title={t('Ręczna decyzja - kliknij, aby wrócić do klasyfikacji automatycznej')} disabled={!edycja}
            onClick={() => void zmienZakupy([z.id], { rodzaj_reczny: false }, t('klasyfikacja automatyczna: {0}', z.nazwa))}>{t('tak')}</button>
        : ''),
    },
    ...(widok === 'materialy' || widok === 'masa' ? [
      {
        id: 'kategoria', naglowek: t('Kategoria'), typ: 'lista', wartosc: (z: Zakup) => s.kategorieMaterialow.find((k) => k.kod === z.kategoria)?.nazwa ?? z.kategoria, className: 'w-44',
        komorka: (z: Zakup) => (
          <select className="pole-komorki text-xs" disabled={!edycja} value={z.kategoria ?? ''} onChange={(e) => void zmienZakupy([z.id], { kategoria: e.target.value || null, rodzaj: 'material', poprawiona_recznie: true }, t('kategoria: {0}', z.nazwa))}>
            <option value="">-</option>{s.kategorieMaterialow.map((k) => <option key={k.kod} value={k.kod}>{k.nazwa}</option>)}
          </select>
        ),
      },
      { id: 'gatunek', naglowek: t('Gatunek'), typ: 'lista', wartosc: (z: Zakup) => z.gatunek, className: 'whitespace-nowrap text-xs' },
      {
        id: 'masa', naglowek: t('Masa [kg]'), typ: 'liczba', wartosc: (z: Zakup) => z.masa_kg, className: 'w-24',
        komorka: (z: Zakup) => (z.rodzaj === 'material'
          ? <span className={cn('block', wymagaMasy(z) && 'bg-amber-50')} title={z.masa_zrodlo ? t('źródło: {0}', z.masa_zrodlo) : t('brak masy')}>
              <PoleLiczby wartosc={z.masa_kg} puste disabled={!edycja} zmien={(n) => void ustawMase(z, n)} />
            </span>
          : null),
      },
      { id: 'zlkg', naglowek: t('zł/kg'), typ: 'liczba', wartosc: (z: Zakup) => z.cena_kg, komorka: (z: Zakup) => (z.cena_kg !== null ? liczba(z.cena_kg, 2) : ''), className: 'whitespace-nowrap text-right text-xs' },
    ] as KolumnaTabeli<Zakup>[] : []),
  ]

  const kolumnyRegul: KolumnaTabeli<Regula>[] = [
    {
      id: 'wzorzec', naglowek: t('Wzorzec (wyrażenie regularne, bez wielkości liter)'), typ: 'tekst', wartosc: (r) => r.wzorzec,
      komorka: (r) => <input className="pole-komorki font-mono text-xs" disabled={!edycja} defaultValue={r.wzorzec}
        onBlur={(e) => { if (e.target.value !== r.wzorzec) void zmienRegule(r, { wzorzec: e.target.value }) }} />,
    },
    {
      id: 'rodzaj', naglowek: t('Rodzaj kosztu'), typ: 'lista', wartosc: (r) => ETYKIETY_RODZAJU_KOSZTU[r.rodzaj_kosztu], className: 'w-48',
      komorka: (r) => (
        <select className="pole-komorki text-xs" disabled={!edycja} value={r.rodzaj_kosztu} onChange={(e) => void zmienRegule(r, { rodzaj_kosztu: e.target.value as RodzajKosztu })}>
          {(Object.keys(ETYKIETY_RODZAJU_KOSZTU) as RodzajKosztu[]).map((k) => <option key={k} value={k}>{ETYKIETY_RODZAJU_KOSZTU[k]}</option>)}
        </select>
      ),
    },
    {
      id: 'typ', naglowek: t('Typ zamówienia'), typ: 'lista', wartosc: (r) => r.typ_zamowienia ?? t('każdy'), className: 'w-28',
      komorka: (r) => (
        <select className="pole-komorki text-xs" disabled={!edycja} value={r.typ_zamowienia ?? ''} onChange={(e) => void zmienRegule(r, { typ_zamowienia: e.target.value || null })}>
          <option value="">{t('każdy')}</option><option value="ZM">ZM</option><option value="ZJ">ZJ</option>
        </select>
      ),
    },
    { id: 'priorytet', naglowek: t('Priorytet'), typ: 'liczba', wartosc: (r) => r.priorytet, className: 'w-24', komorka: (r) => <PoleLiczby wartosc={r.priorytet} disabled={!edycja} zmien={(n) => void zmienRegule(r, { priorytet: n ?? 0 })} /> },
    { id: 'opis', naglowek: t('Opis'), typ: 'tekst', wartosc: (r) => r.opis, komorka: (r) => <input className="pole-komorki text-xs" disabled={!edycja} defaultValue={r.opis ?? ''} onBlur={(e) => { if (e.target.value !== (r.opis ?? '')) void zmienRegule(r, { opis: e.target.value || null }) }} /> },
    { id: 'aktywna', naglowek: t('Aktywna'), typ: 'tak_nie', wartosc: (r) => r.aktywna, className: 'text-center', komorka: (r) => <input type="checkbox" disabled={!edycja} checked={r.aktywna} onChange={(e) => void zmienRegule(r, { aktywna: e.target.checked })} /> },
    {
      id: 'akcje', naglowek: '', typ: 'tekst', wartosc: () => '', bezFiltra: true, bezSortu: true,
      komorka: (r) => edycja && <button className="text-slate-400 hover:text-red-600" title={t('Usuń regułę')} onClick={() => void usunRekordy('zakupy', t('usunięcie reguły'), 'reguly_klasyfikacji', [r.id]).then(wczytaj).catch((e) => setBlad(String(e.message ?? e)))}><Trash2 className="h-4 w-4" /></button>,
    },
  ]
  async function zmienRegule(r: Regula, zm: Partial<Regula>) {
    setBlad(null)
    try { await zmienRekordy('zakupy', t('reguła: {0}', r.opis ?? r.wzorzec), 'reguly_klasyfikacji', [r.id], zm); await wczytaj() } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }

  const listy: [Widok, string, number][] = [
    ['materialy', t('Materiały'), zaRodzajem.materialy.length], ['kooperacja', t('Kooperacja'), zaRodzajem.kooperacja.length],
    ['transport_inne', t('Transport, badania i inne'), zaRodzajem.transport_inne.length], ['do_klasyfikacji', t('Do klasyfikacji'), zaRodzajem.do_klasyfikacji.length],
    ['masa', t('Uzupełnij masę'), zaRodzajem.masa.length],
  ]
  const lista = widok in zaRodzajem ? zaRodzajem[widok as keyof typeof zaRodzajem] : []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">{t('Zakupy Optima (karty dostawy)')}</h2>
        {edycja && <Button rozmiar="maly" onClick={() => void przeklasyfikuj()} title={t('Po zmianie reguł - pozycje z ręczną decyzją zostają')}><RefreshCw className="h-3 w-3" /> {t('Przeklasyfikuj wszystko')}</Button>}
      </div>
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {komunikat && <Komunikat rodzaj="sukces">{komunikat}</Komunikat>}
      {edycja && (
        <div className="space-y-3">
          {/* Import karty dostawy zawsze nad tabelą - plik wybrany albo przeciągnięty. */}
          <label className="flex cursor-pointer flex-wrap items-center gap-3 rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-3 hover:border-blekit"
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void wczytajPlik(e.dataTransfer.files) }}>
            <Upload className="h-5 w-5 text-slate-400" />
            <span className="font-medium">{t('Import karty dostawy')}</span>
            <span className="flex-1 text-sm text-slate-600">{t('Przeciągnij albo wybierz plik „KARTA DOSTAWY” z Optimy: XLS albo wydruk PDF (warstwa tekstowa, bez AI). Ponowny import tej samej karty aktualizuje dane zamiast je dublować.')}</span>
            <input type="file" accept=".xls,.xlsx,.pdf" className="hidden" onChange={(e) => { void wczytajPlik(e.target.files); e.target.value = '' }} />
          </label>
          {podglad && (
            <section className="sekcja space-y-2">
              <h3 className="font-semibold">{t('Karta')}{' '}{podglad.numer_karty || t('(brak numeru!)')} <span className="text-sm font-normal text-slate-500">({podglad.plik})</span></h3>
              <div className={cn('flex items-center gap-2 text-sm', podglad.zgodna ? 'text-limonka-ciemna' : 'text-red-700')}>
                {podglad.zgodna ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {t('Kontrola sumy: stopka')}{' '}{podglad.suma_stopka !== null ? zl(podglad.suma_stopka) : t('brak')} {t('· suma zamówień')}{' '}{zl(podglad.suma_zamowien)} {t('· suma pozycji')}{' '}{zl(podglad.suma_pozycji)}
                {podglad.zgodna ? t(' - zgodna') : t(' - NIEZGODNA')}
              </div>
              {podglad.ostrzezenia.map((o) => <p key={o} className="text-sm text-amber-800">⚠ {o}</p>)}
              <p className="text-sm">{t('Pozycji: {0}. Rodzaj kosztu (materiały / kooperacja / transport, badania i inne) przypisze się przy zapisie wg reguł; niepewne trafią do „Do klasyfikacji”.', podglad.pozycje.length)}</p>
              <div className="flex gap-2">
                <Button wariant="glowny" disabled={zajety || !podglad.numer_karty} onClick={() => void zapiszImport()}>{t('Zapisz w bazie')}</Button>
                <Button onClick={() => setPodglad(null)}>{t('Anuluj')}</Button>
              </div>
            </section>
          )}
        </div>
      )}

      <div className="pasek-zakladek">
        {([...listy, ['reguly', t('Reguły klasyfikacji'), reguly.length], ['historia', t('Historia importów'), -1]] as [Widok, string, number][]).map(([id, et, n]) => (
          <button key={id} onClick={() => setWidok(id)}
            className={cn('zakladka', (widok === id) && 'zakladka-aktywna')}>
            {et}{n >= 0 && <span className={cn('ml-1 rounded-full px-1.5 text-xs', id === 'do_klasyfikacji' && n > 0 ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600')}>{n}</span>}
          </button>
        ))}
      </div>

      {widok === 'historia' && (
        <Tabela id="importy-optima" wiersze={importy} klucz={(i) => i.id} pusto={t('Brak importów.')} kolumny={[
          { id: 'kiedy', naglowek: t('Kiedy'), typ: 'data', wartosc: (i) => i.utworzono, komorka: (i) => dataGodzinaPL(i.utworzono), className: 'whitespace-nowrap text-xs' },
          { id: 'karta', naglowek: t('Karta'), typ: 'tekst', wartosc: (i) => i.numer_karty },
          { id: 'plik', naglowek: t('Plik'), typ: 'tekst', wartosc: (i) => i.nazwa_pliku, className: 'text-xs' },
          { id: 'stopka', naglowek: t('Stopka'), typ: 'liczba', wartosc: (i) => i.suma_stopka, komorka: (i) => (i.suma_stopka !== null ? zl(i.suma_stopka) : ''), className: 'text-right' },
          { id: 'zgodna', naglowek: t('Zgodna'), typ: 'tak_nie', wartosc: (i) => !!i.zgodna },
          { id: 'pozycji', naglowek: t('Pozycji'), typ: 'liczba', wartosc: (i) => i.liczba_pozycji },
          { id: 'zmiany', naglowek: t('Nowe / zaktual. / usunięte'), typ: 'tekst', wartosc: (i) => `${i.nowych} / ${i.zaktualizowanych} / ${i.usunietych}`, className: 'text-sm' },
        ]} />
      )}

      {widok === 'reguly' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">{t('Typ zamówienia z karty (ZM - materiał, ZJ - usługa) to pierwszy sygnał; reguły słów kluczowych rozstrzygają usługi (i usługi zamawiane jako ZM). Wyższy priorytet wygrywa. Po zmianie reguł użyj „Przeklasyfikuj wszystko”.')}</p>
          <Tabela id="reguly-klasyfikacji" kolumny={kolumnyRegul} wiersze={reguly} klucz={(r) => r.id} pusto={t('Brak reguł.')} />
          {edycja && (
            <Button rozmiar="maly" onClick={() => void dodajRekord('zakupy', t('nowa reguła'), 'reguly_klasyfikacji', { wzorzec: 'nowe słowo', rodzaj_kosztu: 'kooperacja', priorytet: 60 }).then(wczytaj).catch((e) => setBlad(String(e.message ?? e)))}>
              <Plus className="h-3 w-3" /> {t('reguła')}
            </Button>
          )}
        </div>
      )}

      {lista && listy.some(([id]) => id === widok) && (
        <div className="space-y-2">
          {widok === 'masa' && <p className="text-sm text-slate-600">{t('Materiały bez masy (np. „Wypałki … 1 kpl”) nie wchodzą do porównań zł/kg, dopóki ktoś nie wpisze masy. Wpisz masę w kg - zapisuje się od razu.')}</p>}
          {widok === 'materialy' && <p className="text-xs text-slate-500">{t('Materiały zasilają ceny w wycenach („Znajdź cenę”, wycena automatyczna).')}</p>}
          {(widok === 'kooperacja' || widok === 'transport_inne') && <p className="text-xs text-slate-500">{t('Tylko do przeglądu - ceny kooperacji i badań / transportu w wycenie pochodzą z ofert zebranych pod zapytanie.')}</p>}
          {edycja && zaznaczone.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-blekit/40 bg-blekit-jasny/40 px-3 py-2 text-sm">
              <span>{t('Zaznaczone: {0}. Przypisz rodzaj:', zaznaczone.size)}</span>
              <select className="pole w-56 py-1" value={hurt.rodzaj} onChange={(e) => setHurt({ ...hurt, rodzaj: e.target.value as RodzajKosztu })}>
                {(Object.keys(ETYKIETY_RODZAJU_KOSZTU) as RodzajKosztu[]).map((k) => <option key={k} value={k}>{ETYKIETY_RODZAJU_KOSZTU[k]}</option>)}
              </select>
              <label className="flex items-center gap-1"><input type="checkbox" checked={hurt.regula} onChange={(e) => setHurt({ ...hurt, regula: e.target.checked })} /> {t('zapamiętaj regułę dla tych nazw')}</label>
              <Button rozmiar="maly" wariant="glowny" onClick={() => void przypiszHurtem()}>{t('Przypisz')}</Button>
            </div>
          )}
          <Tabela id={`zakupy-${widok}`} kolumny={kolumny} wiersze={lista} klucz={(z) => z.id}
            zaznaczanie={edycja ? { zaznaczone, zmien: setZaznaczone } : undefined}
            stopka={<span className="text-sm text-slate-600">{t('Razem: {0} zł', zl(lista.reduce((a, z) => a + Number(z.wartosc), 0)))}</span>}
            pusto={widok === 'do_klasyfikacji' ? t('Wszystkie pozycje mają rodzaj kosztu.') : t('Brak pozycji.')} />
        </div>
      )}
    </div>
  )
}
