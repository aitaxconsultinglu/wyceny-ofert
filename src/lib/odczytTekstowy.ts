// Odczyt całego arkusza rysunku z CAD z warstwy tekstowej PDF - bez AI i bez zaznaczania obszarów.
// Rysunki złożeniowe mają zwykle trzy tabele: materiałów (element -> gatunek), króćców (poz, ilość, wielkość, PN...)
// i danych projektowych; czasem także wykaz części z ilościami. Tabele są szukane po nagłówkach i słowach kluczowych
// (po polsku i angielsku). Wynik ma ten sam kształt co odczyt AI (WynikRysunku), więc trafia do tej samej siatki i wyceny.
import { nazwyPLEN } from './terminy'
import { czesciZTabeli, klasyfikuj, krocceZTabeli, parametryZTabeli, ulozWTabele, type ElementTekstu, type KrociecRysunku, type ParametrRysunku, type PozycjaRysunku, type WynikRysunku } from './rysunki'

const tekst = (e: ElementTekstu) => e.str.replace(/\s+/g, ' ').trim()

/** Elementy w liniach (wg linii bazowej), w każdej linii od lewej. */
export function linieTekstu(el: ElementTekstu[], tolerancja = 2.5): ElementTekstu[][] {
  const linie: { y: number; el: ElementTekstu[] }[] = []
  for (const e of [...el].filter((x) => tekst(x)).sort((a, b) => a.y - b.y)) {
    const l = linie.find((x) => Math.abs(x.y - e.y) <= tolerancja)
    if (l) l.el.push(e)
    else linie.push({ y: e.y, el: [e] })
  }
  return linie.sort((a, b) => a.y - b.y).map((l) => l.el.sort((a, b) => a.x - b.x))
}

// --- Tabela materiałów: element -> gatunek ----------------------------------------------------------

const ELEMENT = /^(płaszcz|plaszcz|shell|dno|dna|dach|denn|denk|head|cover|pokryw|kołnierz|kolnierz|.*flange|rura kró|szyjka|nozzle|kró[cć]|śrub|srub|szpilk|stud|bolt|nakręt|nakret|nuts?\b|podkład|uszczel|gasket|wzmocn|.*reinf|tube ?sheet|ściana sit|sciana sit|sito|tubes?$|rurki|baffle|przegrod|pass partition|.*support|siodł|siodl|saddle|.*poręcz|.*porecz|.*klatka|.*schod|.*drabin|ladder|platform|podest|split ring|floating head|spacer|tie rod|lifting|eye bolt|test ring|plug|coupling|.*wear plate|właz|wlaz|manhole|channel)/i
const PARAMETR_W_NAZWIE = /diameter|thickness|length|pitch|pressure|temperature|średnic|grubo|długo|ciśnien|temperatur|side$/i
const GATUNEK = /^(SA ?-?\d|A ?\d{2,3}\b|ASTM|ASME|P ?\d{3}|S ?\d{3}|Fe ?\d|St ?\d|1\.4\d{3}|AISI|X\d|1[0-6]Mo|1[0-6]CrMo|[0-9]{2}[HG]\d|stainless|nierdz|304|316|321|duplex|inconel|monel|titan|CuNi|azbest|grafit|graphite)/i

function tabelaMaterialow(linie: ElementTekstu[][]): PozycjaRysunku[] {
  const wynik: PozycjaRysunku[] = []
  const widziane = new Set<string>()
  for (const l of linie) {
    l.forEach((e, i) => {
      const nazwa = tekst(e)
      if (nazwa.length > 48 || !ELEMENT.test(nazwa) || PARAMETR_W_NAZWIE.test(nazwa)) return
      // Gatunek: najbliższy element na prawo w tej samej linii (do ~260 pt), zanim zacznie się inna tabela.
      const g = l.slice(i + 1).find((x) => x.x - (e.x + e.w) < 260 && GATUNEK.test(tekst(x)))
      if (!g) return
      const material = tekst(g).replace(/\s+lub\s+zastępczy$/i, ' (lub zastępczy)')
      const k = `${nazwa.toLowerCase()}|${material.toLowerCase()}`
      if (widziane.has(k)) return
      widziane.add(k)
      wynik.push({
        poz: '', nazwa, ...nazwyPLEN(nazwa), ilosc: null, jm: 'szt', material, norma: null, wymiary: null, masa_jedn: null, masa_calk: null,
        uwagi: 'tabela materiałów rysunku', pewnosc: 0.9, sekcja: klasyfikuj(nazwa, null, material).sekcja, obszar_zrodlowy: null,
      })
    })
  }
  return wynik
}

