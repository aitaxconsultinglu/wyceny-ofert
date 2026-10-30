// Typ dokumentu bez AI: rozszerzenie, nazwa pliku, słowa kluczowe PL/EN z początku tekstu, liczba stron i format arkusza
// (rysunek ma zwykle format większy niż A4 i kilka stron), skan bez tekstu. Człowiek zawsze może zmienić typ.
// Część czysta - testy w klasyfikacjaDokumentow.test.ts.

export interface DaneKlasyfikacji {
  nazwa: string
  rodzaj: 'mail' | 'pdf' | 'docx' | 'arkusz' | 'obraz' | 'tekst' | 'inny'
  tekst: string
  /** PDF: liczba stron, skan, format pierwszej strony [mm]. */
  stron?: number
  skan?: boolean
  format_mm?: [number, number] | null
}

export interface Klasyfikacja { typ: string; powod: string; tylko_przechowanie?: boolean }

/**
 * Typy dokumentów zapytania (słownik typy_dokumentow, migracja 0033): zapytanie ofertowe (z korespondencją), projekt /
 * rysunek złożeniowy (wszystkie rysunki i opisy techniczne), lista materiałowa, wymagania techniczne (specyfikacja,
 * standardy, karta danych, formularz wymagań), oferta dostawcy, inne (obliczenia, karty dostawy...).
 */
export const TYPY_RYSUNKOW = ['projekt', 'lista_materialowa']
/** Dokument z tabelami do listy materiałowej: rysunek złożeniowy albo lista materiałowa. */
export const jestRysunkiem = (typ: string | null | undefined) => TYPY_RYSUNKOW.includes(typ ?? '')

/** Arkusz danych (datasheet) - typ "wymagania", ale dane projektowe czytane z niego od razu. */
export const jestKartaDanych = (nazwa: string, tekst = '') => /karta danych|arkusz danych|data ?sheet|\bdatasheet\b/i.test(`${nazwa} ${tekst.slice(0, 3000)}`)

/** [wzorzec, typ, opis] - pierwsze dopasowanie wygrywa; wzorce PL i EN. */
const REGULY: [RegExp, string, string][] = [
  [/zapytani\w* ofertow|\brfq\b|request for (quotation|proposal)|\binquiry\b|\benquiry\b|invitation to (bid|tender)|\btender\b/i, 'zapytanie_ofertowe', 'zapytanie ofertowe / RFQ'],
  [/wykaz części|zestawienie materiał|lista materiał|\bpart ?list\b|bill of materials?|\bbom\b|material list|materials? take.?off/i, 'lista_materialowa', 'lista materiałowa / wykaz części'],
  [/karta danych|arkusz danych|data ?sheet|\bdatasheet\b|process data sheet/i, 'wymagania', 'arkusz danych / datasheet'],
  [/formularz wymagań|formularz wymagan|requirements? form|questionnaire/i, 'wymagania', 'formularz wymagań'],
  [/specyfikacj|\bspecification\b|\bspec\.? techn|\bsiwz\b|opis przedmiotu zamówienia|wymagania techniczne/i, 'wymagania', 'specyfikacja / wymagania'],
  [/\bstandard\b|norma zakładowa|wytyczne|\bguideline|company standard|engineering standard/i, 'wymagania', 'standard / wymagania'],
  [/obliczeni|\bcalculation|strength calc|design calc/i, 'inne', 'obliczenia'],
  [/opis techniczny|projekt techniczny|technical description|design description|basic design/i, 'projekt', 'opis techniczny'],
  [/\bszkic|\bsketch\b|rysunek zestawieniowy|złożeniow|zestawieniow|general arrangement|\bga drawing|assembly drawing|rysunek wykonawczy|wykonawcz|detail drawing|workshop drawing|fabrication drawing/i, 'projekt', 'rysunek złożeniowy / wykonawczy'],
  [/\bdrawing\b|\brysunek\b|\brys\b|\bdrw\b|nozzle schedule|tabela króćców/i, 'projekt', 'rysunek'],
  [/\boferta\b|\boffer\b|\bquotation\b|wycena dostawcy/i, 'oferta_dostawcy', 'oferta dostawcy'],
  [/karta dostawy/i, 'inne', 'karta dostawy'],
  [/registo/i, 'inne', 'Registo'],
]

const rozszerzenie = (n: string) => n.toLowerCase().split('.').pop() ?? ''
const nazwaBezRozszerzenia = (n: string) => n.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ')

/** Arkusz większy niż A4 (np. A3, A1) - na wydruku z CAD to prawie zawsze rysunek. */
export const wiekszyNizA4 = (f: [number, number] | null | undefined) => !!f && Math.max(...f) > 320 && Math.min(...f) > 200

export function klasyfikujDokument(d: DaneKlasyfikacji): Klasyfikacja {
  const ext = rozszerzenie(d.nazwa)
  if (d.rodzaj === 'mail') return { typ: 'zapytanie_ofertowe', powod: 'mail' }
  if (['dwg', 'dxf', 'step', 'stp', 'igs', 'iges'].includes(ext)) return { typ: 'projekt', powod: `plik CAD .${ext} - tylko przechowanie, bez odczytu`, tylko_przechowanie: true }
  if (['tif', 'tiff'].includes(ext)) return { typ: 'projekt', powod: `obraz .${ext} - tylko przechowanie, bez odczytu`, tylko_przechowanie: true }

  // 1. Nazwa pliku (najpewniejsza wskazówka).
  const nazwa = nazwaBezRozszerzenia(d.nazwa)
  for (const [w, typ, opis] of REGULY) if (w.test(nazwa)) return { typ, powod: `nazwa pliku: ${opis}` }

  // 2. Format arkusza: PDF większy niż A4 z kilkoma stronami - rysunek (także skan rysunku).
  if (d.rodzaj === 'pdf' && wiekszyNizA4(d.format_mm) && (d.stron ?? 1) <= 5) return { typ: 'projekt', powod: `format arkusza ${d.format_mm!.map(Math.round).join('×')} mm` }

  // 3. Słowa kluczowe z początku tekstu (nagłówek, tytuł dokumentu).
  const poczatek = d.tekst.slice(0, 3000)
  for (const [w, typ, opis] of REGULY) if (w.test(poczatek)) return { typ, powod: `treść: ${opis}` }

  if (d.rodzaj === 'obraz') return { typ: 'projekt', powod: 'obraz (zdjęcie / skan rysunku)' }
  if (d.rodzaj === 'pdf' && d.skan) return { typ: 'inne', powod: 'skan bez warstwy tekstowej - typ do wybrania ręcznie' }
  return { typ: 'inne', powod: 'brak rozpoznanych słów kluczowych' }
}
