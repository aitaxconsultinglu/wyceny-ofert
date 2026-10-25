import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, FileDown, FileText, Languages, Maximize, Sparkles, ZoomIn, ZoomOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { liczba, odmiana } from '@/lib/format'
import { cn } from '@/lib/utils'
import { szacujAi, wywolajAi, type DaneAi } from '@/lib/ai'
import { kafliOdmiana, tokenyObrazu, type Prostokat } from '@/lib/rysunki'
import {
  ETYKIETY_OBSZARU_TEKSTU, KOLORY_OBSZARU_TEKSTU, NAZWY_JEZYKOW, blokiStrony, blokiZAi, jezykPliku, numeryStron, opisKaflaDokumentu, tekstBlokow, wykryjJezyk,
  type BlokDokumentu, type ObszarTekstu, type RodzajObszaruTekstu, type TrescPliku,
} from '@/lib/wersjeEdytowalne'
import {
  blokiZPliku, pobierzPlikEdytowalny, zapiszOdczyt, zapiszTresc, zrodloObrazu, zrodloPdf,
  type InfoStronyPliku, type PlikEdytowalny, type ZrodloStron,
} from '@/lib/wersjeEdytowalnePliki'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { ZaznaczanieObszarow } from '../ui/ZaznaczanieObszarow'
import { PodgladBlokow } from './PodgladBlokow'

/** Strona ma warstwę tekstową, gdy ma co najmniej tyle elementów tekstu - inaczej to skan. */
const MIN_ELEMENTOW_TEKSTU = 15
/** Kafli w jednym wywołaniu AI (limit funkcji to 20 obrazów). */
const KAFLE_NA_WYWOLANIE = 12
const RODZAJE: RodzajObszaruTekstu[] = ['tekst', 'tabela']

interface Zadanie { nr: number; dane: DaneAi; opis: string; tokeny: number }
interface Plan { rodzaj: 'ai' | 'tlumaczenie'; zadania: Zadanie[]; koszt: number | null; pozostalo: number | null; uwaga: string | null; tlumacz: boolean; obszarow: number }
interface Budzet { miesiac_pln: number; dzis_uzytkownik_pln: number; limit_miesieczny_pln: number; limit_dzienny_pln: number }

const nazwaJezyka = (k: string | null | undefined) => (k ? NAZWY_JEZYKOW[k] ?? k : 'nieznany')

