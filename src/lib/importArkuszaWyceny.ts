// Import historycznej wyceny w formacie dotychczasowego arkusza wyceny (.xls, zakładki: Opinia, Pracochłonność,
// Materiały, Kooperacja, "Badania, odb, trans") do nowej metody (AparatKalk). Używane przez seed
// i test lokalny, który sprawdza, że nowa metoda odtwarza wynik arkusza co do grosza.
import type { AparatKalk, PozycjaKalk, Zakladka } from './kalkulacja'
import type { WierszArkusza } from './importOptima'
import { t } from '@/i18n'

const tekst = (k: WierszArkusza[number]) => (k === null || k === undefined ? '' : String(k).replace(/\s+/g, ' ').trim())
const liczba = (k: WierszArkusza[number]) => (typeof k === 'number' && Number.isFinite(k) ? k : null)

/** Sekcje arkusza "Materiały" -> kategorie materiałów nowej metody. */
const SEKCJE: [RegExp, string][] = [
  [/^Materiały hutnicze/i, 'blachy'],
  [/^Kołnierze/i, 'odkuwki'],
  [/^Rury/i, 'rury_technologiczne'],
  [/^Elementy złączne/i, 'zlaczne'],
  [/^Uszczelki/i, 'uszczelki'],
  [/^Materiały spawalnicze/i, 'spawalnicze'],
  [/^Antykorozja/i, 'antykorozyjne'],
]

export interface WycenaZArkusza {
  nazwa: string
  aparat: AparatKalk
  narzut_zysk_proc: number
  kurs_eur: number | null
  /** Wartości z zakładki Opinia - do porównania z nową metodą. */
  oczekiwane: { robocizna: number; materialy: number; kooperacja: number; badania: number; koszty: number; zysk: number; cena: number; cena_eur: number | null; masa_brutto: number | null }
}

function znajdz(w: WierszArkusza[], wzor: RegExp, kol = 0) {
  return w.find((r) => wzor.test(tekst(r[kol])))
}

