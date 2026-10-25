// Odczyt list materiałowych, tabel króćców i danych projektowych z rysunków PDF.
// Tu jest część czysta (bez przeglądarki i bez AI): podział obszaru na kafle, układanie warstwy
// tekstowej PDF w tabelę, rozpoznanie kolumn i zamiana wyniku na pozycje wyceny.
import { rozpoznajListe, type WierszListy } from './importListy'
import { normalizujNazwe, znajdzGatunek } from './normalizacjaNazw'
import { liczbaPL } from './importOptima'
import { odmiana } from './format'
import type { RysunekAi } from './ai'
import { t } from '@/i18n'
import { nazwyPLEN } from './terminy'

/** Prostokąt w pikselach albo - dla obszarów - we współrzędnych względnych 0..1 strony (po obrocie, jak na ekranie). */
export interface Prostokat { x: number; y: number; w: number; h: number }

export type RodzajObszaru = 'czesci' | 'krocce' | 'parametry' | 'tabliczka'
export const ETYKIETY_OBSZARU: Record<RodzajObszaru, string> = {
  czesci: t('wykaz części'), krocce: t('tabela króćców'), parametry: t('dane projektowe'), tabliczka: t('tabliczka rysunkowa'),
}
export const KOLORY_OBSZARU: Record<RodzajObszaru, string> = {
  czesci: '#0ea5e9', krocce: '#a855f7', parametry: '#f59e0b', tabliczka: '#64748b',
}

export interface Obszar extends Prostokat { id: string; rodzaj: RodzajObszaru }
export type ObszarZrodlowy = Prostokat & { strona: number }

export interface PozycjaRysunku {
  poz: string
  nazwa: string
  ilosc: number | null
  jm: string
  material: string | null
  norma: string | null
  wymiary: string | null
  masa_jedn: number | null
  masa_calk: number | null
  uwagi: string | null
  /** 0-1; poniżej 0,8 komórka jest wyróżniona i oznaczona "(?)". */
  pewnosc: number
  /** kategorie_materialow.kod - reguły (normalizacja nazw) albo AI. */
  sekcja: string
  obszar_zrodlowy: ObszarZrodlowy | null
  /** Odpowiedniki PL / EN nazwy - tylko gdy pewne (lib/terminy.ts); sama nazwa zostaje jak w źródle. */
  nazwa_pl?: string
  nazwa_en?: string
}

export interface KrociecRysunku {
  oznaczenie: string
  ilosc: number | null
  dn: string | null
  pn: string | null
  przylacze: string | null
  przeznaczenie: string | null
  uwagi: string | null
  pewnosc: number
  obszar_zrodlowy: ObszarZrodlowy | null
}

export interface ParametrRysunku {
  nazwa: string
  /** np. płaszcz / rurki - dla wymienników dane projektowe są osobno dla przestrzeni. */
  przestrzen: string | null
  wartosc: string
  jednostka: string | null
  pewnosc: number
  nazwa_pl?: string
  nazwa_en?: string
}

export interface WynikRysunku {
  pozycje: PozycjaRysunku[]
  krocce: KrociecRysunku[]
  parametry: ParametrRysunku[]
  uwagi: string[]
}

export const PUSTY_WYNIK: WynikRysunku = { pozycje: [], krocce: [], parametry: [], uwagi: [] }
export const PROG_PEWNOSCI = 0.8

// --- Kafle -------------------------------------------------------------------------------------

/**
 * Dzieli obszar szer x wys [px] na kafle o boku <= maksBok z zakładką >= `zakladka` boku kafla
 * (tekst przecięty na krawędzi jednego kafla jest cały na sąsiednim). Kafle w jednym wymiarze mają
 * równy rozmiar, ostatni kończy się dokładnie na krawędzi obszaru.
 */
