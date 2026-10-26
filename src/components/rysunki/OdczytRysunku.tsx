import { useCallback, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { ArrowLeft, ArrowRight, ClipboardPaste, Copy, FileSpreadsheet, FileText, Maximize, Save, Sparkles, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { liczba, odmiana } from '@/lib/format'
import { pobierzBajty } from '@/lib/magazyn'
import { szacujAi, wywolajAi, type DaneAi, type RysunekAi } from '@/lib/ai'
import {
  ETYKIETY_OBSZARU, KOLORY_OBSZARU, PUSTY_WYNIK, czesciZTabeli, dpiObszaru, elementyWObszarze, etykietaObszaru, kafelNaStronie, kafle, kafliOdmiana, krocceZTabeli,
  opisKafla, opisObszaruDlaAi, parametryZTabeli, polaczWyniki, tabelaWlasna, tokenyObrazu, ulozWTabele, uwagiZTabeli, wierszeZeSchowka, wierszyWyniku, zWynikuAi,
  type ElementTekstu, type Obszar, type ObszarZrodlowy, type RodzajObszaru, type WynikRysunku,
} from '@/lib/rysunki'
import { bajtyRysunku, infoStrony, kafleObszaru, natywneDpi, otworzRysunek, renderujPodglad, tekstStrony, type InfoStrony } from '@/lib/rysunkiPdf'
import { SZABLONY } from '@/lib/szablony'
import type { RodzajTabeli } from '@/lib/types'
import { uprawnienia, type Profil } from '@/lib/types'
import { useHistoriaStanu } from '@/lib/historia'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { PodgladRysunku } from './PodgladRysunku'
import { SiatkaOdczytu, type ZakladkaSiatki } from './SiatkaOdczytu'
import { PrzeniesDoWyceny } from './PrzeniesDoWyceny'
import { t } from '@/i18n'

export interface DokumentRysunku { id: string; nazwa_pliku: string; sciezka: string | null; metadane: Record<string, unknown> }
export interface OdczytZapisany {
  id: string; dokument_id: string | null; nazwa_pliku: string; strona: number; obszary: Obszar[]; wynik: WynikRysunku
  ekstrakcja_ai: unknown; zrodlo: 'recznie' | 'tekst' | 'ai'; model: string | null; koszt_pln: number | null; sprawdzony: boolean
  utworzyl: string | null; utworzono: string; zmodyfikowano: string
  /** Nazwa tabeli i rodzaj (kod rodzaje_tabel) głównego obszaru - do listy odczytów. */
  nazwa: string | null; rodzaj_tabeli: string | null
}

/** Rodzaje tabel bez słownika (np. podgląd deweloperski) - cztery podstawowe struktury i własna tabela. */
const RODZAJE_PODSTAWOWE: RodzajTabeli[] = (['czesci', 'krocce', 'parametry', 'tabliczka', 'uwagi', 'wlasna'] as const).map((st, i) => ({
  id: -i - 1, rodzaj_aparatu: 'zbiornik', kod: st, nazwa: ETYKIETY_OBSZARU[st], struktura: st, kolumny: [], element_szablonu: null, do_materialow: st === 'czesci', kolejnosc: i,
}))

interface ZadanieAi { obszar: Obszar; dane: DaneAi; kafleNaStronie: ObszarZrodlowy[]; tokeny: number; opis: string }

const podsumowanie = (w: WynikRysunku) => [
  odmiana(w.pozycje.length, ['pozycję', 'pozycje', 'pozycji']), odmiana(w.krocce.length, ['króciec', 'króćce', 'króćców']),
  odmiana(w.parametry.length, ['parametr', 'parametry', 'parametrów']),
  ...(w.uwagi.length ? [odmiana(w.uwagi.length, ['uwagę', 'uwagi', 'uwag'])] : []),
  ...((w.tabele ?? []).length ? [odmiana((w.tabele ?? []).length, ['tabelę', 'tabele', 'tabel'])] : []),
].join(', ')
/** Odczyt z tekstu, gdy obszar ma co najmniej tyle elementów warstwy tekstowej - inaczej obrazy. */
const MIN_ELEMENTOW_TEKSTU = 15
/** Kafli w jednym wywołaniu AI - poniżej limitu funkcji (20) i w limicie czasu funkcji brzegowej. */
const KAFLE_NA_WYWOLANIE = 12

export function OdczytRysunku({ zapytanieId, numer, dokument, odczyt, profil, zamknij, otworzWycene, bajty, rodzajAparatu }: {
  zapytanieId: string; numer: string; dokument: DokumentRysunku; odczyt: OdczytZapisany | null; profil: Profil
  zamknij: () => void; otworzWycene: (id: string) => void
  /** Rodzaj aparatu zapytania - wybiera listę rodzajów tabel i szablon elementów. */
  rodzajAparatu?: 'zbiornik' | 'wymiennik' | null
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
  // Rodzaje tabel do zaznaczania zależą od rodzaju aparatu zapytania (słownik rodzaje_tabel).
  const rodzajeTabel = s.rodzajeTabel.filter((x) => x.rodzaj_aparatu === (rodzajAparatu ?? 'zbiornik'))
  const listaRodzajow = rodzajeTabel.length ? rodzajeTabel : RODZAJE_PODSTAWOWE
  const elementySzablonu = SZABLONY[rodzajAparatu ?? 'zbiornik'].elementy
  const [nowyKod, setNowyKod] = useState<string>(listaRodzajow[0]?.kod ?? 'czesci')
  const [nowaNazwa, setNowaNazwa] = useState('')
  const [nowyElement, setNowyElement] = useState<string | null>(null)
  const rt = listaRodzajow.find((x) => x.kod === nowyKod) ?? listaRodzajow[0]
  const rodzajNowego: RodzajObszaru = rt?.struktura ?? 'czesci'
  const nowy: Omit<Obszar, 'id' | 'x' | 'y' | 'w' | 'h'> = {
    rodzaj: rodzajNowego, rodzaj_tabeli: rt?.kod ?? null, nazwa: nowaNazwa.trim() || rt?.nazwa || null,
    element: nowyElement ?? rt?.element_szablonu ?? null, kolumny: rodzajNowego === 'wlasna' ? rt?.kolumny ?? [] : undefined,
  }
  const wybierzRodzaj = (kod: string) => { setNowyKod(kod); setNowaNazwa(''); setNowyElement(null) }
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
  const zmien = (w: WynikRysunku) => { krok({ wynik: w }, t('zmiana w tabeli odczytu')); setZmieniony(true); setKomunikat(null) }

  // PDF z magazynu (oryginał może być już zarchiwizowany - wtedy zostaje sam wynik).
  useEffect(() => {
    if (!bajty && !dokument.sciezka) { setBlad(t('Oryginał pliku został zarchiwizowany - podgląd niedostępny, wynik odczytu można dalej edytować.')); return }
    let anuluj = false
    setZajety(t('Wczytywanie rysunku...'))
    ;(bajty ? Promise.resolve(bajty) : pobierzBajty(dokument.sciezka!)).then((b) => bajtyRysunku(b, dokument.nazwa_pliku)).then(otworzRysunek).then((d) => { if (!anuluj) setPdf(d) })
      .catch((e) => setBlad(e instanceof Error ? e.message : String(e)))
      .finally(() => setZajety(null))
    return () => { anuluj = true }
  }, [dokument.sciezka, dokument.nazwa_pliku, bajty])

  useEffect(() => {
    if (!pdf) return
    let anuluj = false
    setZajety(t('Renderowanie strony {0}...', strona)); setPodglad(null)
    Promise.all([infoStrony(pdf, strona), renderujPodglad(pdf, strona), natywneDpi(pdf, strona)]).then(([i, p, n]) => {
      if (anuluj) return
      setInfo(i); setPodglad(p); setNatywne(n)
    }).catch((e) => setBlad(String(e))).finally(() => setZajety(null))
    return () => { anuluj = true }
  }, [pdf, strona])

  /** Nowa strona = nowy odczyt; `kopia` - obszary powielone z bieżącej strony (te same tabele na kolejnych arkuszach). */
  function zmienStrone(n: number, kopia: Obszar[] = []) {
    if (zmieniony && !window.confirm(t('Odczyt dotyczy jednej strony. Przejść na inną stronę bez zapisu zmian?'))) return
    setStrona(n); setObszary(kopia.map((o) => ({ ...o, id: crypto.randomUUID() }))); setWybrany(null); setWynik(PUSTY_WYNIK); setId(null); setZrodlo('recznie'); setEkstrakcjaAi(null); setModel(null); setKoszt(null)
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

  function zTabeli(rodzaj: RodzajObszaru, wiersze: string[][], ramki: (ObszarZrodlowy | null)[] = [], o?: Obszar): WynikRysunku {
    if (rodzaj === 'czesci') {
      // Element szablonu z obszaru (np. "Tabela dennic") trafia do pozycji - przeniesienie do wyceny przypisze je do elementu.
      const el = o?.element ? elementySzablonu.find((e) => e.kod === o.element) : null
      return { ...PUSTY_WYNIK, pozycje: czesciZTabeli(wiersze, ramki).map((x) => (el && x.sekcja === 'inne' ? { ...x, sekcja: el.sekcje[0] } : x)) }
    }
    if (rodzaj === 'krocce') return { ...PUSTY_WYNIK, krocce: krocceZTabeli(wiersze, ramki) }
    if (rodzaj === 'uwagi') return { ...PUSTY_WYNIK, uwagi: uwagiZTabeli(wiersze) }
    if (rodzaj === 'wlasna') return { ...PUSTY_WYNIK, tabele: [tabelaWlasna(wiersze, { nazwa: o?.nazwa || t('Własna tabela'), obszar_id: o?.id ?? null, kolumny: o?.kolumny })] }
    return { ...PUSTY_WYNIK, parametry: parametryZTabeli(wiersze) }
  }

  const potwierdzZastapienie = () =>
    !wierszyWyniku(wynik) || window.confirm(t('Zastąpić bieżący wynik nowym odczytem?'))

  async function odczytajTekst() {
    if (!info || !obszary.length) { setBlad(t('Zaznacz na rysunku obszar tabeli (przeciągnij myszą).')); return }
    if (!potwierdzZastapienie()) return
    setBlad(null)
    const el = await elementyStrony()
    const wyniki = obszary.map((o) => {
      const t = ulozWTabele(elementyWObszarze(el, wPunktach(o)))
      return zTabeli(o.rodzaj, t.wiersze, t.ramki.map(wzgledny), o)
    })
    const w = polaczWyniki(...wyniki)
    const ile = wierszyWyniku(w)
    zmien(w); setZrodlo('tekst')
    setKomunikat(ile ? t('Odczytano z warstwy tekstowej: {0}. Sprawdź kolumny - układ tabel bywa nietypowy.', podsumowanie(w)) : t('W zaznaczonych obszarach nie rozpoznano tabeli. Użyj odczytu AI albo wklej tabelę.'))
  }

  /** Przygotowanie wywołań AI: tekst z warstwy PDF, gdy jest (tanio), inaczej kafle ~300 DPI. */
  async function przygotujAi() {
    if (!pdf || !info) return
    if (!obszary.length) { setBlad(t('Zaznacz na rysunku obszar tabeli albo użyj „Cały arkusz”.')); return }
    setBlad(null); setZajety(t('Przygotowanie wycinków...'))
    try {
      const el = await elementyStrony()
      const zadania: ZadanieAi[] = []
      for (const o of obszary) {
        const elementy = elementyWObszarze(el, wPunktach(o))
        const opisO = opisObszaruDlaAi(o)
        const metadane = { plik: dokument.nazwa_pliku, strona, obszar: opisO }
        const wspolne = { zapytanie_id: zapytanieId, dokument_id: dokument.id, metadane }
        if (elementy.length >= MIN_ELEMENTOW_TEKSTU) {
          const tab = ulozWTabele(elementy)
          const tekst = `Obszar: ${opisO} (tekst z warstwy PDF)\n${tab.wiersze.map((r) => r.join(' | ')).join('\n')}`
          zadania.push({ obszar: o, dane: { ...wspolne, tekst }, kafleNaStronie: [], tokeny: Math.ceil(tekst.length / 3), opis: t('{0}: tekst ({1} wierszy)', etykietaObszaru(o), tab.wiersze.length) })
        } else {
          setZajety(t('Renderowanie wycinka „{0}” w ~300 DPI...', etykietaObszaru(o)))
          const k = await kafleObszaru(pdf, strona, o, { natywne })
          const prost = k.kafle.map((x) => x.prostokat)
          const obrazy = k.kafle.map((x, i) => ({ media_type: 'image/jpeg' as const, dane: x.base64, opis: opisKafla(i + 1, o.rodzaj, x.prostokat, prost, opisO) }))
          const naStronie = prost.map((p) => kafelNaStronie(p, o, k.szer, k.wys, strona))
          // Duży obszar (np. cały arkusz A1) - kilka wywołań; numeracja kafli wspólna dla obszaru.
          const czesci = Math.ceil(obrazy.length / KAFLE_NA_WYWOLANIE)
          for (let c = 0; c < czesci; c++) {
            const od = c * KAFLE_NA_WYWOLANIE
            const paczka = obrazy.slice(od, od + KAFLE_NA_WYWOLANIE)
            zadania.push({
              obszar: o, dane: { ...wspolne, obrazy: paczka }, kafleNaStronie: naStronie,
              tokeny: prost.slice(od, od + KAFLE_NA_WYWOLANIE).reduce((sum, p) => sum + tokenyObrazu(p.w, p.h), 0),
              opis: t('{0}: {1} ({2} DPI){3}', etykietaObszaru(o), kafliOdmiana(paczka.length), k.dpi, czesci > 1 ? t(', część {0}/{1}', c + 1, czesci) : ''),
            })
          }
        }
      }
      // Szacunek kosztu po stronie funkcji (liczenie tokenów, bez wywołania modelu).
      setZajety(t('Szacowanie kosztu...'))
      let suma = 0
      let pozostalo: number | null = null
      let uwaga: string | null = null
      for (const z of zadania) {
        const { szacunek, blad: b } = await szacujAi('wyciagnij_liste_z_rysunku', z.dane)
        if (b || !szacunek) { uwaga = b ?? t('Nie udało się oszacować kosztu.'); break }
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
        setZajety(t('Odczyt AI {0}/{1}: {2}...', i + 1, plan.zadania.length, z.opis))
        const { odp, blad: b } = await wywolajAi<RysunekAi>('wyciagnij_liste_z_rysunku', z.dane)
        if (b || !odp) throw new Error(b ?? t('Brak odpowiedzi.'))
        suma += odp.koszt_pln; mod = odp.model
        surowe.push({ obszar: z.obszar.rodzaj, wynik: odp.wynik })
        wyniki.push(zWynikuAi(odp.wynik, z.kafleNaStronie, s.kategorieMaterialow.map((k) => k.kod), z.obszar.id))
      }
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setZajety(null)
    if (!wyniki.length) return
    const w = polaczWyniki(...wyniki)
    setWynik(w); setZrodlo('ai'); setEkstrakcjaAi(surowe); setModel(mod); setKoszt(suma); setSprawdzony(false)
    // Wynik AI zapisujemy od razu - nie liczymy go ponownie bez decyzji użytkownika.
    await zapisz({ wynik: w, zrodlo: 'ai', ekstrakcja_ai: surowe, model: mod, koszt_pln: suma, sprawdzony: false })
    const niepewne = [...w.pozycje, ...w.krocce, ...w.parametry].filter((x) => x.pewnosc < 0.8).length
    setKomunikat(t('Odczyt AI zapisany ({0} zł). {1}', liczba(suma, 2), niepewne ? t('{0} wierszy do sprawdzenia - są wyróżnione na żółto.', niepewne) : ''))
  }

  function calyArkusz() {
    if (!info) return
    const dpi = dpiObszaru(info.szerPt, info.wysPt, { natywne })
    const k = kafle(Math.round(info.szerPt * dpi / 72), Math.round(info.wysPt * dpi / 72))
    const tok = k.reduce((sum, p) => sum + tokenyObrazu(p.w, p.h), 0)
    if (!window.confirm(t('Cały arkusz to {0} (~{1} tys. tokenów wejścia) - zwykle kilka razy drożej niż zaznaczenie samej tabeli. Dodać obszar „{2}” na całą stronę?', kafliOdmiana(k.length), Math.round(tok / 1000), etykietaObszaru(nowy)))) return
    const o: Obszar = { id: crypto.randomUUID(), ...nowy, x: 0, y: 0, w: 1, h: 1 }
    krok({ obszary: [...obszary, o] }, t('obszar: cały arkusz')); setWybrany(o.id); setZmieniony(true)
  }

  function wklejTabele() {
    if (!wklej) return
    const wiersze = wierszeZeSchowka(wklej.tekst)
    const rodzaj: RodzajObszaru = wklej.cel === 'krocce' ? 'krocce' : wklej.cel === 'parametry' ? 'parametry' : wklej.cel === 'tabele' ? 'wlasna' : wklej.cel === 'uwagi' ? 'uwagi' : 'czesci'
    const zWklejki = zTabeli(rodzaj, wiersze)
    const ile = wierszyWyniku(zWklejki)
    if (!ile) { setBlad(rodzaj === 'czesci' ? t('Nie rozpoznano tabeli - pierwszy wiersz powinien mieć nagłówki (np. Poz., Nazwa, Ilość, Materiał).') : t('Nie rozpoznano wierszy tabeli.')); return }
    zmien(polaczWyniki(wynik, zWklejki)); setZakladka(wklej.cel); setWklej(null)
    setKomunikat(t('Wklejono {0}.', odmiana(ile, ['wiersz', 'wiersze', 'wierszy'])))
  }

  async function zapisz(nadpisz: Partial<OdczytZapisany> = {}) {
    setBlad(null)
    const dane = {
      zapytanie_id: zapytanieId, dokument_id: dokument.id, nazwa_pliku: dokument.nazwa_pliku, strona, obszary,
      wynik, zrodlo, ekstrakcja_ai: ekstrakcjaAi, model, koszt_pln: koszt, sprawdzony,
      // Lista odczytów: nazwa tabeli (albo kilku) i rodzaj pierwszego obszaru.
      nazwa: obszary.length ? obszary.map(etykietaObszaru).join(', ') : null, rodzaj_tabeli: obszary[0]?.rodzaj_tabeli ?? null,
      ...nadpisz,
    }
    const { data, error } = id
      ? await supabase.from('odczyty_rysunkow').update(dane).eq('id', id).select('id').single()
      : await supabase.from('odczyty_rysunkow').insert(dane).select('id').single()
    if (error) { setBlad(komunikatPL(error.message)); return false }
    setId(data.id as string); setZmieniony(false)
    if (!nadpisz.wynik) setKomunikat(t('Zapisano odczyt.'))
    return true
  }

  const meta = { zapytanie: numer, plik: dokument.nazwa_pliku, strona, zrodlo }
  // ExcelJS jest duży - ładowany dopiero przy pobieraniu.
  async function pobierzExcel() {
    const { pobierzExcelRysunku } = await import('@/lib/eksportRysunku')
    await pobierzExcelRysunku(wynik, meta, s.kategorieMaterialow)
  }
  const liczbaStron = pdf?.numPages ?? Number(dokument.metadane?.stron ?? 1)
  const obszarWybrany = obszary.find((o) => o.id === wybrany) ?? null
  const ustawObszar = (zm: Partial<Obszar>) => {
    if (!obszarWybrany) return
    krok({ obszary: aktualny.current.obszary.map((o) => (o.id === obszarWybrany.id ? { ...o, ...zm } : o)) }, t('zmiana obszaru'))
    setZmieniony(true)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button rozmiar="maly" wariant="cichy" onClick={() => { if (!zmieniony || window.confirm(t('Wyjść bez zapisu zmian?'))) zamknij() }}><ArrowLeft className="h-4 w-4" /> {t('Rysunki')}</Button>
        <h3 className="font-semibold">{dokument.nazwa_pliku}</h3>
        <div className="flex items-center gap-1 text-sm">
          <Button rozmiar="maly" disabled={strona <= 1} onClick={() => zmienStrone(strona - 1)}><ArrowLeft className="h-3 w-3" /></Button>
          <span>{t('strona {0} / {1}', strona, liczbaStron)}</span>
          <Button rozmiar="maly" disabled={strona >= liczbaStron} onClick={() => zmienStrone(strona + 1)}><ArrowRight className="h-3 w-3" /></Button>
        </div>
        {info && (
          <span className="text-xs text-slate-500">
            {Math.round(info.szerPt / 72 * 25.4)}×{Math.round(info.wysPt / 72 * 25.4)} mm
            {info.elementowTekstu ? t(' · warstwa tekstowa ({0} elementów)', info.elementowTekstu) : t(' · skan bez warstwy tekstowej')}
            {natywne ? t(' · skan {0} DPI', natywne) : ''}
          </span>
        )}
        {zrodlo !== 'recznie' && <span className="znacznik bg-slate-100 text-slate-700">{zrodlo === 'ai' ? `AI${model ? ` (${model})` : ''}${koszt ? `, ${liczba(koszt, 2)} zł` : ''}` : t('warstwa tekstowa')}</span>}
      </div>
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {komunikat && <Komunikat rodzaj="sukces">{komunikat}</Komunikat>}
      {zajety && <Komunikat rodzaj="info">{zajety}</Komunikat>}

      {podglad && (
        <section className="sekcja space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="etykieta mb-0">{t('Zaznacz:')}</span>
            <span className="h-4 w-4 rounded-sm" style={{ background: KOLORY_OBSZARU[rodzajNowego] }} />
            <select className="pole w-64 py-1 text-xs" title={t('Rodzaj tabeli (lista zależy od rodzaju aparatu zapytania)')} value={rt?.kod ?? ''} onChange={(e) => wybierzRodzaj(e.target.value)}>
              {listaRodzajow.map((x) => <option key={x.kod} value={x.kod}>{x.nazwa}</option>)}
            </select>
            <input className="pole w-44 py-1 text-xs" placeholder={rt?.nazwa ?? t('nazwa tabeli')} title={t('Własna nazwa tabeli, np. „Tabela dennic”')} value={nowaNazwa} onChange={(e) => setNowaNazwa(e.target.value)} />
            {(rodzajNowego === 'czesci' || rodzajNowego === 'krocce') && (
              <select className="pole w-48 py-1 text-xs" title={t('Element szablonu, do którego trafią pozycje (opcjonalnie)')} value={nowyElement ?? rt?.element_szablonu ?? ''} onChange={(e) => setNowyElement(e.target.value || null)}>
                <option value="">{t('element: wg nazw pozycji')}</option>
                {elementySzablonu.map((e) => <option key={e.kod} value={e.kod}>{t('element: {0}', e.nazwa)}</option>)}
              </select>
            )}
            <Button rozmiar="maly" wariant="cichy" onClick={calyArkusz} title={t('Cały arkusz jako jeden obszar - drożej')}><Maximize className="h-3 w-3" /> {t('cały arkusz')}</Button>
            <span className="mx-1 h-5 w-px bg-slate-200" />
            <Button rozmiar="maly" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))} title={t('Pomniejsz')}><ZoomOut className="h-3 w-3" /></Button>
            <span className="w-12 text-center text-xs">{Math.round(zoom * 100)}%</span>
            <Button rozmiar="maly" onClick={() => setZoom((z) => Math.min(6, z * 1.25))} title={t('Powiększ')}><ZoomIn className="h-3 w-3" /></Button>
            <span className="ml-auto text-xs text-slate-500">
              {t('Przeciągnij myszą, żeby zaznaczyć tabelę. Do AI idą tylko zaznaczone fragmenty (w ~300 DPI, pocięte na kafle).')}
            </span>
          </div>
          <div className="max-h-[70vh] overflow-auto rounded border border-slate-200 bg-slate-100">
            <PodgladRysunku
              dataUrl={podglad.dataUrl} obszary={obszary} nowy={nowy} zoom={zoom} wybrany={wybrany}
              podswietlony={podswietlony} tylkoOdczyt={tylkoOdczyt} wybierz={setWybrany}
              dodaj={(o) => { krok({ obszary: [...aktualny.current.obszary, o] }, t('zaznaczenie obszaru')); setZmieniony(true) }}
              usun={(x) => { krok({ obszary: aktualny.current.obszary.filter((o) => o.id !== x) }, t('usunięcie obszaru')); setWybrany(null); setZmieniony(true) }}
              zmien={(x, pr) => { krok({ obszary: aktualny.current.obszary.map((o) => (o.id === x ? { ...o, ...pr } : o)) }, t('przesunięcie obszaru')); setZmieniony(true) }}
            />
          </div>
          {obszarWybrany && (
            <div className="flex flex-wrap items-end gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs">
              <span className="h-4 w-4 rounded-sm" style={{ background: KOLORY_OBSZARU[obszarWybrany.rodzaj] }} />
              <label><span className="etykieta">{t('Nazwa tabeli')}</span>
                <input className="pole w-48 py-1 text-xs" value={obszarWybrany.nazwa ?? ''} onChange={(e) => ustawObszar({ nazwa: e.target.value })} /></label>
              <label><span className="etykieta">{t('Rodzaj tabeli')}</span>
                <select className="pole w-56 py-1 text-xs" value={obszarWybrany.rodzaj_tabeli ?? ''} onChange={(e) => {
                  const x = listaRodzajow.find((y) => y.kod === e.target.value)
                  if (x) ustawObszar({ rodzaj_tabeli: x.kod, rodzaj: x.struktura, element: x.element_szablonu, kolumny: x.struktura === 'wlasna' ? obszarWybrany.kolumny ?? x.kolumny : undefined })
                }}>
                  {!obszarWybrany.rodzaj_tabeli && <option value="">{ETYKIETY_OBSZARU[obszarWybrany.rodzaj]}</option>}
                  {listaRodzajow.map((x) => <option key={x.kod} value={x.kod}>{x.nazwa}</option>)}
                </select></label>
              {(obszarWybrany.rodzaj === 'czesci' || obszarWybrany.rodzaj === 'krocce') && (
                <label><span className="etykieta">{t('Element szablonu')}</span>
                  <select className="pole w-48 py-1 text-xs" value={obszarWybrany.element ?? ''} onChange={(e) => ustawObszar({ element: e.target.value || null })}>
                    <option value="">{t('wg nazw pozycji')}</option>
                    {elementySzablonu.map((e) => <option key={e.kod} value={e.kod}>{e.nazwa}</option>)}
                  </select></label>
              )}
              {obszarWybrany.rodzaj === 'wlasna' && (
                <label className="min-w-[16rem] flex-1"><span className="etykieta">{t('Kolumny (rozdziel średnikiem; puste = z nagłówka tabeli)')}</span>
                  <input className="pole py-1 text-xs" value={(obszarWybrany.kolumny ?? []).join('; ')} onChange={(e) => ustawObszar({ kolumny: e.target.value.split(';').map((x) => x.trim()).filter(Boolean) })} /></label>
              )}
              <span className="ml-auto" />
              <Button rozmiar="maly" disabled={strona >= liczbaStron} title={t('Ta sama tabela na kolejnym arkuszu - zaznaczenie przechodzi na następną stronę')}
                onClick={() => zmienStrone(strona + 1, [obszarWybrany])}><Copy className="h-3 w-3" /> {t('Powiel na następną stronę')}</Button>
              <Button rozmiar="maly" onClick={() => { krok({ obszary: aktualny.current.obszary.filter((o) => o.id !== obszarWybrany.id) }, t('usunięcie obszaru')); setWybrany(null); setZmieniony(true) }}><Trash2 className="h-3 w-3" /> {t('Usuń')}</Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-600">{obszary.length ? t('Obszary: {0}', obszary.map(etykietaObszaru).join(', ')) : t('Brak zaznaczonych obszarów.')}</span>
            <span className="ml-auto" />
            <Button rozmiar="maly" disabled={!info?.elementowTekstu || !obszary.length || !!zajety} onClick={() => void odczytajTekst()}
              title={info?.elementowTekstu ? t('Tabela z warstwy tekstowej PDF - bez kosztów') : t('Skan nie ma warstwy tekstowej')}>
              <FileText className="h-3 w-3" /> {t('Odczytaj z tekstu PDF (bez AI)')}
            </Button>
            <Button rozmiar="maly" wariant="akcent" disabled={!obszary.length || !!zajety} onClick={() => void przygotujAi()}>
              <Sparkles className="h-3 w-3" /> {t('Odczytaj przez AI')}
            </Button>
          </div>
        </section>
      )}

      <section className="sekcja space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold">{t('Wynik odczytu')}</h4>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={sprawdzony} onChange={(e) => { setSprawdzony(e.target.checked); setZmieniony(true) }} /> {t('sprawdzony z rysunkiem')}
          </label>
          <span className="ml-auto" />
          <Button rozmiar="maly" onClick={() => setWklej({ tekst: '', cel: zakladka })}><ClipboardPaste className="h-3 w-3" /> {t('Wklej tabelę')}</Button>
          <Button rozmiar="maly" onClick={() => void pobierzExcel()}><FileSpreadsheet className="h-3 w-3" /> {t('Pobierz Excel')}</Button>
          <Button rozmiar="maly" disabled={!wynik.pozycje.length && !wynik.krocce.length && !(wynik.tabele ?? []).length}
            title={t('Wykaz części i króćce do Materiałów, tabela badań do Badań; ponowne przeniesienie aktualizuje pozycje')}
            onClick={() => void (async () => { if ((zmieniony || !id) && !(await zapisz())) return; setPrzenies(true) })()}><ArrowRight className="h-3 w-3" /> {t('Przenieś do wyceny')}</Button>
          <Button rozmiar="maly" wariant="glowny" disabled={!zmieniony} onClick={() => void zapisz()}><Save className="h-3 w-3" /> {t('Zapisz')}</Button>
        </div>
        <SiatkaOdczytu
          wynik={wynik} zmien={zmien} kategorie={s.kategorieMaterialow} zakladka={zakladka} setZakladka={setZakladka}
          podglad={podglad ? { ...podglad, strona } : null} tylkoOdczyt={tylkoOdczyt}
          pokaz={(o) => { setPodswietlony(null); setTimeout(() => setPodswietlony(o), 0) }}
        />
      </section>

      <Dialog open={!!aiPlan} onOpenChange={(o) => !o && setAiPlan(null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t('Odczyt przez AI - potwierdzenie kosztu')}</DialogTitle>
          <DialogDescription>{t('Do Claude API trafią tylko poniższe wycinki rysunku (bez całego pliku).')}</DialogDescription>
          {aiPlan && (
            <div className="mt-3 space-y-3 text-sm">
              <ul className="list-disc pl-5">
                {aiPlan.zadania.map((z, i) => <li key={i}>{z.opis} {t('- ok.')}{' '}{liczba(z.tokeny / 1000, 1)} {t('tys. tokenów')}</li>)}
              </ul>
              {aiPlan.uwaga
                ? <Komunikat rodzaj="ostrzezenie">{aiPlan.uwaga}</Komunikat>
                : <p>{t('Szacowany koszt:')}{' '}<strong>{liczba(aiPlan.koszt_pln ?? 0, 2)} {t('zł')}</strong>{aiPlan.pozostalo !== null && t(' · w budżecie miesiąca zostało {0} zł', liczba(aiPlan.pozostalo, 2))}.</p>}
              <div className="flex justify-end gap-2">
                <Button onClick={() => setAiPlan(null)}>{t('Anuluj')}</Button>
                <Button wariant="akcent" disabled={!!aiPlan.uwaga} onClick={() => void wykonajAi()}><Sparkles className="h-4 w-4" /> {t('Odczytaj')}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!wklej} onOpenChange={(o) => !o && setWklej(null)}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>{t('Wklej tabelę')}</DialogTitle>
          <DialogDescription>{t('Skopiuj tabelę z Excela, Worda albo z innego programu (kolumny rozdzielone tabulatorem). Pierwszy wiersz - nagłówki.')}</DialogDescription>
          {wklej && (
            <div className="mt-3 space-y-3">
              <label className="block"><span className="etykieta">{t('Do zakładki')}</span>
                <select className="pole" value={wklej.cel} onChange={(e) => setWklej({ ...wklej, cel: e.target.value as ZakladkaSiatki })}>
                  <option value="pozycje">{t('Wykaz części')}</option><option value="krocce">{t('Króćce')}</option><option value="parametry">{t('Dane projektowe')}</option>
                  <option value="uwagi">{t('Uwagi do wyceny')}</option><option value="tabele">{t('Własne tabele')}</option>
                </select>
              </label>
              <textarea className="pole h-48 font-mono text-xs" autoFocus value={wklej.tekst} onChange={(e) => setWklej({ ...wklej, tekst: e.target.value })} />
              <div className="flex justify-end gap-2">
                <Button onClick={() => setWklej(null)}>{t('Anuluj')}</Button>
                <Button wariant="glowny" disabled={!wklej.tekst.trim()} onClick={wklejTabele}>{t('Wklej')}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PrzeniesDoWyceny
        otwarty={przenies} zamknij={() => setPrzenies(false)} zapytanieId={zapytanieId} widziMarze={up.widziMarze} otworzWycene={otworzWycene}
        odczyt={id ? { id, nazwa_pliku: dokument.nazwa_pliku, strona, nazwa: obszary.length ? obszary.map(etykietaObszaru).join(', ') : null, rodzaj_tabeli: obszary[0]?.rodzaj_tabeli ?? null, obszary, wynik } : null}
      />
    </div>
  )
}
