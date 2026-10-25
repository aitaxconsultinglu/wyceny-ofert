// Dokumenty Word: notatka wewnętrzna dla prezesa (układ dawnego "Wycena.docx") i oferta dla klienta.
import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx'
import { policzPozycje, type ParametryKalk, type WynikWyceny } from './kalkulacja'
import type { StanWyceny } from './wyceny'
import type { DaneFirmy, KategoriaMaterialu, OfertaDomyslne } from './types'
import { logoFirmy, nazwaPliku, pobierzPlik } from './pobierz'
import { rozbierzTekst, tytulSekcji, type RodzajSekcji } from './ofertaKlienta'
import { lokalizacja, tj, type Jezyk } from '@/i18n'

const fmt = (n: number | null | undefined, miejsc = 2) =>
  new Intl.NumberFormat('pl-PL', { minimumFractionDigits: miejsc, maximumFractionDigits: miejsc }).format(Number(n ?? 0))
const zl = (n: number | null | undefined) => `${fmt(n)} zł`
const P = (tekst: string, opcje: { bold?: boolean; size?: number; po?: number; wyrownanie?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({ alignment: opcje.wyrownanie, spacing: { after: opcje.po ?? 80 }, children: [new TextRun({ text: tekst, bold: opcje.bold, size: opcje.size })] })
const punkt = (tekst: string) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [new TextRun(tekst)] })

function komorka(tekst: string, opcje: { bold?: boolean; prawo?: boolean; szer?: number; tlo?: string } = {}) {
  return new TableCell({
    width: opcje.szer ? { size: opcje.szer, type: WidthType.PERCENTAGE } : undefined,
    shading: opcje.tlo ? { fill: opcje.tlo } : undefined,
    children: [new Paragraph({ alignment: opcje.prawo ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: tekst, bold: opcje.bold, size: 20 })] })],
  })
}

async function naglowekZLogo(firma: DaneFirmy) {
  const logo = logoFirmy(firma)
  const dzieci: Paragraph[] = []
  if (logo) dzieci.push(new Paragraph({ children: [new ImageRun({ type: 'png', data: logo, transformation: { width: 150, height: 40 } })] }))
  dzieci.push(new Paragraph({ children: [new TextRun({ text: firma.nazwa, bold: true, size: 18 }), new TextRun({ text: `  ${firma.adres}`, size: 16, color: '64748B' })] }))
  return new Header({ children: dzieci })
}

function stopka(firma: DaneFirmy) {
  const linie = [
    `${firma.nazwa}, ${firma.adres} · KRS ${firma.krs} · NIP ${firma.nip} · REGON ${firma.regon}`,
    firma.oddzialy.length ? `Oddziały: ${firma.oddzialy.join(' · ')}` : '',
    firma.zarzad.length ? firma.zarzad.join(' · ') : '',
    [firma.www, firma.email, firma.telefon].filter(Boolean).join(' · '),
  ].filter(Boolean)
  return new Footer({
    children: linie.map((l) => new Paragraph({
      alignment: AlignmentType.CENTER,
      border: l === linie[0] ? { top: { style: BorderStyle.SINGLE, size: 4, color: 'C4E82A', space: 4 } } : undefined,
      children: [new TextRun({ text: l, size: 14, color: '64748B' })],
    })),
  })
}

interface Slowniki { kategorieMaterialow: KategoriaMaterialu[]; ustawienia: { firma: DaneFirmy; oferta_domyslne: OfertaDomyslne } }

