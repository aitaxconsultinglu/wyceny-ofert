import { describe, expect, it } from 'vitest'
import { kwota, najlepszeOferty, ofertaZTekstu, parametryKategorii, stanOfertyPozycji, wymaganePozycje, type ProsbaOOferte } from './prosby'
import { pustaKarta } from './analiza'

// Dane FIKCYJNE - treści maili z ofertami (PL i EN).
const KATEGORIE = [
  { kod: 'pwht', nazwa: 'PWHT', zakladka: 'kooperacja' }, { kod: 'ndt', nazwa: 'NDT', zakladka: 'badania' },
  { kod: 'sekafenowanie', nazwa: 'Sekafenowanie', zakladka: 'kooperacja' }, { kod: 'transport', nazwa: 'Transport', zakladka: 'transport' },
]

describe('oferta z maila bez AI', () => {
  it('kwoty w zapisie PL i EN', () => {
    expect(kwota('12 500,00')).toBe(12500)
    expect(kwota('12.500,00')).toBe(12500)
    expect(kwota('12,500.00')).toBe(12500)
    expect(kwota('3450')).toBe(3450)
    expect(kwota('98,5')).toBe(98.5)
  })
  it('PL: ilość × cena jednostkowa, termin, ważność, Incoterms', () => {
    const o = ofertaZTekstu('Dzień dobry,\nSekafenowanie wkładu: 145 m2 x 120,00 zł\nTermin realizacji: 3 tygodnie od dostarczenia\nOferta ważna do 30.11.2026\nDostawa DAP zakład zamawiającego\nCena brutto 21 402,00 zł')
    expect(o.pozycje).toEqual([{ opis: 'Sekafenowanie wkładu', ilosc: 145, jm: 'm2', cena_jedn: 120, wartosc: 17400 }])
    expect([o.waluta, o.termin_dni, o.waznosc_do, o.warunki_dostawy.slice(0, 3), o.wystarczy]).toEqual(['PLN', 21, '2026-11-30', 'DAP', true])
  })
  it('EN: cena za jednostkę i kwota z walutą przed liczbą', () => {
    const o = ofertaZTekstu('PWHT of the bundle - price EUR 3,450.00 net\nRadiography: 95.00 EUR/m\nLead time: 10 days\nValid for 30 days')
    expect(o.pozycje.map((p) => [p.cena_jedn, p.jm])).toEqual([[3450, 'kpl'], [95, 'm']])
    expect([o.waluta, o.termin_dni, o.waznosc_opis]).toEqual(['EUR', 10, 'Valid for 30 days'])
  })
  it('brak ceny - odczyt nie wystarcza (propozycja AI)', () => {
    expect(ofertaZTekstu('W załączeniu oferta. Pozdrawiam').wystarczy).toBe(false)
  })
})

describe('prośby o oferty', () => {
  const prosba = (zm: Partial<ProsbaOOferte> = {}): ProsbaOOferte => ({
    id: 'p1', zapytanie_id: 'z', wycena_id: null, zakladka: 'kooperacja', kategoria_uslugi: 'pwht', opis: 'PWHT', parametry: {}, status: 'nowa',
    termin: null, zlecajacy: null, odpowiedzialny: null, oferta_id: null, uwagi: null, utworzono: '', zmodyfikowano: '', ...zm,
  })
  it('stan pozycji: brak oferty -> prośba wysłana -> oferta otrzymana -> wybrana', () => {
    const poz = { dodatkowe: { prosba_id: 'p1' }, zrodlo_ceny: 'recznie' as const, zrodlo_id: null }
    expect(stanOfertyPozycji({ ...poz, dodatkowe: {} }, null, [])).toBe('brak_oferty')
    expect(stanOfertyPozycji(poz, prosba(), [])).toBe('prosba_wyslana')
    expect(stanOfertyPozycji(poz, prosba({ status: 'oferta_otrzymana' }), ['o1'])).toBe('oferta_otrzymana')
    expect(stanOfertyPozycji({ ...poz, zrodlo_ceny: 'oferta', zrodlo_id: 'o1' }, prosba(), ['o1'])).toBe('wybrana')
  })
  it('parametry zależne od kategorii', () => {
    expect(parametryKategorii('sekafenowanie').map(([k]) => k)).toEqual(expect.arrayContaining(['powierzchnia_m2', 'system', 'termin']))
    expect(parametryKategorii('transport').map(([k]) => k)).toEqual(expect.arrayContaining(['trasa', 'masa_kg', 'gabaryt']))
    expect(parametryKategorii(null).map(([k]) => k)).toEqual(['ilosc', 'termin', 'miejsce'])
  })
  it('wymagane pozycje z karty analizy, bez powtórzeń', () => {
    const k = pustaKarta()
    k.uslugi = [{ kategoria: 'sekafenowanie', opis: 'Sekafenowanie sit', ilosc: 12, jm: 'm2', uwagi: '' }]
    k.wymagania = k.wymagania.map((w) => (w.kod === 'pwht' || w.kod === 'ndt' || w.kod === 'sekafenowanie' ? { ...w, stan: 'wymagane', opis: 'wg spec.' } : w))
    const p = wymaganePozycje(k, [{ zakladka: 'badania', sekcja: 'ndt', nazwa: 'RT' }], KATEGORIE)
    expect(p.map((x) => [x.zakladka, x.sekcja, x.ilosc, x.jm])).toEqual([['kooperacja', 'sekafenowanie', 12, 'm2'], ['kooperacja', 'pwht', 1, 'kpl']])
  })
  it('porównanie: najtańsza i najszybsza', () => {
    expect(najlepszeOferty([
      { id: 'a', dostawca: 'A', cena_pln: 9000, termin_dni: 20, waznosc_do: null },
      { id: 'b', dostawca: 'B', cena_pln: 8000, termin_dni: 30, waznosc_do: null },
    ])).toEqual({ najtansza: 'b', najszybsza: 'a' })
  })
})
