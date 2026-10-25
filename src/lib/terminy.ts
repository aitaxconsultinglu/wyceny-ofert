// Słownik terminów aparatury procesowej PL / EN. Rysunki, specyfikacje i oferty bywają po polsku, po angielsku albo
// dwujęzyczne; wartości odczytu zostają jak w źródle, a nazwa_pl / nazwa_en dopisujemy tylko wtedy, gdy da się je ustalić
// pewnie: nazwa jest dokładnie znanym terminem (także w liczbie mnogiej) albo ma postać dwujęzyczną "Płaszcz / Shell".
// Niczego nie tłumaczymy "na siłę" - nieznana nazwa nie dostaje odpowiednika.

/** [wzorzec polski, wzorzec angielski, nazwa polska, nazwa angielska] - wzorce dopasowują całą nazwę. */
const TERMINY: [RegExp, RegExp, string, string][] = [
  [/^płaszcz(e)?$/i, /^shells?$/i, 'płaszcz', 'shell'],
  [/^denn(ica|ice)$/i, /^heads?$/i, 'dennica', 'head'],
  [/^dn[oa]$/i, /^bottoms?$/i, 'dno', 'bottom'],
  [/^dach(y)?$/i, /^roofs?$/i, 'dach', 'roof'],
  [/^ścian(a|y) sitow(a|e)$/i, /^tube ?sheets?$/i, 'ściana sitowa', 'tubesheet'],
  [/^rurk(a|i)$/i, /^tubes?$/i, 'rurki', 'tubes'],
  [/^przegrod(a|y)$/i, /^baffles?$/i, 'przegroda', 'baffle'],
  [/^przegrod(a|y) przepływow(a|e)$/i, /^pass partitions?( plates?)?$/i, 'przegroda przepływowa', 'pass partition'],
  [/^ściąg(i)?$/i, /^tie ?rods?$/i, 'ściąg', 'tie rod'],
  [/^odległościówk(a|i)$/i, /^spacers?$/i, 'odległościówka', 'spacer'],
  [/^kró(ciec|ćce)$/i, /^nozzles?$/i, 'króciec', 'nozzle'],
  [/^kołnierz(e)?$/i, /^flanges?$/i, 'kołnierz', 'flange'],
  [/^zaślepk(a|i)$/i, /^blind flanges?$/i, 'zaślepka', 'blind flange'],
  [/^właz(y)?$/i, /^manholes?$/i, 'właz', 'manhole'],
  [/^nakładk(a|i)( wzmacniając(a|e))?$/i, /^(reinforcement|reinforcing) pads?$/i, 'nakładka wzmacniająca', 'reinforcement pad'],
  [/^podpor(a|y)$/i, /^supports?$/i, 'podpora', 'support'],
  [/^siodł(o|a)$/i, /^saddles?$/i, 'siodło', 'saddle'],
  [/^łap(a|y)$/i, /^(support )?lugs?$/i, 'łapa', 'lug'],
  [/^nog(a|i)$/i, /^legs?$/i, 'noga', 'leg'],
  [/^śrub(a|y)$/i, /^bolts?$/i, 'śruba', 'bolt'],
  [/^szpilk(a|i)$/i, /^stud ?bolts?$/i, 'szpilka', 'stud bolt'],
  [/^nakrętk(a|i)$/i, /^nuts?$/i, 'nakrętka', 'nut'],
  [/^podkładk(a|i)$/i, /^washers?$/i, 'podkładka', 'washer'],
  [/^uszczelk(a|i)$/i, /^gaskets?$/i, 'uszczelka', 'gasket'],
  [/^pokryw(a|y)$/i, /^covers?$/i, 'pokrywa', 'cover'],
  [/^komor(a|y)( rozdzielcz(a|e))?$/i, /^channels?$/i, 'komora', 'channel'],
  [/^głowic(a|e) pływając(a|e)$/i, /^floating heads?$/i, 'głowica pływająca', 'floating head'],
  [/^pierścień dzielony$/i, /^split rings?$/i, 'pierścień dzielony', 'split ring'],
  [/^ush?k(o|a) transportow(e|a)$/i, /^lifting lugs?$/i, 'uszko transportowe', 'lifting lug'],
  [/^tabliczk(a|i) znamionow(a|e)$/i, /^name ?plates?$/i, 'tabliczka znamionowa', 'nameplate'],
  [/^wspornik(i)?$/i, /^brackets?$/i, 'wspornik', 'bracket'],
  [/^rur(a|y)$/i, /^pipes?$/i, 'rura', 'pipe'],
  [/^kolan(o|a)$/i, /^elbows?$/i, 'kolano', 'elbow'],
  [/^trójnik(i)?$/i, /^tees?$/i, 'trójnik', 'tee'],
  [/^zwężk(a|i)$/i, /^reducers?$/i, 'zwężka', 'reducer'],
  [/^płyt(a|y) wsporcz(a|e)$/i, /^support plates?$/i, 'płyta wsporcza', 'support plate'],
  [/^wkład(y)? rurow(y|e)$/i, /^tube bundles?$/i, 'wkład rurowy', 'tube bundle'],
  [/^wężownic(a|e)$/i, /^coils?$/i, 'wężownica', 'coil'],
  [/^izolacj(a|e)$/i, /^insulation$/i, 'izolacja', 'insulation'],
  [/^drabin(a|y)$/i, /^ladders?$/i, 'drabina', 'ladder'],
  [/^podest(y)?$/i, /^platforms?$/i, 'podest', 'platform'],
  [/^porę(cz|cze)$/i, /^handrails?$/i, 'poręcz', 'handrail'],
  [/^wzmocnieni(e|a)$/i, /^reinforcements?$/i, 'wzmocnienie', 'reinforcement'],
  [/^ciśnienie obliczeniowe$/i, /^design pressure$/i, 'ciśnienie obliczeniowe', 'design pressure'],
  [/^temperatura obliczeniowa$/i, /^design temperature$/i, 'temperatura obliczeniowa', 'design temperature'],
  [/^ciśnienie robocze$/i, /^(operating|working) pressure$/i, 'ciśnienie robocze', 'operating pressure'],
  [/^temperatura robocza$/i, /^(operating|working) temperature$/i, 'temperatura robocza', 'operating temperature'],
  [/^ciśnienie próbne$/i, /^(test|hydro ?test) pressure$/i, 'ciśnienie próbne', 'test pressure'],
  [/^naddatek korozyjny$/i, /^corrosion allowance$/i, 'naddatek korozyjny', 'corrosion allowance'],
  [/^masa pusta$/i, /^(empty|net) weight$/i, 'masa pusta', 'empty weight'],
  [/^pojemność$/i, /^(capacity|volume)$/i, 'pojemność', 'capacity'],
  [/^medium$/i, /^(fluid|medium)$/i, 'medium', 'fluid'],
]

