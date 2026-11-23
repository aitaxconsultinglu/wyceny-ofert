// Katalog ofert materiałowych: zaopatrzenie wrzuca pliki ofert do podłączonego folderu firmowego (Chrome / Edge -
// File System Access API) albo przeciąga je do aplikacji. Każdy plik raz (SHA-256), zapisany jako dokument katalogu;
// odczyt bez AI przy imporcie (kwoty, waluta, termin, dostawca po domenie), przez AI na życzenie (pozycje z wymiarami
// i gatunkami, koszt przed wywołaniem). Z odczytu powstaje oferta „do przejrzenia”; po zatwierdzeniu jej ceny są
// w „Znajdź cenę” i w wycenie automatycznej. Część czysta (bez przeglądarki i bazy) - testy w katalogOfert.test.ts.
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { komunikatPL } from './config'
import { wczytajDane, type WczytanyPlik } from './dokumenty'
import { pobierzBajty, zapiszDokument } from './magazyn'
import { dostawcaPoDomenie, formularzZAi, nowyKlucz, pustaPozycja, pustyFormularz, zapiszOferte, znajdzDostawce, type FormularzOferty, type Slowniki } from './oferty'
import { ofertaZTekstu } from './prosby'
import { przygotujTresc } from './trescOferty'
import type { OfertaAi } from './ai'

export type StatusKatalogu = 'nowy' | 'do_przejrzenia' | 'zatwierdzony' | 'pominiety' | 'blad'
export interface WpisKatalogu {
  id: string; nazwa_pliku: string; folder: string | null; hash: string; rozmiar: number | null; data_pliku: string | null
  dokument_id: string | null; oferta_id: string | null; status: StatusKatalogu; dostawca: string | null; nr_zo: string | null
  pozycji: number | null; uwagi: string | null; koszt_pln: number | null; utworzono: string; zmodyfikowano: string
}
export interface DostawcaKatalogu { id: string; nazwa: string; aliasy: string[]; kontakty: { email?: string | null }[] | null }

export const ROZSZERZENIA_KATALOGU = ['pdf', 'msg', 'eml', 'xlsx', 'xls', 'docx', 'jpg', 'jpeg', 'png', 'txt']

/** Plik oferty do katalogu: obsługiwane rozszerzenie, bez plików tymczasowych Office i systemowych. */
export function czyPlikKatalogu(nazwa: string): boolean {
  const n = nazwa.split(/[\\/]/).pop() ?? nazwa
  if (/^~\$|^\.|^thumbs\.db$|^desktop\.ini$/i.test(n)) return false
  return ROZSZERZENIA_KATALOGU.includes(n.toLowerCase().split('.').pop() ?? '')
}

/** Numer zapytania ZO z nazwy pliku albo treści oferty: "ZO/123/2026", "ZO-123", "zo 123_2026" -> "ZO/123/2026" / "ZO/123". */
export function numerZO(tekst: string): string | null {
  const m = /\bZO\s*[/\-_ ]?\s*(\d{1,4})(?:\s*[/\-_]\s*(20\d{2}))?\b/i.exec(tekst)
  return m ? `ZO/${m[1]}${m[2] ? `/${m[2]}` : ''}` : null
}

/** Załączniki maila, które są ofertą (PDF, skan, DOCX, arkusz) - bez kart katalogowych i aprobat. */
export const zalacznikiOferty = (plik: WczytanyPlik) =>
  plik.zalaczniki.filter((z) => ['pdf', 'obraz', 'docx', 'arkusz'].includes(z.rodzaj) && !/datasheet|karta techn|aprobata/i.test(z.nazwa)).map((z) => z.nazwa)

/**
 * Oferta bez AI: kwoty z walutą i jm, termin, ważność, Incoterms z treści i załączników z tekstem; dostawca po domenie
 * nadawcy albo nazwie. `wystarczy` - jest cena i dostawca, więc można zapisać ofertę do przejrzenia.
 */