// --- Tabele z nagłówkiem (wykaz części, króćce) -------------------------------------------------------

const NAGL_POZ = /^(poz\.?|pozycja|item|lp\.?|l\.p\.?|nr|mark|ozn\.?|oznaczenie)$/i
const NAGL_NAZWA = /^(nazwa|name|description|opis|przedmiot|denomination|nazwa części|part name|component|element)/i
const NAGL_ILOSC = /^(ilość|ilosc|il\.|qty\.?|quantity|szt\.?|pcs\.?|nos\.?|no\. of)$/i
const NAGL_KROCCE = /^(poz\.?|mark|ozn\.?|ilość|ilosc|qty|wielkość|wielkosc|size|dn|pn|rating|class|typ|type|ø|sch|grub\.?|thk\.?|obsługa|obsluga|service|przeznaczenie|uwagi|remarks?)$/i

/** Kolumny tabeli z nagłówka: komórki danych przypisane do najbliższego środka kolumny nagłówka. */
function tabelaPodNaglowkiem(linie: ElementTekstu[][], iNagl: number, x0: number, x1: number, naglowki: ElementTekstu[]): string[][] {
  const kol = [...naglowki].sort((a, b) => a.x - b.x)
  const srodek = (e: ElementTekstu) => e.x + e.w / 2
  const h = Math.max(4, kol.reduce((s, e) => s + e.h, 0) / kol.length)
  const wiersze: string[][] = [kol.map(tekst)]
  let ostatnieY = linie[iNagl][0].y
  for (let i = iNagl + 1; i < linie.length; i++) {
    const w = linie[i].filter((e) => srodek(e) >= x0 && srodek(e) <= x1)
    if (!w.length) continue
    if (w[0].y - ostatnieY > 4.5 * h) break            // koniec tabeli: duża przerwa
    ostatnieY = w[0].y
    const r = Array<string>(kol.length).fill('')
    for (const e of w) {
      let j = 0
      kol.forEach((k, n) => { if (Math.abs(srodek(e) - srodek(k)) < Math.abs(srodek(e) - srodek(kol[j]))) j = n })
      r[j] = r[j] ? `${r[j]} ${tekst(e)}` : tekst(e)
    }
    wiersze.push(r)
  }
  return wiersze
}

/** Nagłówek tabeli w linii (i sąsiednich, gdy dwupiętrowy): elementy pasujące do wzorca, blisko siebie w poziomie. */
function naglowekWLinii(linie: ElementTekstu[][], i: number, wzorzec: RegExp): ElementTekstu[] {
  const y = linie[i][0].y
  const kandydaci = linie.filter((l) => Math.abs(l[0].y - y) <= 9).flat().filter((e) => wzorzec.test(tekst(e)))
  return kandydaci.sort((a, b) => a.x - b.x)
}

function tabelaKroccow(linie: ElementTekstu[][]): KrociecRysunku[] {
  for (let i = 0; i < linie.length; i++) {
    const n = naglowekWLinii(linie, i, NAGL_KROCCE)
    const maPoz = n.some((e) => /^(poz|mark|ozn)/i.test(tekst(e)))
    const maRozmiar = n.some((e) => /^(wielko|size|dn|ø|pn|rating)/i.test(tekst(e)))
    if (n.length < 4 || !maPoz || !maRozmiar) continue
    const x0 = n[0].x - 15
    const x1 = n[n.length - 1].x + n[n.length - 1].w + 60
    const wiersze = tabelaPodNaglowkiem(linie, i, x0, x1, n)
    const krocce = krocceZTabeli(wiersze)
      .filter((k) => /\d/.test(k.oznaczenie) || /^[A-Z]\d*$/.test(k.oznaczenie))
      .map((k) => ({ ...k, uwagi: k.uwagi?.replace(/(\S+) \1:/g, '$1:') ?? null }))
    if (krocce.length >= 2) return krocce
  }
  return []
}

