// Etap 1 - wycena materiałowa: rysunki zapytania -> lista materiałów i parametry projektu -> wycena samych materiałów
// z cenami z kart dostawy Optimy i ofert na materiały zebranych do tego zapytania. Bez AI: rysunki z CAD są czytane
// z warstwy tekstowej (odczytTekstowy.ts), a skany - z odczytów zapisanych wcześniej w module "Rysunki i listy"
// (tam odczyt przez AI z potwierdzeniem kosztu). Każdy aparat dostaje stały zestaw elementów z szablonu typu.
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { komunikatPL } from './config'
import { cennikEtapu1, dobierzCene, wczytajCeny } from './bazaCen'
import { dokumentyZapytania } from './analizaZapytania'
import { listaZRysunku, type KrociecRysunku, type ParametrRysunku, type PozycjaRysunku, type WynikRysunku } from './rysunki'
import { infoStrony, otworzRysunek, tekstStrony } from './rysunkiPdf'
import { masaZParametrow, odczytajArkuszZTekstu } from './odczytTekstowy'
import { pozycjeZListy } from './importListy'
import { BUCKET } from './magazyn'
import { klucz, nowyAparat, wczytajWycene, zapiszWycene, type PozycjaWyceny } from './wyceny'
import { elementPozycji, szablonDlaTypu, ulozWgSzablonu, wierszElementu, type Szablon } from './szablony'
import type { Gatunek } from './types'
import { t } from '@/i18n'

const STRON_NA_RYSUNEK = 3
const MIN_ELEMENTOW_TEKSTU = 30
const ZNACZNIK_TABELI = 'tabela materiałów rysunku'

export interface RaportWycenyMaterialowej {
  wycena_id: string
  wersja: number
  stron_tekst: number
  skany_bez_odczytu: string[]
  pozycji: number
  z_oferty_zapytania: number
  z_optimy: number
  /** W tym ceny innego gatunku tej samej grupy stali (gatunku z rysunku nie ma w zakupach) - do potwierdzenia ofertą. */
  z_innego_gatunku: number
  bez_ceny: number
  braki_szablonu: string[]
  masa_z_rysunku: number | null
  parametrow: number
  krocow: number
}

type Postep = (opis: string) => void

/** Odczyt z warstwy tekstowej zapisany jako odczyt rysunku (powtórne uruchomienie aktualizuje ten sam wpis). */
async function odczytajRysunkiTekstowo(zapytanieId: string, postep: Postep, db: SupabaseClient) {
  const rysunki = (await dokumentyZapytania(zapytanieId, db)).filter((d) => d.typ === 'rysunek' && d.sciezka && d.stan === 'zapisany' && /\.pdf$/i.test(d.nazwa_pliku))
  let stron = 0
  const skany: string[] = []
  for (const d of rysunki) {
    postep(t('Rysunek {0}...', d.nazwa_pliku))
    const { data: plik } = await db.storage.from(BUCKET).download(d.sciezka!)
    if (!plik) continue
    const pdf = await otworzRysunek(new Uint8Array(await plik.arrayBuffer()))
    for (let nr = 1; nr <= Math.min(pdf.numPages, STRON_NA_RYSUNEK); nr++) {
      const info = await infoStrony(pdf, nr)
      if (info.elementowTekstu < MIN_ELEMENTOW_TEKSTU) { skany.push(`${d.nazwa_pliku}, str. ${nr}`); continue }
      const w = odczytajArkuszZTekstu(await tekstStrony(pdf, nr))
      if (!w.pozycje.length && !w.krocce.length && !w.parametry.length) continue
      stron++
      const wiersz = {
        zapytanie_id: zapytanieId, dokument_id: d.id, nazwa_pliku: d.nazwa_pliku, strona: nr, obszary: [{ id: 'caly', rodzaj: 'czesci', x: 0, y: 0, w: 1, h: 1 }],
        wynik: w, zrodlo: 'tekst', model: 'arkusz z warstwy tekstowej',
      }
      const { data: ist } = await db.from('odczyty_rysunkow').select('id').eq('zapytanie_id', zapytanieId).eq('nazwa_pliku', d.nazwa_pliku).eq('strona', nr).eq('model', 'arkusz z warstwy tekstowej').limit(1)
      if (ist?.[0]) await db.from('odczyty_rysunkow').update({ wynik: w }).eq('id', ist[0].id)
      else await db.from('odczyty_rysunkow').insert(wiersz)
    }
  }
  return { stron, skany }
}