/** Notatka wewnętrzna: lista kosztów, razem, narzut, łącznie, waga, cena za kg (jak dawny "Wycena.docx"). */
export async function notatkaDlaPrezesa(stan: StanWyceny, wynik: WynikWyceny, par: ParametryKalk, s: Slowniki) {
  pobierzPlik(await Packer.toBlob(await zbudujNotatke(stan, wynik, par, s)), `${nazwaPliku(`${stan.zapytanie.numer} notatka v${stan.wycena.wersja}`)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
}

export async function zbudujNotatke(stan: StanWyceny, wynik: WynikWyceny, par: ParametryKalk, s: Slowniki): Promise<Document> {
  const w = stan.wycena
  const tresc: (Paragraph | Table)[] = []
  const masa = wynik.masa_kg
  const material = [...new Set(stan.aparaty.map((a) => a.material_wiodacy).filter(Boolean))].join(' / ')
  tresc.push(P(`${stan.zapytanie.numer} ${stan.zapytanie.klient ?? ''} - ${stan.zapytanie.przedmiot}${material ? ` ${material}` : ''}${masa ? ` o wadze ${fmt(masa, 0)} kg` : ''}`, { bold: true, po: 200 }))
  tresc.push(P(`Wycena v${w.wersja}${w.nazwa ? ` (${w.nazwa})` : ''} - notatka wewnętrzna`, { size: 18, po: 200 }))

  for (const [ia, a] of stan.aparaty.entries()) {
    const k = wynik.aparaty[ia]
    if (stan.aparaty.length > 1) tresc.push(P(`${a.nazwa} - ${a.ilosc} szt. (koszt 1 szt.)`, { bold: true, po: 100 }))
    const suma = (z: string) => a.pozycje.filter((p) => p.zakladka === z).reduce((acc, p) => acc + policzPozycje(p, par).koszt, 0)
    if (suma('projekt')) tresc.push(P(`Projekt: ${zl(suma('projekt'))}`))
    for (const sek of k.materialy.sekcje) {
      const nazwa = s.kategorieMaterialow.find((x) => x.kod === sek.sekcja)?.nazwa ?? sek.sekcja
      tresc.push(P(`Materiał - ${nazwa}${sek.masa ? ` ${fmt(sek.masa, 0)} kg` : ''}${sek.naddatek ? ` (z naddatkiem ${sek.naddatek_proc}%)` : ''}: ${zl(sek.razem)}`))
    }
    if (k.materialy.narzut_zakupowy) tresc.push(P(`Narzut zakupowy ${par.narzut_zakupowy_proc}%: ${zl(k.materialy.narzut_zakupowy)}`))
    for (const p of a.pozycje.filter((x) => x.zakladka === 'kooperacja')) tresc.push(P(`Kooperacja (${p.nazwa})${p.opcjonalna ? ' [opcja]' : ''}: ${zl(policzPozycje(p, par).koszt)}`))
    if (k.kooperacja.narzut) tresc.push(P(`Narzut na kooperację ${par.narzut_kooperacja_proc}%: ${zl(k.kooperacja.narzut)}`))
    tresc.push(P(`Robocizna: ${fmt(k.robocizna.rbh, 0)} rbh x ${fmt(k.robocizna.srednia_stawka ?? 0)} zł/godz. = ${zl(k.robocizna.wartosc)}`))
    if (suma('badania')) tresc.push(P(`Badania i odbiory: ${zl(suma('badania'))}`))
    if (suma('transport')) tresc.push(P(`Transport: ${zl(suma('transport'))}`))
    for (const p of a.pozycje.filter((x) => x.zakladka === 'inne')) tresc.push(P(`${p.nazwa}${p.opcjonalna ? ' [opcja]' : ''}: ${zl(policzPozycje(p, par).koszt)}`))
    if (a.ilosc !== 1) tresc.push(P(`Koszt ${a.ilosc} szt.: ${zl(k.koszt)}`, { bold: true }))
    tresc.push(P('', { po: 120 }))
  }
  tresc.push(P(`Razem: ${zl(wynik.koszty.koszt)}`, { bold: true }))
  if (wynik.cena !== null) {
    tresc.push(P(`Narzut ${fmt(wynik.zysk_proc, 0)}%: ${zl(wynik.zysk)}`))
    tresc.push(P(wynik.korekta
      ? `Łącznie: ${zl(wynik.cena)} + ${zl(wynik.korekta)} (prezes) = ${zl(wynik.cena_koncowa)} + vat`
      : `Łącznie: ${zl(wynik.cena_koncowa)} + vat`, { bold: true }))
  }
  if (masa) tresc.push(P(`Waga: ${fmt(masa, 0)} kg`))
  if (wynik.cena !== null && masa) tresc.push(P(`Cena jednostkowa: ${fmt(wynik.cena / masa)} zł/kg + vat${wynik.korekta ? ` (po korekcie: ${fmt(wynik.cena_koncowa_zl_kg)} zł/kg)` : ''}`))
  if (wynik.ma_opcje && wynik.cena_bez_opcji !== null) {
    tresc.push(P(`Cena z ${fmt(wynik.zysk_proc, 0)}% narzutem bez pozycji opcjonalnych: ${zl(wynik.cena_bez_opcji)} + vat${masa ? ` (${fmt(wynik.cena_bez_opcji / masa)} zł/kg)` : ''}`))
  }
  if (wynik.cena_koncowa_eur !== null) tresc.push(P(`Cena w EUR (kurs ${fmt(w.kurs_eur, 4)}): ${fmt(wynik.cena_koncowa_eur)} EUR`))

  return new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ headers: { default: await naglowekZLogo(s.ustawienia.firma) }, children: tresc }],
  })
}

export interface SekcjaDoWydruku {
  rodzaj: RodzajSekcji
  tytul: string
  /** Tekst sekcji po podstawieniu zmiennych (formatowanie: "- " punkt, **pogrubienie**). */
  tekst: string
}

export interface DaneOferty {
  numer: string
  data: string
  klient: string
  nr_zapytania_klienta: string
  przedmiot: string
  pozycje: { nazwa: string; ilosc: number; material: string; masa_kg: number | null; cena: number | null }[]
  cena_netto: number
  cena_bez_opcji: number | null
  opis_wariantu: string
  vat_proc: number
  waluta: 'PLN' | 'EUR'
  kurs_eur: number | null
  obejmuje: string[]
  nie_obejmuje: string[]
  uwagi: string[]
  termin_realizacji: string
  gwarancja: string
  waznosc: string
  platnosc: string
  podpis: string
  projekt: boolean    // cena niezatwierdzona - znak "PROJEKT"
  /** Język dokumentu (domyślnie polski). */
  jezyk?: Jezyk
  /** Sekcje w kolejności z edytora (tylko widoczne w wydruku); brak = układ domyślny. */
  sekcje?: SekcjaDoWydruku[]
  numer_oferty?: string
  osoba_kontaktowa?: string
  nazwa_projektu?: string
  incoterms?: string
  miejsce_dostawy?: string
  kary?: string
  zaliczki?: string
  zalaczniki?: string[]
}

export async function ofertaDlaKlienta(d: DaneOferty, firma: DaneFirmy) {
  const nazwa = d.jezyk === 'en' ? `Offer ${d.numer_oferty || d.numer}` : `Oferta ${d.numer_oferty || d.numer}`
  pobierzPlik(await Packer.toBlob(await zbudujOferte(d, firma)), `${nazwaPliku(nazwa)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
}

/** Tekst z prostym formatowaniem -> akapity Word (punkty, pogrubienia). */
function akapity(tekst: string): Paragraph[] {
  return rozbierzTekst(tekst).map((l) => new Paragraph({
    bullet: l.punkt ? { level: 0 } : undefined, spacing: { after: 40 },
    children: l.fragmenty.map((f) => new TextRun({ text: f.tekst, bold: f.pogrubiony })),
  }))
}

export async function zbudujOferte(d: DaneOferty, firma: DaneFirmy): Promise<Document> {
  const j: Jezyk = d.jezyk ?? 'pl'
  const fj = (n: number | null | undefined, miejsc = 2) =>
    new Intl.NumberFormat(lokalizacja(j), { minimumFractionDigits: miejsc, maximumFractionDigits: miejsc }).format(Number(n ?? 0))
  const przelicz = (n: number) => (d.waluta === 'EUR' && d.kurs_eur ? n / d.kurs_eur : n)
  const jedn = d.waluta === 'EUR' ? 'EUR' : j === 'en' ? 'PLN' : 'zł'
  const tresc: (Paragraph | Table)[] = []
  const tytul = (s: string) => tresc.push(P(s, { bold: true, size: 24, po: 80 }))
  const wiersz = (k: string, v: string | undefined) => { if (v?.trim()) tresc.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: `${k}: `, bold: true }), new TextRun(v)] })) }
  const lista = (naglowek: string, l: string[]) => {
    if (!l.length) return
    tresc.push(P(naglowek, { bold: true, po: 60 }))
    l.forEach((x) => tresc.push(punkt(x)))
    tresc.push(P('', { po: 80 }))
  }

  if (d.projekt) tresc.push(P(tj(j, 'PROJEKT OFERTY - cena niezatwierdzona'), { bold: true, size: 20, wyrownanie: AlignmentType.CENTER }))
  tresc.push(P([firma.miejscowosc?.trim(), d.data].filter(Boolean).join(', '), { wyrownanie: AlignmentType.RIGHT }))
  tresc.push(P(d.klient, { bold: true, po: 40 }))
  if (d.osoba_kontaktowa) tresc.push(P(d.osoba_kontaktowa, { po: 40 }))
  if (d.nr_zapytania_klienta) tresc.push(P(tj(j, 'Dotyczy: zapytanie nr {0}', d.nr_zapytania_klienta), { po: 200 }))
  tresc.push(P(tj(j, 'OFERTA nr {0}', d.numer_oferty || d.numer), { bold: true, size: 28, wyrownanie: AlignmentType.CENTER, po: 200 }))

  const sekcje: SekcjaDoWydruku[] = d.sekcje ?? (['dane', 'przedmiot', 'cena', 'zakres', 'uwagi', 'warunki'] as RodzajSekcji[]).map((rodzaj) => ({ rodzaj, tytul: '', tekst: '' }))
  for (const s of sekcje) {
    const nagl = s.tytul || tytulSekcji({ rodzaj: s.rodzaj, tytul: '' }, j)
    switch (s.rodzaj) {
      case 'dane':
        if (d.sekcje) tytul(nagl)
        wiersz(tj(j, 'Projekt'), d.nazwa_projektu)
        wiersz(tj(j, 'Przedmiot oferty'), d.przedmiot)
        break
      case 'przedmiot':
        if (d.sekcje) tytul(nagl)
        tresc.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: [tj(j, 'Aparat'), tj(j, 'Ilość szt.'), tj(j, 'Materiał'), tj(j, 'Masa [kg]'), tj(j, 'Cena netto [{0}]', jedn)].map((x) => komorka(x, { bold: true, tlo: 'EEF9C4' })) }),
            ...d.pozycje.map((p) => new TableRow({ children: [
              komorka(p.nazwa, { szer: 40 }), komorka(fj(p.ilosc, 0), { prawo: true }), komorka(p.material), komorka(p.masa_kg ? fj(p.masa_kg, 0) : '', { prawo: true }),
              komorka(p.cena !== null ? fj(przelicz(p.cena)) : '', { prawo: true }),
            ] })),
          ],
        }))
        tresc.push(P('', { po: 120 }))
        break
      case 'cena': {
        if (d.sekcje) tytul(nagl)
        const vat = d.cena_netto * d.vat_proc / 100
        tresc.push(P(tj(j, 'Cena netto: {0} {1}', fj(przelicz(d.cena_netto)), jedn), { bold: true, size: 24 }))
        tresc.push(P(tj(j, 'VAT {0}%: {1} {2}   ·   Cena brutto: {3} {2}', d.vat_proc, fj(przelicz(vat)), jedn, fj(przelicz(d.cena_netto + vat)))))
        if (d.cena_bez_opcji !== null) tresc.push(P(tj(j, 'Wariant {0}: {1} {2} netto + VAT', d.opis_wariantu, fj(przelicz(d.cena_bez_opcji)), jedn)))
        if (d.waluta === 'EUR' && d.kurs_eur) tresc.push(P(tj(j, 'Ceny w EUR przeliczone po kursie {0} PLN/EUR.', fj(d.kurs_eur, 4)), { size: 18 }))
        tresc.push(P('', { po: 120 }))
        break
      }
      case 'zakres':
        if (d.sekcje) tytul(nagl)
        lista(tj(j, 'Oferta obejmuje:'), d.obejmuje)
        lista(tj(j, 'Oferta nie obejmuje:'), d.nie_obejmuje)
        break
      case 'uwagi':
        if (d.sekcje) tytul(nagl)
        lista(tj(j, 'Uwagi:'), d.uwagi)
        break
      case 'warunki':
        if (d.sekcje) tytul(nagl)
        wiersz(tj(j, 'Termin realizacji'), d.termin_realizacji)
        wiersz(tj(j, 'Gwarancja'), d.gwarancja)
        wiersz(tj(j, 'Ważność oferty'), d.waznosc)
        wiersz(tj(j, 'Płatność'), d.platnosc)
        wiersz(tj(j, 'Zaliczki'), d.zaliczki)
        wiersz(tj(j, 'Warunki dostawy (Incoterms)'), d.incoterms)
        wiersz(tj(j, 'Miejsce dostawy'), d.miejsce_dostawy)
        wiersz(tj(j, 'Kary umowne'), d.kary)
        break
      case 'zalaczniki':
        if (!d.zalaczniki?.length && !s.tekst.trim()) continue
        tytul(nagl)
        d.zalaczniki?.forEach((x) => tresc.push(punkt(x)))
        break
      case 'wlasna':
        tytul(nagl)
        break
    }
    if (s.tekst.trim()) tresc.push(...akapity(s.tekst), P('', { po: 80 }))
  }

  tresc.push(P('', { po: 400 }))
  tresc.push(P(tj(j, 'Z poważaniem'), { wyrownanie: AlignmentType.RIGHT }))
  if (d.podpis) tresc.push(P(d.podpis, { wyrownanie: AlignmentType.RIGHT }))

  return new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ headers: { default: await naglowekZLogo(firma) }, footers: { default: stopka(firma) }, children: tresc }],
  })
}