function wykazCzesci(linie: ElementTekstu[][], el: ElementTekstu[]): PozycjaRysunku[] {
  for (let i = 0; i < linie.length; i++) {
    const l = linie[i]
    const poz = l.find((e) => NAGL_POZ.test(tekst(e)))
    const nazwa = l.find((e) => NAGL_NAZWA.test(tekst(e)))
    const ilosc = l.find((e) => NAGL_ILOSC.test(tekst(e)))
    if (!poz || !nazwa || !ilosc) continue
    const x0 = Math.min(poz.x, nazwa.x, ilosc.x) - 15
    const prawy = l.filter((e) => e.x >= x0 && e.x - x0 < 650)
    const x1 = Math.max(...prawy.map((e) => e.x + e.w)) + 40
    // Wykaz bywa nad nagłówkiem (numeracja w górę) albo pod nim - bierzemy pas tabeli w obu kierunkach.
    const pas = el.filter((e) => e.x >= x0 && e.x + e.w <= x1 && Math.abs(e.y - l[0].y) < 700)
    const t = ulozWTabele(pas)
    const wynik = czesciZTabeli(t.wiersze)
    if (wynik.length >= 2) return wynik
  }
  return []
}

// --- Dane projektowe ----------------------------------------------------------------------------------

const PARAMETR = /^(ciśnieni|cisnieni|.*pressure|temperatur|.*temperature|mdmt|naddatek|corrosion|radiogra|badani|.*radiography|obróbka|obrobka|stress relief|pwht|pojemno|.*capacity|izolac|insulation|ciężar|ciezar|masa|.*weight|freight|bundle|wymiary|overall size|kategori|category|.*design code|normy|norma|tube diameter|tube thickness|tube length|tube pitch|number of passes|heat transfer|dno grubo|dach grubo|grubość|ciecz|fluid|medium|kontrola|wytrzymało|.*joint efficiency|malowanie|painting|type$|class$|manufacturing standard|center of gravity|liquid specific gravity)/i

function daneProjektowe(linie: ElementTekstu[][]): ParametrRysunku[] {
  const wiersze: string[][] = []
  for (const l of linie) {
    let biezacy: string[] | null = null
    let koniec = -Infinity
    for (const e of l) {
      const t = tekst(e)
      const rownosc = /^(.{3,40}?)\s*=\s*(.+)$/.exec(t)
      if (rownosc && PARAMETR.test(rownosc[1])) { wiersze.push([rownosc[1], rownosc[2]]); biezacy = null; continue }
      if (PARAMETR.test(t) && !/^\d/.test(t)) {
        biezacy = [t]
        wiersze.push(biezacy)
        koniec = e.x + e.w
        continue
      }
      if (biezacy && e.x - koniec < 160 && !/^[.-]$/.test(t)) { biezacy.push(t); koniec = e.x + e.w }
      else if (biezacy && e.x - koniec >= 160) biezacy = null
    }
  }
  const p = parametryZTabeli(wiersze.filter((r) => r.length >= 2 && r.slice(1).some((x) => !/^[.-]$/.test(x))))
  const widziane = new Set<string>()
  return p.filter((x) => { const k = `${x.nazwa}|${x.wartosc}`; if (widziane.has(k)) return false; widziane.add(k); return true })
}

/** Cały arkusz z warstwy tekstowej: wykaz części (gdy jest), tabela materiałów, króćce i dane projektowe. */
export function odczytajArkuszZTekstu(el: ElementTekstu[]): WynikRysunku {
  const linie = linieTekstu(el)
  const czesci = wykazCzesci(linie, el)
  const materialy = tabelaMaterialow(linie)
  return {
    pozycje: [...czesci, ...materialy.filter((m) => !czesci.some((c) => c.nazwa.toLowerCase() === m.nazwa.toLowerCase()))],
    krocce: tabelaKroccow(linie),
    parametry: daneProjektowe(linie),
    uwagi: [],
  }
}

/** Masa pusta / transportowa aparatu z danych projektowych (kg), jeśli rysunek ją podaje. */
export function masaZParametrow(p: ParametrRysunku[]): number | null {
  const m = p.find((x) => /ciężar pusty|ciezar pusty|masa (pusta|własna|wlasna)|empty weight|weight empty|freight/i.test(x.nazwa))
  const n = m ? Number((/[\d\s]+(?:[.,]\d+)?/.exec(m.wartosc.replace(/kg/i, ''))?.[0] ?? '').replace(/\s/g, '').replace(',', '.')) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}