/** Wszystkie odczyty zapytania połączone: wykaz części z ilościami (najnowszy odczyt strony, który go ma), tabela materiałów, króćce, parametry. */
export async function zebraneOdczyty(zapytanieId: string, db: SupabaseClient = supabase) {
  const { data } = await db.from('odczyty_rysunkow').select('nazwa_pliku, strona, nazwa, wynik, zmodyfikowano').eq('zapytanie_id', zapytanieId).order('zmodyfikowano', { ascending: false })
  const odczyty = (data ?? []) as { nazwa_pliku: string; strona: number; nazwa: string | null; wynik: WynikRysunku }[]
  const czesci: { plik: string; pozycje: PozycjaRysunku[] }[] = []
  const materialy: PozycjaRysunku[] = []
  const krocce: KrociecRysunku[] = []
  const parametry: ParametrRysunku[] = []
  const strony = new Set<string>()
  const podpisy = new Set<string>()
  for (const o of odczyty) {
    // Najnowszy odczyt strony - osobno dla każdej nazwanej tabeli (kilka tabel na jednym arkuszu).
    const k = `${o.nazwa_pliku}:${o.strona}:${o.nazwa ?? ''}`
    const zIloscia = o.wynik.pozycje.filter((p) => p.uwagi !== ZNACZNIK_TABELI && p.ilosc !== null)
    const podpis = zIloscia.map((p) => `${p.poz}|${p.nazwa}`.toLowerCase()).sort().join('\n')
    if (zIloscia.length && !strony.has(k) && !podpisy.has(podpis)) { czesci.push({ plik: `${o.nazwa_pliku}, str. ${o.strona}`, pozycje: zIloscia }); strony.add(k); podpisy.add(podpis) }
    for (const m of o.wynik.pozycje.filter((p) => p.uwagi === ZNACZNIK_TABELI)) if (!materialy.some((x) => x.nazwa === m.nazwa && x.material === m.material)) materialy.push(m)
    if (!krocce.length && o.wynik.krocce.length) krocce.push(...o.wynik.krocce)
    for (const p of o.wynik.parametry) if (!parametry.some((x) => x.nazwa === p.nazwa && x.wartosc === p.wartosc)) parametry.push(p)
  }
  return { czesci, materialy, krocce, parametry }
}

/** Pierwsza liczba z tekstu rysunku; kropka i przecinek to separator dziesiętny ("2.6" i "2,6" = 2,6 mm). */
export const liczbaZ = (s: string | null | undefined) => {
  const m = /-?\d+(?:[.,]\d+)?/.exec(s ?? '')
  return m ? Number(m[0].replace(',', '.')) : null
}
const wUwagach = (k: KrociecRysunku, nazwa: RegExp) => {
  const m = new RegExp(`(?:^|; )(?:${nazwa.source})[^:]*:\\s*([^;]+)`, 'i').exec(k.uwagi ?? '')
  return m ? m[1].trim() : null
}

/** Rury i kołnierze króćców z tabeli króćców (włazy osobno); wiersze bez wielkości (drabiny, poręcze) pominięte. */
export function pozycjeZKroccow(krocce: KrociecRysunku[], gatunekRury: string | null, gatunekKolnierza: string | null, s: Szablon): PozycjaWyceny[] {
  const wynik: PozycjaWyceny[] = []
  for (const k of krocce) {
    const ilosc = k.ilosc ?? 1
    const opisNalezy = `${k.oznaczenie}${k.przeznaczenie ? ` (${k.przeznaczenie.toLowerCase()})` : ''}`
    if (/właz|wlaz|manhole/i.test(`${k.przeznaczenie ?? ''} ${k.pn ?? ''} ${k.dn ?? ''}`)) {
      if (s.elementy.some((e) => e.kod === 'wlazy')) {
        wynik.push({ klucz: klucz(), lp: 0, zakladka: 'materialy', sekcja: 'inne', nazwa: `Właz ${k.dn ?? ''} - poz. ${k.oznaczenie}`.trim(), ilosc, jm: 'szt', cena_jedn: 0, jednostka_ceny: 'jm', zrodlo_ceny: 'recznie', dn: k.dn, uwagi: 'z tabeli króćców', dodatkowe: { element: 'wlazy' } })
      }
      continue
    }
    const d = liczbaZ(wUwagach(k, /ø|średnica|diam|od/))
    const g = liczbaZ(wUwagach(k, /grub|thk|thick|wall/))
    const maPn = /\d/.test(k.pn ?? '')
    if (!d && !maPn) continue
    if (d) {
      wynik.push({
        klucz: klucz(), lp: 0, zakladka: 'materialy', sekcja: 'rury_krocce', nazwa: `Rura króćca ${k.dn ?? ''} Ø${d}${g ? `x${g}` : ''} - poz. ${opisNalezy}, ${ilosc} szt.`.replace(/\s+/g, ' '),
        gatunek: gatunekRury, d_zew: d, grubosc: g, ilosc: 0, jm: 'm', cena_jedn: 0, jednostka_ceny: 'm', zrodlo_ceny: 'recznie', dn: k.dn,
        uwagi: `z tabeli króćców; ${ilosc} szt. - podaj długość [m]${wUwagach(k, /sch/) ? `; SCH ${wUwagach(k, /sch/)}` : ''}`, dodatkowe: { element: 'krocce' },
      })
    }
    if (maPn) {
      wynik.push({
        klucz: klucz(), lp: 0, zakladka: 'materialy', sekcja: 'kolnierze', nazwa: `Kołnierz ${k.dn ?? ''} ${/^\d+$/.test((k.pn ?? '').trim()) ? `${k.pn}#` : k.pn ?? ''} ${k.przylacze ?? ''} - poz. ${opisNalezy}`.replace(/\s+/g, ' '),
        gatunek: gatunekKolnierza, ilosc, jm: 'szt', cena_jedn: 0, jednostka_ceny: 'jm', zrodlo_ceny: 'recznie', dn: k.dn, pn: k.pn,
        uwagi: 'z tabeli króćców', dodatkowe: { element: 'kolnierze' },
      })
    }
  }
  return wynik
}