export function kafle(szer: number, wys: number, maksBok = 1500, zakladka = 0.1): Prostokat[] {
  const podzial = (L: number): { od: number; dl: number }[] => {
    if (L <= maksBok) return [{ od: 0, dl: L }]
    let n = 2
    while (L / (n - (n - 1) * zakladka) > maksBok) n++
    const t = Math.ceil(L / (n - (n - 1) * zakladka))
    const krok = (L - t) / (n - 1)
    return Array.from({ length: n }, (_, i) => ({ od: Math.round(i * krok), dl: t }))
  }
  const W = Math.round(szer)
  const H = Math.round(wys)
  return podzial(H).flatMap((r) => podzial(W).map((c) => ({ x: c.od, y: r.od, w: c.dl, h: r.dl })))
}

/** "1 kafel", "3 kafle", "12 kafli". */
export const kafliOdmiana = (n: number) => odmiana(n, ['kafel', 'kafle', 'kafli'])

/** Przybliżona liczba tokenów obrazu w Claude API (szer x wys / 750). */
export const tokenyObrazu = (w: number, h: number) => Math.ceil((w * h) / 750)

/**
 * Rozdzielczość renderu obszaru: docelowo 300 DPI (albo natywna rozdzielczość skanu, jeśli wyższa).
 * Mały wycinek powiększamy, aż dłuższy bok ma ~minBok px (model lepiej czyta większe pismo), najwyżej
 * do maksDpi. Mniej niż 300 DPI tylko wtedy, gdy obraz byłby za duży dla przeglądarki.
 */
export function dpiObszaru(
  szerPt: number, wysPt: number,
  opcje: { dpi?: number; natywne?: number | null; minBok?: number; maksDpi?: number; maksPikseli?: number; minDpi?: number } = {},
) {
  const { minBok = 1500, maksDpi = 600, maksPikseli = 60_000_000, minDpi = 150 } = opcje
  let dpi = Math.max(opcje.dpi ?? 300, Math.min(opcje.natywne ?? 0, maksDpi))
  const bok = Math.max(szerPt, wysPt) * dpi / 72
  // W dół - powiększony wycinek ma się zmieścić w jednym kaflu.
  if (bok < minBok) dpi = Math.min(maksDpi, Math.floor(dpi * minBok / bok + 1e-9))
  const piks = (szerPt * dpi / 72) * (wysPt * dpi / 72)
  if (piks <= maksPikseli) return dpi
  return Math.max(minDpi, Math.floor(dpi * Math.sqrt(maksPikseli / piks)))
}

/** Prostokąt kafla [px w renderze obszaru] -> obszar względny na stronie (do podglądu źródła wiersza). */
export function kafelNaStronie(kafel: Prostokat, obszar: Prostokat, szerRenderu: number, wysRenderu: number, strona: number): ObszarZrodlowy {
  return {
    strona,
    x: obszar.x + (kafel.x / szerRenderu) * obszar.w,
    y: obszar.y + (kafel.y / wysRenderu) * obszar.h,
    w: (kafel.w / szerRenderu) * obszar.w,
    h: (kafel.h / wysRenderu) * obszar.h,
  }
}

// --- Warstwa tekstowa -> tabela ------------------------------------------------------------------

/** Element tekstu PDF w układzie strony po obrocie: x od lewej, y = linia bazowa od góry, w/h w punktach. */
export interface ElementTekstu { str: string; x: number; y: number; w: number; h: number }

export interface TabelaTekstu { wiersze: string[][]; ramki: Prostokat[] }

