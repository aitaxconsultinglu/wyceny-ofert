// Import starej, uproszczonej "Kalkulacja.xlsx" (jeden wiersz na aparat, kolumny Kden, Kkr, Kpł, ...
// Materiały+, Dokum, Badania, UDT, Robocizna Rbh, Montaż) do nowej metody. Narzut zakupowy i stawkę
// robocizny odczytujemy z formuł (=Q5*1.05, =Z5+(AA5*120)+AB5).
import type { AparatKalk, PozycjaKalk, Zakladka } from './kalkulacja'
import { t } from '@/i18n'

export interface Komorka { v: unknown; f?: string }
export type Wiersz = (Komorka | null)[]

const tekst = (k: Komorka | null | undefined) => (k?.v === null || k?.v === undefined ? '' : String(k.v).replace(/\s+/g, ' ').trim())
const liczba = (k: Komorka | null | undefined) => (typeof k?.v === 'number' && Number.isFinite(k.v) ? k.v : 0)

/** Kolumna kosztu -> pozycja nowej metody. Kolejność jak w arkuszu. */
const MAPA: { wzor: RegExp; zakladka: Zakladka; sekcja: string | null; nazwa?: string }[] = [
  { wzor: /^Kden$/i, zakladka: 'materialy', sekcja: 'dennice', nazwa: 'Dennice' },
  { wzor: /^Kkr$/i, zakladka: 'materialy', sekcja: 'rury_krocce', nazwa: 'Króćce' },
  { wzor: /^Ksit/i, zakladka: 'materialy', sekcja: 'blachy', nazwa: 'Sita i przegrody' },
  { wzor: /^Kpł$|^Kpl$/i, zakladka: 'materialy', sekcja: 'blachy', nazwa: 'Płaszcz' },
  { wzor: /^Kkoł$|^Kkol$/i, zakladka: 'materialy', sekcja: 'kolnierze', nazwa: 'Kołnierze' },
  { wzor: /^Krurtech$/i, zakladka: 'materialy', sekcja: 'rury_technologiczne', nazwa: 'Rury technologiczne' },
  { wzor: /^Kśr$|^Ksr$/i, zakladka: 'materialy', sekcja: 'zlaczne', nazwa: 'Śruby, elementy złączne' },
  { wzor: /^Kuszcz$/i, zakladka: 'materialy', sekcja: 'uszczelki', nazwa: 'Uszczelki' },
  { wzor: /^Dokum/i, zakladka: 'projekt', sekcja: null, nazwa: 'Dokumentacja' },
  { wzor: /^Badania/i, zakladka: 'badania', sekcja: null },
  { wzor: /^Koszty UDT/i, zakladka: 'badania', sekcja: null },
  { wzor: /^Malowanie|^Zabezpieczenie|antykoroz|sekafen/i, zakladka: 'kooperacja', sekcja: 'malowanie' },
  { wzor: /^Izolacja/i, zakladka: 'kooperacja', sekcja: 'izolacja' },
  { wzor: /^Transp/i, zakladka: 'transport', sekcja: 'transport', nazwa: 'Transport' },
  { wzor: /^Inne/i, zakladka: 'inne', sekcja: null },
  { wzor: /^Montaż/i, zakladka: 'inne', sekcja: 'montaz', nazwa: 'Montaż' },
]

export interface StaraKalkulacja {
  tytul: string
  aparaty: AparatKalk[]
  narzut_zakupowy_proc: number
  /** Koszt z arkusza (kolumna "Koszt ... zł netto/szt.") - do kontroli. */
  koszty_szt: number[]
}

