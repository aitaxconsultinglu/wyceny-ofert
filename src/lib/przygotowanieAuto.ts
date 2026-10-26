// Automatyczne przygotowanie zapytania: analiza AI (karta analizy), listy materiałów z rysunków (AI),
// wstępna wycena (aparaty, materiały z cenami z bazy, robocizna wskaźnikowa, usługi) i projekt oferty.
// Najpierw plan z szacunkiem kosztu (bez wywołania modelu), potem wykonanie. Bez klucza AI kroki AI są
// pomijane, a wycena powstaje z tego, co już jest (karta wypełniona ręcznie, zapisane odczyty rysunków).
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { komunikatPL } from './config'
import { szacujAi, wywolajAi, type DaneAi, type RysunekAi, type TrybAi } from './ai'
import { uzupelnijKarte, terminOfertyISO, zWynikuAnalizyAi, type AnalizaAi, type KartaAnalizy, type KrokPrzygotowania, type RaportPrzygotowania } from './analiza'
import { dokumentyZapytania, przygotujAnalize } from './analizaZapytania'
import { listaZRysunku, polaczWyniki, zWynikuAi, type ObszarZrodlowy, type WynikRysunku } from './rysunki'
import { otworzRysunek } from './rysunkiPdf'
import { zadaniaStrony } from './odczytDokumentu'
import { pozycjeZListy } from './importListy'
import { dobierzCene, wczytajCeny } from './bazaCen'
import { BUCKET } from './magazyn'
import { klucz, nowyAparat, parametry, wczytajWycene, zapiszWycene, type PozycjaWyceny } from './wyceny'
import { aparatyZKarty, dopasujAparat, ujednolicJednostkeUslugi, klauzuleZAnalizy, medianaRbhT, przypiszOdczyty, punktyWeryfikacji, terminOferty, zmienneOferty, type KlauzulaBazy } from './przygotowanie'
import type { Gatunek, KategoriaMaterialu, KategoriaUslugi, RodzajStali, StawkaRobocizny, Ustawienia } from './types'
import { dataPL, dzisiajISO } from './format'
import { typAparatuZRodzaju } from './zapytania'
import { t } from '@/i18n'

export const MAKS_STRON_RYSUNKOW = 8
const STRON_NA_RYSUNEK = 3

export interface ZapytanieDoPrzygotowania { id: string; numer: string; przedmiot: string; klient: string | null; klient_id: string | null; nr_zapytania_klienta: string | null; termin_oferty: string | null; status: string }
export interface SlownikiPrzygotowania {
  kategorieMaterialow: KategoriaMaterialu[]; kategorieUslug: KategoriaUslugi[]; gatunki: Gatunek[]; rodzajeStali: RodzajStali[]; stawki: StawkaRobocizny[]; ustawienia: Ustawienia
}

export interface ZadanieAi {
  rodzaj: 'analiza' | 'rysunek'
  opis: string
  tryb: TrybAi
  dane: DaneAi
  koszt_pln: number | null
  /** Rysunek: dokument i strona (wyniki kafli jednej strony łączą się w jeden odczyt). */
  dokument?: { id: string; nazwa: string }
  strona?: number
  kafleNaStronie?: ObszarZrodlowy[]
}

export interface PlanPrzygotowania {
  zadania: ZadanieAi[]
  koszt_pln: number
  aiDostepne: boolean
  uwaga: string | null
  pominiete: string[]
}

type Postep = (opis: string) => void
const BRAK_KLUCZA = /klucz claude api nie jest ustawiony/i