/** Jeden plik modułu "Wersje edytowalne": podgląd z zaznaczaniem, odczyt bez AI / przez AI, tłumaczenie, Word. */
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
  const [wszystkieStrony, setWszystkieStrony] = useState(false)
  const [zajety, setZajety] = useState<string | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  const [komunikat, setKomunikat] = useState<string | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [budzet, setBudzet] = useState<Budzet | null>(null)
  const tekstCache = useRef<Record<number, Awaited<ReturnType<ZrodloStron['tekst']>>>>({})

  const zPodgladem = plik.rodzaj === 'pdf' || plik.rodzaj === 'obraz'
  const liczbaStron = zrodlo?.stron ?? plik.stron ?? 1

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
        if (!b) { setBlad('Pliku nie ma w magazynie - zostaje zapisana wersja edytowalna.'); return }
        if (anuluj) return
        setBajty(b)
        if (!zPodgladem) return
        setZajety('Wczytywanie pliku...')
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
    setZajety(`Renderowanie strony ${strona}...`); setPodglad(null)
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
    return !ai.length || window.confirm(`${ai.length === 1 ? `Strona ${ai[0]} ma` : `Strony ${ai.join(', ')} mają`} odczyt przez AI. Zastąpić go nowym odczytem?`)
  }
  const wPunktach = (o: Prostokat) => ({ x: o.x * info!.szerPt, y: o.y * info!.wysPt, w: o.w * info!.szerPt, h: o.h * info!.wysPt })

  // --- Odczyt bez AI ---------------------------------------------------------------------------------
  async function odczytajBezAi(wszystkie: boolean) {
    setBlad(null); setKomunikat(null)
    try {
      if (!zPodgladem) {
        if (!bajty) return
        if (!potwierdzZastapienie([1])) return
        setZajety('Odczyt struktury pliku...')
        const bloki = await blokiZPliku(plik.nazwa_pliku, plik.rodzaj, bajty)
        const j = wykryjJezyk(tekstBlokow(bloki))
        await zapisz({ ...tresc, strony: { 1: { bloki, zrodlo: 'tekst', jezyk: j.kod } }, tlumaczenie: {} })
        await dziennik({ rodzaj: 'tekst', strony: [1], obszarow: 0, jezyk: j.kod })
        setKomunikat(`Odczytano bez AI: ${odmiana(bloki.length, ['blok', 'bloki', 'bloków'])}. Język: ${j.nazwa}.`)
        return
      }
      const strony = wszystkie ? Array.from({ length: liczbaStron }, (_, i) => i + 1) : [strona]
      if (!potwierdzZastapienie(strony)) return
      const nowa: TrescPliku = { strony: { ...tresc.strony }, tlumaczenie: { ...tresc.tlumaczenie } }
      const skany: number[] = []
      for (const nr of strony) {
        setZajety(`Odczyt warstwy tekstowej, strona ${nr}/${liczbaStron}...`)
        const el = await tekstStrony(nr)
        if (el.length < MIN_ELEMENTOW_TEKSTU) { skany.push(nr); continue }
        const i = nr === strona && info ? info : await zrodlo!.info(nr)
        const zaznaczone = nr === strona && !wszystkie ? obszary.map((o) => ({ ...wPunktach(o), rodzaj: o.rodzaj })) : []
        const bloki = blokiStrony(el, i.szerPt, zaznaczone)
        nowa.strony[nr] = { bloki, zrodlo: 'tekst', jezyk: wykryjJezyk(tekstBlokow(bloki)).kod }
        delete nowa.tlumaczenie[nr]
      }
      const odczytane = strony.filter((n) => !skany.includes(n))
      if (odczytane.length) {
        await zapisz(nowa)
        await dziennik({ rodzaj: 'tekst', strony: odczytane, obszarow: wszystkie ? 0 : obszary.length, jezyk: jezykPliku(nowa) })
      }
      setKomunikat([
        odczytane.length ? `Odczytano bez AI: ${odmiana(odczytane.length, ['strona', 'strony', 'stron'])}. Język: ${nazwaJezyka(jezykPliku(nowa))}.` : '',
        skany.length ? `Bez warstwy tekstowej (skan): ${skany.length > 10 ? `${skany.length} stron` : `str. ${skany.join(', ')}`} - użyj odczytu przez AI.` : '',
      ].filter(Boolean).join(' '))
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setZajety(null)
  }

  // --- Odczyt przez AI ---------------------------------------------------------------------------------
  async function szacuj(rodzaj: Plan['rodzaj'], zadania: Zadanie[], tlumacz: boolean, obszarow: number) {
    setZajety('Szacowanie kosztu...')
    let suma = 0
    let pozostalo: number | null = null
    let uwaga: string | null = null
    for (const z of zadania) {
      const { szacunek, blad: b } = await szacujAi(rodzaj === 'ai' ? 'odczytaj_dokument' : 'przetlumacz_dokument', z.dane)
      if (b || !szacunek) { uwaga = b ?? 'Nie udało się oszacować kosztu.'; break }
      suma += szacunek.koszt_pln
      pozostalo = szacunek.pozostalo_miesiac_pln
    }
    setZajety(null)
    setPlan({ rodzaj, zadania, koszt: uwaga ? null : suma, pozostalo, uwaga, tlumacz, obszarow })
  }

  async function przygotujAi(zakres: 'zaznaczone' | 'strona' | 'wszystkie', tlumacz: boolean) {
    if (!zrodlo) return
    if (zakres === 'zaznaczone' && !obszary.length) { setBlad('Zaznacz fragment na podglądzie (przeciągnij myszą) albo odczytaj całą stronę.'); return }
    setBlad(null); setKomunikat(null)
    try {
      const strony = zakres === 'wszystkie' ? Array.from({ length: liczbaStron }, (_, i) => i + 1) : [strona]
      const zadania: Zadanie[] = []
      for (const nr of strony) {
        setZajety(`Przygotowanie strony ${nr}/${strony.length}...`)
        const fragmenty: (Prostokat & { rodzaj: RodzajObszaruTekstu | 'strona' })[] = zakres === 'zaznaczone'
          ? [...obszary].sort((a, b) => a.y - b.y || a.x - b.x) : [{ x: 0, y: 0, w: 1, h: 1, rodzaj: 'strona' }]
        const obrazy: NonNullable<DaneAi['obrazy']> = []
        let tokeny = 0
        let nrKafla = 0
        for (const f of fragmenty) {
          const k = await zrodlo.kafle(nr, f)
          const prost = k.kafle.map((x) => x.prostokat)
          const etykieta = f.rodzaj === 'strona' ? 'cała strona' : `fragment ${fragmenty.indexOf(f) + 1}/${fragmenty.length} (${f.rodzaj === 'tabela' ? 'tabela' : 'tekst'})`
          k.kafle.forEach((x) => {
            nrKafla++
            obrazy.push({ media_type: 'image/jpeg', dane: x.base64, opis: opisKaflaDokumentu(nrKafla, etykieta, x.prostokat, prost) })
            tokeny += tokenyObrazu(x.prostokat.w, x.prostokat.h)
          })
        }
        const czesci = Math.ceil(obrazy.length / KAFLE_NA_WYWOLANIE)
        for (let c = 0; c < czesci; c++) {
          const paczka = obrazy.slice(c * KAFLE_NA_WYWOLANIE, (c + 1) * KAFLE_NA_WYWOLANIE)
          zadania.push({
            nr, tokeny: Math.round(tokeny * paczka.length / obrazy.length),
            opis: `Strona ${nr}${zakres === 'zaznaczone' ? ` - ${odmiana(fragmenty.length, ['fragment', 'fragmenty', 'fragmentów'])}` : ''}: ${kafliOdmiana(paczka.length)}${czesci > 1 ? `, część ${c + 1}/${czesci}` : ''}`,
            dane: { obrazy: paczka, plik_id: dev ? null : plik.id, metadane: { plik: plik.nazwa_pliku, strona: nr, tlumacz_na_polski: tlumacz } },
          })
        }
      }
      await szacuj('ai', zadania, tlumacz, zakres === 'zaznaczone' ? obszary.length : 0)
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)); setZajety(null) }
  }

  function przygotujTlumaczenie(wszystkie: boolean) {
    const strony = (wszystkie ? numeryStron(tresc.strony) : [strona]).filter((n) => tresc.strony[n]?.bloki.length && tresc.strony[n].jezyk !== 'pl')
    if (!strony.length) { setBlad(wszystkie ? 'Brak stron do tłumaczenia - najpierw odczytaj plik (strony po polsku są pomijane).' : 'Ta strona nie ma odczytanej treści w języku obcym.'); return }
    const zadania = strony.map((nr): Zadanie => {
      const tekst = JSON.stringify(tresc.strony[nr].bloki)
      return { nr, tokeny: Math.ceil(tekst.length / 3), opis: `Strona ${nr}: ${odmiana(tresc.strony[nr].bloki.length, ['blok', 'bloki', 'bloków'])}`, dane: { tekst, plik_id: dev ? null : plik.id, metadane: { plik: plik.nazwa_pliku, strona: nr } } }
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
        setZajety(`${p.rodzaj === 'ai' ? 'Odczyt' : 'Tłumaczenie'} AI ${i + 1}/${p.zadania.length}: ${z.opis}...`)
        if (p.rodzaj === 'ai') {
          const { odp, blad: b } = await wywolajAi<{ jezyk: string; bloki: unknown; tlumaczenie: unknown }>('odczytaj_dokument', z.dane)
          if (b || !odp) throw new Error(b ?? 'Brak odpowiedzi.')
          suma += odp.koszt_pln; model = odp.model
          const c = czesciStron[z.nr] ?? { bloki: [], pl: [], jezyk: null }
          c.bloki.push(...blokiZAi(odp.wynik.bloki)); c.pl.push(...blokiZAi(odp.wynik.tlumaczenie)); c.jezyk = (odp.wynik.jezyk || c.jezyk || '').toLowerCase().slice(0, 2) || null
          czesciStron[z.nr] = c
          nowa.strony[z.nr] = { bloki: c.bloki, zrodlo: 'ai', jezyk: c.jezyk }
          if (c.pl.length) nowa.tlumaczenie[z.nr] = { bloki: c.pl }
          else if (c.jezyk === 'pl' || !p.tlumacz) delete nowa.tlumaczenie[z.nr]
        } else {
          const { odp, blad: b } = await wywolajAi<{ jezyk_zrodlowy: string; bloki: unknown }>('przetlumacz_dokument', z.dane)
          if (b || !odp) throw new Error(b ?? 'Brak odpowiedzi.')
          suma += odp.koszt_pln; model = odp.model
          nowa.tlumaczenie[z.nr] = { bloki: blokiZAi(odp.wynik.bloki) }
        }
        zrobione.add(z.nr)
        // Wynik AI zapisujemy po każdej stronie - przerwanie nie marnuje już zapłaconych odczytów.
        await zapisz({ strony: { ...nowa.strony }, tlumaczenie: { ...nowa.tlumaczenie } })
      }
    } catch (e) { setBlad(`${e instanceof Error ? e.message : String(e)}${zrobione.size ? ` Zapisano wcześniejsze strony (${[...zrobione].join(', ')}).` : ''}`) }
    setZajety(null)
    if (zrobione.size) {
      await dziennik({ rodzaj: p.rodzaj, strony: [...zrobione], obszarow: p.obszarow, jezyk: jezykPliku(nowa), model, koszt_pln: suma })
      setKomunikat(`${p.rodzaj === 'ai' ? 'Odczyt' : 'Tłumaczenie'} AI zapisane: ${odmiana(zrobione.size, ['strona', 'strony', 'stron'])}, koszt ${liczba(suma, 2)} zł.`)
      if (p.rodzaj === 'tlumaczenie' || p.tlumacz) setWidok('polski')
    }
    void wczytajBudzet()
  }

  // --- Widok wyniku -------------------------------------------------------------------------------------
  const stronyTresci = numeryStron(tresc.strony)
  const stronyPl = numeryStron(tresc.tlumaczenie)
  const naStronie = tresc.strony[zPodgladem ? strona : 1]
  const pokazane = useMemo(() => {
    const zrodloStron = widok === 'polski' ? tresc.tlumaczenie : tresc.strony
    const nr = wszystkieStrony || !zPodgladem ? numeryStron(zrodloStron) : [strona]
    return nr.map((n) => ({ nr: n, bloki: zrodloStron[n]?.bloki ?? [] })).filter((s) => s.bloki.length)
  }, [widok, tresc, wszystkieStrony, strona, zPodgladem])

  async function word(polski: boolean) {
    const { pobierzWord } = await import('@/lib/wersjeEdytowalneWord')
    const zrodloStron = polski ? tresc.tlumaczenie : tresc.strony
    await pobierzWord(numeryStron(zrodloStron).map((nr) => ({ nr, bloki: zrodloStron[nr].bloki })), `${plik.nazwa_pliku.replace(/\.[^.]+$/, '')}${polski ? ' - PL' : ' - wersja edytowalna'}`)
  }

  const pozostaloDzis = budzet ? budzet.limit_dzienny_pln - budzet.dzis_uzytkownik_pln : null
  const tekstowa = (info?.elementowTekstu ?? 0) >= MIN_ELEMENTOW_TEKSTU

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button rozmiar="maly" wariant="cichy" onClick={zamknij}><ArrowLeft className="h-4 w-4" /> Pliki</Button>
        <h3 className="font-semibold">{plik.nazwa_pliku}</h3>
        {zPodgladem && (
          <div className="flex items-center gap-1 text-sm">
            <Button rozmiar="maly" disabled={strona <= 1} onClick={() => { setStrona(strona - 1); setObszary([]) }}><ArrowLeft className="h-3 w-3" /></Button>
            <span>strona {strona} / {liczbaStron}</span>
            <Button rozmiar="maly" disabled={strona >= liczbaStron} onClick={() => { setStrona(strona + 1); setObszary([]) }}><ArrowRight className="h-3 w-3" /></Button>
          </div>
        )}
        {info && plik.rodzaj === 'pdf' && <span className="text-xs text-slate-500">{tekstowa ? `warstwa tekstowa (${info.elementowTekstu} elementów)` : 'skan bez warstwy tekstowej'}</span>}
        <span className="znacznik bg-slate-100 text-slate-700">język: {nazwaJezyka(plik.jezyk)}</span>
        {budzet && (
          <span className="ml-auto text-xs text-slate-600">
            Budżet AI: {liczba(budzet.miesiac_pln, 2)} z {liczba(budzet.limit_miesieczny_pln, 0)} zł w miesiącu · Twój limit dziś: zostało {liczba(Math.max(0, pozostaloDzis ?? 0), 2)} zł
          </span>
        )}
      </div>
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {komunikat && <Komunikat rodzaj="sukces">{komunikat}</Komunikat>}
      {zajety && <Komunikat rodzaj="info">{zajety}</Komunikat>}

      <div className={cn('grid gap-3', zPodgladem && 'xl:grid-cols-2')}>
        {zPodgladem && (
          <section className="sekcja space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="etykieta mb-0">Zaznacz:</span>
              {RODZAJE.map((r) => (
                <button key={r} onClick={() => setRodzajNowego(r)}
                  className={cn('rounded-md border px-2 py-1 text-xs', rodzajNowego === r ? 'font-semibold text-white' : 'bg-white text-slate-700')}
                  style={rodzajNowego === r ? { background: KOLORY_OBSZARU_TEKSTU[r], borderColor: KOLORY_OBSZARU_TEKSTU[r] } : { borderColor: KOLORY_OBSZARU_TEKSTU[r] }}>
                  {ETYKIETY_OBSZARU_TEKSTU[r]}
                </button>
              ))}
              {obszary.length > 0 && <Button rozmiar="maly" wariant="cichy" onClick={() => { setObszary([]); setWybrany(null) }}>wyczyść</Button>}
              <span className="mx-1 h-5 w-px bg-slate-200" />
              <Button rozmiar="maly" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} title="Pomniejsz"><ZoomOut className="h-3 w-3" /></Button>
              <span className="w-12 text-center text-xs">{Math.round(zoom * 100)}%</span>
              <Button rozmiar="maly" onClick={() => setZoom((z) => Math.min(6, z * 1.25))} title="Powiększ"><ZoomIn className="h-3 w-3" /></Button>
            </div>
            <p className="text-xs text-slate-500">
              Przeciągnij myszą, żeby zaznaczyć fragment (tekst albo tabelę). Przy krawędzi podgląd sam się przewija - można zaznaczyć tabelę dłuższą niż ekran.
              Bez zaznaczenia odczytywana jest cała strona.
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
              <span className="text-xs text-slate-600">{obszary.length ? `Zaznaczone: ${obszary.map((o) => ETYKIETY_OBSZARU_TEKSTU[o.rodzaj]).join(', ')}` : 'Bez zaznaczenia - cała strona.'}</span>
              <span className="ml-auto" />
              <Button rozmiar="maly" disabled={plik.rodzaj !== 'pdf' || !tekstowa || !!zajety} onClick={() => void odczytajBezAi(false)}
                title={plik.rodzaj !== 'pdf' ? 'Zdjęcie / skan nie ma warstwy tekstowej - tylko AI' : tekstowa ? 'Z warstwy tekstowej PDF - bez kosztów' : 'Strona to skan - tylko AI'}>
                <FileText className="h-3 w-3" /> Odczytaj bez AI
              </Button>
              {plik.rodzaj === 'pdf' && liczbaStron > 1 && (
                <Button rozmiar="maly" disabled={!!zajety} onClick={() => void odczytajBezAi(true)} title="Wszystkie strony z warstwą tekstową - bez kosztów">
                  <FileText className="h-3 w-3" /> Bez AI - wszystkie strony
                </Button>
              )}
              <Button rozmiar="maly" wariant="akcent" disabled={!!zajety} onClick={() => void przygotujAi(obszary.length ? 'zaznaczone' : 'strona', false)}>
                <Sparkles className="h-3 w-3" /> Odczytaj przez AI
              </Button>
              {liczbaStron > 1 && (
                <Button rozmiar="maly" wariant="cichy" disabled={!!zajety} onClick={() => void przygotujAi('wszystkie', false)} title="Każda strona osobno, koszt pokazany przed odczytem">
                  <Maximize className="h-3 w-3" /> AI - wszystkie strony
                </Button>
              )}
            </div>
          </section>
        )}

        <section className="sekcja space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold">Wersja edytowalna</h4>
            <div className="flex rounded-md border border-slate-200 text-xs">
              <button className={cn('px-2 py-1', widok === 'oryginal' && 'bg-slate-800 text-white')} onClick={() => setWidok('oryginal')}>
                Oryginał ({nazwaJezyka(naStronie?.jezyk ?? plik.jezyk)})
              </button>
              <button className={cn('px-2 py-1', widok === 'polski' && 'bg-slate-800 text-white')} onClick={() => setWidok('polski')}>Polski</button>
            </div>
            {zPodgladem && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={wszystkieStrony} onChange={(e) => setWszystkieStrony(e.target.checked)} /> wszystkie strony</label>}
            {naStronie && <span className="text-xs text-slate-500">{naStronie.zrodlo === 'ai' ? 'odczyt AI' : 'odczyt bez AI'}</span>}
          </div>
          {!zPodgladem && (
            <div className="flex flex-wrap gap-2">
              <Button rozmiar="maly" disabled={!bajty || !!zajety} onClick={() => void odczytajBezAi(false)}><FileText className="h-3 w-3" /> Odczytaj bez AI</Button>
              <span className="self-center text-xs text-slate-500">
                {plik.rodzaj === 'docx' ? 'DOCX: nagłówki, akapity, listy i tabele.' : plik.rodzaj === 'arkusz' ? 'Arkusz: każdy arkusz jako tabela.' : plik.rodzaj === 'cad' ? 'DXF: teksty z rysunku (DWG / STEP zapisz jako PDF).' : ''}
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button rozmiar="maly" wariant="akcent" disabled={!!zajety || !stronyTresci.length} onClick={() => przygotujTlumaczenie(!zPodgladem || wszystkieStrony)}
              title="Tłumaczenie odczytanej treści przez AI - koszt pokazany przed wywołaniem">
              <Languages className="h-3 w-3" /> Przetłumacz na polski{zPodgladem && !wszystkieStrony ? ' (ta strona)' : ''}
            </Button>
            <span className="ml-auto" />
            <Button rozmiar="maly" disabled={!stronyTresci.length} onClick={() => void word(false)}><FileDown className="h-3 w-3" /> Word - oryginał</Button>
            <Button rozmiar="maly" disabled={!stronyPl.length} onClick={() => void word(true)}><FileDown className="h-3 w-3" /> Word - polski</Button>
          </div>
          <div className="max-h-[75vh] overflow-auto rounded border border-slate-100 bg-white p-3">
            {pokazane.length ? pokazane.map((s) => (
              <div key={s.nr} className="mb-4">
                {(wszystkieStrony || pokazane.length > 1) && zPodgladem && <p className="mb-1 text-xs font-semibold text-slate-400">— strona {s.nr} —</p>}
                <PodgladBlokow bloki={s.bloki} />
              </div>
            )) : (
              <p className="text-sm text-slate-500">
                {widok === 'polski' ? 'Brak tłumaczenia - użyj „Przetłumacz na polski” albo odczytu AI z tłumaczeniem.' : 'Brak odczytu - użyj „Odczytaj bez AI” (PDF z warstwą tekstową, DOCX, arkusze) albo „Odczytaj przez AI” (skany, zdjęcia).'}
              </p>
            )}
          </div>
        </section>
      </div>

      <Dialog open={!!plan} onOpenChange={(o) => !o && setPlan(null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{plan?.rodzaj === 'tlumaczenie' ? 'Tłumaczenie przez AI' : 'Odczyt przez AI'} - potwierdzenie kosztu</DialogTitle>
          <DialogDescription>
            {plan?.rodzaj === 'tlumaczenie' ? 'Do Claude API trafi odczytana treść stron (tekst, bez pliku).' : 'Do Claude API trafią tylko poniższe wycinki pliku (obrazy ok. 200 DPI).'}
          </DialogDescription>
          {plan && (
            <div className="mt-3 space-y-3 text-sm">
              <ul className="max-h-48 list-disc overflow-auto pl-5">
                {plan.zadania.map((z, i) => <li key={i}>{z.opis} - ok. {liczba(z.tokeny / 1000, 1)} tys. tokenów</li>)}
              </ul>
              {plan.rodzaj === 'ai' && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={plan.tlumacz} onChange={(e) => {
                    const t = e.target.checked
                    void szacuj('ai', plan.zadania.map((z) => ({ ...z, dane: { ...z.dane, metadane: { ...z.dane.metadane, tlumacz_na_polski: t } } })), t, plan.obszarow)
                  }} />
                  od razu przetłumacz na polski (droższy odczyt, taniej niż osobne tłumaczenie)
                </label>
              )}
              {plan.uwaga
                ? <Komunikat rodzaj="ostrzezenie">{plan.uwaga}</Komunikat>
                : (
                  <p>
                    Szacowany koszt: <strong>{liczba(plan.koszt ?? 0, 2)} zł</strong>
                    {plan.pozostalo !== null && ` · w budżecie miesiąca zostało ${liczba(plan.pozostalo, 2)} zł`}
                    {pozostaloDzis !== null && ` · Twój limit dziś: ${liczba(Math.max(0, pozostaloDzis), 2)} zł`}.
                  </p>
                )}
              <div className="flex justify-end gap-2">
                <Button onClick={() => setPlan(null)}>Anuluj</Button>
                <Button wariant="akcent" disabled={!!plan.uwaga} onClick={() => void wykonaj()}><Sparkles className="h-4 w-4" /> {plan.rodzaj === 'tlumaczenie' ? 'Przetłumacz' : 'Odczytaj'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
