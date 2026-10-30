import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, FileDown, FileText, Languages, Sparkles, ZoomIn, ZoomOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { liczba, odmiana } from '@/lib/format'
import { cn } from '@/lib/utils'
import { szacujAi, wywolajAi, type DaneAi } from '@/lib/ai'
import { kafliOdmiana, tokenyObrazu, type Prostokat } from '@/lib/rysunki'
import {
  ETYKIETY_OBSZARU_TEKSTU, KOLORY_OBSZARU_TEKSTU, NAZWY_JEZYKOW, blokiDokladne, blokiDoTlumaczenia, blokiStrony, blokiZAi, jestFormularzem, jestSkanem, jezykPliku,
  numeryStron, opisKaflaDokumentu, opisStron, parsujStrony, scalTlumaczenie, tekstBlokow, wykryjJezyk,
  type BlokDokumentu, type ObszarTekstu, type RodzajObszaruTekstu, type TrescPliku, type WymiaryStrony,
} from '@/lib/wersjeEdytowalne'
import {
  blokiZPliku, pobierzPlikEdytowalny, zapiszOdczyt, zapiszTresc, zrodloObrazu, zrodloPdf,
  type InfoStronyPliku, type PlikEdytowalny, type ZrodloStron,
} from '@/lib/wersjeEdytowalnePliki'
import type { ObrazBloku, StronaWorda } from '@/lib/wersjeEdytowalneWord'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { ZaznaczanieObszarow } from '../ui/ZaznaczanieObszarow'
import { PodgladBlokow, PodgladUkladu } from './PodgladBlokow'
import { t } from '@/i18n'

/** Kafli w jednym wywołaniu AI (limit funkcji to 20 obrazów). */
const KAFLE_NA_WYWOLANIE = 12
const RODZAJE: RodzajObszaruTekstu[] = ['tekst', 'tabela']

interface Zadanie { nr: number; dane: DaneAi; opis: string; tokeny: number; wymiary?: WymiaryStrony }
interface Plan { rodzaj: 'ai' | 'tlumaczenie'; zadania: Zadanie[]; koszt: number | null; pozostalo: number | null; uwaga: string | null; tlumacz: boolean; obszarow: number }
interface Budzet { miesiac_pln: number; dzis_uzytkownik_pln: number; limit_miesieczny_pln: number; limit_dzienny_pln: number }

const nazwaJezyka = (k: string | null | undefined) => (k ? NAZWY_JEZYKOW[k] ?? k : t('nieznany'))
const stronyTekst = (n: number) => odmiana(n, [t('strona'), t('strony'), t('stron')])

