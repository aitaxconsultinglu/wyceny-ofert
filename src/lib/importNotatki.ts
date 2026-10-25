// Import notatki dla prezesa w starym układzie "Wycena.docx" (lista kosztów, razem, narzut, łącznie)
// do nowej metody. Część parsująca linie jest czysta (testy w repo na tekście fikcyjnym).
import type { AparatKalk, PozycjaKalk, Zakladka } from './kalkulacja'
import { zaokraglij } from './kalkulacja'
import { t } from '@/i18n'

export interface NotatkaWyceny {
  nazwa: string
  aparat: AparatKalk
  narzut_zysk_proc: number
  zaokraglenie: number
  korekta_prezesa_kwota: number
  oczekiwane: { razem: number; lacznie: number; cena_koncowa: number | null; cena_bez_opcji: number | null }
}

/** "46 200,- zł" / "293 500,00 zł" -> ostatnia kwota w linii. */
export function kwotaZLinii(linia: string): number | null {
  const wszystkie = [...linia.matchAll(/(\d[\d\s ]*(?:,\d+)?)\s*,?-?\s*zł(?!\/)/g)]
  const ost = wszystkie[wszystkie.length - 1]
  if (!ost) return null
  return Number(ost[1].replace(/[\s ]/g, '').replace(',', '.'))
}

function zakladkaPozycji(nazwa: string, wMaterialach: boolean): { zakladka: Zakladka; sekcja: string | null } {
  const n = nazwa.toLowerCase()
  if (wMaterialach) {
    if (/dennic/.test(n)) return { zakladka: 'materialy', sekcja: 'dennice' }
    if (/króćc|krocc/.test(n)) return { zakladka: 'materialy', sekcja: 'rury_krocce' }
    if (/rurk|rury tech/.test(n)) return { zakladka: 'materialy', sekcja: 'rury_technologiczne' }
    if (/odkuw/.test(n)) return { zakladka: 'materialy', sekcja: 'odkuwki' }
    if (/uszczel|złączn|zlaczn/.test(n)) return { zakladka: 'materialy', sekcja: 'zlaczne' }
    if (/blach|wypał|wypal|przegrod/.test(n)) return { zakladka: 'materialy', sekcja: 'blachy' }
    return { zakladka: 'materialy', sekcja: 'inne' }
  }
  if (/materiał spawal|material spawal/.test(n)) return { zakladka: 'materialy', sekcja: 'spawalnicze' }
  if (/^materiał|^material/.test(n)) return { zakladka: 'materialy', sekcja: 'blachy' }
  if (/^robocizna/.test(n)) return { zakladka: 'robocizna', sekcja: null }
  if (/^kooperacja/.test(n)) return { zakladka: 'kooperacja', sekcja: null }
  if (/antykoroz|izolac|sekafen|malowan|śrutow/.test(n)) return { zakladka: 'kooperacja', sekcja: null }
  if (/projekt|dokumentacj/.test(n)) return { zakladka: 'projekt', sekcja: null }
  if (/badani|ndt|odbior|udt|kj\b/.test(n)) return { zakladka: 'badania', sekcja: null }
  if (/transport|pakowan/.test(n)) return { zakladka: 'transport', sekcja: 'transport' }
  return { zakladka: 'inne', sekcja: null }
}

const liczbaPL = (s: string) => Number(s.replace(/[\s ]/g, '').replace(',', '.'))