const mediana = (l: number[]) => {
  const s = [...l].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

/** Elementy, których środek leży w prostokącie (w punktach strony). */
export function elementyWObszarze(el: ElementTekstu[], p: Prostokat): ElementTekstu[] {
  return el.filter((e) => {
    const sx = e.x + e.w / 2
    const sy = e.y - e.h / 2
    return sx >= p.x && sx <= p.x + p.w && sy >= p.y && sy <= p.y + p.h
  })
}

/**
 * Układa elementy tekstu w wiersze (wg linii bazowej) i kolumny (wg rzutu komórek na oś X:
 * przerwy wspólne dla wszystkich wierszy to granice kolumn). Wynik jak wiersze arkusza.
 */
export function ulozWTabele(elementy: ElementTekstu[]): TabelaTekstu {
  const el = elementy.filter((e) => e.str.trim())
  if (!el.length) return { wiersze: [], ramki: [] }
  const h = mediana(el.map((e) => e.h)) || 8

  // 1. Wiersze: linia bazowa w tolerancji ~0,45 wysokości znaku.
  const wiersze: ElementTekstu[][] = []
  for (const e of [...el].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const ost = wiersze[wiersze.length - 1]
    const y = ost ? ost.reduce((s, x) => s + x.y, 0) / ost.length : 0
    if (ost && Math.abs(e.y - y) <= 0.45 * h) ost.push(e)
    else wiersze.push([e])
  }

  // 2. Komórki: sąsiednie elementy w wierszu bliżej niż ~0,8 wysokości znaku to jedna komórka.
  interface Komorka { x0: number; x1: number; tekst: string }
  const komorki = wiersze.map((w) => {
    const wynik: Komorka[] = []
    for (const e of [...w].sort((a, b) => a.x - b.x)) {
      const ost = wynik[wynik.length - 1]
      const przerwa = ost ? e.x - ost.x1 : Infinity
      if (ost && przerwa <= 0.8 * h) {
        ost.tekst += (przerwa > 0.15 * h && !ost.tekst.endsWith(' ') ? ' ' : '') + e.str
        ost.x1 = Math.max(ost.x1, e.x + e.w)
      } else wynik.push({ x0: e.x, x1: e.x + e.w, tekst: e.str })
    }
    return wynik.map((k) => ({ ...k, tekst: k.tekst.replace(/\s+/g, ' ').trim() }))
  })

  // 3. Kolumny: rzut komórek na oś X, zlepione przedziały = kolumny. Bierzemy wiersze z prawie pełną
  //    liczbą komórek - nagłówki grupujące ("Nozzle Neck" nad Diam./Thk.) skleiłyby kolumny.
  const maks = Math.max(...komorki.map((k) => k.length))
  const zrodlo = komorki.filter((k) => k.length >= Math.max(2, Math.ceil(maks / 2))).flat()
  const przedzialy = (zrodlo.length ? zrodlo : komorki.flat()).map((k) => [k.x0, k.x1] as [number, number]).sort((a, b) => a[0] - b[0])
  const kolumny: [number, number][] = []
  for (const [a, b] of przedzialy) {
    const ost = kolumny[kolumny.length - 1]
    if (ost && a <= ost[1] + 0.3 * h) ost[1] = Math.max(ost[1], b)
    else kolumny.push([a, b])
  }
  const kolumna = (k: Komorka) => {
    const i = kolumny.findIndex(([a, b]) => k.x0 >= a - 0.3 * h && k.x0 <= b + 0.3 * h)
    if (i >= 0) return i
    // Komórka poza przedziałami - najbliższa kolumna na lewo.
    let j = 0
    kolumny.forEach(([a], n) => { if (a <= k.x0) j = n })
    return j
  }

  const tabela = komorki.map((w) => {
    const r = Array<string>(kolumny.length).fill('')
    for (const k of w) {
      const i = kolumna(k)
      r[i] = r[i] ? `${r[i]} ${k.tekst}` : k.tekst
    }
    return r
  })
  // Puste kolumny precz.
  const uzyte = kolumny.map((_, i) => tabela.some((r) => r[i]))
  const ramki = wiersze.map((w) => {
    const x0 = Math.min(...w.map((e) => e.x))
    const x1 = Math.max(...w.map((e) => e.x + e.w))
    const y0 = Math.min(...w.map((e) => e.y - e.h))
    const y1 = Math.max(...w.map((e) => e.y))
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 + 0.25 * h }
  })
  return { wiersze: tabela.map((r) => r.filter((_, i) => uzyte[i])), ramki }
}

// --- Tabela -> struktury -------------------------------------------------------------------------