export function formularzBezAi(plik: WczytanyPlik, dostawcy: DostawcaKatalogu[]): { formularz: FormularzOferty; wystarczy: boolean } {
  const wybrane = new Set(zalacznikiOferty(plik))
  const teksty = [plik.tekst, ...plik.zalaczniki.filter((z) => wybrane.has(z.nazwa)).map((z) => z.tekst)].filter(Boolean).join('\n')
  const o = ofertaZTekstu(teksty)
  const f = pustyFormularz()
  const nadawca = String(plik.metadane.od ?? '')
  const d = dostawcaPoDomenie(String(plik.metadane.od_email ?? ''), dostawcy) ?? znajdzDostawce(nadawca || null, dostawcy)
  f.dostawca_id = d?.id ?? null
  if (!d && nadawca) f.dostawca_nowy = { nazwa: nadawca, nip: '', osoba: '', email: String(plik.metadane.od_email ?? ''), telefon: '' }
  if (typeof plik.metadane.data === 'string' && /^\d{4}-\d{2}-\d{2}/.test(plik.metadane.data)) f.data_oferty = plik.metadane.data.slice(0, 10)
  f.nr_zo = numerZO(`${plik.nazwa} ${String(plik.metadane.temat ?? '')} ${teksty.slice(0, 5000)}`) ?? ''
  f.waluta = o.waluta; f.termin_realizacji = o.termin_realizacji; f.termin_dni = o.termin_dni
  f.waznosc_do = o.waznosc_do ?? ''; f.waznosc_opis = o.waznosc_opis; f.warunki_dostawy = o.warunki_dostawy
  f.zrodlo = plik.rodzaj === 'mail' ? 'mail' : plik.rodzaj === 'pdf' ? 'pdf' : 'reczne'
  f.pozycje = o.pozycje.length
    ? o.pozycje.map((p, i) => ({ ...pustaPozycja(i + 1), klucz: nowyKlucz(), opis: p.opis || plik.nazwa, ilosc: p.ilosc, jm: p.jm, cena_jedn: p.cena_jedn, wartosc: p.wartosc, pewnosc: 0.7 }))
    : [pustaPozycja(1)]
  return { formularz: f, wystarczy: o.wystarczy && !!(f.dostawca_id || f.dostawca_nowy?.nazwa.trim()) }
}

const nazwaDostawcy = (f: FormularzOferty, dostawcy: DostawcaKatalogu[]) => dostawcy.find((d) => d.id === f.dostawca_id)?.nazwa ?? f.dostawca_nowy?.nazwa ?? null

// --- Baza i magazyn (przeglądarka) ---------------------------------------------------------------------

export async function wpisyKatalogu(db: SupabaseClient = supabase): Promise<WpisKatalogu[]> {
  const { data, error } = await db.from('katalog_ofert').select('*').order('utworzono', { ascending: false }).limit(1000)
  if (error) throw new Error(komunikatPL(error.message))
  return (data ?? []) as WpisKatalogu[]
}

/** Skróty plików już obecnych w katalogu - do pominięcia przy sprawdzaniu folderu. */
export async function znaneSkroty(db: SupabaseClient = supabase): Promise<Set<string>> {
  const { data } = await db.from('katalog_ofert').select('hash')
  return new Set((data ?? []).map((x) => x.hash as string))
}

/** Zapis oferty z formularza w katalogu: oferta do przejrzenia, dokument przy ofercie, wpis katalogu uzupełniony. */
async function zapiszOferteKatalogu(w: Pick<WpisKatalogu, 'id' | 'dokument_id' | 'oferta_id'>, f: FormularzOferty, s: Slowniki, dostawcy: DostawcaKatalogu[], dodatkowo: Partial<WpisKatalogu>, db: SupabaseClient) {
  const ofertaId = await zapiszOferte({ ...f, id: w.oferta_id ?? undefined, dokument_id: w.dokument_id }, s, 'do_przejrzenia', db)
  if (w.dokument_id) await db.from('oferty_dostawcow').update({ dokument_id: w.dokument_id }).eq('id', ofertaId)
  const { error } = await db.from('katalog_ofert').update({
    oferta_id: ofertaId, status: 'do_przejrzenia', dostawca: nazwaDostawcy(f, dostawcy), nr_zo: f.nr_zo || null,
    pozycji: f.pozycje.filter((p) => p.opis.trim()).length, uwagi: null, ...dodatkowo,
  }).eq('id', w.id)
  if (error) throw new Error(komunikatPL(error.message))
  return ofertaId
}

export type WynikImportu = { stan: 'dodany'; oferta: boolean } | { stan: 'duplikat' } | { stan: 'pominiety'; powod: string }

/**
 * Plik do katalogu: skrót (duplikat - pominięty), wpis, dokument (mail: treść jako tekst i załączniki-oferty), odczyt
 * bez AI - przy cenie i dostawcy od razu oferta do przejrzenia, inaczej wpis czeka na odczyt AI.
 */