/** Plan: dane do AI przygotowane w przeglądarce (teksty, kafle) i koszt policzony przez funkcję (bez modelu). */
export async function zaplanujPrzygotowanie(z: ZapytanieDoPrzygotowania, opcje: { analiza: boolean; rysunki: boolean }, postep: Postep, db: SupabaseClient = supabase): Promise<PlanPrzygotowania> {
  const zadania: ZadanieAi[] = []
  const pominiete: string[] = []
  if (opcje.analiza) {
    postep(t('Dokumenty do analizy...'))
    const a = await przygotujAnalize({ id: z.id, numer: z.numer, przedmiot: z.przedmiot, klient: z.klient }, db)
    if (a.znakow || a.dane.obrazy?.length) zadania.push({ rodzaj: 'analiza', opis: t('Analiza zapytania: {0} dok., {1} tys. znaków{2}', a.dokumentow, Math.round(a.znakow / 1000), a.skany.length ? `, ${a.skany.length} skan.` : ''), tryb: 'analizuj_zapytanie', dane: a.dane, koszt_pln: null })
    else pominiete.push('Analiza: brak dokumentów istotnych z treścią')
    pominiete.push(...a.pominiete.map((p) => `Analiza: pominięty ${p}`))
  }
  if (opcje.rysunki) {
    const rysunki = (await dokumentyZapytania(z.id, db)).filter((d) => d.istotny && d.typ === 'rysunek' && d.sciezka && d.stan === 'zapisany' && /\.pdf$/i.test(d.nazwa_pliku))
    let stron = 0
    const juzCzytane = new Map<string, string>()
    for (const d of rysunki) {
      if (stron >= MAKS_STRON_RYSUNKOW) { pominiete.push(`Rysunek ${d.nazwa_pliku}: limit ${MAKS_STRON_RYSUNKOW} stron na przygotowanie`); continue }
      postep(t('Rysunek {0}...', d.nazwa_pliku))
      const { data: plik, error } = await db.storage.from(BUCKET).download(d.sciezka!)
      if (error || !plik) { pominiete.push(`Rysunek ${d.nazwa_pliku}: nie udało się pobrać`); continue }
      const pdf = await otworzRysunek(new Uint8Array(await plik.arrayBuffer()))
      for (let nr = 1; nr <= Math.min(pdf.numPages, STRON_NA_RYSUNEK) && stron < MAKS_STRON_RYSUNKOW; nr++, stron++) {
        const strona = await zadaniaStrony(pdf, nr, { zapytanie_id: z.id, dokument_id: d.id }, d.nazwa_pliku)
        // Ten sam rysunek w kilku plikach (np. z zaznaczoną antykorozją / izolacją) - lista raz, inaczej pozycje by się powieliły.
        const tresc = strona[0]?.tresc
        if (tresc) {
          const ten = juzCzytane.get(tresc)
          if (ten) { pominiete.push(`Rysunek ${d.nazwa_pliku}, str. ${nr}: ta sama treść co ${ten} - lista materiałów raz`); continue }
          juzCzytane.set(tresc, `${d.nazwa_pliku}, str. ${nr}`)
        }
        for (const zs of strona) {
          zadania.push({ rodzaj: 'rysunek', opis: zs.opis, tryb: 'wyciagnij_liste_z_rysunku', dane: zs.dane, koszt_pln: null, dokument: { id: d.id, nazwa: d.nazwa_pliku }, strona: nr, kafleNaStronie: zs.kafleNaStronie })
        }
      }
    }
  }
  let aiDostepne = zadania.length > 0
  let uwaga: string | null = null
  let koszt = 0
  for (const [i, zad] of zadania.entries()) {
    postep(t('Szacowanie kosztu {0}/{1}...', i + 1, zadania.length))
    const { szacunek, blad } = await szacujAi(zad.tryb, zad.dane)
    if (blad || !szacunek) {
      aiDostepne = false
      uwaga = blad && BRAK_KLUCZA.test(blad) ? 'Klucz Claude API nie jest ustawiony - kroki AI zostaną pominięte. Wycena powstanie z karty analizy i zapisanych odczytów rysunków.' : (blad ?? 'Nie udało się oszacować kosztu.')
      break
    }
    zad.koszt_pln = szacunek.koszt_pln
    koszt += szacunek.koszt_pln
  }
  return { zadania, koszt_pln: koszt, aiDostepne, uwaga, pominiete }
}

async function zapiszKarte(z: ZapytanieDoPrzygotowania, karta: KartaAnalizy, dodatkowe: Record<string, unknown>, db: SupabaseClient) {
  const { error } = await db.from('analizy_zapytan').upsert({ zapytanie_id: z.id, dane: karta, ...dodatkowe })
  if (error) throw new Error(komunikatPL(error.message))
}

