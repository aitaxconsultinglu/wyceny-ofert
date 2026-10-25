// Automatyczne przygotowanie wstępnej wyceny i projektu oferty z karty analizy i odczytów rysunków.
// Część czysta (testy w repo na danych fikcyjnych): aparaty, przypisanie list do aparatów, wskaźnik rbh/t,
// klauzule oferty dobrane do wymagań kosztotwórczych i lista punktów do weryfikacji przez pracownika.
import type { AparatAnalizy, KartaAnalizy, PunktWeryfikacji } from './analiza'
import type { StanWyceny } from './wyceny'
import { policzPozycje, type ParametryKalk } from './kalkulacja'
import { PROG_PEWNOSCI } from './rysunki'
import { wiekMiesiecy } from './bazaCen'
import { t } from '@/i18n'

/** Aparaty z karty analizy; bez nich - jeden aparat z przedmiotu zapytania. */
export function aparatyZKarty(k: KartaAnalizy | null, przedmiot: string): AparatAnalizy[] {
  const z = (k?.aparaty ?? []).filter((a) => a.nazwa.trim() || a.masa_kg)
  if (z.length) return z
  const p = k?.podsumowanie
  return [{ nazwa: p?.przedmiot?.trim() || przedmiot || 'Aparat 1', typ: null, ilosc: p?.ilosc_szt || 1, masa_kg: p?.masa_kg ?? null, srednica_mm: null, dlugosc_mm: null, wysokosc_mm: null, material: null }]
}

const tokeny = (s: string) => new Set((s.toUpperCase().match(/[A-Z0-9]+(?:[-/][A-Z0-9]+)*/g) ?? []).filter((t) => t.length >= 3 && /\d/.test(t)))

const bezRozszerzenia = (s: string) => s.trim().toLowerCase().replace(/\.[a-z0-9]+$/i, '')

/**
 * Do którego aparatu należy odczyt rysunku: plik wskazany przy aparacie w analizie (rysunek "RYS-110" może być
 * zbiornika "Z-1"), albo wspólne oznaczenie w nazwie pliku i nazwie aparatu ("SEP-0001.pdf" ↔ "Separator SEP-0001").
 * null - brak dopasowania.
 */
export function dopasujAparat(plik: string, aparaty: { nazwa: string; rysunki?: string[] }[]): number | null {
  const p = bezRozszerzenia(plik)
  const wskazany = aparaty.findIndex((a) => (a.rysunki ?? []).some((r) => bezRozszerzenia(r) === p))
  if (wskazany >= 0) return wskazany
  const t = tokeny(plik.replace(/\.[a-z0-9]+$/i, ''))
  const i = aparaty.findIndex((a) => [...tokeny(a.nazwa)].some((x) => t.has(x) || [...t].some((y) => y.includes(x) || x.includes(y))))
  return i >= 0 ? i : null
}

/** Aparat dla każdego odczytu; bez dopasowania - pierwszy (raport każe to sprawdzić). */
export function przypiszOdczyty(pliki: string[], aparaty: { nazwa: string; rysunki?: string[] }[]): number[] {
  return pliki.map((plik) => dopasujAparat(plik, aparaty) ?? 0)
}

const jmKlucz = (j: string | null | undefined) => (j ?? '').toLowerCase().trim().replace(/\.$/, '')

/**
 * Cena usługi z oferty jest za jednostkę oferty. Gdy oferta jest ryczałtem ("1 kpl"), a w wycenie ilość jest w sztukach
 * (np. "806 rurek"), cena pomnożona przez ilość byłaby wielokrotnie za wysoka - pozycja staje się "1 kpl" w cenie oferty,
 * a pierwotna ilość trafia do uwag. Inna niezgodność jednostek (np. oferta za m², pozycja w kpl) - uwaga do sprawdzenia.
 */