export async function dodajDoKatalogu(
  plik: File, opcje: { folder?: string | null; dostawcy: DostawcaKatalogu[]; s: Slowniki; limitMb: number; znane?: Set<string> }, db: SupabaseClient = supabase,
): Promise<WynikImportu> {
  if (!czyPlikKatalogu(plik.name)) return { stan: 'pominiety', powod: 'nieobsługiwany typ pliku' }
  const bajty = new Uint8Array(await plik.arrayBuffer())
  const { sha256 } = await import('./kompresja')
  const hash = await sha256(bajty)
  if (opcje.znane?.has(hash)) return { stan: 'duplikat' }
  const { data: jest } = await db.from('katalog_ofert').select('id').eq('hash', hash).limit(1)
  if (jest?.length) { opcje.znane?.add(hash); return { stan: 'duplikat' } }
  const wczytany = await wczytajDane(plik.name, bajty)
  const { data: wpis, error } = await db.from('katalog_ofert').insert({
    nazwa_pliku: plik.name, folder: opcje.folder ?? null, hash, rozmiar: plik.size, data_pliku: plik.lastModified ? new Date(plik.lastModified).toISOString() : null,
  }).select('id').single()
  if (error) throw new Error(komunikatPL(error.message))
  opcje.znane?.add(hash)
  const oferty = new Set(zalacznikiOferty(wczytany))
  const doZapisu = wczytany.rodzaj === 'mail' ? { ...wczytany, zalaczniki: wczytany.zalaczniki.map((z) => ({ ...z, wgraj: oferty.has(z.nazwa) })) } : wczytany
  const { dokument } = await zapiszDokument(doZapisu, { katalog_id: wpis.id }, { typ: 'oferta_dostawcy', istotny: true, limitMb: opcje.limitMb }, db)
  await db.from('katalog_ofert').update({ dokument_id: dokument?.id ?? null }).eq('id', wpis.id)
  const { formularz, wystarczy } = formularzBezAi(wczytany, opcje.dostawcy)
  if (wystarczy) {
    try {
      await zapiszOferteKatalogu({ id: wpis.id, dokument_id: dokument?.id ?? null, oferta_id: null }, formularz, opcje.s, opcje.dostawcy, {}, db)
      return { stan: 'dodany', oferta: true }
    } catch { /* oferta z odczytu bez AI się nie zapisała - wpis czeka na AI */ }
  }
  await db.from('katalog_ofert').update({
    nr_zo: formularz.nr_zo || null, dostawca: nazwaDostawcy(formularz, opcje.dostawcy),
    uwagi: 'Bez AI nie znaleziono ceny albo dostawcy - odczytaj przez AI albo uzupełnij ręcznie.',
  }).eq('id', wpis.id)
  return { stan: 'dodany', oferta: false }
}

/** Plik wpisu z magazynu jako WczytanyPlik (mail: treść z dokumentu i załączniki zapisane przy nim). */
export async function plikWpisu(w: Pick<WpisKatalogu, 'dokument_id' | 'nazwa_pliku'>, db: SupabaseClient = supabase): Promise<WczytanyPlik> {
  if (!w.dokument_id) throw new Error(`${w.nazwa_pliku}: brak dokumentu w magazynie.`)
  const { data: d } = await db.from('dokumenty').select('id, nazwa_pliku, sciezka, tekst, metadane, stan').eq('id', w.dokument_id).single()
  if (!d) throw new Error(`${w.nazwa_pliku}: brak dokumentu w magazynie.`)
  if (d.sciezka) return wczytajDane(d.nazwa_pliku, await pobierzBajty(d.sciezka))
  // Mail (zapisany jako tekst) - załączniki z magazynu.
  const { data: zal } = await db.from('dokumenty').select('nazwa_pliku, sciezka').eq('nadrzedny_id', d.id)
  const zalaczniki: WczytanyPlik[] = []
  for (const z of zal ?? []) if (z.sciezka) zalaczniki.push(await wczytajDane(z.nazwa_pliku, await pobierzBajty(z.sciezka)))
  const tekst = String(d.tekst ?? '')
  return { nazwa: d.nazwa_pliku, mime: 'message/rfc822', rozmiar: tekst.length, dane: new Uint8Array(), rodzaj: 'mail', tekst, typSugerowany: 'oferta_dostawcy', metadane: (d.metadane ?? {}) as Record<string, unknown>, zalaczniki }
}

/** Dane do AI (szacunek i odczyt) dla wpisu katalogu. */
export async function daneAiWpisu(w: WpisKatalogu, db: SupabaseClient = supabase) {
  const plik = await plikWpisu(w, db)
  const tresc = await przygotujTresc(plik, new Set(zalacznikiOferty(plik).length ? zalacznikiOferty(plik) : plik.zalaczniki.map((z) => z.nazwa)))
  return { plik, dane: { tekst: tresc.tekst, obrazy: tresc.obrazy, metadane: { plik: w.nazwa_pliku } } }
}