/** Pola karty zapytania z analizy - tylko puste (i ogólny przedmiot z importu). */
async function uzupelnijZapytanie(z: ZapytanieDoPrzygotowania, karta: KartaAnalizy, db: SupabaseClient) {
  const p = karta.podsumowanie
  const zmiany: Record<string, unknown> = {}
  if (!z.nr_zapytania_klienta && p.nr_zapytania_klienta.trim()) zmiany.nr_zapytania_klienta = p.nr_zapytania_klienta.trim()
  const termin = terminOfertyISO(p)
  if (!z.termin_oferty && termin) zmiany.termin_oferty = termin
  if (/^(nowe zapytanie|zapytanie z maila|zapytanie)$/i.test(z.przedmiot.trim()) && p.przedmiot.trim()) zmiany.przedmiot = p.przedmiot.trim()
  if (!z.klient_id && p.klient?.trim()) {
    const nazwa = p.klient.trim()
    const { data: kl } = await db.from('klienci').select('id, nazwa, skrot')
    const znany = (kl ?? []).find((k) => [k.nazwa, k.skrot].filter(Boolean).some((n) => nazwa.toLowerCase().includes(String(n).toLowerCase()) || String(n).toLowerCase().includes(nazwa.toLowerCase())))
    if (znany) zmiany.klient_id = znany.id
    else {
      const { data: nowy } = await db.from('klienci').insert({ nazwa }).select('id').single()
      if (nowy) zmiany.klient_id = nowy.id
    }
  }
  if (Object.keys(zmiany).length) await db.from('zapytania').update(zmiany).eq('id', z.id)
  return Object.keys(zmiany)
}