export function ujednolicJednostkeUslugi(p: { ilosc: number; jm: string; uwagi?: string | null }, jmOferty?: string, iloscOferty?: number) {
  if (!jmOferty) return
  const jo = jmKlucz(jmOferty)
  const jp = jmKlucz(p.jm)
  if (jo === jp) return
  const dopisz = (t: string) => { p.uwagi = [p.uwagi, t].filter(Boolean).join('; ') }
  if (['kpl', 'komplet', 'ryczałt', 'usł', 'usługa', 'usluga'].includes(jo) && (iloscOferty ?? 1) <= 1) {
    dopisz(`ilość w zapytaniu: ${p.ilosc} ${p.jm} - oferta ryczałtowa`)
    p.ilosc = 1
    p.jm = 'kpl'
  } else {
    dopisz(`jednostka oferty: ${jmOferty} - sprawdź ilość`)
  }
}

/** Mediana wskaźników rbh/t (podobne projekty i wyceny) - odporna na pojedyncze nietypowe zlecenia. */
export function medianaRbhT(wartosci: (number | null | undefined)[]): number | null {
  const l = wartosci.map(Number).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b)
  if (!l.length) return null
  const m = Math.floor(l.length / 2)
  return Math.round((l.length % 2 ? l[m] : (l[m - 1] + l[m]) / 2) * 10) / 10
}

export interface KlauzulaBazy { kategoria: 'obejmuje' | 'nie_obejmuje' | 'uwagi'; tekst: string; tagi: string[]; kolejnosc: number }

/**
 * Klauzule oferty z karty analizy: zawsze wykonanie, materiał (z udarnością, gdy wymagana) i dokumentacja;
 * do tego klauzule dla wymagań "wymagane" (UDT, NDT, próba, antykorozja, izolacja, transport, montaż),
 * "nie obejmuje" dla izolacji / montażu oznaczonych "nie dotyczy" i uwagi (termin, PED gdy nie dotyczy).
 */