/** Kategoria materiału i pewność z reguł normalizacji nazw. */
export function klasyfikuj(nazwa: string, wymiary: string | null, material: string | null): { sekcja: string; pewny: boolean } {
  const n = normalizujNazwe([nazwa, wymiary, material].filter(Boolean).join(' '))
  return { sekcja: n.rodzaj === 'material' ? n.kategoria ?? 'inne' : 'inne', pewny: n.rodzaj === 'material' && n.pewnosc === 'wysoka' }
}

/** Wykaz części z tabeli. Na rysunkach nagłówek bywa NA DOLE wykazu (wiersze rosną w górę). */
export function czesciZTabeli(wiersze: string[][], ramki: (ObszarZrodlowy | null)[] = []): PozycjaRysunku[] {
  const proba = (w: string[][]) => rozpoznajListe(w)
  let { pozycje } = proba(wiersze)
  let odwrocone = false
  const odwr = proba([...wiersze].reverse())
  if (odwr.pozycje.length > pozycje.length) { pozycje = odwr.pozycje; odwrocone = true }
  // Ramki wierszy: rozpoznajListe pomija nagłówek i puste wiersze - dopasowujemy po nazwie.
  const zRamka = (w: WierszListy) => {
    const i = wiersze.findIndex((r) => r.some((k) => k.length >= 3 && w.nazwa.startsWith(k)))
    return i >= 0 ? ramki[i] ?? null : null
  }
  const wynik = pozycje.map((w): PozycjaRysunku => ({
    poz: String(w.lp), nazwa: w.nazwa, ...nazwyPLEN(w.nazwa), ilosc: w.ilosc, jm: w.jm, material: w.gatunek, norma: w.norma, wymiary: null,
    masa_jedn: w.masa_jedn, masa_calk: w.masa_jedn !== null ? w.masa_jedn * w.ilosc : null, uwagi: w.uwagi,
    pewnosc: w.pewnosc, sekcja: w.sekcja, obszar_zrodlowy: zRamka(w),
  }))
  return odwrocone ? wynik.sort((a, b) => (Number(a.poz) || 0) - (Number(b.poz) || 0)) : wynik
}

const KOLUMNY_KROCCOW: [keyof Omit<KrociecRysunku, 'pewnosc' | 'obszar_zrodlowy'>, RegExp][] = [
  ['oznaczenie', /^(mark|ozn|symbol|nozzle$|króciec$|krociec$|nr|poz|item|tag)/i],
  ['ilosc', /^(qty|quantity|ilo|szt)/i],
  ['dn', /size|wielko|^dn|średn|sredn|nominal|nom\.?\s?d|rozmiar|^ø/i],
  ['pn', /rating|^pn|clas|klasa|ciśn|cisn/i],
  ['przylacze', /facing|type|typ|przyłącz|przylacz|kołnierz|kolnierz|connection|uszczel/i],
  ['przeznaczenie', /service|obsług|obslug|przeznacz|designation|description|opis|funkcj|medium|purpose/i],
  ['uwagi', /remark|uwag|note/i],
]

/**
 * Nagłówek tabeli z kilku wierszy (np. "Flange" nad "Nom. d. | Type | Clas."): wiersze od góry do
 * ostatniego wiersza nagłówkowego w pierwszych sześciu, sklejone kolumnami. Nagłówek przesunięty
 * względem danych (kolumna bez danych obok kolumny danych bez nagłówka) przenosimy nad dane.
 */
function naglowekTabeli(wiersze: string[][], trafienia: (r: string[]) => number) {
  let koniec = -1
  for (let i = 0; i < Math.min(6, wiersze.length); i++) if (trafienia(wiersze[i]) >= 2) koniec = i
  if (koniec < 0) return null
  const n = Math.max(...wiersze.map((r) => r.length))
  const nagl = Array.from({ length: n }, (_, j) => wiersze.slice(0, koniec + 1).map((r) => r[j]?.trim()).filter(Boolean).join(' '))
  const dane = wiersze.slice(koniec + 1)
  const maDane = (j: number) => dane.some((r) => r[j]?.trim())
  for (let j = 0; j < n; j++) {
    if (!nagl[j] || maDane(j)) continue
    const s = [j - 1, j + 1].find((k) => k >= 0 && k < n && !nagl[k] && maDane(k))
    if (s !== undefined) { nagl[s] = nagl[j]; nagl[j] = '' }
  }
  return { koniec, naglowek: nagl }
}