/** Wykonanie planu: AI (jeśli dostępne), wstępna wycena, projekt oferty, raport do weryfikacji. */
export async function wykonajPrzygotowanie(
  z: ZapytanieDoPrzygotowania, plan: PlanPrzygotowania, opcje: { wycena: boolean; oferta: boolean }, s: SlownikiPrzygotowania,
  widziMarze: boolean, postep: Postep, db: SupabaseClient = supabase,
): Promise<RaportPrzygotowania> {
  const kroki: KrokPrzygotowania[] = []
  let koszt = 0
  const { data: an } = await db.from('analizy_zapytan').select('dane').eq('zapytanie_id', z.id).maybeSingle()
  let karta = uzupelnijKarte(an?.dane as Partial<KartaAnalizy> | undefined)

  // 1. Analiza zapytania.
  const analiza = plan.zadania.find((t) => t.rodzaj === 'analiza')
  if (analiza && plan.aiDostepne) {
    postep(t('Analiza zapytania przez AI (do 2 minut)...'))
    const { odp, blad } = await wywolajAi<AnalizaAi>('analizuj_zapytanie', analiza.dane)
    if (odp) {
      koszt += odp.koszt_pln
      karta = zWynikuAnalizyAi(odp.wynik, karta)
      await zapiszKarte(z, karta, { ekstrakcja_ai: odp.wynik, model: odp.model, koszt_pln: odp.koszt_pln, przeanalizowano: new Date().toISOString() }, db)
      const pola = await uzupelnijZapytanie(z, karta, db)
      kroki.push({ nazwa: 'Analiza zapytania', stan: 'ok', opis: t('wymagań {0}, usług {1}, pytań {2}{3}', karta.wymagania.filter((w) => w.stan === 'wymagane').length, karta.uslugi.length, karta.pytania.length, pola.length ? `; uzupełniono kartę zapytania (${pola.length} pól)` : '') })
    } else kroki.push({ nazwa: 'Analiza zapytania', stan: 'blad', opis: blad ?? t('brak odpowiedzi') })
  } else kroki.push({ nazwa: 'Analiza zapytania', stan: 'pominiety', opis: plan.aiDostepne ? t('brak dokumentów do analizy') : t('AI niedostępne - użyto karty analizy w obecnej postaci') })

  // 2. Listy materiałów z rysunków (wyniki kafli jednej strony łączone w jeden odczyt).
  const rysunki = plan.zadania.filter((t) => t.rodzaj === 'rysunek')
  if (rysunki.length && plan.aiDostepne) {
    const strony = new Map<string, ZadanieAi[]>()
    for (const t of rysunki) strony.set(`${t.dokument!.id}:${t.strona}`, [...(strony.get(`${t.dokument!.id}:${t.strona}`) ?? []), t])
    let pozycji = 0
    let bledy = 0
    for (const [, zad] of strony) {
      const wyniki: WynikRysunku[] = []
      const surowe: RysunekAi[] = []
      for (const zr of zad) {
        postep(t('Odczyt rysunku: {0}...', zr.opis))
        const { odp } = await wywolajAi<RysunekAi>('wyciagnij_liste_z_rysunku', zr.dane)
        if (!odp) { bledy++; continue }
        koszt += odp.koszt_pln
        surowe.push(odp.wynik)
        wyniki.push(zWynikuAi(odp.wynik, zr.kafleNaStronie ?? [], s.kategorieMaterialow.map((k) => k.kod)))
      }
      const w = polaczWyniki(...wyniki)
      if (w.pozycje.length + w.krocce.length + w.parametry.length) {
        const { dokument, strona } = zad[0]
        await db.from('odczyty_rysunkow').insert({
          zapytanie_id: z.id, dokument_id: dokument!.id, nazwa_pliku: dokument!.nazwa, strona, obszary: [{ id: 'caly', rodzaj: 'czesci', x: 0, y: 0, w: 1, h: 1 }],
          wynik: w, ekstrakcja_ai: surowe, zrodlo: 'ai', model: 'automatycznie', koszt_pln: null,
        })
        pozycji += w.pozycje.length
      }
    }
    kroki.push({ nazwa: 'Listy materiałów z rysunków', stan: bledy && !pozycji ? 'blad' : 'ok', opis: t('{0} str., {1} pozycji{2}', strony.size, pozycji, bledy ? `, błędów: ${bledy}` : '') })
  } else kroki.push({ nazwa: 'Listy materiałów z rysunków', stan: 'pominiety', opis: rysunki.length ? t('AI niedostępne - użyto zapisanych odczytów') : t('brak rysunków PDF oznaczonych jako istotne') })

  // 3. Wstępna wycena.
  let wycenaId: string | null = null
  let wersja: number | null = null
  let weryfikacja: RaportPrzygotowania['weryfikacja'] = []
  if (opcje.wycena) {
    postep(t('Wstępna wycena: aparaty, materiały i ceny z bazy...'))
    const { data: wid, error } = await db.rpc('nowa_wycena', { p_zapytanie: z.id, p_nazwa: 'Wstępna - przygotowana automatycznie' })
    if (error) throw new Error(komunikatPL(error.message))
    const st = await wczytajWycene(wid as string, db)
    wycenaId = wid as string
    wersja = st.wycena.wersja
    const zKarty = aparatyZKarty(karta, z.przedmiot)
    // Typ aparatu z rodzaju zapytania (zbiornik / wymiennik ciepła) - typ z analizy AI tylko, gdy zapytanie go nie ma.
    const typZapytania = typAparatuZRodzaju(st.zapytanie.rodzaj_aparatu, st.zapytanie.zakres_wymiennika)
    st.aparaty = zKarty.map((a, i) => ({
      ...(st.aparaty[i] ?? nowyAparat(i + 1)), nazwa: a.nazwa || `Aparat ${i + 1}`, typ: typZapytania ?? a.typ, ilosc: a.ilosc || 1, masa_netto_kg: a.masa_kg,
      srednica_mm: a.srednica_mm, dlugosc_mm: a.dlugosc_mm, wysokosc_mm: a.wysokosc_mm, material_wiodacy: a.material, metoda_robocizny: 'wskaznikowa', pozycje: [],
    }))

    // Materiały z odczytów rysunków (najnowszy odczyt każdej strony).
    const { data: od } = await db.from('odczyty_rysunkow').select('nazwa_pliku, strona, nazwa, wynik, zmodyfikowano').eq('zapytanie_id', z.id).order('zmodyfikowano', { ascending: false })
    const widziane = new Set<string>()
    const podpisy = new Set<string>()
    const odczyty = (od ?? []).filter((o) => {
      // Najnowszy odczyt strony - osobno dla każdej nazwanej tabeli (kilka tabel na jednym arkuszu).
      const k = `${o.nazwa_pliku}:${o.strona}:${o.nazwa ?? ''}`
      if (widziane.has(k)) return false
      widziane.add(k)
      const poz = (o.wynik as WynikRysunku).pozycje
      // Ta sama lista z innego pliku (kopia rysunku z zaznaczeniami) - raz.
      const podpis = poz.map((p) => `${p.poz}|${p.nazwa}`.toLowerCase()).sort().join('\n')
      if (!poz.length || podpisy.has(podpis)) return false
      podpisy.add(podpis)
      return true
    })
    const przydzial = przypiszOdczyty(odczyty.map((o) => o.nazwa_pliku), zKarty)
    const bezAparatu = st.aparaty.length > 1 ? [...new Set(odczyty.filter((o) => dopasujAparat(o.nazwa_pliku, zKarty) === null).map((o) => o.nazwa_pliku))] : []
    odczyty.forEach((o, i) => {
      st.aparaty[przydzial[i]].pozycje.push(...pozycjeZListy(listaZRysunku((o.wynik as WynikRysunku).pozycje), `rysunek ${o.nazwa_pliku}, str. ${o.strona}`))
    })
    for (const a of st.aparaty) {
      if (!a.masa_netto_kg) {
        const masa = a.pozycje.reduce((sum, p) => sum + (p.masa_jedn ?? 0) * (p.ilosc ?? 0), 0)
        if (masa > 0) a.masa_netto_kg = Math.round(masa)
      }
    }

    // Usługi z karty analizy - na pierwszy aparat, zakładka wg kategorii usługi.
    for (const u of karta.uslugi.filter((x) => x.opis.trim())) {
      const kat = s.kategorieUslug.find((k) => k.kod === u.kategoria)
      st.aparaty[0].pozycje.push({
        klucz: klucz(), lp: st.aparaty[0].pozycje.length + 1, zakladka: kat?.zakladka ?? 'kooperacja', sekcja: u.kategoria, nazwa: u.opis.trim(),
        ilosc: u.ilosc ?? 1, jm: u.jm || (u.ilosc ? 'szt' : 'kpl'), cena_jedn: 0, jednostka_ceny: 'jm', zrodlo_ceny: 'recznie',
        uwagi: [u.uwagi, 'z karty analizy'].filter(Boolean).join('; '), dodatkowe: {},
      } as PozycjaWyceny)
    }

    // Ceny z bazy ofert i zakupów (kopia ze źródłem i datą).
    postep(t('Dobór cen z bazy ofert i zakupów...'))
    const { wiersze } = await wczytajCeny({ zakupy: true }, db)
    let zCena = 0
    let wszystkich = 0
    for (const a of st.aparaty) {
      for (const p of a.pozycje) {
        const uslugi = p.zakladka !== 'materialy'
        wszystkich++
        const c = dobierzCene({ sekcja: p.sekcja ?? null, gatunek: p.gatunek, d_zew: p.d_zew, grubosc: p.grubosc, jednostka_ceny: p.jednostka_ceny }, wiersze, s.gatunki, uslugi, undefined, z.id)
        if (!c) continue
        const { dopasowanie, jm_zrodla, ilosc_zrodla, ...cena } = c
        Object.assign(p, cena)
        if (uslugi) ujednolicJednostkeUslugi(p, jm_zrodla, ilosc_zrodla)
        if (dopasowanie === 'przyblizone') p.uwagi = [p.uwagi, 'cena przybliżona (kategoria + gatunek, bez wymiarów)'].filter(Boolean).join('; ')
        zCena++
      }
    }

    // Robocizna wskaźnikowa: mediana rbh/t z podobnych projektów (Registo), wycen wskaźnikowych i zatwierdzonych wycen
    // tego typu aparatu (rbh/t z ich podsumowania - także wycen liczonych szczegółowo), domyślna stawka.
    const stawka = s.stawki.find((x) => x.domyslna && x.aktywna)?.stawka ?? null
    for (const a of st.aparaty) {
      const [{ data: pr }, { data: ap }, { data: zatw }] = await Promise.all([
        a.typ ? db.from('projekty_podsumowanie').select('rbh_na_t').eq('typ_aparatu', a.typ).limit(50) : db.from('projekty_podsumowanie').select('rbh_na_t').limit(50),
        a.typ ? db.from('aparaty').select('wskaznik_rbh_t').eq('typ', a.typ).eq('metoda_robocizny', 'wskaznikowa').not('wskaznik_rbh_t', 'is', null).limit(50) : Promise.resolve({ data: [] as { wskaznik_rbh_t: number }[] }),
        a.typ ? db.from('aparaty').select('nazwa, wyceny!inner(status, podsumowanie)').eq('typ', a.typ).eq('wyceny.status', 'zatwierdzona').limit(50) : Promise.resolve({ data: [] }),
      ])
      const zHistorii = ((zatw ?? []) as unknown as { nazwa: string; wyceny: { podsumowanie: { aparaty?: { nazwa: string; rbh_na_t: number | null }[] } | null } }[])
        .map((x) => x.wyceny.podsumowanie?.aparaty?.find((y) => y.nazwa === x.nazwa)?.rbh_na_t ?? null)
      a.wskaznik_rbh_t = medianaRbhT([...(pr ?? []).map((x) => x.rbh_na_t), ...(ap ?? []).map((x) => x.wskaznik_rbh_t), ...zHistorii])
      a.stawka_wskaznikowa = stawka === null ? null : Number(stawka)
    }

    // Projekt oferty: klauzule do wymagań z karty, zmienne, terminy i warunki domyślne.
    if (opcje.oferta) {
      const { data: kl } = await db.from('klauzule').select('kategoria, tekst, tagi, kolejnosc').eq('aktywna', true)
      const k = klauzuleZAnalizy(karta, (kl ?? []) as KlauzulaBazy[])
      const d = s.ustawienia.oferta_domyslne
      st.wycena.oferta = {
        ...k, zmienne: zmienneOferty(karta, st.aparaty), termin_realizacji: terminOferty(karta), gwarancja_mies: d.gwarancja_mies, waznosc_dni: d.waznosc_dni,
        platnosc: karta.podsumowanie.platnosc.trim() || d.platnosc, waluta: 'PLN', pokaz_wariant: false, opis_wariantu: 'bez pozycji opcjonalnych',
        data: dzisiajISO(), podpis: '', przedmiot: karta.podsumowanie.przedmiot.trim() || z.przedmiot,
      }
    }
    st.wycena.uwagi = `Wstępna wycena przygotowana automatycznie ${dataPL(dzisiajISO())} - do weryfikacji (raport w karcie analizy).`
    await zapiszWycene(st, widziMarze, db)
    kroki.push({ nazwa: 'Wstępna wycena', stan: 'ok', opis: t('v{0}: {1} apar., {2} poz., z ceną z bazy {3}', wersja, st.aparaty.length, wszystkich, zCena) })
    if (opcje.oferta) kroki.push({ nazwa: 'Projekt oferty', stan: 'ok', opis: t('klauzul: {0}', (st.wycena.oferta.obejmuje as string[]).length + (st.wycena.oferta.nie_obejmuje as string[]).length + (st.wycena.oferta.uwagi as string[]).length) })
    weryfikacja = [
      ...bezAparatu.map((p): RaportPrzygotowania['weryfikacja'][number] => ({ rodzaj: 'odczyt', gdzie: 'wycena', opis: t('Lista z rysunku {0} trafiła do pierwszego aparatu - nie wiadomo, którego dotyczy. Przenieś pozycje, jeśli to inny aparat (albo wskaż rysunek przy aparacie w karcie analizy).', p) })),
      ...punktyWeryfikacji(st, parametry(st.wycena, st.marze, s), karta, Number(s.ustawienia.wiek_ceny_ostrzezenie_mies) || 6),
    ]
    if (['nowe', 'w_analizie', 'zapytania_do_dostawcow'].includes(z.status)) await db.from('zapytania').update({ status: 'kalkulacja' }).eq('id', z.id)
  }

  const raport: RaportPrzygotowania = { data: new Date().toISOString(), wycena_id: wycenaId, wersja, koszt_pln: koszt, kroki, weryfikacja }
  karta = { ...karta, przygotowanie: raport }
  await zapiszKarte(z, karta, {}, db)
  return raport
}
