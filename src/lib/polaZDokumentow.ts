// Karta zapytania z dokumentów bez AI: numer zapytania klienta, termin składania ofert i klient (po słowniku klientów)
// z tekstu zapytania ofertowego, specyfikacji, korespondencji... Uzupełniamy tylko puste pola i zapisujemy źródło
// (plik, strona) - poprawka człowieka ma zawsze pierwszeństwo. Część czysta - testy w polaZDokumentow.test.ts.
import { nrZapytaniaZTresci, rozpoznajKlienta, terminOfertZTresci, type KlientImportu } from './importMaila'

export interface DokumentDoPol { nazwa: string; typ: string; tekst: string | null }
export interface PoleZDokumentu { pole: 'nr_zapytania_klienta' | 'termin_oferty' | 'klient_id'; wartosc: string; zrodlo: string }

/** Kolejność szukania: zapytanie ofertowe, specyfikacja, korespondencja, opis techniczny, arkusz danych, reszta. */
const PIERWSZENSTWO = ['zapytanie_ofertowe', 'wymagania', 'projekt', 'lista_materialowa']
const ranga = (typ: string) => { const i = PIERWSZENSTWO.indexOf(typ); return i < 0 ? PIERWSZENSTWO.length : i }

/** Strona, na której jest fragment (tekst PDF ma znaczniki "--- strona N ---"). */
export function stronaFragmentu(tekst: string, fragment: string): number | null {
  const i = tekst.indexOf(fragment)
  if (i < 0) return null
  const znaczniki = [...tekst.slice(0, i).matchAll(/--- strona (\d+) ---/g)]
  return znaczniki.length ? Number(znaczniki[znaczniki.length - 1][1]) : null
}

const zrodlo = (d: DokumentDoPol, fragment: string) => {
  const s = stronaFragmentu(d.tekst ?? '', fragment)
  return s ? `${d.nazwa}, str. ${s}` : d.nazwa
}

export function polaZapytaniaZDokumentow(
  dokumenty: DokumentDoPol[],
  zapytanie: { nr_zapytania_klienta: string | null; termin_oferty: string | null; klient_id: string | null },
  klienci: KlientImportu[],
  domenyWlasne: string[] = [],
): PoleZDokumentu[] {
  const wynik: PoleZDokumentu[] = []
  const posort = dokumenty.filter((d) => d.tekst?.trim()).sort((a, b) => ranga(a.typ) - ranga(b.typ))
  if (!zapytanie.nr_zapytania_klienta?.trim()) {
    for (const d of posort) {
      const nr = nrZapytaniaZTresci('', d.tekst!)
      if (nr) { wynik.push({ pole: 'nr_zapytania_klienta', wartosc: nr, zrodlo: zrodlo(d, nr) }); break }
    }
  }
  if (!zapytanie.termin_oferty) {
    for (const d of posort) {
      const termin = terminOfertZTresci(d.tekst!)
      if (termin) {
        const dzien = new Date(termin).getDate()
        const frag = new RegExp(`\\b0?${dzien}[.\\-/]`).exec(d.tekst!)?.[0] ?? ''
        wynik.push({ pole: 'termin_oferty', wartosc: termin, zrodlo: zrodlo(d, frag) })
        break
      }
    }
  }
  if (!zapytanie.klient_id) {
    for (const d of posort) {
      const k = rozpoznajKlienta({ temat: '', od: '', od_email: '', data: null, tekst: d.tekst! }, klienci, domenyWlasne)
      if (k.klient_id) { wynik.push({ pole: 'klient_id', wartosc: k.klient_id, zrodlo: `${d.nazwa} (${k.powod})` }); break }
    }
  }
  return wynik
}