export function krocceZTabeli(wiersze: string[][], ramki: (ObszarZrodlowy | null)[] = []): KrociecRysunku[] {
  // Nagłówek nie ma cyfr - inaczej wiersz "N1 | DN150 | PN40" też wyglądałby na nagłówek.
  const trafienia = (r: string[]) => KOLUMNY_KROCCOW.filter(([, w]) => r.some((k) => !/\d/.test(k) && w.test(k.trim()))).length
  const n = naglowekTabeli(wiersze, trafienia)
  const mapa: Partial<Record<keyof KrociecRysunku, number>> = {}
  if (n) {
    for (const [pole, w] of KOLUMNY_KROCCOW) {
      // Dopasowanie po ostatnim członie nagłówka ("Flange Nom. d." -> "Nom. d.") i po całości.
      const i = n.naglowek.findIndex((k, j) => k && !Object.values(mapa).includes(j) && (w.test(k) || w.test(k.split(' ').slice(-2).join(' '))))
      if (i >= 0) mapa[pole] = i
    }
  }
  if (mapa.oznaczenie === undefined) mapa.oznaczenie = 0
  const pole = (r: string[], k: keyof KrociecRysunku) => {
    const i = mapa[k]
    return i === undefined ? null : r[i]?.trim() || null
  }
  const zmapowane = new Set(Object.values(mapa))
  const start = n ? n.koniec + 1 : 0
  return wiersze.slice(start).flatMap((r, j) => {
    const ozn = pole(r, 'oznaczenie')
    if (!ozn || r.filter((k) => k.trim()).length < 2) return []
    const ilosc = pole(r, 'ilosc')
    // Kolumny bez odpowiednika (grubość szyjki, wzmocnienie...) - do uwag, żeby nic nie zginęło.
    const reszta = r.map((k, i) => (zmapowane.has(i) || !k.trim() ? null : `${n?.naglowek[i] || `kol. ${i + 1}`}: ${k.trim()}`)).filter(Boolean)
    return [{
      oznaczenie: ozn, ilosc: ilosc ? liczbaPL(ilosc) : null, dn: pole(r, 'dn'), pn: pole(r, 'pn'),
      przylacze: pole(r, 'przylacze'), przeznaczenie: pole(r, 'przeznaczenie'),
      uwagi: [pole(r, 'uwagi'), ...reszta].filter(Boolean).join('; ') || null,
      pewnosc: n ? 0.9 : 0.5, obszar_zrodlowy: ramki[start + j] ?? null,
    }]
  })
}

const JEDNOSTKA = /^(MPa|kPa|bar|barg|bar\(g\)|°C|ºC|C|mm|m|kg|t|m³|m3|l|%|kW|kg\/h|m³\/h|m3\/h|N\/mm²|daN\.?m)$/i

/** Dane projektowe: pierwsza komórka = nazwa, komórka z jednostką, reszta = wartość (np. "1,0 / FV"). */
export function parametryZTabeli(wiersze: string[][]): ParametrRysunku[] {
  return wiersze.flatMap((r) => {
    const k = r.map((x) => x.trim()).filter(Boolean)
    if (k.length < 2) return []
    const [nazwa, ...reszta] = k
    if (!/[a-ząćęłńóśźż]{2}/i.test(nazwa)) return []      // "-", ". Yes" - pola wyboru, nie parametr
    const ij = reszta.findIndex((x) => JEDNOSTKA.test(x))
    const jednostka = ij >= 0 ? reszta[ij] : null
    const wartosc = reszta.filter((_, i) => i !== ij).join(' | ')
    if (!wartosc) return []
    return [{ nazwa, przestrzen: null, wartosc, jednostka, pewnosc: 0.9 }]
  })
}

