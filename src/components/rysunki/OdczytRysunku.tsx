import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ArrowLeft, ArrowRight, ClipboardPaste, FileSpreadsheet, FileText, Maximize, Save, Sparkles, ZoomIn, ZoomOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { liczba, odmiana } from '@/lib/format'
import { cn } from '@/lib/utils'
import { pobierzBajty } from '@/lib/magazyn'
import { szacujAi, wywolajAi, type DaneAi, type RysunekAi } from '@/lib/ai'
import {
  ETYKIETY_OBSZARU, KOLORY_OBSZARU, PUSTY_WYNIK, czesciZTabeli, dpiObszaru, elementyWObszarze, kafelNaStronie, kafle, kafliOdmiana, krocceZTabeli,
  opisKafla, parametryZTabeli, polaczWyniki, tokenyObrazu, ulozWTabele, wierszeZeSchowka, zWynikuAi,
  type ElementTekstu, type Obszar, type ObszarZrodlowy, type RodzajObszaru, type WynikRysunku,
} from '@/lib/rysunki'
import { infoStrony, kafleObszaru, natywneDpi, otworzRysunek, renderujPodglad, tekstStrony, type InfoStrony } from '@/lib/rysunkiPdf'
import { uprawnienia, type Profil } from '@/lib/types'
import { useHistoriaStanu } from '@/lib/historia'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { PodgladRysunku } from './PodgladRysunku'
import { SiatkaOdczytu, type ZakladkaSiatki } from './SiatkaOdczytu'
import { PrzeniesDoWyceny } from './PrzeniesDoWyceny'

export interface DokumentRysunku { id: string; nazwa_pliku: string; sciezka: string | null; metadane: Record<string, unknown> }
export interface OdczytZapisany {
  id: string; dokument_id: string | null; nazwa_pliku: string; strona: number; obszary: Obszar[]; wynik: WynikRysunku
  ekstrakcja_ai: unknown; zrodlo: 'recznie' | 'tekst' | 'ai'; model: string | null; koszt_pln: number | null; sprawdzony: boolean
  utworzyl: string | null; utworzono: string; zmodyfikowano: string
}

interface ZadanieAi { obszar: Obszar; dane: DaneAi; kafleNaStronie: ObszarZrodlowy[]; tokeny: number; opis: string }

const RODZAJE: RodzajObszaru[] = ['czesci', 'krocce', 'parametry', 'tabliczka']
const podsumowanie = (w: WynikRysunku) => [
  odmiana(w.pozycje.length, ['pozycję', 'pozycje', 'pozycji']), odmiana(w.krocce.length, ['króciec', 'króćce', 'króćców']),
  odmiana(w.parametry.length, ['parametr', 'parametry', 'parametrów']),
].join(', ')
/** Odczyt z tekstu, gdy obszar ma co najmniej tyle elementów warstwy tekstowej - inaczej obrazy. */
const MIN_ELEMENTOW_TEKSTU = 15
/** Kafli w jednym wywołaniu AI - poniżej limitu funkcji (20) i w limicie czasu funkcji brzegowej. */
const KAFLE_NA_WYWOLANIE = 12

