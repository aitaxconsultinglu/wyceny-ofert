// Przeniesienie sprawdzonego odczytu rysunku do wyceny. Mapowanie wg rodzaju tabeli: wykaz części -> zakładka Materiały
// (element szablonu z obszaru), króćce -> rury króćców i kołnierze, tabela "Badania i wymagania" -> zakładka Badania.
// Każda pozycja pamięta źródło (odczyt, strona, klucz wiersza i skrót treści), więc ponowne przeniesienie tego samego
// odczytu aktualizuje pozycje zamiast je dublować, a zakładka Materiały pokazuje pozycje zmienione w źródle.
// Część czysta - testy w przeniesienieOdczytu.test.ts.
import { pozycjeZListy } from './importListy'
import { listaZRysunku, type KrociecRysunku, type Obszar, type PozycjaRysunku, type WynikRysunku } from './rysunki'
import { klucz as nowyKlucz, type PozycjaWyceny } from './wyceny'

export interface ZrodloOdczytu {
  odczyt_id: string
  /** Klucz wiersza w odczycie (numer pozycji / oznaczenie króćca) - stały mimo zmiany kolejności wierszy. */
  wiersz: string
  /** "rysunek X.pdf, str. 2 - Wykaz części" - kolumna Źródło w wycenie. */
  opis: string
  /** Skrót treści wiersza w chwili przeniesienia - wykrywa zmianę w źródle. */
  skrot: string
}