export function klauzuleZAnalizy(k: KartaAnalizy | null, klauzule: KlauzulaBazy[]) {
  const posort = [...klauzule].sort((a, b) => a.kolejnosc - b.kolejnosc)
  const stan = (kod: string) => k?.wymagania.find((w) => w.kod === kod)
  const wymagane = (kod: string) => stan(kod)?.stan === 'wymagane'
  const pierwsza = (kat: KlauzulaBazy['kategoria'], f: (x: KlauzulaBazy) => boolean) => posort.find((x) => x.kategoria === kat && f(x))?.tekst
  const tag = (t: string) => (x: KlauzulaBazy) => x.tagi.includes(t)
  const wynik = { obejmuje: [] as string[], nie_obejmuje: [] as string[], uwagi: [] as string[] }
  const dodaj = (kat: keyof typeof wynik, t: string | undefined) => { if (t && !wynik[kat].includes(t)) wynik[kat].push(t) }

  dodaj('obejmuje', pierwsza('obejmuje', tag('wykonanie')))
  const opisMaterialu = `${stan('material')?.opis ?? ''} ${stan('atesty')?.opis ?? ''}`
  const udarnosc = /udarno|KV|−\s?\d+\s*°?C|-\s?\d+\s*°?C/i.test(opisMaterialu)
  dodaj('obejmuje', udarnosc ? pierwsza('obejmuje', (x) => x.tagi.includes('material') && x.tagi.includes('udarnosc')) : pierwsza('obejmuje', (x) => x.tagi.includes('material') && /UE/.test(x.tekst)) ?? pierwsza('obejmuje', tag('material')))
  if (wymagane('udt')) {
    dodaj('obejmuje', pierwsza('obejmuje', (x) => x.tagi.includes('projekt') && x.tagi.includes('udt')))
    dodaj('obejmuje', pierwsza('obejmuje', (x) => x.tagi.length === 1 && x.tagi[0] === 'udt'))
  }
  if (wymagane('ndt')) dodaj('obejmuje', (stan('ndt')?.opis ? pierwsza('obejmuje', (x) => x.tagi.includes('ndt') && x.tekst.includes('{zakres_NDT}')) : undefined) ?? pierwsza('obejmuje', tag('ndt')))
  if (wymagane('proba')) dodaj('obejmuje', pierwsza('obejmuje', tag('proba')))
  if (wymagane('sekafenowanie')) dodaj('obejmuje', pierwsza('obejmuje', (x) => /sekafen/i.test(x.tekst)))
  if (wymagane('antykorozja')) {
    const wewn = /wewn/i.test(stan('antykorozja')?.opis ?? '')
    dodaj('obejmuje', pierwsza('obejmuje', (x) => x.tagi.includes('antykorozja') && !/sekafen/i.test(x.tekst) && (wewn ? /wewnętrzn/i.test(x.tekst) : !/wewnętrzn/i.test(x.tekst))))
  }
  if (wymagane('izolacja')) dodaj('obejmuje', pierwsza('obejmuje', tag('izolacja')))
  else if (stan('izolacja')?.stan === 'nie') dodaj('nie_obejmuje', pierwsza('nie_obejmuje', tag('izolacja')))
  if (wymagane('transport')) dodaj('obejmuje', pierwsza('obejmuje', (x) => x.tagi.includes('transport') && x.tekst.includes('{miejsce_dostawy}')) ?? pierwsza('obejmuje', tag('transport')))
  if (wymagane('montaz')) dodaj('obejmuje', pierwsza('obejmuje', (x) => x.tagi.includes('montaz') && /demontaż/i.test(x.tekst)) ?? pierwsza('obejmuje', tag('montaz')))
  else if (stan('montaz')?.stan === 'nie') dodaj('nie_obejmuje', pierwsza('nie_obejmuje', tag('montaz')))
  dodaj('obejmuje', pierwsza('obejmuje', tag('dokumentacja')))

  if (stan('ped')?.stan === 'nie') dodaj('uwagi', pierwsza('uwagi', tag('ped')))
  dodaj('uwagi', pierwsza('uwagi', (x) => !x.tagi.length))
  dodaj('uwagi', pierwsza('uwagi', tag('termin')))
  return wynik
}

/** Wartości zmiennych w klauzulach ({przedmiot}, {masa_kg}, {gatunki}, {temp_udarnosci}...). */
export function zmienneOferty(k: KartaAnalizy | null, aparaty: { material_wiodacy: string | null; masa_netto_kg: number | null; ilosc: number }[]): Record<string, string> {
  const z: Record<string, string> = {}
  const temp = /(-|−)\s?(\d{2})\s*°?\s*C/.exec(`${k?.wymagania.find((w) => w.kod === 'material')?.opis ?? ''}`)
  if (temp) z.temp_udarnosci = `-${temp[2]} °C`
  const ndt = k?.wymagania.find((w) => w.kod === 'ndt')
  if (ndt?.stan === 'wymagane' && ndt.opis.trim()) z.zakres_NDT = ndt.opis.trim()
  if (k?.podsumowanie.miejsce_dostawy.trim()) z.miejsce_dostawy = k.podsumowanie.miejsce_dostawy.trim()
  const gatunki = [...new Set(aparaty.map((a) => a.material_wiodacy).filter(Boolean))]
  if (gatunki.length) z.gatunki = gatunki.join('/')
  const masa = aparaty.reduce((s, a) => s + (a.masa_netto_kg ?? 0) * (a.ilosc || 1), 0)
  if (masa) z.masa_kg = String(Math.round(masa))
  return z
}

/** Termin realizacji do oferty: z karty, albo na podstawie najdłuższego terminu zakupu materiałów. */
export function terminOferty(k: KartaAnalizy | null): string {
  return k?.podsumowanie.termin_realizacji.trim() ?? ''
}

/**
 * Co pracownik musi sprawdzić we wstępnej wycenie: pozycje bez ceny / z ceną starą lub przybliżoną,
 * niepewne odczyty z rysunków, aparaty bez masy i wskaźnika rbh/t, a z karty - wymagania do wyjaśnienia,
 * niespójności i pytania bez odpowiedzi.
 */