export function parsujNotatke(liniePliku: string[]): NotatkaWyceny {
  const linie = liniePliku.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const nazwa = linie[0] ?? ''
  const pozycje: PozycjaKalk[] = []
  let wMaterialach = false
  let razem: number | null = null
  let zysk = 0
  let lacznie: number | null = null
  let korekta = 0
  let cenaKoncowa: number | null = null
  let cenaBezOpcji: number | null = null
  let opcje: string[] = []
  let masa: number | null = Number(/o wadze (?:około )?([\d\s]+)\s*kg/i.exec(nazwa)?.[1]?.replace(/\s/g, '') ?? NaN) || null
  const mT = /o wadze (?:około )?(\d+[,.]?\d*)\s*T\b/i.exec(nazwa)
  if (!masa && mT) masa = liczbaPL(mT[1]) * 1000

  for (const l of linie.slice(1)) {
    if (/^Oferta obejmuje/i.test(l)) break
    const [etykieta] = l.split(':')
    if (razem === null) {
      if (/^Materiał hutniczy:?$/i.test(l)) { wMaterialach = true; continue }
      if (/^(Razem|Całkowita kwota)\b/i.test(l)) {
        if (wMaterialach && /^Razem/i.test(l)) { wMaterialach = false; continue }   // suma pośrednia materiałów
        razem = kwotaZLinii(l)
        continue
      }
      const kwota = kwotaZLinii(l)
      if (kwota === null) continue
      const { zakladka, sekcja } = zakladkaPozycji(etykieta, wMaterialach)
      const rob = /(\d[\d\s]*)\s*rb[gh]\s*x\s*(\d+(?:,\d+)?)\s*zł/i.exec(l)
      const matKg = /=\s*([\d\s]+(?:,\d+)?)\s*kg\s*x\s*(\d+(?:,\d+)?)\s*zł\/kg/i.exec(l)
      const masaPoz = /([\d\s]+)\s*kg\s*:/i.exec(l)
      if (zakladka === 'robocizna' && rob) {
        pozycje.push({ zakladka, sekcja: null, nazwa: 'Robocizna', ilosc: liczbaPL(rob[1]), jm: 'rbh', cena_jedn: liczbaPL(rob[2]), jednostka_ceny: 'jm', wartosc_reczna: kwota })
      } else if (zakladka === 'materialy' && matKg) {
        pozycje.push({ zakladka, sekcja, nazwa: etykieta, ilosc: liczbaPL(matKg[1]), jm: 'kg', cena_jedn: liczbaPL(matKg[2]), jednostka_ceny: 'kg', wartosc_reczna: kwota })
      } else {
        const masaKg = masaPoz ? liczbaPL(masaPoz[1]) : null
        pozycje.push({
          zakladka, sekcja, nazwa: etykieta.replace(/\s*[\d\s]+\s*kg$/i, '').trim(), ilosc: 1, jm: 'kpl',
          masa_jedn: masaKg, masa_reczna: masaKg !== null, cena_za_komplet: masaKg === null, cena_jedn: kwota, jednostka_ceny: 'jm', wartosc_reczna: kwota,
        })
      }
      continue
    }
    const narzut = /^Narzut\s*(\d+(?:,\d+)?)\s*%/i.exec(l)
    if (narzut) { zysk = liczbaPL(narzut[1]); continue }
    if (/^Łącznie/i.test(l)) {
      const kwoty = [...l.matchAll(/(\d[\d\s ]*(?:,\d+)?)\s*,?-?\s*zł/g)].map((m) => liczbaPL(m[1]))
      lacznie = kwoty[0] ?? null
      if (/prezes/i.test(l) && kwoty.length >= 3) { korekta = kwoty[1]; cenaKoncowa = kwoty[2] }
      continue
    }
    const bez = /^Cena z \d+% narzutem bez (.+?):/i.exec(l)
    if (bez) {
      cenaBezOpcji = kwotaZLinii(l)
      opcje = bez[1].split(/\s+i\s+|\//).map((s) => s.trim().toLowerCase().slice(0, 6)).filter((s) => s.length >= 5)
      continue
    }
    const waga = /^Waga[^:]*:\s*([\d\s]+)\s*kg/i.exec(l)
    if (waga) masa = liczbaPL(waga[1])
  }
  for (const p of pozycje) {
    const n = p.nazwa.toLowerCase()
    if (opcje.some((o) => n.includes(o) || n.includes(o.replace('demont', 'montaż')))) { p.opcjonalna = true; p.wariant = 'bez pozycji opcjonalnych' }
  }
  if (razem === null || lacznie === null) throw new Error(t('Nie rozpoznano układu notatki (brak "Razem"/"Całkowita kwota" albo "Łącznie").'))
  // Zaokrąglenie ceny, które daje "Łącznie" z notatki.
  const surowa = razem * (1 + zysk / 100)
  const zaokr = [0, 10, 100, 1000].find((k) => Math.abs(zaokraglij(surowa, k) - lacznie!) < 0.01) ?? 0
  // Notatki podawały kwoty materiałów już po naddatkach - zerujemy domyślne naddatki kategorii.
  const naddatki = Object.fromEntries(pozycje.filter((p) => p.zakladka === 'materialy').map((p) => [p.sekcja ?? 'inne', 0]))
  return {
    nazwa,
    aparat: { nazwa, ilosc: 1, masa_netto_kg: masa, metoda_robocizny: 'szczegolowa', wskaznik_rbh_t: null, stawka_wskaznikowa: null, liczba_osob: 8, naddatki, pozycje },
    narzut_zysk_proc: zysk, zaokraglenie: zaokr, korekta_prezesa_kwota: korekta,
    oczekiwane: { razem, lacznie, cena_koncowa: cenaKoncowa, cena_bez_opcji: cenaBezOpcji },
  }
}

export async function importujNotatkeWyceny(dane: Uint8Array): Promise<NotatkaWyceny> {
  const mammoth = await import('mammoth')
  const zrodlo = typeof window === 'undefined'
    ? { buffer: Buffer.from(dane) }
    : { arrayBuffer: dane.buffer.slice(dane.byteOffset, dane.byteOffset + dane.byteLength) as ArrayBuffer }
  const { value } = await mammoth.extractRawText(zrodlo as Parameters<typeof mammoth.extractRawText>[0])
  return parsujNotatke(value.split('\n'))
}