/** Rurki wymiennika: wymiary z danych projektowych (średnica, grubość, długość rurek), liczba rurek - do uzupełnienia. */
function wymiaryRurek(p: ParametrRysunku[]) {
  const z = (w: RegExp) => liczbaZ(p.find((x) => w.test(x.nazwa))?.wartosc)
  return { d_zew: z(/tube diameter|średnica rur/i), grubosc: z(/tube thickness|grubość rur/i), dlugosc: z(/tube length|długość rur/i) }
}

/**
 * Wycena materiałowa jednym przyciskiem: odczyt rysunków z CAD (bez AI), lista materiałów wg szablonu typu aparatu,
 * ceny z cennika etapu 1, masa pusta z rysunku. Tworzy nową wersję wyceny "Wycena materiałowa".
 */
export async function przygotujWyceneMaterialowa(
  z: { id: string; przedmiot: string; status: string }, typ: string, gatunki: Gatunek[], postep: Postep, db: SupabaseClient = supabase,
): Promise<RaportWycenyMaterialowej> {
  const s = szablonDlaTypu(typ)
  if (!s) throw new Error(t('Brak szablonu dla typu "{0}" - etap 1 obejmuje wymienniki i zbiorniki.', typ))
  const odczyt = await odczytajRysunkiTekstowo(z.id, postep, db)
  postep(t('Lista materiałów...'))
  const { czesci, materialy, krocce, parametry } = await zebraneOdczyty(z.id, db)
  // Skany bez odczytu: strony, dla których nie ma żadnego zapisanego odczytu (np. AI w module Rysunki i listy).
  const { data: zapisane } = await db.from('odczyty_rysunkow').select('nazwa_pliku, strona').eq('zapytanie_id', z.id)
  const skanyBez = odczyt.skany.filter((x) => !(zapisane ?? []).some((o) => x === `${o.nazwa_pliku}, str. ${o.strona}`))

  // 1. Wykaz części z ilościami (CAD albo odczyt AI skanu) -> pozycje.
  let pozycje: PozycjaWyceny[] = czesci.flatMap((c) => pozycjeZListy(listaZRysunku(c.pozycje), `rysunek ${c.plik}`))
  // 2. Króćce z tabeli króćców (rury + kołnierze), gdy wykaz ich nie zawiera.
  const gatunekDla = (kod: string) => materialy.find((m) => elementPozycji({ nazwa: m.nazwa, sekcja: m.sekcja, dodatkowe: {} }, s)?.kod === kod)?.material?.replace(/\s*\(lub zastępczy\)/i, '') ?? null
  const maKrocce = pozycje.some((p) => elementPozycji(p, s)?.kod === 'krocce')
  if (!maKrocce) pozycje.push(...pozycjeZKroccow(krocce, gatunekDla('krocce'), gatunekDla('kolnierze'), s))
  // 3. Elementy szablonu bez pozycji: wymagane zawsze, opcjonalne - gdy rysunek je wymienia (tabela materiałów).
  const braki: string[] = []
  // Konstrukcja bez gatunku w tabeli materiałów: zwykle z tej samej stali co płaszcz (do potwierdzenia).
  const gatunekPlaszcza = gatunekDla('plaszcz')
  for (const e of s.elementy) {
    if (pozycje.some((p) => elementPozycji(p, s)?.kod === e.kod)) continue
    const zTabeli = materialy.filter((m) => elementPozycji({ nazwa: m.nazwa, sekcja: m.sekcja, dodatkowe: {} }, s)?.kod === e.kod)
    if (!e.wymagany && !zTabeli.length) continue
    const w = wierszElementu(e, zTabeli[0]?.material?.replace(/\s*\(lub zastępczy\)/i, '') ?? null)
    if (zTabeli.length) w.uwagi = `rysunek: ${zTabeli.map((m) => `${m.nazwa} - ${m.material}`).join('; ')}; ${w.uwagi}`
    if (e.kod === 'rurki') Object.assign(w, wymiaryRurek(parametry))
    if (!w.gatunek && e.jednostka_ceny === 'kg' && gatunekPlaszcza) {
      w.gatunek = gatunekPlaszcza
      w.uwagi = `gatunek jak płaszcz (rysunek go nie podaje); ${w.uwagi}`
    }
    pozycje.push(w)
    braki.push(e.nazwa)
  }
  pozycje = ulozWgSzablonu(pozycje, s).map((p, i) => ({ ...p, lp: i + 1 }))

  // 4. Ceny: zakupy z Optimy i oferty na materiały do tego zapytania.
  postep(t('Ceny z kart dostawy Optimy i ofert do zapytania...'))
  const { wiersze, blad } = await wczytajCeny({ zakupy: true }, db)
  if (blad) throw new Error(blad)
  const cennik = cennikEtapu1(wiersze, z.id)
  let zOferty = 0
  let zOptimy = 0
  let zInnego = 0
  for (const p of pozycje) {
    // Wiersz szablonu liczony w sztukach/kompletach (śruby, uszczelki, kołnierze, dennice) bez wielkości - cena
    // zależy od rozmiaru, więc jej nie zgadujemy (cena z oferty albo z Optimy po wpisaniu DN / wymiarów).
    const szablonowy = (p.dodatkowe as { szablon?: boolean } | undefined)?.szablon
    if (szablonowy && p.jednostka_ceny === 'jm' && !p.dn && !p.d_zew) continue
    if (szablonowy && !p.gatunek) continue
    const c = dobierzCene({ sekcja: p.sekcja ?? null, gatunek: p.gatunek, d_zew: p.d_zew, grubosc: p.grubosc, dn: p.dn, jednostka_ceny: p.jednostka_ceny }, cennik, gatunki, false, undefined, z.id, true)
    if (!c) continue
    const { dopasowanie, jm_zrodla: _j, ilosc_zrodla: _i, ...cena } = c
    void _j; void _i
    Object.assign(p, cena)
    if (dopasowanie === 'przyblizone') p.uwagi = [p.uwagi, 'cena przybliżona (kategoria + gatunek, bez wymiarów)'].filter(Boolean).join('; ')
    if (dopasowanie === 'inny_gatunek') {
      p.uwagi = [p.uwagi, `cena zastępcza: ${c.zrodlo_opis?.slice(0, 60) ?? 'inny gatunek'} - gatunku z rysunku nie ma w zakupach, potwierdź ofertą`].filter(Boolean).join('; ')
      zInnego++
    }
    if (cena.zrodlo_ceny === 'oferta') zOferty++; else zOptimy++
  }

  // 5. Nowa wersja wyceny z jednym aparatem.
  postep(t('Zapis wyceny...'))
  const { data: wid, error } = await db.rpc('nowa_wycena', { p_zapytanie: z.id, p_nazwa: 'Wycena materiałowa' })
  if (error) throw new Error(komunikatPL(error.message))
  const st = await wczytajWycene(wid as string, db)
  const masa = masaZParametrow(parametry)
  st.aparaty = [{
    ...(st.aparaty[0] ?? nowyAparat(1)), nazwa: z.przedmiot || s.nazwa, typ, ilosc: 1, masa_netto_kg: masa,
    material_wiodacy: pozycje.find((p) => elementPozycji(p, s)?.kod === 'plaszcz')?.gatunek ?? null,
    metoda_robocizny: 'wskaznikowa', wskaznik_rbh_t: null, stawka_wskaznikowa: null, pozycje,
    uwagi: masa ? `Masa pusta z rysunku: ${masa} kg.` : null,
  }]
  st.wycena.uwagi = `Wycena materiałowa (etap 1): lista z rysunków wg szablonu „${s.nazwa}”, ceny z kart dostawy Optimy i ofert do tego zapytania.`
  await zapiszWycene(st, false, db)
  if (['nowe', 'w_analizie', 'zapytania_do_dostawcow'].includes(z.status)) await db.from('zapytania').update({ status: 'kalkulacja' }).eq('id', z.id)

  return {
    wycena_id: wid as string, wersja: st.wycena.wersja, stron_tekst: odczyt.stron, skany_bez_odczytu: skanyBez,
    pozycji: pozycje.length, z_oferty_zapytania: zOferty, z_optimy: zOptimy, z_innego_gatunku: zInnego, bez_ceny: pozycje.length - zOferty - zOptimy,
    braki_szablonu: braki, masa_z_rysunku: masa, parametrow: parametry.length, krocow: krocce.length,
  }
}