export function punktyWeryfikacji(stan: StanWyceny, par: ParametryKalk, k: KartaAnalizy | null, wiekOstrzezenieMies = 6, dzis = new Date()): PunktWeryfikacji[] {
  const pkt: PunktWeryfikacji[] = []
  for (const a of stan.aparaty) {
    const pref = stan.aparaty.length > 1 ? `${a.nazwa}: ` : ''
    if (!a.masa_netto_kg) pkt.push({ rodzaj: 'masa', opis: t('{0}brak masy netto aparatu - robocizna wskaźnikowa i zł/kg nie policzą się', pref), gdzie: 'wycena' })
    if (a.metoda_robocizny === 'wskaznikowa' && (!a.wskaznik_rbh_t || !a.stawka_wskaznikowa)) pkt.push({ rodzaj: 'robocizna', opis: t('{0}uzupełnij wskaźnik rbh/t i stawkę (brak podobnych zleceń w bazie)', pref), gdzie: 'wycena' })
    else if (a.metoda_robocizny === 'wskaznikowa') pkt.push({ rodzaj: 'robocizna', opis: t('{0}robocizna wskaźnikowa {1} rbh/t z podobnych zleceń - sprawdź', pref, a.wskaznik_rbh_t), gdzie: 'wycena' })
    const bezCeny = a.pozycje.filter((p) => (p.zakladka === 'materialy' || p.zakladka === 'kooperacja') && !p.wartosc_reczna && policzPozycje(p, par).koszt === 0)
    if (bezCeny.length) pkt.push({ rodzaj: 'cena', opis: t('{0}{1} poz. bez ceny ({2}{3})', pref, bezCeny.length, bezCeny.slice(0, 4).map((p) => p.nazwa).join(', '), bezCeny.length > 4 ? '...' : ''), gdzie: 'wycena' })
    const stare = a.pozycje.filter((p) => p.zrodlo_data && (wiekMiesiecy(p.zrodlo_data, dzis) ?? 0) >= wiekOstrzezenieMies)
    if (stare.length) pkt.push({ rodzaj: 'stara_cena', opis: t('{0}{1} poz. z ceną starszą niż {2} mies.', pref, stare.length, wiekOstrzezenieMies), gdzie: 'wycena' })
    const przybl = a.pozycje.filter((p) => /przybliżon/.test(p.uwagi ?? ''))
    if (przybl.length) pkt.push({ rodzaj: 'cena_przyblizona', opis: t('{0}{1} poz. z ceną przybliżoną (kategoria + gatunek, bez wymiarów)', pref, przybl.length), gdzie: 'wycena' })
    const niepewne = a.pozycje.filter((p) => p.pewnosc !== null && p.pewnosc !== undefined && Number(p.pewnosc) < PROG_PEWNOSCI)
    if (niepewne.length) pkt.push({ rodzaj: 'odczyt', opis: t('{0}{1} poz. z niepewnym odczytem z rysunku "(?)"', pref, niepewne.length), gdzie: 'rysunki' })
  }
  if (k) {
    for (const w of k.wymagania.filter((x) => x.stan === 'do_wyjasnienia')) pkt.push({ rodzaj: 'wymaganie', opis: t('do wyjaśnienia: {0}{1}', w.nazwa, w.opis ? ` - ${w.opis}` : ''), gdzie: 'karta' })
    for (const n of k.niespojnosci) pkt.push({ rodzaj: 'niespojnosc', opis: n.opis, gdzie: 'karta' })
    const pytania = k.pytania.filter((p) => !p.odpowiedz.trim())
    if (pytania.length) pkt.push({ rodzaj: 'pytanie', opis: t('{0} pytań do klienta bez odpowiedzi', pytania.length), gdzie: 'karta' })
  }
  return pkt
}