export interface OdczytDoPrzeniesienia {
  id: string
  nazwa_pliku: string
  strona: number
  nazwa: string | null
  rodzaj_tabeli: string | null
  obszary: Obszar[]
  wynik: WynikRysunku
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
export const zrodloPozycji = (p: Pick<PozycjaWyceny, 'dodatkowe'>) => (p.dodatkowe as { zrodlo_odczytu?: ZrodloOdczytu } | undefined)?.zrodlo_odczytu ?? null

const skrotCzesci = (p: PozycjaRysunku) => [p.nazwa, p.ilosc, p.jm, p.material, p.norma, p.wymiary, p.masa_jedn, p.masa_calk].map((x) => norm(String(x ?? ''))).join('|')
const skrotKrocca = (k: KrociecRysunku) => [k.oznaczenie, k.ilosc, k.dn, k.pn, k.przylacze].map((x) => norm(String(x ?? ''))).join('|')

/** Klucze wierszy unikalne w odczycie: numer pozycji (oznaczenie króćca), a przy braku albo powtórzeniu - numer wiersza. */
function kluczeWierszy<T>(lista: T[], wlasny: (x: T) => string, prefiks: string) {
  const uzyte = new Set<string>()
  return lista.map((x, i) => {
    let k = norm(wlasny(x))
    if (!k || uzyte.has(k)) k = `#${i + 1}`
    uzyte.add(k)
    return `${prefiks}:${k}`
  })
}

/** Pozycje wyceny z odczytu (z kluczami źródła). `badania` - kod rodzaju tabeli przenoszonej do zakładki Badania. */
export function pozycjeZOdczytu(o: OdczytDoPrzeniesienia, opcje: { badania?: string[] } = {}): PozycjaWyceny[] {
  const opisZrodla = `rysunek ${o.nazwa_pliku}, str. ${o.strona}${o.nazwa ? ` - ${o.nazwa}` : ''}`
  const zrodlo = (wiersz: string, skrot: string): { zrodlo_odczytu: ZrodloOdczytu } => ({ zrodlo_odczytu: { odczyt_id: o.id, wiersz, opis: opisZrodla, skrot } })
  // Element szablonu: wspólny dla wszystkich obszarów wykazu części w odczycie (np. "Tabela dennic" -> dennice).
  const elementy = [...new Set(o.obszary.filter((x) => x.rodzaj === 'czesci').map((x) => x.element ?? null))]
  const element = elementy.length === 1 ? elementy[0] : null
  const wynik: PozycjaWyceny[] = []

  const czesci = o.wynik.pozycje.filter((p) => p.nazwa.trim())
  const kluczeCzesci = kluczeWierszy(czesci, (p) => (p.poz.trim() ? `${p.poz}` : ''), 'p')
  czesci.forEach((p, i) => {
    const [poz] = pozycjeZListy(listaZRysunku([p]), opisZrodla)
    wynik.push({ ...poz, lp: i + 1, dodatkowe: { ...poz.dodatkowe, ...(element ? { element } : {}), ...zrodlo(kluczeCzesci[i], skrotCzesci(p)) } })
  })

  const kluczeKroccow = kluczeWierszy(o.wynik.krocce, (k) => k.oznaczenie, 'k')
  o.wynik.krocce.forEach((k, i) => {
    const ilosc = k.ilosc ?? 1
    const opis = [k.oznaczenie, k.przeznaczenie].filter(Boolean).join(' - ')
    const wspolne = { lp: 0, ilosc, cena_jedn: 0, zrodlo_ceny: 'recznie' as const, zrodlo_opis: opisZrodla, dn: k.dn, pn: k.pn, pewnosc: k.pewnosc, uwagi: k.uwagi }
    wynik.push({ ...wspolne, klucz: nowyKlucz(), zakladka: 'materialy', sekcja: 'rury_krocce', nazwa: `Rura króćca ${opis}${k.dn ? ` ${k.dn}` : ''}`.trim(), jm: 'szt', jednostka_ceny: 'jm',
      dodatkowe: { element: 'krocce', ...zrodlo(`${kluczeKroccow[i]}:rura`, skrotKrocca(k)) } })
    wynik.push({ ...wspolne, klucz: nowyKlucz(), zakladka: 'materialy', sekcja: 'kolnierze', nazwa: `Kołnierz ${opis}${[k.dn, k.pn, k.przylacze].filter(Boolean).length ? ` ${[k.dn, k.pn, k.przylacze].filter(Boolean).join(' ')}` : ''}`.trim(), jm: 'szt', jednostka_ceny: 'jm',
      dodatkowe: { element: 'kolnierze', ...zrodlo(`${kluczeKroccow[i]}:kolnierz`, skrotKrocca(k)) } })
  })

  // Rodzaj tabeli własnej: z jej obszaru (kilka tabel w jednym odczycie), inaczej z odczytu.
  const rodzajTabeli = (obszarId: string | null) => o.obszary.find((x) => x.id === obszarId)?.rodzaj_tabeli ?? o.rodzaj_tabeli
  for (const tb of o.wynik.tabele ?? []) {
    const kod = rodzajTabeli(tb.obszar_id)
    if (kod && (opcje.badania ?? ['badania']).includes(kod)) {
      const klucze = kluczeWierszy(tb.wiersze, (w) => w[0] ?? '', `t:${norm(tb.nazwa)}`)
      tb.wiersze.forEach((w, i) => {
        if (!w[0]?.trim()) return
        wynik.push({
          klucz: nowyKlucz(), lp: 0, zakladka: 'badania', sekcja: null, nazwa: w[0].trim(), ilosc: 1, jm: 'kpl', cena_jedn: 0, jednostka_ceny: 'jm', zrodlo_ceny: 'recznie',
          zrodlo_opis: opisZrodla, uwagi: w.slice(1).filter((x) => x.trim()).map((x, j) => `${tb.kolumny[j + 1] ?? ''}: ${x}`.replace(/^: /, '')).join('; ') || null,
          dodatkowe: zrodlo(klucze[i], w.map(norm).join('|')),
        })
      })
    }
  }
  return wynik
}

/** Pola pozycji, które pochodzą z rysunku (aktualizowane przy ponownym przeniesieniu); cena i źródło ceny zostają. */
const POLA_ZRODLA = ['nazwa', 'sekcja', 'gatunek', 'd_zew', 'd_wew', 'grubosc', 'szerokosc', 'dlugosc', 'dn', 'pn', 'ilosc', 'jm', 'masa_jedn', 'masa_reczna', 'uwagi', 'pewnosc'] as const
const kluczZrodla = (z: ZrodloOdczytu) => `${z.odczyt_id}|${z.wiersz}`

export interface WynikScalenia { pozycje: PozycjaWyceny[]; dodane: number; zaktualizowane: number; bezZmian: number; usunieteWZrodle: number }

/**
 * Scala pozycje z odczytu z pozycjami aparatu: ten sam odczyt i wiersz = aktualizacja pól z rysunku (cena zostaje),
 * nowe wiersze - na końcu zakładki, wiersze usunięte z odczytu - zostają w wycenie (liczone w `usunieteWZrodle`).
 */
export function scalZOdczytem(istniejace: PozycjaWyceny[], nowe: PozycjaWyceny[]): WynikScalenia {
  const wgKlucza = new Map(nowe.map((p) => [kluczZrodla(zrodloPozycji(p)!), p]))
  const odczyty = new Set(nowe.map((p) => zrodloPozycji(p)!.odczyt_id))
  let zaktualizowane = 0
  let bezZmian = 0
  let usunieteWZrodle = 0
  const uzyte = new Set<string>()
  const pozycje = istniejace.map((p) => {
    const z = zrodloPozycji(p)
    if (!z || !odczyty.has(z.odczyt_id)) return p
    const n = wgKlucza.get(kluczZrodla(z))
    if (!n) { usunieteWZrodle++; return p }
    uzyte.add(kluczZrodla(z))
    if (z.skrot === zrodloPozycji(n)!.skrot) { bezZmian++; return p }
    zaktualizowane++
    const zm = Object.fromEntries(POLA_ZRODLA.map((k) => [k, n[k]]))
    return { ...p, ...zm, dodatkowe: { ...p.dodatkowe, ...n.dodatkowe } }
  })
  const dodane = nowe.filter((p) => !uzyte.has(kluczZrodla(zrodloPozycji(p)!)))
  return { pozycje: [...pozycje, ...dodane], dodane: dodane.length, zaktualizowane, bezZmian, usunieteWZrodle }
}

/** Pozycje wyceny, których wiersz w odczycie zmienił się po przeniesieniu (do pytania "zaktualizować?"). */
export function zmienioneWZrodle(pozycje: PozycjaWyceny[], odczyty: OdczytDoPrzeniesienia[], opcje: { badania?: string[] } = {}): PozycjaWyceny[] {
  const zOdczytow = new Map(odczyty.flatMap((o) => pozycjeZOdczytu(o, opcje)).map((p) => [kluczZrodla(zrodloPozycji(p)!), p]))
  return pozycje.filter((p) => {
    const z = zrodloPozycji(p)
    const n = z ? zOdczytow.get(kluczZrodla(z)) : undefined
    return !!n && zrodloPozycji(n)!.skrot !== z!.skrot
  })
}
