import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, Copy, FileSpreadsheet, FileText, Plus, Save, Send, Trash2, Undo2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { dataGodzinaPL, liczba, zl } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ostrzezenia as liczOstrzezenia, policzWycene } from '@/lib/kalkulacja'
import {
  ETYKIETY_STATUSU_WYCENY, KOLORY_STATUSU_WYCENY, nowyAparat, parametry, podsumowanieKosztow, wczytajWycene, zapiszWycene,
  type Aparat, type Marze, type PozycjaWyceny, type StanWyceny, type Wycena,
} from '@/lib/wyceny'
import { kursNaDzien } from '@/lib/oferty'
import { opisZmiany, roznica, useHistoriaStanu } from '@/lib/historia'
import { typAparatuZRodzaju } from '@/lib/zapytania'
import { ZnacznikRodzaju } from '../zapytania/RodzajAparatu'
import { uprawnienia, type Profil } from '@/lib/types'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Materialy } from './Materialy'
import { Pracochlonnosc } from './Pracochlonnosc'
import { BadaniaOdbioryTransport, Kooperacja } from './Uslugi'
import { Podsumowanie } from './Podsumowanie'
import { ZnajdzCene, type WybranaCena } from './ZnajdzCene'
import { ImportListy } from './ImportListy'
import { EdytorOferty } from './EdytorOferty'
import { Opinia } from './Opinia'
import { adresWidoku, useZakladkaWAdresie } from '@/lib/adres'
import { JEZYKI, jezyk, t, type Jezyk } from '@/i18n'

// Kolejność zakładek jak w arkuszu wzorcowym wyceny: Opinia, Materiały, Pracochłonność, Kooperacja, Badania, Podsumowanie, Oferta.
const ZAKLADKI_WYCENY = ['wycena', 'materialy', 'robocizna', 'kooperacja', 'badania', 'podsumowanie', 'oferta'] as const
type Zakladka = typeof ZAKLADKI_WYCENY[number]