/** Jeden plik modułu "Wersje edytowalne": podgląd z zaznaczaniem, wybór stron, odczyt bez AI / przez AI, tłumaczenie, Word. */
export function PlikWersji({ plik: poczatkowy, zamknij, bajty: bajtyDev }: {
  plik: PlikEdytowalny; zamknij: () => void
  /** Podgląd deweloperski: bajty pliku z dysku, bez zapisu do bazy. */
  bajty?: Uint8Array
}) {
  const dev = !!bajtyDev
  const [plik, setPlik] = useState(poczatkowy)
  const [tresc, setTresc] = useState<TrescPliku>(poczatkowy.tresc ?? { strony: {}, tlumaczenie: {} })
  const [bajty, setBajty] = useState<Uint8Array | null>(bajtyDev ?? null)
  const [zrodlo, setZrodlo] = useState<ZrodloStron | null>(null)
  const [strona, setStrona] = useState(1)
  const [info, setInfo] = useState<InfoStronyPliku | null>(null)
  const [podglad, setPodglad] = useState<string | null>(null)
  const [obszary, setObszary] = useState<ObszarTekstu[]>([])
  const [rodzajNowego, setRodzajNowego] = useState<RodzajObszaruTekstu>('tekst')
  const [wybrany, setWybrany] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [widok, setWidok] = useState<'oryginal' | 'polski'>('oryginal')
  const [uklad, setUklad] = useState(true)
  /** Wybór stron jako tekst ("1-3, 5"); pusty - cały dokument. */
  const [wyborStron, setWyborStron] = useState('')
  const [skany, setSkany] = useState<number[]>([])
  /** AI także dla stron z warstwą tekstową (domyślnie: te strony czyta silnik bez AI - dokładniej i bez kosztów). */
  const [aiDlaTekstu, setAiDlaTekstu] = useState(false)
  /** Układ w Wordzie przy odczycie bez AI: automatycznie (formularze - dokładny), płynny tekst albo dokładne położenie. */
  const [trybUkladu, setTrybUkladu] = useState<'auto' | 'plynny' | 'dokladny'>('auto')
  const [zajety, setZajety] = useState<string | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  const [komunikat, setKomunikat] = useState<string | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [budzet, setBudzet] = useState<Budzet | null>(null)
  const tekstCache = useRef<Record<number, Awaited<ReturnType<ZrodloStron['tekst']>>>>({})

  const zPodgladem = plik.rodzaj === 'pdf' || plik.rodzaj === 'obraz'
  const liczbaStron = zrodlo?.stron ?? plik.stron ?? 1
  const wybraneStrony = useMemo(() => (zPodgladem ? parsujStrony(wyborStron, liczbaStron) : [1]), [wyborStron, liczbaStron, zPodgladem])
  const calyDokument = wybraneStrony.length === liczbaStron

  const wczytajBudzet = useCallback(async () => {
    if (dev) return
    const { data } = await supabase.rpc('ai_zuzycie')
    setBudzet(((data as Budzet[] | null) ?? [])[0] ?? null)
  }, [dev])
  useEffect(() => { void wczytajBudzet() }, [wczytajBudzet])

  // Plik z magazynu -> źródło stron (PDF / obraz). Inne formaty nie mają podglądu - czytamy ich strukturę.
  useEffect(() => {
    let anuluj = false
    ;(async () => {
      try {
        const b = bajtyDev ?? (plik.sciezka ? await pobierzPlikEdytowalny(plik.sciezka) : null)
        if (!b) { setBlad(t('Pliku nie ma w magazynie - zostaje zapisana wersja edytowalna.')); return }
        if (anuluj) return
        setBajty(b)
        if (!zPodgladem) return
        setZajety(t('Wczytywanie pliku...'))
        const z = plik.rodzaj === 'pdf' ? await zrodloPdf(b) : await zrodloObrazu(b, plik.mime ?? 'image/jpeg')
        if (!anuluj) setZrodlo(z)
      } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
      setZajety(null)
    })()
    return () => { anuluj = true }
  }, [plik.sciezka, plik.rodzaj, plik.mime, bajtyDev, zPodgladem])

  useEffect(() => {
    if (!zrodlo) return
    let anuluj = false
    setZajety(t('Renderowanie strony {0}...', strona)); setPodglad(null)
    Promise.all([zrodlo.info(strona), zrodlo.podglad(strona)]).then(([i, p]) => {
      if (anuluj) return
      setInfo(i); setPodglad(p.dataUrl)
    }).catch((e) => setBlad(String(e))).finally(() => setZajety(null))
    return () => { anuluj = true }
  }, [zrodlo, strona])

  const tekstStrony = async (nr: number) => {
    if (!zrodlo) return []
    if (!tekstCache.current[nr]) tekstCache.current[nr] = await zrodlo.tekst(nr)
    return tekstCache.current[nr]
  }
  const idzDo = (nr: number) => { if (nr !== strona) { setStrona(nr); setObszary([]); setWybrany(null) } }

  async function zapisz(nowa: TrescPliku) {
    const jezyk = jezykPliku(nowa)
    setTresc(nowa); setPlik((p) => ({ ...p, jezyk }))
    if (!dev) await zapiszTresc(plik.id, nowa, jezyk)
  }
  const dziennik = async (w: Omit<Parameters<typeof zapiszOdczyt>[0], 'plik_id' | 'nazwa_pliku'>) => {
    if (!dev) await zapiszOdczyt({ plik_id: plik.id, nazwa_pliku: plik.nazwa_pliku, ...w })
  }
  const potwierdzZastapienie = (strony: number[]) => {
    const ai = strony.filter((n) => tresc.strony[n]?.zrodlo === 'ai')
    return !ai.length || window.confirm(t('Strony z odczytem przez AI: {0}. Zastąpić je nowym odczytem?', opisStron(ai)))
  }
  const wPunktach = (o: Prostokat) => ({ x: o.x * info!.szerPt, y: o.y * info!.wysPt, w: o.w * info!.szerPt, h: o.h * info!.wysPt })
  /** Zaznaczone fragmenty dotyczą strony w podglądzie - wtedy czytamy tylko je. */
  const tylkoZaznaczone = obszary.length > 0

  /**
   * „Odczytaj przez AI” dla stron: strony z warstwą tekstową czyta silnik bez AI (układ, czcionki, tabele dokładnie
   * jak w PDF, bez kosztów), do AI idą tylko skany - chyba że zaznaczono AI także dla stron z tekstem albo fragmenty.
   */
  async function odczytajAutomatycznie() {
    if (tylkoZaznaczone || aiDlaTekstu || plik.rodzaj !== 'pdf') { void przygotujAi(tylkoZaznaczone ? [strona] : wybraneStrony, false); return }
    const skany = await odczytajBezAi()
    if (skany?.length) void przygotujAi(skany, false)
  }

  // --- Odczyt bez AI ---------------------------------------------------------------------------------
  async function odczytajBezAi(): Promise<number[] | undefined> {
    setBlad(null); setKomunikat(null); setSkany([])
    try {
      if (!zPodgladem) {
        if (!bajty) return
        if (!potwierdzZastapienie([1])) return
        setZajety(t('Odczyt struktury pliku...'))
        const bloki = await blokiZPliku(plik.nazwa_pliku, plik.rodzaj, bajty)
        const j = wykryjJezyk(tekstBlokow(bloki))
        await zapisz({ ...tresc, strony: { 1: { bloki, zrodlo: 'tekst', jezyk: j.kod } }, tlumaczenie: {} })
        await dziennik({ rodzaj: 'tekst', strony: [1], obszarow: 0, jezyk: j.kod })
        setKomunikat(t('Odczytano bez AI: {0}. Język: {1}.', odmiana(bloki.length, ['blok', 'bloki', 'bloków']), j.nazwa))
        setZajety(null)
        return
      }
      const strony = tylkoZaznaczone ? [strona] : wybraneStrony
      if (!potwierdzZastapienie(strony)) return
      const nowa: TrescPliku = { strony: { ...tresc.strony }, tlumaczenie: { ...tresc.tlumaczenie } }
      const bezTekstu: number[] = []
      for (const [k, nr] of strony.entries()) {
        setZajety(t('Odczyt warstwy tekstowej, strona {0} ({1}/{2})...', nr, k + 1, strony.length))
        const el = await tekstStrony(nr)
        const i = nr === strona && info ? info : await zrodlo!.info(nr)
        const grafika = await zrodlo!.grafika(nr)
        if (jestSkanem(el, grafika, i.szerPt, i.wysPt)) { bezTekstu.push(nr); continue }
        const zaznaczone = tylkoZaznaczone ? obszary.map((o) => ({ ...wPunktach(o), rodzaj: o.rodzaj })) : []
        const dokladny = !zaznaczone.length && (trybUkladu === 'dokladny' || (trybUkladu === 'auto' && jestFormularzem(grafika)))
        const bloki = dokladny ? blokiDokladne(el, i.szerPt, i.wysPt, grafika) : blokiStrony(el, i.szerPt, zaznaczone, { wysPt: i.wysPt, grafika })
        nowa.strony[nr] = {
          bloki, zrodlo: 'tekst', jezyk: wykryjJezyk(tekstBlokow(bloki)).kod, wymiary: { szerPt: i.szerPt, wysPt: i.wysPt }, uklad: dokladny ? 'dokladny' : 'plynny',
        }
        delete nowa.tlumaczenie[nr]
      }
      const odczytane = strony.filter((n) => !bezTekstu.includes(n))
      if (odczytane.length) {
        await zapisz(nowa)
        await dziennik({ rodzaj: 'tekst', strony: odczytane, obszarow: tylkoZaznaczone ? obszary.length : 0, jezyk: jezykPliku(nowa) })
      }
      setSkany(bezTekstu)
      setZajety(null)
      setKomunikat([
        odczytane.length ? t('Odczytano bez AI: {0} ({1}). Język: {2}.', stronyTekst(odczytane.length), opisStron(odczytane), nazwaJezyka(jezykPliku(nowa))) : '',
        bezTekstu.length ? t('Bez warstwy tekstowej (skan): str. {0} - odczytaj je przez AI.', opisStron(bezTekstu)) : '',
      ].filter(Boolean).join(' '))
      return bezTekstu
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setZajety(null)
    return undefined
  }

  // --- Odczyt przez AI ---------------------------------------------------------------------------------
  async function szacuj(rodzaj: Plan['rodzaj'], zadania: Zadanie[], tlumacz: boolean, obszarow: number) {
    setZajety(t('Szacowanie kosztu...'))
    let suma = 0
    let pozostalo: number | null = null
    let uwaga: string | null = null
    for (const z of zadania) {
      const { szacunek, blad: b } = await szacujAi(rodzaj === 'ai' ? 'odczytaj_dokument' : 'przetlumacz_dokument', z.dane)
      if (b || !szacunek) { uwaga = b ?? t('Nie udało się oszacować kosztu.'); break }
      suma += szacunek.koszt_pln
      pozostalo = szacunek.pozostalo_miesiac_pln
    }
    setZajety(null)
    setPlan({ rodzaj, zadania, koszt: uwaga ? null : suma, pozostalo, uwaga, tlumacz, obszarow })
  }

  async function przygotujAi(strony: number[], tlumacz: boolean) {
    if (!zrodlo) return
    setBlad(null); setKomunikat(null)
    try {
      const zaznaczone = tylkoZaznaczone && strony.length === 1 && strony[0] === strona
      const zadania: Zadanie[] = []
      for (const [n, nr] of strony.entries()) {
        setZajety(t('Przygotowanie strony {0} ({1}/{2})...', nr, n + 1, strony.length))
        const i = await zrodlo.info(nr)
        const fragmenty: (Prostokat & { rodzaj: RodzajObszaruTekstu | 'strona' })[] = zaznaczone
          ? [...obszary].sort((a, b) => a.y - b.y || a.x - b.x) : [{ x: 0, y: 0, w: 1, h: 1, rodzaj: 'strona' }]
        const obrazy: NonNullable<DaneAi['obrazy']> = []
        let tokeny = 0
        let nrKafla = 0
        for (const f of fragmenty) {
          const k = await zrodlo.kafle(nr, f)
          const prost = k.kafle.map((x) => x.prostokat)
          const etykieta = f.rodzaj === 'strona' ? t('cała strona') : t('fragment {0}/{1} ({2})', fragmenty.indexOf(f) + 1, fragmenty.length, f.rodzaj === 'tabela' ? 'tabela' : 'tekst')
          k.kafle.forEach((x) => {
            nrKafla++
            // Zakres kafla na stronie (0..1) - model podaje położenie bloków w % strony.
            const naStronie = { x: f.x + (x.prostokat.x / k.szer) * f.w, y: f.y + (x.prostokat.y / k.wys) * f.h, w: (x.prostokat.w / k.szer) * f.w, h: (x.prostokat.h / k.wys) * f.h }
            obrazy.push({ media_type: 'image/jpeg', dane: x.base64, opis: opisKaflaDokumentu(nrKafla, etykieta, x.prostokat, prost, naStronie) })
            tokeny += tokenyObrazu(x.prostokat.w, x.prostokat.h)
          })
        }
        const czesci = Math.ceil(obrazy.length / KAFLE_NA_WYWOLANIE)
        for (let c = 0; c < czesci; c++) {
          const paczka = obrazy.slice(c * KAFLE_NA_WYWOLANIE, (c + 1) * KAFLE_NA_WYWOLANIE)
          zadania.push({
            nr, tokeny: Math.round(tokeny * paczka.length / obrazy.length), wymiary: { szerPt: i.szerPt, wysPt: i.wysPt },
            opis: t('Strona {0}{1}: {2}{3}', nr, zaznaczone ? ` - ${odmiana(fragmenty.length, ['fragment', 'fragmenty', 'fragmentów'])}` : '', kafliOdmiana(paczka.length), czesci > 1 ? `, część ${c + 1}/${czesci}` : ''),
            dane: { obrazy: paczka, plik_id: dev ? null : plik.id, metadane: { plik: plik.nazwa_pliku, strona: nr, tlumacz_na_polski: tlumacz } },
          })
        }
      }
      await szacuj('ai', zadania, tlumacz, zaznaczone ? obszary.length : 0)
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)); setZajety(null) }
  }

  function przygotujTlumaczenie() {
    const strony = wybraneStrony.filter((n) => tresc.strony[n]?.bloki.some((b) => b.typ !== 'obraz') && tresc.strony[n].jezyk !== 'pl')
    if (!strony.length) { setBlad(t('Wybrane strony nie mają odczytanej treści w języku obcym - najpierw je odczytaj (strony po polsku są pomijane).')); return }
    const zadania = strony.map((nr): Zadanie => {
      const tekst = JSON.stringify(blokiDoTlumaczenia(tresc.strony[nr].bloki))
      return { nr, tokeny: Math.ceil(tekst.length / 3), opis: t('Strona {0}: {1}', nr, odmiana(tresc.strony[nr].bloki.length, ['blok', 'bloki', 'bloków'])), dane: { tekst, plik_id: dev ? null : plik.id, metadane: { plik: plik.nazwa_pliku, strona: nr } } }
    })
    void szacuj('tlumaczenie', zadania, true, 0)
  }

  async function wykonaj() {
    if (!plan) return
    const p = plan
    setPlan(null)
    if (p.rodzaj === 'ai' && !potwierdzZastapienie([...new Set(p.zadania.map((z) => z.nr))])) return
    let suma = 0
    let model: string | null = null
    const nowa: TrescPliku = { strony: { ...tresc.strony }, tlumaczenie: { ...tresc.tlumaczenie } }
    const zrobione = new Set<number>()
    const czesciStron: Record<number, { bloki: BlokDokumentu[]; pl: BlokDokumentu[]; jezyk: string | null }> = {}
    try {
      for (const [i, z] of p.zadania.entries()) {
        setZajety(t('{0} AI {1}/{2}: {3}...', p.rodzaj === 'ai' ? t('Odczyt') : t('Tłumaczenie'), i + 1, p.zadania.length, z.opis))
        if (p.rodzaj === 'ai') {
          const { odp, blad: b } = await wywolajAi<{ jezyk: string; bloki: unknown; tlumaczenie: unknown }>('odczytaj_dokument', z.dane)
          if (b || !odp) throw new Error(b ?? t('Brak odpowiedzi.'))
          suma += odp.koszt_pln; model = odp.model
          const c = czesciStron[z.nr] ?? { bloki: [], pl: [], jezyk: null }
          c.bloki.push(...blokiZAi(odp.wynik.bloki)); c.pl.push(...blokiZAi(odp.wynik.tlumaczenie)); c.jezyk = (odp.wynik.jezyk || c.jezyk || '').toLowerCase().slice(0, 2) || null
          czesciStron[z.nr] = c
          nowa.strony[z.nr] = { bloki: c.bloki, zrodlo: 'ai', jezyk: c.jezyk, wymiary: z.wymiary ?? null }
          // Tłumaczenie dostaje układ (położenie, czcionkę, obrazy) z odczytu oryginału.
          if (c.pl.length) nowa.tlumaczenie[z.nr] = { bloki: scalTlumaczenie(c.bloki, c.pl) }
          else if (c.jezyk === 'pl' || !p.tlumacz) delete nowa.tlumaczenie[z.nr]
        } else {
          const { odp, blad: b } = await wywolajAi<{ jezyk_zrodlowy: string; bloki: unknown }>('przetlumacz_dokument', z.dane)
          if (b || !odp) throw new Error(b ?? t('Brak odpowiedzi.'))
          suma += odp.koszt_pln; model = odp.model
          nowa.tlumaczenie[z.nr] = { bloki: scalTlumaczenie(nowa.strony[z.nr]?.bloki ?? [], blokiZAi(odp.wynik.bloki)) }
        }
        zrobione.add(z.nr)
        // Wynik AI zapisujemy po każdej stronie - przerwanie nie marnuje już zapłaconych odczytów.
        await zapisz({ strony: { ...nowa.strony }, tlumaczenie: { ...nowa.tlumaczenie } })
      }
    } catch (e) { setBlad(`${e instanceof Error ? e.message : String(e)}${zrobione.size ? t(' Zapisano wcześniejsze strony ({0}).', opisStron([...zrobione])) : ''}`) }
    setZajety(null)
    if (zrobione.size) {
      await dziennik({ rodzaj: p.rodzaj, strony: [...zrobione], obszarow: p.obszarow, jezyk: jezykPliku(nowa), model, koszt_pln: suma })
      setKomunikat(t('{0} AI zapisane: {1} ({2}), koszt {3} zł.', p.rodzaj === 'ai' ? t('Odczyt') : t('Tłumaczenie'), stronyTekst(zrobione.size), opisStron([...zrobione]), liczba(suma, 2)))
      if (p.rodzaj === 'tlumaczenie' || p.tlumacz) setWidok('polski')
      if (p.rodzaj === 'ai') setSkany((s) => s.filter((n) => !zrobione.has(n)))
    }
    void wczytajBudzet()
  }

  // --- Widok wyniku i Word ------------------------------------------------------------------------------
  const zrodloWidoku = widok === 'polski' ? tresc.tlumaczenie : tresc.strony
  const pokazane = useMemo(() => wybraneStrony.map((n) => ({ nr: n, bloki: zrodloWidoku[n]?.bloki ?? [] })).filter((s) => s.bloki.length), [zrodloWidoku, wybraneStrony])
  const doWorda = (polski: boolean) => wybraneStrony.filter((n) => (polski ? tresc.tlumaczenie : tresc.strony)[n]?.bloki.length)

  async function word(polski: boolean) {
    setBlad(null)
    try {
      const { pobierzWord } = await import('@/lib/wersjeEdytowalneWord')
      const zrodloStron = polski ? tresc.tlumaczenie : tresc.strony
      const strony: StronaWorda[] = []
      for (const nr of doWorda(polski)) {
        const bloki = zrodloStron[nr].bloki
        const uklad = tresc.strony[nr]?.uklad ?? 'plynny'
        const obrazy: Record<number, ObrazBloku> = {}
        let tlo: ObrazBloku | null = null
        if (uklad === 'dokladny' && zrodlo) {
          setZajety(t('Tło strony {0} (linie i grafika)...', nr))
          const dane = await zrodlo.tlo(nr)
          tlo = dane ? { dane, typ: 'jpg' } : null
        }
        for (const [i, b] of bloki.entries()) {
          if (uklad === 'dokladny' || b.typ !== 'obraz' || !b.ramka || !zrodlo) continue
          setZajety(t('Wycinanie obrazów, strona {0}...', nr))
          obrazy[i] = { dane: await zrodlo.wycinek(nr, b.ramka), typ: 'jpg' }
        }
        strony.push({ nr, bloki, wymiary: tresc.strony[nr]?.wymiary ?? null, obrazy, uklad, tlo })
      }
      setZajety(t('Składanie dokumentu Word...'))
      const zakres = calyDokument ? '' : ` (str. ${opisStron(strony.map((s) => s.nr))})`
      await pobierzWord(strony, `${plik.nazwa_pliku.replace(/\.[^.]+$/, '')}${polski ? ' - PL' : ' - wersja edytowalna'}${zakres}`)
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setZajety(null)
  }

  const pozostaloDzis = budzet ? budzet.limit_dzienny_pln - budzet.dzis_uzytkownik_pln : null
  const tekstowa = (info?.elementowTekstu ?? 0) > 0
  const zakresPrzycisku = tylkoZaznaczone ? t('zaznaczone na str. {0}', strona) : calyDokument ? t('cały dokument') : t('str. {0}', opisStron(wybraneStrony))
  const stanStrony = (n: number) => (tresc.tlumaczenie[n]?.bloki.length ? 'pl' : tresc.strony[n]?.zrodlo ?? null)
  const KOLOR_STANU: Record<string, string> = { pl: 'border-emerald-400 bg-emerald-50', ai: 'border-violet-400 bg-violet-50', tekst: 'border-sky-400 bg-sky-50' }
  const przelacz = (n: number) => {
    const s = new Set(wybraneStrony)
    if (s.has(n)) s.delete(n); else s.add(n)
    setWyborStron(s.size === liczbaStron ? '' : opisStron([...s]) || '0')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button rozmiar="maly" wariant="cichy" onClick={zamknij}><ArrowLeft className="h-4 w-4" /> {t('Pliki')}</Button>
        <h3 className="font-semibold">{plik.nazwa_pliku}</h3>
        {zPodgladem && (
          <div className="flex items-center gap-1 text-sm">
            <Button rozmiar="maly" disabled={strona <= 1} onClick={() => idzDo(strona - 1)}><ArrowLeft className="h-3 w-3" /></Button>
            <span>{t('podgląd: strona {0} / {1}', strona, liczbaStron)}</span>
            <Button rozmiar="maly" disabled={strona >= liczbaStron} onClick={() => idzDo(strona + 1)}><ArrowRight className="h-3 w-3" /></Button>
          </div>
        )}
        {info && plik.rodzaj === 'pdf' && <span className="text-xs text-slate-500">{tekstowa ? t('warstwa tekstowa ({0} elementów)', info.elementowTekstu) : t('skan bez warstwy tekstowej')}</span>}
        <span className="znacznik bg-slate-100 text-slate-700">{t('język:')}{' '}{nazwaJezyka(plik.jezyk)}</span>
        {budzet && (
          <span className="ml-auto text-xs text-slate-600">
            {t('Budżet AI:')}{' '}{liczba(budzet.miesiac_pln, 2)} z {liczba(budzet.limit_miesieczny_pln, 0)} {t('zł w miesiącu · Twój limit dziś: zostało')}{' '}{liczba(Math.max(0, pozostaloDzis ?? 0), 2)} {t('zł')}
          </span>
        )}
      </div>

      {zPodgladem && (
        <section className="sekcja space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="etykieta mb-0">{t('Strony do odczytu, tłumaczenia i Worda:')}</span>
            <input className="pole w-40 py-1 text-sm" value={wyborStron} placeholder={t('wszystkie (1-{0})', liczbaStron)} onChange={(e) => setWyborStron(e.target.value)} title={t('Np. 1-3, 5. Puste - cały dokument.')} />
            <Button rozmiar="maly" wariant={calyDokument ? 'akcent' : 'cichy'} onClick={() => setWyborStron('')}>{t('Cały dokument')}</Button>
            <Button rozmiar="maly" wariant="cichy" onClick={() => setWyborStron(String(strona))}>{t('Tylko strona {0}', strona)}</Button>
            <span className="text-xs text-slate-500">{t('Wybrano: {0}', stronyTekst(wybraneStrony.length))}</span>
          </div>
          {liczbaStron <= 200 && (
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: liczbaStron }, (_, i) => i + 1).map((n) => {
                const s = stanStrony(n)
                return (
                  <button key={n} onClick={(e) => (e.shiftKey || e.ctrlKey ? przelacz(n) : idzDo(n))} onContextMenu={(e) => { e.preventDefault(); przelacz(n) }}
                    title={t('Klik - podgląd strony; Ctrl+klik albo prawy przycisk - zaznacz / odznacz. Stan: {0}', s === 'pl' ? t('przetłumaczona') : s === 'ai' ? t('odczyt AI') : s === 'tekst' ? t('odczyt bez AI') : t('nieodczytana'))}
                    className={cn('min-w-[2rem] rounded border px-1.5 py-0.5 text-xs', s ? KOLOR_STANU[s] : 'border-slate-200 bg-white',
                      !wybraneStrony.includes(n) && 'opacity-40', n === strona && 'ring-2 ring-slate-800')}>
                    {n}
                  </button>
                )
              })}
            </div>
          )}
          <p className="text-xs text-slate-500">
            {t('Kolor: niebieski - odczyt bez AI, fioletowy - odczyt AI, zielony - przetłumaczona. Klik - podgląd strony, Ctrl+klik - wybór strony.')}
          </p>
        </section>
      )}

      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {komunikat && (
        <Komunikat rodzaj="sukces">
          {komunikat}
          {skany.length > 0 && (
            <Button rozmiar="maly" wariant="akcent" className="ml-2" disabled={!!zajety} onClick={() => void przygotujAi(skany, false)}>
              <Sparkles className="h-3 w-3" /> {t('Odczytaj skany przez AI ({0})', opisStron(skany))}
            </Button>
          )}
        </Komunikat>
      )}
      {zajety && <Komunikat rodzaj="info">{zajety}</Komunikat>}

      <div className={cn('grid gap-3', zPodgladem && 'xl:grid-cols-2')}>
        {zPodgladem && (
          <section className="sekcja space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="etykieta mb-0">{t('Zaznacz:')}</span>
              {RODZAJE.map((r) => (
                <button key={r} onClick={() => setRodzajNowego(r)}
                  className={cn('rounded-md border px-2 py-1 text-xs', rodzajNowego === r ? 'font-semibold text-white' : 'bg-white text-slate-700')}
                  style={rodzajNowego === r ? { background: KOLORY_OBSZARU_TEKSTU[r], borderColor: KOLORY_OBSZARU_TEKSTU[r] } : { borderColor: KOLORY_OBSZARU_TEKSTU[r] }}>
                  {ETYKIETY_OBSZARU_TEKSTU[r]}
                </button>
              ))}
              {obszary.length > 0 && <Button rozmiar="maly" wariant="cichy" onClick={() => { setObszary([]); setWybrany(null) }}>{t('wyczyść')}</Button>}
              <span className="mx-1 h-5 w-px bg-slate-200" />
              <Button rozmiar="maly" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} title={t('Pomniejsz')}><ZoomOut className="h-3 w-3" /></Button>
              <span className="w-12 text-center text-xs">{Math.round(zoom * 100)}%</span>
              <Button rozmiar="maly" onClick={() => setZoom((z) => Math.min(6, z * 1.25))} title={t('Powiększ')}><ZoomIn className="h-3 w-3" /></Button>
            </div>
            <p className="text-xs text-slate-500">
              {t('Bez zaznaczenia odczytywane są wybrane strony w całości (tabele, obrazy i układ rozpoznawane automatycznie). Zaznacz fragment (przeciągnij myszą), żeby odczytać tylko go - przy krawędzi podgląd sam się przewija.')}
            </p>
            <div className="max-h-[75vh] overflow-auto rounded border border-slate-200 bg-slate-100">
              {podglad && (
                <ZaznaczanieObszarow
                  dataUrl={podglad} zoom={zoom} wybrany={wybrany} podswietlony={null} tylkoOdczyt={false} wybierz={setWybrany}
                  obszary={obszary.map((o) => ({ ...o, kolor: KOLORY_OBSZARU_TEKSTU[o.rodzaj], etykieta: ETYKIETY_OBSZARU_TEKSTU[o.rodzaj] }))}
                  kolorNowego={KOLORY_OBSZARU_TEKSTU[rodzajNowego]}
                  dodaj={(p) => { const id = crypto.randomUUID(); setObszary((l) => [...l, { id, rodzaj: rodzajNowego, ...p }]); setWybrany(id) }}
                  usun={(x) => { setObszary((l) => l.filter((o) => o.id !== x)); setWybrany(null) }}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-600">{tylkoZaznaczone ? t('Zaznaczone: {0}', obszary.map((o) => ETYKIETY_OBSZARU_TEKSTU[o.rodzaj]).join(', ')) : t('Zakres: {0}', zakresPrzycisku)}</span>
              {plik.rodzaj === 'pdf' && (
                <label className="flex items-center gap-1 text-xs text-slate-600"
                  title={t('Płynny tekst - akapity i tabele jeden pod drugim, wygodne do dalszej edycji. Dokładne położenie - tekst w polach w miejscach oryginału na tle z liniami i grafiką (formularze, karty danych). Automatycznie - strony z gęstą siatką linii dostają dokładne położenie. Dotyczy odczytu bez AI.')}>
                  {t('Układ w Wordzie:')}
                  <select className="pole w-auto py-0.5 text-xs" value={trybUkladu} onChange={(e) => setTrybUkladu(e.target.value as typeof trybUkladu)}>
                    <option value="auto">{t('automatycznie')}</option>
                    <option value="plynny">{t('płynny tekst')}</option>
                    <option value="dokladny">{t('dokładne położenie')}</option>
                  </select>
                </label>
              )}
              {plik.rodzaj === 'pdf' && !tylkoZaznaczone && (
                <label className="flex items-center gap-1 text-xs text-slate-600" title={t('Domyślnie strony z warstwą tekstową czyta silnik bez AI - dokładniej i bez kosztów; AI czyta tylko skany.')}>
                  <input type="checkbox" checked={aiDlaTekstu} onChange={(e) => setAiDlaTekstu(e.target.checked)} /> {t('AI także dla stron z tekstem')}
                </label>
              )}
              <span className="ml-auto" />
              <Button rozmiar="maly" disabled={plik.rodzaj !== 'pdf' || !!zajety || !wybraneStrony.length} onClick={() => void odczytajBezAi()}
                title={plik.rodzaj !== 'pdf' ? t('Zdjęcie / skan nie ma warstwy tekstowej - tylko AI') : t('Z warstwy tekstowej PDF - bez kosztów; strony-skany zostaną wskazane do odczytu przez AI')}>
                <FileText className="h-3 w-3" /> {t('Odczytaj bez AI')} ({zakresPrzycisku})
              </Button>
              <Button rozmiar="maly" wariant="akcent" disabled={!!zajety || !wybraneStrony.length} onClick={() => void odczytajAutomatycznie()}
                title={aiDlaTekstu ? t('Każda strona osobno, koszt pokazany przed odczytem') : t('Strony z warstwą tekstową - bez AI (dokładnie i bez kosztów), skany - przez AI z kosztem pokazanym przed odczytem')}>
                <Sparkles className="h-3 w-3" /> {t('Odczytaj przez AI')} ({zakresPrzycisku})
              </Button>
            </div>
          </section>
        )}

        <section className="sekcja space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold">{t('Wersja edytowalna')}</h4>
            <div className="flex rounded-md border border-slate-200 text-xs">
              <button className={cn('px-2 py-1', widok === 'oryginal' && 'bg-slate-800 text-white')} onClick={() => setWidok('oryginal')}>
                {t('Oryginał (')}{nazwaJezyka(plik.jezyk)})
              </button>
              <button className={cn('px-2 py-1', widok === 'polski' && 'bg-slate-800 text-white')} onClick={() => setWidok('polski')}>{t('Polski')}</button>
            </div>
            {zPodgladem && (
              <div className="flex rounded-md border border-slate-200 text-xs">
                <button className={cn('px-2 py-1', uklad && 'bg-slate-800 text-white')} onClick={() => setUklad(true)}>{t('Układ strony')}</button>
                <button className={cn('px-2 py-1', !uklad && 'bg-slate-800 text-white')} onClick={() => setUklad(false)}>{t('Tekst')}</button>
              </div>
            )}
          </div>
          {!zPodgladem && (
            <div className="flex flex-wrap gap-2">
              <Button rozmiar="maly" disabled={!bajty || !!zajety} onClick={() => void odczytajBezAi()}><FileText className="h-3 w-3" /> {t('Odczytaj bez AI')}</Button>
              <span className="self-center text-xs text-slate-500">
                {plik.rodzaj === 'docx' ? t('DOCX: nagłówki, akapity, listy i tabele.') : plik.rodzaj === 'arkusz' ? t('Arkusz: każdy arkusz jako tabela.') : plik.rodzaj === 'cad' ? t('DXF: teksty z rysunku (DWG / STEP zapisz jako PDF).') : ''}
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button rozmiar="maly" wariant="akcent" disabled={!!zajety || !numeryStron(tresc.strony).length} onClick={przygotujTlumaczenie}
              title={t('Tłumaczenie odczytanej treści przez AI z zachowaniem układu - koszt pokazany przed wywołaniem')}>
              <Languages className="h-3 w-3" /> {t('Przetłumacz na polski')}{zPodgladem ? ` (${calyDokument ? t('cały dokument') : t('str. {0}', opisStron(wybraneStrony))})` : ''}
            </Button>
            <span className="ml-auto" />
            <Button rozmiar="maly" disabled={!doWorda(false).length || !!zajety} onClick={() => void word(false)}><FileDown className="h-3 w-3" /> {t('Word - oryginał')}</Button>
            <Button rozmiar="maly" disabled={!doWorda(true).length || !!zajety} onClick={() => void word(true)}><FileDown className="h-3 w-3" /> {t('Word - polski')}</Button>
          </div>
          {zPodgladem && pokazane.length > 0 && pokazane.length < wybraneStrony.length && (
            <p className="text-xs text-amber-700">{t('Bez treści w tej wersji: str. {0}.', opisStron(wybraneStrony.filter((n) => !pokazane.some((s) => s.nr === n))))}</p>
          )}
          <div className="max-h-[75vh] space-y-4 overflow-auto rounded border border-slate-100 bg-slate-50 p-3">
            {pokazane.length ? pokazane.map((s) => (
              <div key={s.nr}>
                {zPodgladem && (
                  <button className="mb-1 text-xs font-semibold text-slate-500 hover:text-slate-900" onClick={() => idzDo(s.nr)} title={t('Pokaż tę stronę w podglądzie')}>
                    {t('— strona')}{' '}{s.nr} —
                  </button>
                )}
                {uklad && zPodgladem && s.bloki.some((b) => b.ramka)
                  ? <PodgladUkladu bloki={s.bloki} wymiary={tresc.strony[s.nr]?.wymiary} tlo={s.nr === strona ? podglad : null} />
                  : <div className="rounded bg-white p-3"><PodgladBlokow bloki={s.bloki} /></div>}
              </div>
            )) : (
              <p className="text-sm text-slate-500">
                {widok === 'polski' ? t('Brak tłumaczenia - użyj „Przetłumacz na polski” albo odczytu AI z tłumaczeniem.') : t('Brak odczytu - użyj „Odczytaj bez AI” (PDF z warstwą tekstową, DOCX, arkusze) albo „Odczytaj przez AI” (skany, zdjęcia).')}
              </p>
            )}
          </div>
        </section>
      </div>

      <Dialog open={!!plan} onOpenChange={(o) => !o && setPlan(null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{plan?.rodzaj === 'tlumaczenie' ? t('Tłumaczenie przez AI') : t('Odczyt przez AI')} {t('- potwierdzenie kosztu')}</DialogTitle>
          <DialogDescription>
            {plan?.rodzaj === 'tlumaczenie' ? t('Do Claude API trafi odczytana treść stron (tekst, bez pliku).') : t('Do Claude API trafią tylko poniższe wycinki pliku (obrazy ok. 200 DPI).')}
          </DialogDescription>
          {plan && (
            <div className="mt-3 space-y-3 text-sm">
              <ul className="max-h-48 list-disc overflow-auto pl-5">
                {plan.zadania.map((z, i) => <li key={i}>{z.opis} {t('- ok.')}{' '}{liczba(z.tokeny / 1000, 1)} {t('tys. tokenów')}</li>)}
              </ul>
              {plan.rodzaj === 'ai' && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={plan.tlumacz} onChange={(e) => {
                    const tl = e.target.checked
                    void szacuj('ai', plan.zadania.map((z) => ({ ...z, dane: { ...z.dane, metadane: { ...z.dane.metadane, tlumacz_na_polski: tl } } })), tl, plan.obszarow)
                  }} />
                  {t('od razu przetłumacz na polski (droższy odczyt, taniej niż osobne tłumaczenie)')}
                </label>
              )}
              {plan.uwaga
                ? <Komunikat rodzaj="ostrzezenie">{plan.uwaga}</Komunikat>
                : (
                  <p>
                    {t('Szacowany koszt:')}{' '}<strong>{liczba(plan.koszt ?? 0, 2)} {t('zł')}</strong>
                    {plan.pozostalo !== null && t(' · w budżecie miesiąca zostało {0} zł', liczba(plan.pozostalo, 2))}
                    {pozostaloDzis !== null && t(' · Twój limit dziś: {0} zł', liczba(Math.max(0, pozostaloDzis), 2))}.
                  </p>
                )}
              <div className="flex justify-end gap-2">
                <Button onClick={() => setPlan(null)}>{t('Anuluj')}</Button>
                <Button wariant="akcent" disabled={!!plan.uwaga} onClick={() => void wykonaj()}><Sparkles className="h-4 w-4" /> {plan.rodzaj === 'tlumaczenie' ? t('Przetłumacz') : t('Odczytaj')}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