export function importujStaraKalkulacje(wiersze: Wiersz[]): StaraKalkulacja {
  const idxNagl = wiersze.findIndex((w) => w.some((k) => /^Urządzenie$/i.test(tekst(k))))
  if (idxNagl < 0) throw new Error(t('To nie jest stara Kalkulacja.xlsx (brak nagłówka "Urządzenie").'))
  const nagl = wiersze[idxNagl].map(tekst)
  const kol = (wzor: RegExp) => nagl.findIndex((n) => wzor.test(n))
  const kIlosc = kol(/^Ilość/i); const kMat = kol(/^Mat\./i); const kMasaAp = kol(/^Q apar/i)
  const kQ = kol(/^Materiały$/i); const kR = kol(/^Materiały \+/i)
  const kRbh = kol(/^Robocizna/i); const kKoszt = kol(/^Koszt\b.*szt|^Koszty całk/i)
  const tytul = wiersze.slice(0, idxNagl).map((w) => w.map(tekst).filter(Boolean).join(' ')).filter(Boolean).join(' ')

  let narzutZak = 0
  const aparaty: AparatKalk[] = []
  const koszty: number[] = []
  for (const w of wiersze.slice(idxNagl + 1)) {
    const nazwa = tekst(w[0])
    if (!nazwa || liczba(w[kIlosc]) <= 0) continue
    const q = liczba(w[kQ]); const r = liczba(w[kR])
    if (q > 0 && r > 0) narzutZak = Math.round((r / q - 1) * 10000) / 100
    const pozycje: PozycjaKalk[] = []
    nagl.forEach((n, i) => {
      const m = MAPA.find((x) => x.wzor.test(n))
      const wart = liczba(w[i])
      if (!m || !wart) return
      pozycje.push({ zakladka: m.zakladka, sekcja: m.sekcja, nazwa: m.nazwa ?? n.replace(/\s*\(.*\)\s*$/, '').trim(), ilosc: 1, jm: 'kpl', cena_jedn: wart, jednostka_ceny: 'jm', wartosc_reczna: wart, cena_za_komplet: true })
    })
    // Stawka z formuły kolumny kosztu: =Z5+(AA5*120)+AB5
    const rbh = liczba(w[kRbh])
    const formula = w[kKoszt]?.f ?? ''
    let stawka = Number(/\*\s*(\d+(?:\.\d+)?)/.exec(formula)?.[1] ?? NaN)
    if (!Number.isFinite(stawka) && rbh > 0) {
      const montaz = liczba(w[kol(/^Montaż/i)])
      stawka = (liczba(w[kKoszt]) - liczba(w[kol(/^Koszty mat/i)]) - montaz) / rbh
    }
    if (rbh > 0) pozycje.push({ zakladka: 'robocizna', sekcja: null, nazwa: 'Robocizna', ilosc: rbh, jm: 'rbh', cena_jedn: stawka, jednostka_ceny: 'jm' })
    // Stary format nie znał naddatków technologicznych - zerujemy domyślne z kategorii.
    const naddatki = Object.fromEntries(pozycje.filter((p) => p.zakladka === 'materialy').map((p) => [p.sekcja!, 0]))
    aparaty.push({
      nazwa, ilosc: liczba(w[kIlosc]), masa_netto_kg: liczba(w[kMasaAp]) || null, metoda_robocizny: 'szczegolowa',
      wskaznik_rbh_t: null, stawka_wskaznikowa: null, liczba_osob: 8, naddatki, pozycje,
    })
    void kMat
    koszty.push(liczba(w[kKoszt]))
  }
  return { tytul, aparaty, narzut_zakupowy_proc: narzutZak, koszty_szt: koszty }
}

/** Materiał wiodący z kolumny "Mat. S/T". */
export function materialyZeStarejKalkulacji(wiersze: Wiersz[]): string[] {
  const idx = wiersze.findIndex((w) => w.some((k) => /^Urządzenie$/i.test(tekst(k))))
  const k = wiersze[idx]?.findIndex((x) => /^Mat\./i.test(tekst(x))) ?? -1
  return wiersze.slice(idx + 1).filter((w) => tekst(w[0]) && liczba(w[1]) > 0).map((w) => tekst(w[k]))
}

/** Z notatki Word starej wyceny: narzut %, "Całkowita kwota" i "Łącznie" (do zaokrąglenia). */
export function narzutZNotatki(linie: string[]) {
  const t = linie.map((l) => l.replace(/\s+/g, ' ').trim())
  const kw = (re: RegExp) => {
    const l = t.find((x) => re.test(x))
    const m = l ? [...l.matchAll(/(\d[\d\s ]*(?:,\d+)?)\s*,?-?\s*zł/g)] : []
    return m.length ? Number(m[0][1].replace(/[\s ]/g, '').replace(',', '.')) : null
  }
  const zysk = Number(/Narzut\s*(\d+(?:,\d+)?)\s*%/i.exec(t.find((x) => /^Narzut/i.test(x)) ?? '')?.[1]?.replace(',', '.') ?? NaN)
  return { zysk: Number.isFinite(zysk) ? zysk : null, razem: kw(/^(Całkowita kwota|Razem)/i), lacznie: kw(/^Łącznie/i) }
}