export function OdczytRysunku({ zapytanieId, numer, dokument, odczyt, profil, zamknij, otworzWycene, bajty }: {
  zapytanieId: string; numer: string; dokument: DokumentRysunku; odczyt: OdczytZapisany | null; profil: Profil
  zamknij: () => void; otworzWycene: (id: string) => void
  /** Bajty PDF podane z zewnątrz (podgląd deweloperski) zamiast pobrania z magazynu. */
  bajty?: Uint8Array
}) {
  const s = useSlowniki()
  const up = uprawnienia(profil)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [strona, setStrona] = useState(odczyt?.strona ?? 1)
  const [info, setInfo] = useState<InfoStrony | null>(null)
  const [natywne, setNatywne] = useState<number | null>(null)
  const [podglad, setPodglad] = useState<{ dataUrl: string; szer: number; wys: number } | null>(null)
  const [obszary, setObszary] = useState<Obszar[]>(odczyt?.obszary ?? [])
  const [rodzajNowego, setRodzajNowego] = useState<RodzajObszaru>('czesci')
  const [wybrany, setWybrany] = useState<string | null>(null)
  const [podswietlony, setPodswietlony] = useState<ObszarZrodlowy | null>(null)
  const [zoom, setZoom] = useState(1)
  const [wynik, setWynik] = useState<WynikRysunku>(odczyt?.wynik ?? PUSTY_WYNIK)
  const [zrodlo, setZrodlo] = useState<OdczytZapisany['zrodlo']>(odczyt?.zrodlo ?? 'recznie')
  const [ekstrakcjaAi, setEkstrakcjaAi] = useState<unknown>(odczyt?.ekstrakcja_ai ?? null)
  const [model, setModel] = useState<string | null>(odczyt?.model ?? null)
  const [koszt, setKoszt] = useState<number | null>(odczyt?.koszt_pln ?? null)
  const [sprawdzony, setSprawdzony] = useState(odczyt?.sprawdzony ?? false)
  const [id, setId] = useState<string | null>(odczyt?.id ?? null)
  const [zmieniony, setZmieniony] = useState(false)
  const [zakladka, setZakladka] = useState<ZakladkaSiatki>('pozycje')
  const [zajety, setZajety] = useState<string | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  const [komunikat, setKomunikat] = useState<string | null>(null)
  const [aiPlan, setAiPlan] = useState<{ zadania: ZadanieAi[]; koszt_pln: number | null; pozostalo: number | null; uwaga: string | null } | null>(null)
  const [wklej, setWklej] = useState<{ tekst: string; cel: ZakladkaSiatki } | null>(null)
  const [przenies, setPrzenies] = useState(false)
  const tekstCache = useRef<Record<number, ElementTekstu[]>>({})

  // Odczyty poprawia każdy pracownik (RLS).
  const tylkoOdczyt = false
  // Cofnij / Ponów: siatka wyniku i zaznaczone obszary - stos per plik i strona.
  type StanOdczytu = { wynik: WynikRysunku; obszary: Obszar[] }
  const aktualny = useRef<StanOdczytu>({ wynik, obszary })
  aktualny.current = { wynik, obszary }
  const ustawZHistorii = useCallback((f: (s: StanOdczytu) => StanOdczytu) => {
    const n = f(aktualny.current); aktualny.current = n; setWynik(n.wynik); setObszary(n.obszary); setZmieniony(true)
  }, [])
  const zapiszKrok = useHistoriaStanu<StanOdczytu>(`odczyt:${dokument.id}:${strona}`, ustawZHistorii)
  const krok = (n: Partial<StanOdczytu>, opis: string) => {
    const przed = aktualny.current
    const po = { ...przed, ...n }
    aktualny.current = po
    zapiszKrok(przed, po, opis)
    if (n.wynik) setWynik(n.wynik)
    if (n.obszary) setObszary(n.obszary)
  }
  const zmien = (w: WynikRysunku) => { krok({ wynik: w }, 'zmiana w tabeli odczytu'); setZmieniony(true); setKomunikat(null) }

  // PDF z magazynu (oryginał może być już zarchiwizowany - wtedy zostaje sam wynik).
  useEffect(() => {
    if (!bajty && !dokument.sciezka) { setBlad('Oryginał pliku został zarchiwizowany - podgląd niedostępny, wynik odczytu można dalej edytować.'); return }
    let anuluj = false
    setZajety('Wczytywanie rysunku...')
    ;(bajty ? Promise.resolve(bajty) : pobierzBajty(dokument.sciezka!)).then(otworzRysunek).then((d) => { if (!anuluj) setPdf(d) })
      .catch((e) => setBlad(e instanceof Error ? e.message : String(e)))
      .finally(() => setZajety(null))
    return () => { anuluj = true }
  }, [dokument.sciezka, bajty])

  useEffect(() => {
    if (!pdf) return
    let anuluj = false
    setZajety(`Renderowanie strony ${strona}...`); setPodglad(null)
    Promise.all([infoStrony(pdf, strona), renderujPodglad(pdf, strona), natywneDpi(pdf, strona)]).then(([i, p, n]) => {
      if (anuluj) return
      setInfo(i); setPodglad(p); setNatywne(n)
    }).catch((e) => setBlad(String(e))).finally(() => setZajety(null))
    return () => { anuluj = true }
  }, [pdf, strona])

  function zmienStrone(n: number) {
    if (zmieniony && !window.confirm('Odczyt dotyczy jednej strony. Przejść na inną stronę bez zapisu zmian?')) return
    // Nowa strona = nowy odczyt.
    setStrona(n); setObszary([]); setWynik(PUSTY_WYNIK); setId(null); setZrodlo('recznie'); setEkstrakcjaAi(null); setModel(null); setKoszt(null)
    setSprawdzony(false); setZmieniony(false); setPodswietlony(null)
  }

  async function elementyStrony() {
    if (!pdf) return []
    if (!tekstCache.current[strona]) tekstCache.current[strona] = await tekstStrony(pdf, strona)
    return tekstCache.current[strona]
  }
  const wPunktach = (o: Obszar) => ({ x: o.x * info!.szerPt, y: o.y * info!.wysPt, w: o.w * info!.szerPt, h: o.h * info!.wysPt })
  const wzgledny = (r: { x: number; y: number; w: number; h: number }): ObszarZrodlowy =>
    ({ strona, x: r.x / info!.szerPt, y: r.y / info!.wysPt, w: r.w / info!.szerPt, h: r.h / info!.wysPt })

  function zTabeli(rodzaj: RodzajObszaru, wiersze: string[][], ramki: (ObszarZrodlowy | null)[] = []): WynikRysunku {
    if (rodzaj === 'czesci') return { ...PUSTY_WYNIK, pozycje: czesciZTabeli(wiersze, ramki) }
    if (rodzaj === 'krocce') return { ...PUSTY_WYNIK, krocce: krocceZTabeli(wiersze, ramki) }
    return { ...PUSTY_WYNIK, parametry: parametryZTabeli(wiersze) }
  }

  const potwierdzZastapienie = () =>
    !(wynik.pozycje.length + wynik.krocce.length + wynik.parametry.length) || window.confirm('Zastąpić bieżący wynik nowym odczytem?')

  async function odczytajTekst() {
    if (!info || !obszary.length) { setBlad('Zaznacz na rysunku obszar tabeli (przeciągnij myszą).'); return }
    if (!potwierdzZastapienie()) return
    setBlad(null)
    const el = await elementyStrony()
    const wyniki = obszary.map((o) => {
      const t = ulozWTabele(elementyWObszarze(el, wPunktach(o)))
      return zTabeli(o.rodzaj, t.wiersze, t.ramki.map(wzgledny))
    })
    const w = polaczWyniki(...wyniki)
    const ile = w.pozycje.length + w.krocce.length + w.parametry.length
    zmien(w); setZrodlo('tekst')
    setKomunikat(ile ? `Odczytano z warstwy tekstowej: ${podsumowanie(w)}. Sprawdź kolumny - układ tabel bywa nietypowy.` : 'W zaznaczonych obszarach nie rozpoznano tabeli. Użyj odczytu AI albo wklej tabelę.')
  }

  /** Przygotowanie wywołań AI: tekst z warstwy PDF, gdy jest (tanio), inaczej kafle ~300 DPI. */
  async function przygotujAi() {
    if (!pdf || !info) return
    if (!obszary.length) { setBlad('Zaznacz na rysunku obszar tabeli albo użyj „Cały arkusz”.'); return }
    setBlad(null); setZajety('Przygotowanie wycinków...')
    try {
      const el = await elementyStrony()
      const zadania: ZadanieAi[] = []
      for (const o of obszary) {
        const elementy = elementyWObszarze(el, wPunktach(o))
        const metadane = { plik: dokument.nazwa_pliku, strona, obszar: ETYKIETY_OBSZARU[o.rodzaj] }
        const wspolne = { zapytanie_id: zapytanieId, dokument_id: dokument.id, metadane }
        if (elementy.length >= MIN_ELEMENTOW_TEKSTU) {
          const t = ulozWTabele(elementy)
          const tekst = `Obszar: ${ETYKIETY_OBSZARU[o.rodzaj]} (tekst z warstwy PDF)\n${t.wiersze.map((r) => r.join(' | ')).join('\n')}`
          zadania.push({ obszar: o, dane: { ...wspolne, tekst }, kafleNaStronie: [], tokeny: Math.ceil(tekst.length / 3), opis: `${ETYKIETY_OBSZARU[o.rodzaj]}: tekst (${t.wiersze.length} wierszy)` })
        } else {
          setZajety(`Renderowanie wycinka „${ETYKIETY_OBSZARU[o.rodzaj]}” w ~300 DPI...`)
          const k = await kafleObszaru(pdf, strona, o, { natywne })
          const prost = k.kafle.map((x) => x.prostokat)
          const obrazy = k.kafle.map((x, i) => ({ media_type: 'image/jpeg' as const, dane: x.base64, opis: opisKafla(i + 1, o.rodzaj, x.prostokat, prost) }))
          const naStronie = prost.map((p) => kafelNaStronie(p, o, k.szer, k.wys, strona))
          // Duży obszar (np. cały arkusz A1) - kilka wywołań; numeracja kafli wspólna dla obszaru.
          const czesci = Math.ceil(obrazy.length / KAFLE_NA_WYWOLANIE)
          for (let c = 0; c < czesci; c++) {
            const od = c * KAFLE_NA_WYWOLANIE
            const paczka = obrazy.slice(od, od + KAFLE_NA_WYWOLANIE)
            zadania.push({
              obszar: o, dane: { ...wspolne, obrazy: paczka }, kafleNaStronie: naStronie,
              tokeny: prost.slice(od, od + KAFLE_NA_WYWOLANIE).reduce((sum, p) => sum + tokenyObrazu(p.w, p.h), 0),
              opis: `${ETYKIETY_OBSZARU[o.rodzaj]}: ${kafliOdmiana(paczka.length)} (${k.dpi} DPI)${czesci > 1 ? `, część ${c + 1}/${czesci}` : ''}`,
            })
          }
        }
      }
      // Szacunek kosztu po stronie funkcji (liczenie tokenów, bez wywołania modelu).
      setZajety('Szacowanie kosztu...')
      let suma = 0
      let pozostalo: number | null = null
      let uwaga: string | null = null
      for (const z of zadania) {
        const { szacunek, blad: b } = await szacujAi('wyciagnij_liste_z_rysunku', z.dane)
        if (b || !szacunek) { uwaga = b ?? 'Nie udało się oszacować kosztu.'; break }
        suma += szacunek.koszt_pln
        pozostalo = szacunek.pozostalo_miesiac_pln
      }
      setAiPlan({ zadania, koszt_pln: uwaga ? null : suma, pozostalo, uwaga })
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setZajety(null)
  }

  async function wykonajAi() {
    if (!aiPlan) return
    const plan = aiPlan
    setAiPlan(null)
    if (!potwierdzZastapienie()) return
    const wyniki: WynikRysunku[] = []
    const surowe: { obszar: RodzajObszaru; wynik: RysunekAi }[] = []
    let suma = 0
    let mod: string | null = null
    try {
      for (const [i, z] of plan.zadania.entries()) {
        setZajety(`Odczyt AI ${i + 1}/${plan.zadania.length}: ${z.opis}...`)
        const { odp, blad: b } = await wywolajAi<RysunekAi>('wyciagnij_liste_z_rysunku', z.dane)
        if (b || !odp) throw new Error(b ?? 'Brak odpowiedzi.')
        suma += odp.koszt_pln; mod = odp.model
        surowe.push({ obszar: z.obszar.rodzaj, wynik: odp.wynik })
        wyniki.push(zWynikuAi(odp.wynik, z.kafleNaStronie, s.kategorieMaterialow.map((k) => k.kod)))
      }
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setZajety(null)
    if (!wyniki.length) return
    const w = polaczWyniki(...wyniki)
    setWynik(w); setZrodlo('ai'); setEkstrakcjaAi(surowe); setModel(mod); setKoszt(suma); setSprawdzony(false)
    // Wynik AI zapisujemy od razu - nie liczymy go ponownie bez decyzji użytkownika.
    await zapisz({ wynik: w, zrodlo: 'ai', ekstrakcja_ai: surowe, model: mod, koszt_pln: suma, sprawdzony: false })
    const niepewne = [...w.pozycje, ...w.krocce, ...w.parametry].filter((x) => x.pewnosc < 0.8).length
    setKomunikat(`Odczyt AI zapisany (${liczba(suma, 2)} zł). ${niepewne ? `${niepewne} wierszy do sprawdzenia - są wyróżnione na żółto.` : ''}`)
  }

  function calyArkusz() {
    if (!info) return
    const dpi = dpiObszaru(info.szerPt, info.wysPt, { natywne })
    const k = kafle(Math.round(info.szerPt * dpi / 72), Math.round(info.wysPt * dpi / 72))
    const tok = k.reduce((sum, p) => sum + tokenyObrazu(p.w, p.h), 0)
    if (!window.confirm(`Cały arkusz to ${kafliOdmiana(k.length)} (~${Math.round(tok / 1000)} tys. tokenów wejścia) - zwykle kilka razy drożej niż zaznaczenie samej tabeli. Dodać obszar „${ETYKIETY_OBSZARU[rodzajNowego]}” na całą stronę?`)) return
    const o: Obszar = { id: crypto.randomUUID(), rodzaj: rodzajNowego, x: 0, y: 0, w: 1, h: 1 }
    krok({ obszary: [...obszary, o] }, 'obszar: cały arkusz'); setWybrany(o.id); setZmieniony(true)
  }

  function wklejTabele() {
    if (!wklej) return
    const wiersze = wierszeZeSchowka(wklej.tekst)
    const rodzaj: RodzajObszaru = wklej.cel === 'krocce' ? 'krocce' : wklej.cel === 'parametry' ? 'parametry' : 'czesci'
    const nowy = zTabeli(rodzaj, wiersze)
    const ile = nowy.pozycje.length + nowy.krocce.length + nowy.parametry.length
    if (!ile) { setBlad(rodzaj === 'czesci' ? 'Nie rozpoznano tabeli - pierwszy wiersz powinien mieć nagłówki (np. Poz., Nazwa, Ilość, Materiał).' : 'Nie rozpoznano wierszy tabeli.'); return }
    zmien(polaczWyniki(wynik, nowy)); setZakladka(wklej.cel); setWklej(null)
    setKomunikat(`Wklejono ${odmiana(ile, ['wiersz', 'wiersze', 'wierszy'])}.`)
  }

  async function zapisz(nadpisz: Partial<OdczytZapisany> = {}) {
    setBlad(null)
    const dane = {
      zapytanie_id: zapytanieId, dokument_id: dokument.id, nazwa_pliku: dokument.nazwa_pliku, strona, obszary,
      wynik, zrodlo, ekstrakcja_ai: ekstrakcjaAi, model, koszt_pln: koszt, sprawdzony, ...nadpisz,
    }
    const { data, error } = id
      ? await supabase.from('odczyty_rysunkow').update(dane).eq('id', id).select('id').single()
      : await supabase.from('odczyty_rysunkow').insert(dane).select('id').single()
    if (error) { setBlad(komunikatPL(error.message)); return false }
    setId(data.id as string); setZmieniony(false)
    if (!nadpisz.wynik) setKomunikat('Zapisano odczyt.')
    return true
  }

  const meta = { zapytanie: numer, plik: dokument.nazwa_pliku, strona, zrodlo }
  // ExcelJS jest duży - ładowany dopiero przy pobieraniu.
  async function pobierzExcel() {
    const { pobierzExcelRysunku } = await import('@/lib/eksportRysunku')
    await pobierzExcelRysunku(wynik, meta, s.kategorieMaterialow)
  }
  const liczbaStron = pdf?.numPages ?? Number(dokument.metadane?.stron ?? 1)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button rozmiar="maly" wariant="cichy" onClick={() => { if (!zmieniony || window.confirm('Wyjść bez zapisu zmian?')) zamknij() }}><ArrowLeft className="h-4 w-4" /> Rysunki</Button>
        <h3 className="font-semibold">{dokument.nazwa_pliku}</h3>
        <div className="flex items-center gap-1 text-sm">
          <Button rozmiar="maly" disabled={strona <= 1} onClick={() => zmienStrone(strona - 1)}><ArrowLeft className="h-3 w-3" /></Button>
          <span>strona {strona} / {liczbaStron}</span>
          <Button rozmiar="maly" disabled={strona >= liczbaStron} onClick={() => zmienStrone(strona + 1)}><ArrowRight className="h-3 w-3" /></Button>
        </div>
        {info && (
          <span className="text-xs text-slate-500">
            {Math.round(info.szerPt / 72 * 25.4)}×{Math.round(info.wysPt / 72 * 25.4)} mm
            {info.elementowTekstu ? ` · warstwa tekstowa (${info.elementowTekstu} elementów)` : ' · skan bez warstwy tekstowej'}
            {natywne ? ` · skan ${natywne} DPI` : ''}
          </span>
        )}
        {zrodlo !== 'recznie' && <span className="znacznik bg-slate-100 text-slate-700">{zrodlo === 'ai' ? `AI${model ? ` (${model})` : ''}${koszt ? `, ${liczba(koszt, 2)} zł` : ''}` : 'warstwa tekstowa'}</span>}
      </div>
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {komunikat && <Komunikat rodzaj="sukces">{komunikat}</Komunikat>}
      {zajety && <Komunikat rodzaj="info">{zajety}</Komunikat>}

      {podglad && (
        <section className="sekcja space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="etykieta mb-0">Zaznacz:</span>
            {RODZAJE.map((r) => (
              <button key={r} onClick={() => setRodzajNowego(r)}
                className={cn('rounded-md border px-2 py-1 text-xs', rodzajNowego === r ? 'font-semibold text-white' : 'bg-white text-slate-700')}
                style={rodzajNowego === r ? { background: KOLORY_OBSZARU[r], borderColor: KOLORY_OBSZARU[r] } : { borderColor: KOLORY_OBSZARU[r] }}>
                {ETYKIETY_OBSZARU[r]}
              </button>
            ))}
            <Button rozmiar="maly" wariant="cichy" onClick={calyArkusz} title="Cały arkusz jako jeden obszar - drożej"><Maximize className="h-3 w-3" /> cały arkusz</Button>
            <span className="mx-1 h-5 w-px bg-slate-200" />
            <Button rozmiar="maly" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} title="Pomniejsz"><ZoomOut className="h-3 w-3" /></Button>
            <span className="w-12 text-center text-xs">{Math.round(zoom * 100)}%</span>
            <Button rozmiar="maly" onClick={() => setZoom((z) => Math.min(6, z * 1.25))} title="Powiększ"><ZoomIn className="h-3 w-3" /></Button>
            <span className="ml-auto text-xs text-slate-500">
              Przeciągnij myszą, żeby zaznaczyć tabelę. Do AI idą tylko zaznaczone fragmenty (w ~300 DPI, pocięte na kafle).
            </span>
          </div>
          <div className="max-h-[70vh] overflow-auto rounded border border-slate-200 bg-slate-100">
            <PodgladRysunku
              dataUrl={podglad.dataUrl} obszary={obszary} rodzajNowego={rodzajNowego} zoom={zoom} wybrany={wybrany}
              podswietlony={podswietlony} tylkoOdczyt={tylkoOdczyt} wybierz={setWybrany}
              dodaj={(o) => { krok({ obszary: [...aktualny.current.obszary, o] }, 'zaznaczenie obszaru'); setZmieniony(true) }}
              usun={(x) => { krok({ obszary: aktualny.current.obszary.filter((o) => o.id !== x) }, 'usunięcie obszaru'); setWybrany(null); setZmieniony(true) }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-600">{obszary.length ? `Obszary: ${obszary.map((o) => ETYKIETY_OBSZARU[o.rodzaj]).join(', ')}` : 'Brak zaznaczonych obszarów.'}</span>
            <span className="ml-auto" />
            <Button rozmiar="maly" disabled={!info?.elementowTekstu || !obszary.length || !!zajety} onClick={() => void odczytajTekst()}
              title={info?.elementowTekstu ? 'Tabela z warstwy tekstowej PDF - bez kosztów' : 'Skan nie ma warstwy tekstowej'}>
              <FileText className="h-3 w-3" /> Odczytaj z tekstu PDF (bez AI)
            </Button>
            <Button rozmiar="maly" wariant="akcent" disabled={!obszary.length || !!zajety} onClick={() => void przygotujAi()}>
              <Sparkles className="h-3 w-3" /> Odczytaj przez AI
            </Button>
          </div>
        </section>
      )}

      <section className="sekcja space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold">Wynik odczytu</h4>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={sprawdzony} onChange={(e) => { setSprawdzony(e.target.checked); setZmieniony(true) }} /> sprawdzony z rysunkiem
          </label>
          <span className="ml-auto" />
          <Button rozmiar="maly" onClick={() => setWklej({ tekst: '', cel: zakladka === 'uwagi' ? 'pozycje' : zakladka })}><ClipboardPaste className="h-3 w-3" /> Wklej tabelę</Button>
          <Button rozmiar="maly" onClick={() => void pobierzExcel()}><FileSpreadsheet className="h-3 w-3" /> Pobierz Excel</Button>
          <Button rozmiar="maly" disabled={!wynik.pozycje.length} onClick={() => setPrzenies(true)}><ArrowRight className="h-3 w-3" /> Przenieś do wyceny</Button>
          <Button rozmiar="maly" wariant="glowny" disabled={!zmieniony} onClick={() => void zapisz()}><Save className="h-3 w-3" /> Zapisz</Button>
        </div>
        <SiatkaOdczytu
          wynik={wynik} zmien={zmien} kategorie={s.kategorieMaterialow} zakladka={zakladka} setZakladka={setZakladka}
          podglad={podglad ? { ...podglad, strona } : null} tylkoOdczyt={tylkoOdczyt}
          pokaz={(o) => { setPodswietlony(null); setTimeout(() => setPodswietlony(o), 0) }}
        />
      </section>

      <Dialog open={!!aiPlan} onOpenChange={(o) => !o && setAiPlan(null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle>Odczyt przez AI - potwierdzenie kosztu</DialogTitle>
          <DialogDescription>Do Claude API trafią tylko poniższe wycinki rysunku (bez całego pliku).</DialogDescription>
          {aiPlan && (
            <div className="mt-3 space-y-3 text-sm">
              <ul className="list-disc pl-5">
                {aiPlan.zadania.map((z, i) => <li key={i}>{z.opis} - ok. {liczba(z.tokeny / 1000, 1)} tys. tokenów</li>)}
              </ul>
              {aiPlan.uwaga
                ? <Komunikat rodzaj="ostrzezenie">{aiPlan.uwaga}</Komunikat>
                : <p>Szacowany koszt: <strong>{liczba(aiPlan.koszt_pln ?? 0, 2)} zł</strong>{aiPlan.pozostalo !== null && ` · w budżecie miesiąca zostało ${liczba(aiPlan.pozostalo, 2)} zł`}.</p>}
              <div className="flex justify-end gap-2">
                <Button onClick={() => setAiPlan(null)}>Anuluj</Button>
                <Button wariant="akcent" disabled={!!aiPlan.uwaga} onClick={() => void wykonajAi()}><Sparkles className="h-4 w-4" /> Odczytaj</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!wklej} onOpenChange={(o) => !o && setWklej(null)}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Wklej tabelę</DialogTitle>
          <DialogDescription>Skopiuj tabelę z Excela, Worda albo z innego programu (kolumny rozdzielone tabulatorem). Pierwszy wiersz - nagłówki.</DialogDescription>
          {wklej && (
            <div className="mt-3 space-y-3">
              <label className="block"><span className="etykieta">Do zakładki</span>
                <select className="pole" value={wklej.cel} onChange={(e) => setWklej({ ...wklej, cel: e.target.value as ZakladkaSiatki })}>
                  <option value="pozycje">Wykaz części</option><option value="krocce">Króćce</option><option value="parametry">Dane projektowe</option>
                </select>
              </label>
              <textarea className="pole h-48 font-mono text-xs" autoFocus value={wklej.tekst} onChange={(e) => setWklej({ ...wklej, tekst: e.target.value })} />
              <div className="flex justify-end gap-2">
                <Button onClick={() => setWklej(null)}>Anuluj</Button>
                <Button wariant="glowny" disabled={!wklej.tekst.trim()} onClick={wklejTabele}>Wklej</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PrzeniesDoWyceny
        otwarty={przenies} zamknij={() => setPrzenies(false)} zapytanieId={zapytanieId} pozycje={wynik.pozycje}
        opisZrodla={`rysunek ${dokument.nazwa_pliku}, str. ${strona}`} widziMarze={up.widziMarze} otworzWycene={otworzWycene}
      />
    </div>
  )
}
