export type StatusZapytania =
  | 'nowe' | 'w_analizie' | 'zapytania_do_dostawcow' | 'kalkulacja' | 'do_zatwierdzenia'
  | 'zatwierdzona' | 'wyslana' | 'wygrana' | 'przegrana' | 'rezygnacja'

export const STATUSY_ZAPYTANIA: { id: StatusZapytania; etykieta: string; kolor: string }[] = [
  { id: 'nowe', etykieta: 'nowe', kolor: 'bg-white text-slate-700 ring-slate-300' },
  { id: 'w_analizie', etykieta: 'w analizie', kolor: 'bg-blekit-jasny text-blekit-ciemny ring-blekit' },
  { id: 'zapytania_do_dostawcow', etykieta: 'zapytania do dostawców', kolor: 'bg-blekit-jasny text-blekit-ciemny ring-blekit' },
  { id: 'kalkulacja', etykieta: 'kalkulacja', kolor: 'bg-blekit-jasny text-blekit-ciemny ring-blekit' },
  { id: 'do_zatwierdzenia', etykieta: 'do zatwierdzenia', kolor: 'bg-amber-50 text-amber-800 ring-amber-400' },
  { id: 'zatwierdzona', etykieta: 'zatwierdzona', kolor: 'bg-limonka-jasna text-limonka-ciemna ring-limonka' },
  { id: 'wyslana', etykieta: 'wysłana', kolor: 'bg-limonka-jasna text-limonka-ciemna ring-limonka' },
  { id: 'wygrana', etykieta: 'wygrana', kolor: 'bg-limonka text-slate-900 ring-limonka-ciemna' },
  { id: 'przegrana', etykieta: 'przegrana', kolor: 'bg-slate-200 text-slate-600 ring-slate-300' },
  { id: 'rezygnacja', etykieta: 'rezygnacja', kolor: 'bg-slate-200 text-slate-600 ring-slate-300' },
]
export const statusZapytania = (s: StatusZapytania) => STATUSY_ZAPYTANIA.find((x) => x.id === s) ?? STATUSY_ZAPYTANIA[0]

export const ZRODLA: Record<string, string> = { mail: 'mail', platforma: 'platforma zakupowa', wizja_lokalna: 'wizja lokalna', inne: 'inne' }

/** Ile dni do terminu złożenia oferty (ujemne = po terminie), null gdy brak terminu. */
export function dniDoTerminu(termin: string | null, teraz = new Date()) {
  if (!termin) return null
  return Math.floor((new Date(termin).getTime() - teraz.getTime()) / 86400000)
}

/** Kolor terminu: po terminie / ≤ 3 dni / ≤ 7 dni - tylko dla zapytań jeszcze w toku. */
export function kolorTerminu(dni: number | null, status: StatusZapytania) {
  if (dni === null || !['nowe', 'w_analizie', 'zapytania_do_dostawcow', 'kalkulacja', 'do_zatwierdzenia', 'zatwierdzona'].includes(status)) return ''
  if (dni < 0) return 'bg-red-100 text-red-800'
  if (dni <= 3) return 'bg-amber-100 text-amber-900'
  if (dni <= 7) return 'bg-yellow-50 text-yellow-900'
  return ''
}

// --- Rodzaj aparatu (pierwsze pole nowego zapytania) ------------------------------------------
export type RodzajAparatu = 'zbiornik' | 'wymiennik'
export type ZakresWymiennika = 'kompletny' | 'wiazka' | 'czesc'

export const RODZAJE_APARATU: { id: RodzajAparatu; etykieta: string }[] = [
  { id: 'zbiornik', etykieta: 'Zbiornik' },
  { id: 'wymiennik', etykieta: 'Wymiennik ciepła' },
]
export const ZAKRESY_WYMIENNIKA: { id: ZakresWymiennika; etykieta: string; opis: string }[] = [
  { id: 'kompletny', etykieta: 'wymiennik kompletny', opis: 'płaszcz, komory, wiązka rurowa, podpory' },
  { id: 'wiazka', etykieta: 'wkład rurowy (wiązka)', opis: 'ściany sitowe, rurki, przegrody, ściągi, głowica pływająca - bez płaszcza i podpór' },
  { id: 'czesc', etykieta: 'część wymiennika - inna', opis: 'np. komora, pokrywa, wężownica - wszystkie elementy szablonu opcjonalne' },
]

/** Etykieta rodzaju z zakresem: "Wymiennik ciepła - wkład rurowy (wiązka)". */
export function etykietaRodzaju(r: RodzajAparatu | null | undefined, zakres?: ZakresWymiennika | null, opis?: string | null) {
  if (!r) return 'nie wybrano'
  if (r === 'zbiornik') return 'Zbiornik'
  const z = ZAKRESY_WYMIENNIKA.find((x) => x.id === (zakres ?? 'kompletny'))
  return `Wymiennik ciepła - ${zakres === 'czesc' && opis?.trim() ? opis.trim() : z?.etykieta ?? 'kompletny'}`
}

/** Typ aparatu wyceny z rodzaju zapytania - te same wartości co funkcja bazy typ_aparatu_zapytania (szablony je rozpoznają). */
export function typAparatuZRodzaju(r: RodzajAparatu | null | undefined, zakres?: ZakresWymiennika | null): string | null {
  if (r === 'zbiornik') return 'zbiornik'
  if (r === 'wymiennik') return zakres === 'wiazka' ? 'wkład rurowy' : zakres === 'czesc' ? 'część wymiennika' : 'wymiennik płaszczowo-rurowy'
  return null
}

/** Rodzaj podpowiadany z przedmiotu (import, seed) - w aplikacji człowiek wybiera go zawsze sam. */
export function rodzajZPrzedmiotu(przedmiot: string): { rodzaj_aparatu: RodzajAparatu; zakres_wymiennika: ZakresWymiennika | null } {
  if (/wymienn|wkład|wklad|chłodnic|chlodnic|skraplacz|exchanger|bundle|wężownic|wezownic/i.test(przedmiot)) {
    return { rodzaj_aparatu: 'wymiennik', zakres_wymiennika: /wkład|wklad|wiązk|wiazk|bundle/i.test(przedmiot) ? 'wiazka' : /wężownic|wezownic|głowic|glowic/i.test(przedmiot) ? 'czesc' : 'kompletny' }
  }
  return { rodzaj_aparatu: 'zbiornik', zakres_wymiennika: null }
}