// --- Wynik -> wycena -----------------------------------------------------------------------------

/** Pozycje wykazu części -> wiersze listy (wymiary i gatunek z normalizacji nazw) do zakładki Materiały. */
export function listaZRysunku(pozycje: PozycjaRysunku[]): WierszListy[] {
  return pozycje.filter((p) => p.nazwa.trim()).map((p, i) => {
    const opis = [p.nazwa, p.wymiary].filter(Boolean).join(' ')
    const n = normalizujNazwe(`${opis} ${p.material ?? ''}`)
    const ilosc = p.ilosc ?? 1
    return {
      lp: Number(p.poz) || i + 1,
      nazwa: opis,
      sekcja: p.sekcja,
      gatunek: (p.material && (znajdzGatunek(p.material.toUpperCase()) ?? p.material)) || n.gatunek,
      norma: p.norma ?? n.norma,
      d_zew: n.d_zew, d_wew: n.d_wew, grubosc: n.grubosc, szerokosc: n.szerokosc, dlugosc: n.dlugosc, dn: n.dn, pn: n.pn,
      ilosc, jm: p.jm || 'szt',
      masa_jedn: p.masa_jedn ?? (p.masa_calk !== null && ilosc ? p.masa_calk / ilosc : null),
      uwagi: [p.uwagi, p.pewnosc < PROG_PEWNOSCI ? 'odczyt z rysunku niepewny (?)' : null].filter(Boolean).join('; ') || null,
      pewnosc: p.pewnosc,
    }
  })
}

// --- Odpowiedź AI -> wynik ----------------------------------------------------------------------

export const ETYKIETY_DANYCH_PROJEKTOWYCH: Record<keyof RysunekAi['dane_projektowe'], string> = {
  kod_projektowy: t('Kod projektowy'), cisnienie_obliczeniowe: t('Ciśnienie obliczeniowe'), temperatura_obliczeniowa: t('Temperatura obliczeniowa'),
  mdmt: t('MDMT'), naddatek_korozyjny: t('Naddatek korozyjny'), pwht: t('PWHT (obróbka cieplna)'), badania_ndt: t('Badania NDT'),
  kategoria_ped: t('Kategoria PED'), dozor_udt: t('Dozór UDT'), masa_pusta: t('Masa pusta'),
}

/** Opis kafla wysyłany przed obrazem - model zwraca numer kafla, z którego odczytał wiersz. */
export function opisKafla(nr: number, rodzaj: RodzajObszaru, k: Prostokat, wszystkie: Prostokat[]) {
  const kolumny = [...new Set(wszystkie.map((x) => x.x))].sort((a, b) => a - b)
  const wiersze = [...new Set(wszystkie.map((x) => x.y))].sort((a, b) => a - b)
  return `Kafel ${nr}: ${ETYKIETY_OBSZARU[rodzaj]}, wiersz ${wiersze.indexOf(k.y) + 1}/${wiersze.length}, kolumna ${kolumny.indexOf(k.x) + 1}/${kolumny.length}`
}

/**
 * Odpowiedź modelu -> wynik siatki. `kafle[i]` to obszar kafla nr i+1 na stronie (podgląd źródła wiersza).
 * Kategoria: z AI, gdy jest w słowniku, inaczej z reguł. Dane projektowe idą na początek parametrów.
 */