export function importujArkuszWyceny(arkusze: Record<string, WierszArkusza[]>): WycenaZArkusza {
  const op = arkusze['Opinia'] ?? []
  const mat = arkusze['Materiały'] ?? []
  const prac = arkusze['Pracochłonność'] ?? []
  const koop = arkusze['Kooperacja'] ?? []
  const bad = arkusze['Badania, odb, trans'] ?? []
  if (!op.length || !mat.length) throw new Error(t('To nie jest arkusz w formacie arkusza wyceny (brak zakładek Opinia / Materiały).'))

  const nazwa = tekst(mat[0]?.[0]) || tekst(znajdz(op, /^Przedmiot zapytania/)?.[0])
  const wierszMasy = znajdz(op, /^Ciężar NETTO/)
  const masa = liczba(wierszMasy?.[3]) ?? 0
  const ilosc = liczba(wierszMasy?.[7]) ?? 1
  const wartoscOp = (wzor: RegExp) => liczba(znajdz(op, wzor)?.[5]) ?? 0
  const zysk = liczba(znajdz(op, /^Zakładany zysk/)?.[3]) ?? 0
  const kurs = liczba(znajdz(op, /^1EUR/)?.[2])

  const pozycje: PozycjaKalk[] = []
  const naddatki: Record<string, number> = {}

  // --- Materiały: sekcje, wiersze z kosztem w kol. 15 (koszt całkowity), naddatek w kol. 10 ---
  let sekcja: string | null = null
  for (const r of mat) {
    const c0 = tekst(r[0]); const nazwaPoz = tekst(r[1])
    const nowa = SEKCJE.find(([w]) => w.test(c0))
    if (nowa) { sekcja = nowa[1]; continue }
    if (!sekcja || /^RAZEM|^Dla |^KOSZT|^Ciężar|^L\.p\./i.test(c0)) {
      if (/^RAZEM/i.test(c0)) sekcja = sekcja === 'antykorozyjne' ? null : sekcja
      continue
    }
    if (/^Naddatki technologiczne/i.test(nazwaPoz)) {
      naddatki[sekcja] = (liczba(r[10]) ?? 0) * 100
      continue
    }
    const koszt = liczba(r[15])
    if (/^Koszty zakupu/i.test(nazwaPoz) || koszt === null || (koszt === 0 && !nazwaPoz)) continue
    if (koszt === 0 && !(liczba(r[13]) ?? 0)) continue
    const iloscPoz = liczba(r[10]) ?? 0
    // W sekcji antykorozji kolumny 12-13 to zapotrzebowanie farby (m²/L), a nie masa.
    const masaJedn = sekcja === 'antykorozyjne' ? null : liczba(r[12])
    const masaCalk = sekcja === 'antykorozyjne' ? 0 : liczba(r[13]) ?? 0
    const iloscEf = iloscPoz > 0 ? iloscPoz : 1
    pozycje.push({
      zakladka: 'materialy', sekcja, nazwa: nazwaPoz || tekst(r[2]), gatunek: tekst(r[3]) || null,
      d_zew: liczba(r[4]), d_wew: liczba(r[5]), grubosc: liczba(r[7]), szerokosc: liczba(r[8]), dlugosc: liczba(r[9]),
      ilosc: iloscEf, jm: tekst(r[11]) || 'kpl',
      masa_jedn: masaJedn && masaJedn > 0 ? masaJedn : masaCalk > 0 ? masaCalk / iloscEf : null, masa_reczna: true,
      cena_jedn: liczba(r[14]) ?? 0, jednostka_ceny: 'jm', wartosc_reczna: koszt, cena_za_komplet: true,
    })
  }

  // --- Pracochłonność: szczegółowa (wiersze L.p. z rbg) albo przyjęta wskaźnikowa ---
  const wskaznik = liczba(znajdz(prac, /^Wskaźnik pracochłonności/, 1)?.[5])
  const stawka = liczba(znajdz(prac, /^Stawka/, 1)?.[5])
  const wierszDni = prac.find((r) => /dni \d+ osob/.test(tekst(r[11])))
  const osoby = Number(/dni (\d+) osob/.exec(tekst(wierszDni?.[11]))?.[1] ?? 8)
  const wierszeSzcz = prac.filter((r) => typeof r[0] === 'number' && (liczba(r[2]) ?? 0) > 0 && (liczba(r[5]) ?? 0) > 0)
  const szczegolowa = wierszeSzcz.length > 0 && !wskaznik
  for (const r of wierszeSzcz) {
    pozycje.push({ zakladka: 'robocizna', sekcja: null, nazwa: tekst(r[1]) || tekst(r[3]) || 'robocizna', ilosc: liczba(r[2])!, jm: 'rbh', cena_jedn: liczba(r[4]) ?? 0, jednostka_ceny: 'jm', wartosc_reczna: liczba(r[5]) })
  }

  // --- Kooperacja: wiersze z kwotą w kol. 8 ---
  const startK = koop.findIndex((r) => /^L\.p\./.test(tekst(r[0])))
  for (const r of koop.slice(startK + 1)) {
    if (/^RAZEM/i.test(tekst(r[0]))) break
    const wartosc = liczba(r[8]); const nazwaK = tekst(r[1])
    if (!nazwaK || !wartosc) continue
    pozycje.push({ zakladka: 'kooperacja', sekcja: null, nazwa: nazwaK, ilosc: liczba(r[6]) ?? 1, jm: 'szt', cena_jedn: liczba(r[7]) ?? 0, jednostka_ceny: 'jm', wartosc_reczna: wartosc })
  }

  // --- Badania, odbiory, projekt, transport ---
  let zakladka: Zakladka | null = null
  for (const r of bad) {
    const c0 = tekst(r[0])
    if (/^Projekt$/i.test(c0)) { zakladka = 'projekt'; continue }
    if (/^Badania i odbiory/i.test(c0)) { zakladka = 'badania'; continue }
    if (/^Transport/i.test(c0)) { zakladka = 'transport'; continue }
    if (/^RAZEM|^Dla /i.test(c0)) { if (/^RAZEM Transport/i.test(c0)) zakladka = null; continue }
    if (!zakladka || typeof r[0] !== 'number') continue
    const wartosc = liczba(r[5]); const nazwaB = tekst(r[1])
    if (!wartosc) continue
    if (zakladka === 'transport') {
      pozycje.push({ zakladka, sekcja: 'transport', nazwa: nazwaB || 'transport', ilosc: liczba(r[3]) ?? 1, jm: 'kurs', cena_jedn: liczba(r[4]) ?? 0, jednostka_ceny: 'jm', wartosc_reczna: wartosc, dodatkowe: { km: liczba(r[2]) } })
    } else {
      pozycje.push({ zakladka, sekcja: null, nazwa: nazwaB, ilosc: liczba(r[2]) ?? 1, jm: tekst(r[3]) || 'kpl', cena_jedn: liczba(r[4]) ?? 0, jednostka_ceny: 'jm', wartosc_reczna: wartosc })
    }
  }

  const aparat: AparatKalk = {
    nazwa, ilosc, masa_netto_kg: masa,
    metoda_robocizny: szczegolowa ? 'szczegolowa' : 'wskaznikowa',
    wskaznik_rbh_t: wskaznik, stawka_wskaznikowa: stawka, liczba_osob: osoby,
    naddatki, pozycje,
  }
  const cenaEur = liczba(znajdz(op, /^1EUR/)?.[5])
  return {
    nazwa, aparat, narzut_zysk_proc: zysk * 100, kurs_eur: kurs,
    oczekiwane: {
      robocizna: wartoscOp(/^Robocizna/), materialy: wartoscOp(/^Materiały/), kooperacja: wartoscOp(/^Kooperacja/),
      badania: wartoscOp(/^Badania, odbiory/), koszty: wartoscOp(/^Koszty całkowite/), zysk: wartoscOp(/^Zakładany zysk/),
      cena: wartoscOp(/^CENA/), cena_eur: cenaEur, masa_brutto: liczba(znajdz(mat, /^Ciężar BRUTTO/)?.[3]),
    },
  }
}