export function EdytorWyceny({ id, profil, otworzWycene }: { id: string; profil: Profil; otworzWycene: (id: string) => void }) {
  const s = useSlowniki()
  const up = uprawnienia(profil)
  const jestPrezesem = profil.rola === 'prezes'
  const [stan, setStan] = useState<StanWyceny | null>(null)
  const [aktywny, setAktywny] = useState(0)
  const [zakladka, setZakladka] = useZakladkaWAdresie<Zakladka>(ZAKLADKI_WYCENY, 'wycena')
  const [zmieniony, setZmieniony] = useState(false)
  const [blad, setBlad] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [zajety, setZajety] = useState(false)
  const [szukana, setSzukana] = useState<{ aparat: string; pozycja: PozycjaWyceny; uslugi: boolean } | null>(null)
  const [importOtwarty, setImportOtwarty] = useState(false)
  const [jezykEksportu, setJezykEksportu] = useState<Jezyk>(jezyk())
  // Cofnij / Ponów: każda zmiana stanu wyceny to krok (różnica), stos per wycena w IndexedDB.
  const ustawZHistorii = useCallback((f: (s: StanWyceny) => StanWyceny) => { setStan((x) => (x ? f(x) : x)); setZmieniony(true) }, [])
  const zapiszKrok = useHistoriaStanu<StanWyceny>(`wycena:${id}`, ustawZHistorii)
  // Najnowszy stan także dla kilku zmian w jednym zdarzeniu (zanim React przerysuje).
  const biezacy = useRef<StanWyceny | null>(null)
  biezacy.current = stan

  const wczytaj = useCallback(async () => {
    try {
      const st = await wczytajWycene(id)
      if (!st.aparaty.length) st.aparaty.push(nowyAparat(1))
      // Typ aparatu z rodzaju zapytania - w wycenie nie ma wyboru zbiornik / wymiennik.
      const typ = typAparatuZRodzaju(st.zapytanie.rodzaj_aparatu, st.zapytanie.zakres_wymiennika)
      for (const a of st.aparaty) if (!a.typ && typ) a.typ = typ
      // Stawka wskaźnikowa domyślnie ze słownika (stawka oznaczona jako domyślna).
      const dom = s.stawki.find((x) => x.domyslna && x.aktywna)
      for (const a of st.aparaty) if (a.stawka_wskaznikowa === null && dom) a.stawka_wskaznikowa = Number(dom.stawka)
      setStan(st); setZmieniony(false); setBlad(null)
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }, [id, s.stawki])
  useEffect(() => { void wczytaj() }, [wczytaj])

  // Ostrzeżenie przy zamykaniu karty z niezapisanymi zmianami.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (zmieniony) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [zmieniony])

  const kontekstUslug = useMemo(() => (stan ? { zapytanieId: stan.zapytanie.id, numer: stan.zapytanie.numer, wycenaId: stan.wycena.id } : undefined), [stan?.zapytanie.id, stan?.zapytanie.numer, stan?.wycena.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const par = useMemo(() => (stan ? parametry(stan.wycena, up.widziMarze ? stan.marze : null, s) : null), [stan, s, up.widziMarze])
  const wynik = useMemo(() => (stan && par ? policzWycene(stan.aparaty, par) : null), [stan, par])
  const ostrz = useMemo(() => (stan ? liczOstrzezenia(stan.aparaty, {
    dzis: new Date().toISOString().slice(0, 10), wiek_ceny_mies: s.ustawienia.wiek_ceny_ostrzezenie_mies,
    ryzyko_dni: s.ustawienia.waznosc_oferty_dostawcy_ryzyko_dni,
    waznosc_oferty_klienta_dni: Number((stan.wycena.oferta as { waznosc_dni?: number }).waznosc_dni ?? s.ustawienia.oferta_domyslne.waznosc_dni),
    termin_realizacji_tyg: stan.wycena.termin_realizacji_tyg, montaz_tyg: stan.wycena.montaz_tyg,
  }) : []), [stan, s.ustawienia])

  if (!stan || !par || !wynik) return <p className="text-slate-500">{blad ?? t('Wczytywanie wyceny...')}</p>
  const w = stan.wycena
  const tylkoOdczyt = w.status === 'zatwierdzona' || (w.status === 'do_zatwierdzenia' && !jestPrezesem)
  const aparat = stan.aparaty[Math.min(aktywny, stan.aparaty.length - 1)]

  const ustStan = (f: (s: StanWyceny) => StanWyceny, opis?: string) => {
    const przed = biezacy.current ?? stan
    const nowy = f(przed)
    biezacy.current = nowy
    zapiszKrok(przed, nowy, opis ?? opisZmiany(roznica(przed, nowy)))
    setStan(nowy); setZmieniony(true); setInfo(null)
  }
  const ustWycene = (zm: Partial<Wycena>) => ustStan((x) => ({ ...x, wycena: { ...x.wycena, ...zm } }))
  const ustMarze = (zm: Partial<Marze>) => ustStan((x) => ({ ...x, marze: x.marze ? { ...x.marze, ...zm } : x.marze }))
  const ustAparat = (kl: string) => (f: (a: Aparat) => Aparat) => ustStan((x) => ({ ...x, aparaty: x.aparaty.map((a) => (a.klucz === kl ? f(a) : a)) }))
  const zmienAparat = ustAparat(aparat.klucz)

  async function zapisz(cicho = false) {
    if (!stan) return false
    setZajety(true); setBlad(null)
    try {
      await zapiszWycene(stan, up.widziMarze)
      await wczytaj()
      if (!cicho) setInfo(t('Zapisano.'))
      setZajety(false)
      return true
    } catch (e) {
      setBlad(e instanceof Error ? e.message : String(e)); setZajety(false)
      return false
    }
  }

  async function zmienStatus(status: 'do_zatwierdzenia' | 'zatwierdzona' | 'zwrocona' | 'robocza') {
    if (!stan || !wynik) return
    let komentarz: string | null = null
    if (status === 'zwrocona') {
      komentarz = window.prompt(t('Co poprawić? (komentarz dla autora wyceny)'))
      if (!komentarz?.trim()) return
    }
    if (status === 'zatwierdzona') {
      if (!window.confirm(t('Zatwierdzić wycenę v{0}? Cena końcowa: {1} PLN. Zatwierdzona wersja zostanie zamrożona.', w.wersja, zl(wynik.cena_koncowa)))) return
      komentarz = window.prompt(t('Komentarz prezesa (opcjonalnie):')) || null
    }
    if (zmieniony && !(await zapisz(true))) return
    // Po zapisie przelicz na świeżym stanie (np. marże prezesa).
    const st = await wczytajWycene(w.id)
    const p2 = parametry(st.wycena, up.widziMarze ? st.marze : null, s)
    const wyn = policzWycene(st.aparaty, p2)
    const { error } = await supabase.rpc('zmien_status_wyceny', {
      p_wycena: w.id, p_status: status, p_komentarz: komentarz, p_podsumowanie: podsumowanieKosztow(wyn),
      p_ceny: status === 'zatwierdzona' ? { koszt_calkowity: wyn.koszty.koszt, cena: wyn.cena, cena_koncowa: wyn.cena_koncowa, cena_bez_opcji: wyn.cena_bez_opcji } : null,
    })
    if (error) { setBlad(komunikatPL(error.message)); return }
    setInfo({ do_zatwierdzenia: t('Przekazano do zatwierdzenia przez prezesa.'), zatwierdzona: t('Wycena zatwierdzona i zamrożona.'), zwrocona: t('Zwrócono do poprawy.'), robocza: t('Wycofano z kolejki do zatwierdzenia.') }[status])
    await wczytaj()
  }

  async function kopiuj() {
    if (zmieniony && !window.confirm(t('Masz niezapisane zmiany - kopia powstanie z wersji zapisanej. Kontynuować?'))) return
    const { data, error } = await supabase.rpc('kopiuj_wycene', { p_wycena: w.id })
    if (error) { setBlad(komunikatPL(error.message)); return }
    otworzWycene(data as string)
  }

  async function pobierzKurs() {
    const k = await kursNaDzien('EUR', new Date().toISOString().slice(0, 10))
    if (k) ustWycene({ kurs_eur: k.kurs, kurs_eur_data: k.data, kurs_eur_zrodlo: `NBP ${k.tabela ?? ''}`.trim() })
    else setBlad(t('Brak kursu EUR w bazie - pobierz kursy w Ustawieniach albo wpisz ręcznie.'))
  }

  function wstawCene(c: WybranaCena) {
    if (!szukana) return
    // „Użyj w wycenie”: prośba pozycji zapamiętuje wybraną ofertę (wybór można zmienić).
    const prosba = (szukana.pozycja.dodatkowe as { prosba_id?: string } | undefined)?.prosba_id
    if (prosba && c.zrodlo_ceny === 'oferta' && c.zrodlo_id) void supabase.from('prosby_o_oferte').update({ oferta_id: c.zrodlo_id }).eq('id', prosba)
    ustAparat(szukana.aparat)((a) => ({ ...a, pozycje: a.pozycje.map((p) => (p.klucz === szukana.pozycja.klucz ? { ...p, ...c, wartosc_reczna: null } : p)) }))
    setSzukana(null)
  }

  async function eksport(rodzaj: 'excel' | 'notatka') {
    if (!stan || !wynik) return
    try {
      if (rodzaj === 'excel') {
        const [{ eksportujKalkulacje }, { uzupelnijKarte }, { data: an }] = await Promise.all([
          import('@/lib/eksportExcel'), import('@/lib/analiza'),
          supabase.from('analizy_zapytan').select('dane').eq('zapytanie_id', stan.zapytanie.id).maybeSingle(),
        ])
        await eksportujKalkulacje(stan, wynik, par!, s, up.widziMarze, an ? uzupelnijKarte(an.dane) : null, jezykEksportu)
      } else {
        const { notatkaDlaPrezesa } = await import('@/lib/eksportWord')
        await notatkaDlaPrezesa(stan, wynik, par!, s)
      }
    } catch (e) { setBlad(t('Eksport nie powiódł się: {0}', e instanceof Error ? e.message : String(e))) }
  }

  const ZAKLADKI = ([
    ['wycena', t('Wycena')], ['materialy', t('Materiały')], ['robocizna', t('Robocizna')], ['kooperacja', t('Kooperacja')], ['badania', t('Badania, odbiory, transport')],
    ['podsumowanie', t('Podsumowanie')], ['oferta', t('Oferta')],
  ] as [Zakladka, string][])
  const doZapytania = () => { if (!zmieniony || window.confirm(t('Porzucić niezapisane zmiany?'))) window.location.hash = adresWidoku('zapytania', stan.zapytanie.id, 'wyceny').slice(1) }
  const koszt = wynik.aparaty[Math.min(aktywny, wynik.aparaty.length - 1)]

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500" aria-label={t('Ścieżka')}>
        <a className="hover:underline" href={adresWidoku('zapytania')}>{t('Zapytania')}</a><span>›</span>
        <button className="hover:underline" onClick={doZapytania}>{stan.zapytanie.numer} - {stan.zapytanie.przedmiot}</button><span>›</span>
        <span>{t('Wycena v{0}', w.wersja)}</span><span>›</span>
        <span className="font-medium text-slate-700">{ZAKLADKI.find(([k]) => k === zakladka)?.[1]}</span>
      </nav>
      <div className="flex flex-wrap items-center gap-3">
        <Button rozmiar="maly" wariant="cichy" onClick={doZapytania}><ArrowLeft className="h-4 w-4" /> {t('Wstecz do zapytania')}</Button>
        <h2 className="text-lg font-semibold">{stan.zapytanie.numer} {t('· wycena v')}{w.wersja}</h2>
        <span className={cn('znacznik', KOLORY_STATUSU_WYCENY[w.status])}>{ETYKIETY_STATUSU_WYCENY[w.status]}</span>
        <span className="text-sm text-slate-600">{stan.zapytanie.przedmiot}{stan.zapytanie.klient ? ` · ${stan.zapytanie.klient}` : ''}</span>
        <div className="ml-auto flex flex-wrap gap-2">
          {!tylkoOdczyt && <Button wariant="glowny" disabled={zajety || !zmieniony} onClick={() => void zapisz()}><Save className="h-4 w-4" /> {t('Zapisz')}</Button>}
          {['robocza', 'zwrocona'].includes(w.status) && <Button wariant="akcent" disabled={zajety} onClick={() => void zmienStatus('do_zatwierdzenia')}><Send className="h-4 w-4" /> {t('Do zatwierdzenia')}</Button>}
          {w.status === 'do_zatwierdzenia' && jestPrezesem && (
            <>
              <Button wariant="glowny" disabled={zajety} onClick={() => void zmienStatus('zatwierdzona')}><CheckCircle2 className="h-4 w-4" /> {t('Zatwierdź')}</Button>
              <Button wariant="ostrzezenie" disabled={zajety} onClick={() => void zmienStatus('zwrocona')}><Undo2 className="h-4 w-4" /> {t('Zwróć')}</Button>
            </>
          )}
          {w.status === 'do_zatwierdzenia' && !jestPrezesem && <Button disabled={zajety} onClick={() => void zmienStatus('robocza')}><Undo2 className="h-4 w-4" /> {t('Wycofaj')}</Button>}
          <Button onClick={() => void kopiuj()}><Copy className="h-4 w-4" /> {t('Kopiuj wersję')}</Button>
          <span className="inline-flex items-center">
            <Button onClick={() => void eksport('excel')}><FileSpreadsheet className="h-4 w-4" /> {t('Excel')}</Button>
            <select className="pole ml-1 w-16 py-1 text-xs" title={t('Język eksportu')} value={jezykEksportu} onChange={(e) => setJezykEksportu(e.target.value as Jezyk)}>
              {JEZYKI.map((x) => <option key={x.id} value={x.id}>{x.etykieta}</option>)}
            </select>
          </span>
          {up.widziMarze && <Button onClick={() => void eksport('notatka')}><FileText className="h-4 w-4" /> {t('Notatka')}</Button>}
        </div>
      </div>
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {info && <Komunikat rodzaj="sukces">{info}</Komunikat>}
      {w.komentarz_prezesa && <Komunikat rodzaj={w.status === 'zwrocona' ? 'ostrzezenie' : 'info'}>{t('Komentarz prezesa:')}{' '}{w.komentarz_prezesa}</Komunikat>}
      {w.status === 'zatwierdzona' && <Komunikat rodzaj="info">{t('Wersja zatwierdzona')}{' '}{dataGodzinaPL(w.zatwierdzono)} {t('- zamrożona. Zmiana wymaga skopiowania wersji. Ofertę dla klienta można nadal redagować.')}</Komunikat>}
      {profil.rola === 'handlowy' && !tylkoOdczyt && <p className="text-xs text-slate-500">{t('Dział handlowy zmienia w wycenie ceny materiałów i kooperację. Pozostałe zmiany odrzuci baza.')}</p>}

      <section className="sekcja flex flex-wrap items-end gap-4 text-sm">
        <label className="w-56"><span className="etykieta">{t('Nazwa wersji')}</span><input className="pole" disabled={tylkoOdczyt} value={w.nazwa ?? ''} onChange={(e) => ustWycene({ nazwa: e.target.value || null })} /></label>
        <label><span className="etykieta">{t('Narzut zakupowy [%]')}</span>
          <span className="block w-20 rounded border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={Number(w.narzut_zakupowy_proc)} disabled={tylkoOdczyt} zmien={(n) => ustWycene({ narzut_zakupowy_proc: n ?? 0 })} /></span></label>
        <label><span className="etykieta">{t('Narzut na kooperację [%]')}</span>
          <span className="block w-20 rounded border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={Number(w.narzut_kooperacja_proc)} disabled={tylkoOdczyt} zmien={(n) => ustWycene({ narzut_kooperacja_proc: n ?? 0 })} /></span></label>
        <label><span className="etykieta">{t('Termin realizacji [tyg.]')}</span>
          <span className="block w-20 rounded border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={w.termin_realizacji_tyg} puste disabled={tylkoOdczyt} zmien={(n) => ustWycene({ termin_realizacji_tyg: n })} /></span></label>
        <label title={t('Część terminu na montaż / odbiory - do ostrzeżeń o terminach dostaw materiałów')}><span className="etykieta">{t('w tym montaż [tyg.]')}</span>
          <span className="block w-20 rounded border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={w.montaz_tyg} puste disabled={tylkoOdczyt} zmien={(n) => ustWycene({ montaz_tyg: n })} /></span></label>
        <div className="ml-auto text-right">
          <p>{t('Koszty:')}{' '}<strong>{zl(wynik.koszty.koszt)} PLN</strong>{wynik.koszty.zl_kg !== null && t(' ({0} PLN/kg)', liczba(wynik.koszty.zl_kg, 2))}</p>
          {wynik.cena_koncowa !== null && <p>{t('Cena końcowa:')}{' '}<strong className="text-limonka-ciemna">{zl(wynik.cena_koncowa)} PLN</strong></p>}
          {ostrz.length > 0 && <button className="text-xs text-amber-700 underline" onClick={() => setZakladka('podsumowanie')}>{ostrz.length} {t('ostrzeżeń')}</button>}
        </div>
      </section>

      {/* Aparaty */}
      <div className="flex flex-wrap items-center gap-1">
        {stan.aparaty.map((a, i) => (
          <button key={a.klucz} onClick={() => setAktywny(i)}
            className={cn('rounded-md px-3 py-1.5 text-sm ring-1', i === aktywny ? 'bg-blekit-jasny font-medium ring-blekit' : 'bg-white ring-slate-200 hover:bg-slate-50')}>
            {a.nazwa || t('Aparat {0}', i + 1)}{a.ilosc !== 1 && ` ×${liczba(a.ilosc)}`}
          </button>
        ))}
        {!tylkoOdczyt && <Button rozmiar="maly" wariant="cichy" onClick={() => { ustStan((x) => ({ ...x, aparaty: [...x.aparaty, { ...nowyAparat(x.aparaty.length + 1), typ: typAparatuZRodzaju(x.zapytanie.rodzaj_aparatu, x.zapytanie.zakres_wymiennika) }] })); setAktywny(stan.aparaty.length) }}><Plus className="h-3 w-3" /> aparat</Button>}
      </div>

      <section className="sekcja flex flex-wrap items-end gap-3 text-sm">
        <label className="w-64"><span className="etykieta">{t('Nazwa aparatu')}</span><input className="pole" disabled={tylkoOdczyt} value={aparat.nazwa} onChange={(e) => zmienAparat((a) => ({ ...a, nazwa: e.target.value }))} /></label>
        <div className="w-56"><span className="etykieta">{t('Rodzaj (z zapytania)')}</span>
          <ZnacznikRodzaju rodzaj={stan.zapytanie.rodzaj_aparatu} zakres={stan.zapytanie.zakres_wymiennika} opis={stan.zapytanie.zakres_opis} />
          {aparat.typ && aparat.typ !== typAparatuZRodzaju(stan.zapytanie.rodzaj_aparatu, stan.zapytanie.zakres_wymiennika) && <span className="block text-xs text-slate-500">{t('typ w tej wycenie:')}{' '}{aparat.typ}</span>}
        </div>
        {stan.zapytanie.rodzaj_aparatu === 'wymiennik' && (
          <label className="w-24"><span className="etykieta">TEMA</span><input className="pole" placeholder="AES" disabled={tylkoOdczyt} value={aparat.tema ?? ''} onChange={(e) => zmienAparat((a) => ({ ...a, tema: e.target.value || null }))} /></label>
        )}
        <label><span className="etykieta">{t('Ilość [szt.]')}</span>
          <span className="block w-20 rounded border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={aparat.ilosc} disabled={tylkoOdczyt} zmien={(n) => zmienAparat((a) => ({ ...a, ilosc: n && n > 0 ? n : 1 }))} /></span></label>
        <label><span className="etykieta">{t('Masa netto [kg / szt.]')}</span>
          <span className="block w-28 rounded border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={aparat.masa_netto_kg} puste disabled={tylkoOdczyt} zmien={(n) => zmienAparat((a) => ({ ...a, masa_netto_kg: n }))} /></span></label>
        {(['srednica_mm', 'wysokosc_mm', 'dlugosc_mm'] as const).map((k) => (
          <label key={k}><span className="etykieta">{{ srednica_mm: 'Średnica', wysokosc_mm: 'Wysokość', dlugosc_mm: 'Długość' }[k]} {t('[mm]')}</span>
            <span className="block w-24 rounded border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={aparat[k]} puste disabled={tylkoOdczyt} zmien={(n) => zmienAparat((a) => ({ ...a, [k]: n }))} /></span></label>
        ))}
        <label className="w-40"><span className="etykieta">{t('Materiał wiodący')}</span><input className="pole" disabled={tylkoOdczyt} value={aparat.material_wiodacy ?? ''} onChange={(e) => zmienAparat((a) => ({ ...a, material_wiodacy: e.target.value || null }))} /></label>
        <div className="ml-auto text-right">
          <p>{t('Koszt 1 szt.:')}{' '}<strong>{zl(koszt.koszt_szt)}</strong></p>
          {koszt.cena_szt !== null && <p className="text-xs">{t('cena 1 szt.:')}{' '}{zl(koszt.cena_szt)}</p>}
          {!tylkoOdczyt && stan.aparaty.length > 1 && (
            <button className="mt-1 inline-flex items-center gap-1 text-xs text-red-600" onClick={() => { if (window.confirm(t('Usunąć aparat {0}?', aparat.nazwa))) { ustStan((x) => ({ ...x, aparaty: x.aparaty.filter((a) => a.klucz !== aparat.klucz) })); setAktywny(0) } }}>
              <Trash2 className="h-3 w-3" /> {t('usuń aparat')}
            </button>
          )}
        </div>
      </section>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {ZAKLADKI.map(([k, et]) => (
          <button key={k} onClick={() => setZakladka(k)}
            className={cn('-mb-px rounded-t-md border px-3 py-1.5 text-sm', zakladka === k ? 'border-slate-200 border-b-white bg-white font-medium' : 'border-transparent text-slate-600 hover:bg-slate-100')}>{et}</button>
        ))}
      </div>

      {zakladka === 'wycena' && <Opinia stan={stan} wynik={wynik} profil={profil} widziMarze={up.widziMarze} zajety={zajety} zmienStatus={(st) => void zmienStatus(st)} />}
      {zakladka === 'materialy' && <Materialy aparat={aparat} par={par} tylkoOdczyt={tylkoOdczyt} zmien={zmienAparat} importuj={() => setImportOtwarty(true)} zapytanieId={stan.zapytanie.id}
        znajdz={(p) => setSzukana({ aparat: aparat.klucz, pozycja: p, uslugi: false })} />}
      {zakladka === 'robocizna' && <Pracochlonnosc aparat={aparat} par={par} tylkoOdczyt={tylkoOdczyt} zmien={zmienAparat} wycenaId={w.id} kto={profil.nazwa ?? profil.email} />}
      {zakladka === 'kooperacja' && <Kooperacja aparat={aparat} par={par} tylkoOdczyt={tylkoOdczyt} zmien={zmienAparat} kontekst={kontekstUslug} znajdz={(p) => setSzukana({ aparat: aparat.klucz, pozycja: p, uslugi: true })} />}
      {zakladka === 'badania' && <BadaniaOdbioryTransport aparat={aparat} par={par} tylkoOdczyt={tylkoOdczyt} zmien={zmienAparat} kontekst={kontekstUslug} znajdz={(p) => setSzukana({ aparat: aparat.klucz, pozycja: p, uslugi: true })} />}
      {zakladka === 'podsumowanie' && (
        <Podsumowanie wynik={wynik} wycena={w} marze={up.widziMarze ? stan.marze : null} ostrzezenia={ostrz} tylkoOdczyt={tylkoOdczyt}
          jestPrezesem={jestPrezesem} zmienMarze={ustMarze} zmienWycene={ustWycene} pobierzKurs={() => void pobierzKurs()} />
      )}
      {zakladka === 'oferta' && (
        <EdytorOferty stan={stan} wynik={wynik} zmienWycene={ustWycene} widziMarze={up.widziMarze} zapisz={() => zapisz()} zmieniony={zmieniony} kto={profil.nazwa ?? profil.email} />
      )}

      <ZnajdzCene pozycja={szukana?.pozycja ?? null} uslugi={szukana?.uslugi} zamknij={() => setSzukana(null)} wybierz={wstawCene}
        zapytanieId={stan.zapytanie.id} />
      <ImportListy otwarty={importOtwarty} zamknij={() => setImportOtwarty(false)}
        dodaj={(nowe) => zmienAparat((a) => ({ ...a, pozycje: [...a.pozycje, ...nowe] }))} />
    </div>
  )
}