export function zWynikuAi(ai: RysunekAi, kafle: ObszarZrodlowy[], kody: string[]): WynikRysunku {
  const zrodlo = (k: number | null) => (k && kafle[k - 1]) || null
  const dane = (Object.keys(ETYKIETY_DANYCH_PROJEKTOWYCH) as (keyof RysunekAi['dane_projektowe'])[])
    .filter((k) => ai.dane_projektowe?.[k])
    .map((k): ParametrRysunku => ({ nazwa: ETYKIETY_DANYCH_PROJEKTOWYCH[k], przestrzen: null, wartosc: ai.dane_projektowe[k]!, jednostka: null, pewnosc: /\(\?\)/.test(ai.dane_projektowe[k]!) ? 0.6 : 0.9 }))
  return {
    pozycje: ai.pozycje.map((p) => {
      const reguly = klasyfikuj(p.nazwa, p.wymiary, p.material)
      return {
        poz: p.poz, nazwa: p.nazwa, ...nazwyPLEN(p.nazwa), ilosc: p.ilosc, jm: p.jm || 'szt', material: p.material, norma: p.norma, wymiary: p.wymiary,
        masa_jedn: p.masa_jedn, masa_calk: p.masa_calk, uwagi: p.uwagi,
        pewnosc: Math.max(0, Math.min(1, p.pewnosc)),
        sekcja: p.kategoria && kody.includes(p.kategoria) ? p.kategoria : reguly.sekcja,
        obszar_zrodlowy: zrodlo(p.kafel),
      }
    }),
    krocce: ai.krocce.map((k) => ({ ...k, pewnosc: Math.max(0, Math.min(1, k.pewnosc)), obszar_zrodlowy: zrodlo(k.kafel) })).map(({ kafel: _k, ...r }) => { void _k; return r }),
    parametry: [...dane, ...ai.parametry.map((x) => ({ ...x, ...nazwyPLEN(x.nazwa) }))],
    uwagi: ai.uwagi_do_wyceny,
  }
}

/**
 * Łączy wyniki kilku obszarów / wywołań. Wiersze z zakładki kafli mogą się powtórzyć - ten sam
 * numer pozycji i nazwa (albo to samo oznaczenie króćca) = jeden wiersz, zostaje pewniejszy odczyt.
 */
export function polaczWyniki(...wyniki: WynikRysunku[]): WynikRysunku {
  const unikalne = <T extends { pewnosc: number }>(l: T[], klucz: (x: T) => string) => {
    const m = new Map<string, T>()
    for (const x of l) {
      const k = klucz(x)
      const b = m.get(k)
      if (!b || x.pewnosc > b.pewnosc) m.set(k, x)
    }
    return [...m.values()]
  }
  const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  let bezKlucza = 0
  const pozycje = unikalne(wyniki.flatMap((w) => w.pozycje), (p) => p.poz.trim() ? `${norm(p.poz)}|${norm(p.nazwa)}` : `#${bezKlucza++}`)
  const porzadek = (p: PozycjaRysunku) => p.poz.split(/[.,]/).map((x) => Number(x) || 0)
  pozycje.sort((a, b) => {
    const x = porzadek(a); const y = porzadek(b)
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
    return 0
  })
  return {
    pozycje,
    krocce: unikalne(wyniki.flatMap((w) => w.krocce), (k) => norm(k.oznaczenie) || `#${bezKlucza++}`),
    parametry: unikalne(wyniki.flatMap((w) => w.parametry), (p) => `${norm(p.nazwa)}|${norm(p.przestrzen)}`),
    uwagi: [...new Set(wyniki.flatMap((w) => w.uwagi))],
  }
}

/** Pusty wiersz siatki (dodawanie ręczne). */
export function nowaPozycjaRysunku(poz: number): PozycjaRysunku {
  return {
    poz: String(poz), nazwa: '', ilosc: 1, jm: 'szt', material: null, norma: null, wymiary: null, masa_jedn: null, masa_calk: null,
    uwagi: null, pewnosc: 1, sekcja: 'inne', obszar_zrodlowy: null,
  }
}

/** Tabela wklejona ze schowka (Excel, Word: kolumny rozdzielone tabulatorem). */
export function wierszeZeSchowka(tekst: string): string[][] {
  return tekst.replace(/\r/g, '').split('\n').filter((l) => l.trim()).map((l) => l.split('\t').map((k) => k.trim()))
}