/** Wynik AI wpisu -> oferta do przejrzenia (istniejąca oferta wpisu jest nadpisywana). */
export async function zapiszOdczytAi(w: WpisKatalogu, ai: OfertaAi, koszt: number, plik: WczytanyPlik, dostawcy: DostawcaKatalogu[], s: Slowniki, db: SupabaseClient = supabase) {
  const zrodlo = plik.rodzaj === 'mail' ? 'mail' : plik.rodzaj === 'pdf' ? (plik.metadane.skan ? 'skan' : 'pdf') : plik.rodzaj === 'obraz' ? 'skan' : 'reczne'
  const f = formularzZAi(ai, dostawcy, zrodlo)
  if (!f.nr_zo) f.nr_zo = numerZO(`${w.nazwa_pliku} ${String(plik.metadane.temat ?? '')}`) ?? ''
  return zapiszOferteKatalogu(w, f, s, dostawcy, { koszt_pln: Number(w.koszt_pln ?? 0) + koszt }, db)
}

/** Zatwierdzenie ofert z katalogu - ich ceny trafiają do wycen. */
export async function zatwierdzOferty(wpisy: WpisKatalogu[], db: SupabaseClient = supabase) {
  const z = wpisy.filter((w) => w.oferta_id && w.status === 'do_przejrzenia')
  if (!z.length) return 0
  const { data: u } = await db.auth.getUser()
  const { error } = await db.from('oferty_dostawcow').update({ status: 'zatwierdzona', zatwierdzil: u.user?.id ?? null }).in('id', z.map((w) => w.oferta_id!))
  if (error) throw new Error(komunikatPL(error.message))
  await db.from('katalog_ofert').update({ status: 'zatwierdzony' }).in('id', z.map((w) => w.id))
  return z.length
}

// --- Podłączony folder (Chrome / Edge) -----------------------------------------------------------------

/** Minimalne typy File System Access API (Chrome, Edge) - nie wszystkie są w lib.dom. */
interface UchwytPliku { kind: 'file'; name: string; getFile(): Promise<File> }
export interface UchwytFolderu {
  kind: 'directory'; name: string
  values(): AsyncIterable<UchwytPliku | UchwytFolderu>
  queryPermission(o: { mode: 'read' }): Promise<PermissionState>
  requestPermission(o: { mode: 'read' }): Promise<PermissionState>
}

export const folderyObslugiwane = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

export async function wybierzFolder(): Promise<UchwytFolderu> {
  return (window as unknown as { showDirectoryPicker(o: { mode: 'read'; id: string }): Promise<UchwytFolderu> }).showDirectoryPicker({ mode: 'read', id: 'katalog-ofert' })
}

const BAZA_IDB = 'wyceny-katalog'
const otworzIdb = () => new Promise<IDBDatabase>((ok, zle) => {
  const r = indexedDB.open(BAZA_IDB, 1)
  r.onupgradeneeded = () => r.result.createObjectStore('uchwyty')
  r.onsuccess = () => ok(r.result)
  r.onerror = () => zle(r.error)
})

/** Uchwyt folderu zapamiętany w przeglądarce (IndexedDB) - po odświeżeniu wystarczy potwierdzić dostęp. */
export async function zapamietajFolder(u: UchwytFolderu | null) {
  const db = await otworzIdb()
  await new Promise<void>((ok, zle) => {
    const tx = db.transaction('uchwyty', 'readwrite')
    if (u) tx.objectStore('uchwyty').put(u, 'folder'); else tx.objectStore('uchwyty').delete('folder')
    tx.oncomplete = () => ok(); tx.onerror = () => zle(tx.error)
  })
}

export async function zapamietanyFolder(): Promise<UchwytFolderu | null> {
  try {
    const db = await otworzIdb()
    return await new Promise((ok) => {
      const r = db.transaction('uchwyty').objectStore('uchwyty').get('folder')
      r.onsuccess = () => ok((r.result as UchwytFolderu | undefined) ?? null)
      r.onerror = () => ok(null)
    })
  } catch { return null }
}

/** Pliki ofert z folderu i podfolderów (do 4 poziomów) ze ścieżką względną. */
export async function plikiFolderu(u: UchwytFolderu, sciezka = '', poziom = 0): Promise<{ plik: File; sciezka: string }[]> {
  const wynik: { plik: File; sciezka: string }[] = []
  for await (const w of u.values()) {
    const s = sciezka ? `${sciezka}/${w.name}` : w.name
    if (w.kind === 'file' && czyPlikKatalogu(w.name)) wynik.push({ plik: await w.getFile(), sciezka: s })
    else if (w.kind === 'directory' && poziom < 4) wynik.push(...await plikiFolderu(w, s, poziom + 1))
  }
  return wynik
}
