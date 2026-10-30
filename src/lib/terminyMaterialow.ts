// Terminy zakupu materiałów w ocenie działów: grupy wynikają z materiałów wyceny (kategorie pozycji listy materiałowej),
// a bez materiałów - z rodzaju aparatu (wymiennik: rurki, ściany sitowe, kołnierze...; zbiornik: blachy, dennice...).
// Podpowiedź terminu dla grupy - najdłuższy termin dostawy z ofert dostawców do tego zapytania. Część czysta - testy.

/** Kategorie materiałów bez terminu zakupu (materiały pomocnicze kupowane na bieżąco). */
const BEZ_TERMINU = new Set(['spawalnicze', 'antykorozyjne', 'pomocnicze', 'inne'])

export const DOMYSLNE_GRUPY: Record<'zbiornik' | 'wymiennik', string[]> = {
  zbiornik: ['blachy', 'dennice', 'kolnierze', 'odkuwki', 'rury_krocce', 'zlaczne'],
  wymiennik: ['rury_technologiczne', 'odkuwki', 'blachy', 'kolnierze', 'zlaczne', 'uszczelki'],
}
export const GRUPA_DOKUMENTACJI = 'Dokumentacja'

/** Nazwy grup terminów: kategorie materiałów obecne w wycenie (w kolejności kategorii) albo domyślne dla rodzaju aparatu. */
export function grupyTerminow(sekcje: string[], rodzaj: 'zbiornik' | 'wymiennik' | null, kategorie: { kod: string; nazwa: string }[]): string[] {
  const obecne = new Set(sekcje.filter((s) => !BEZ_TERMINU.has(s)))
  const kody = obecne.size ? kategorie.map((k) => k.kod).filter((k) => obecne.has(k)) : DOMYSLNE_GRUPY[rodzaj ?? 'zbiornik']
  return [...kody.map((k) => kategorie.find((x) => x.kod === k)?.nazwa ?? k), GRUPA_DOKUMENTACJI]
}

/** Terminy zapisane w ocenie dopasowane do grup: wpisane zostają, nowe grupy puste, stare z wpisem - na końcu. */
export function wyrownajTerminy(istniejace: { grupa: string; termin: string }[], grupy: string[]) {
  const wynik = grupy.map((g) => ({ grupa: g, termin: istniejace.find((x) => x.grupa === g)?.termin ?? '' }))
  return [...wynik, ...istniejace.filter((x) => x.termin.trim() && !grupy.includes(x.grupa))]
}

export interface TerminZOferty { kategoria: string | null; termin_dni: number | null; dostawca: string | null }

/** Najdłuższy termin dostawy z ofert dla grupy (nazwy kategorii): "6 tyg. (42 dni, Dostawca)". */
export function terminyZOfert(pozycje: TerminZOferty[], kategorie: { kod: string; nazwa: string }[]): Record<string, string> {
  const maks = new Map<string, { dni: number; dostawca: string | null }>()
  for (const p of pozycje) {
    if (!p.kategoria || !p.termin_dni) continue
    const nazwa = kategorie.find((k) => k.kod === p.kategoria)?.nazwa ?? p.kategoria
    const b = maks.get(nazwa)
    if (!b || p.termin_dni > b.dni) maks.set(nazwa, { dni: p.termin_dni, dostawca: p.dostawca })
  }
  return Object.fromEntries([...maks.entries()].map(([g, m]) => [g, `${Math.ceil(m.dni / 7)} tyg. (${m.dni} dni${m.dostawca ? `, ${m.dostawca}` : ''})`]))
}