const czysc = (s: string) => s.replace(/\s+/g, ' ').replace(/[.:;,]+$/, '').trim()

export interface NazwyPLEN { nazwa_pl?: string; nazwa_en?: string }

/** Odpowiedniki PL / EN nazwy - tylko gdy pewne (znany termin albo zapis dwujęzyczny "polska / english"). */
export function nazwyPLEN(nazwa: string | null | undefined): NazwyPLEN {
  const n = czysc(nazwa ?? '')
  if (!n) return {}
  // Zapis dwujęzyczny: "Płaszcz / Shell", "Shell (Płaszcz)".
  const czesci = n.split(/\s*\/\s*|\s*\(\s*|\s*\)\s*/).map(czysc).filter(Boolean)
  if (czesci.length === 2) {
    const pl = TERMINY.find(([p]) => p.test(czesci[0])) ?? TERMINY.find(([p]) => p.test(czesci[1]))
    const en = TERMINY.find(([, e]) => e.test(czesci[1])) ?? TERMINY.find(([, e]) => e.test(czesci[0]))
    if (pl && en && pl === en) return { nazwa_pl: pl[2], nazwa_en: pl[3] }
  }
  const t = TERMINY.find(([p, e]) => p.test(n) || e.test(n))
  return t ? { nazwa_pl: t[2], nazwa_en: t[3] } : {}
}

/** Język nazwy z terminologii (pl / en / null) - pomocniczo przy odczycie dwujęzycznych tabel. */
export function jezykTerminu(nazwa: string): 'pl' | 'en' | null {
  const n = czysc(nazwa)
  if (TERMINY.some(([p]) => p.test(n))) return 'pl'
  if (TERMINY.some(([, e]) => e.test(n))) return 'en'
  return null
}
