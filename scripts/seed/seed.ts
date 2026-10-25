// Dane testowe z lokalnego folderu materiałów -> Supabase (klucz serwisowy z .env).
// Dane NIE trafiają do repozytorium: skrypt czyta pliki z dysku (FOLDER_MATERIALOW), a listę plików,
// klientów i zapytań z lokalnego prywatne/seed.json.
// Używa tych samych modułów co aplikacja (parsery, normalizacja, zapis ofert i dokumentów),
// więc przy okazji je testuje. Można uruchamiać wielokrotnie - nie dubluje danych.
//
//   npx vite-node scripts/seed/seed.ts                 - wszystkie kroki
//   npx vite-node scripts/seed/seed.ts zapytania karty - wybrane kroki
// Kroki: firma, klienci, zapytania, teksty, karty, registo, wyceny, oferty, stan
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { wierszePierwszegoArkusza } from '../../src/lib/arkusz'
import { parsujKarteDostawy } from '../../src/lib/importOptima'
import { rodzajZPrzedmiotu } from '../../src/lib/zapytania'
import { agregujRegisto } from '../../src/lib/importRegisto'
import { base64ZBajtow, wczytajDane, type TypDokumentu, type WczytanyPlik } from '../../src/lib/dokumenty'
import { zapiszDokument } from '../../src/lib/magazyn'
import { formularzZAi, kursNaDzien, zapiszOferte, type Slowniki } from '../../src/lib/oferty'
import { normalizujCene } from '../../src/lib/normalizacjaOfert'
import type { KlasyfikacjaMaila, OfertaAi } from '../../src/lib/ai'
import { wierszeZFormulami, wszystkieArkusze } from '../../src/lib/arkusz'
import { importujArkuszWyceny } from '../../src/lib/importArkuszaWyceny'
import { importujNotatkeWyceny } from '../../src/lib/importNotatki'
import { importujStaraKalkulacje, materialyZeStarejKalkulacji, narzutZNotatki } from '../../src/lib/importKalkulacjiStarej'
import { policzWycene, type AparatKalk } from '../../src/lib/kalkulacja'
import { parametry, podsumowanieKosztow, type Marze, type Wycena } from '../../src/lib/wyceny'

const KORZEN = join(__dirname, '..', '..')
const env = Object.fromEntries(
  readFileSync(join(KORZEN, '.env'), 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
) as Record<string, string>
const MAT = process.env.FOLDER_MATERIALOW || env.FOLDER_MATERIALOW
if (!MAT || !existsSync(MAT)) throw new Error('Ustaw FOLDER_MATERIALOW w .env (folder z materiałami testowymi).')
const db: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const LIMIT_MB = 50

// Definicje (klienci, zapytania z dokumentami, oferty, karty dostawy, wyceny historyczne) są w pliku lokalnym
// prywatne/seed.json - repozytorium jest publiczne i nie zawiera nazw firmy, klientów ani dostawców.
// Format: scripts/seed/seed.przyklad.json (dane fikcyjne).
interface DefDokumentu { plik: string; typ: TypDokumentu; istotny: boolean; tylkoTekst?: boolean }
interface DefZapytania {
  numer: string | { rok: number }
  przedmiot: string
  klient: string
  nr_zapytania_klienta?: string
  nr_zapotrzebowania?: string
  zrodlo: 'mail' | 'platforma' | 'wizja_lokalna' | 'inne'
  status: string
  termin_oferty?: string
  utworzono?: string
  uwagi?: string
  dokumenty: DefDokumentu[]
  /** Mail z załącznikami: załączniki pasujące do wzorca "pomin" (np. obliczenia) pomijane - limit planu Free. */
  mail?: { plik: string; pomin: string }
}
interface KonfiguracjaSeeda {
  firma?: { nazwa?: string; miejscowosc?: string; domeny?: string[]; opis_dzialalnosci?: string; logo?: string }
  klienci: { nazwa: string; skrot: string | null }[]
  zapytania: DefZapytania[]
  oferty: { plik: string; zo: string }[]
  karty: { plik: string; tytul: string; typ: string }[]
  registo?: string
  wyceny: {
    arkusze: { plik: string; rok: number; klient: string; typ: string; material: string | null }[]
    kalkulacje: { kalk: string; notatka: string; przedmiot: string; typ: string }[]
    notatki: { plik: string; przedmiot: string; typ: string; material: string }[]
  }
}
const PLIK_KONFIGURACJI = process.env.SEED_KONFIGURACJA || join(KORZEN, 'prywatne', 'seed.json')
if (!existsSync(PLIK_KONFIGURACJI)) throw new Error(`Brak ${PLIK_KONFIGURACJI} - skopiuj scripts/seed/seed.przyklad.json i uzupełnij (plik lokalny, poza repo).`)
const K = JSON.parse(readFileSync(PLIK_KONFIGURACJI, 'utf8')) as KonfiguracjaSeeda
const KLIENCI = K.klienci
const ZAPYTANIA = K.zapytania
const OFERTY = K.oferty
const KARTY = K.karty

// ---------------------------------------------------------------------------------------------
const log = (...a: unknown[]) => console.log(...a)
const sciezka = (p: string) => join(MAT, p)
async function wczytaj(p: string): Promise<WczytanyPlik> {
  return wczytajDane(p.split('/').pop()!, new Uint8Array(readFileSync(sciezka(p))))
}
function sprawdz<T>(r: { data: T | null; error: { message: string } | null }, co: string): T {
  if (r.error) throw new Error(`${co}: ${r.error.message}`)
  return r.data as T
}

/** Dane firmy w ustawieniach (nazwa, miejscowość, domeny poczty, opis dla AI, logo) - uzupełnia istniejące pola. */
async function firma() {
  if (!K.firma) { log('  (brak sekcji "firma" w konfiguracji)'); return }
  const { logo, ...pola } = K.firma
  const obecne = (sprawdz(await db.from('ustawienia').select('wartosc').eq('klucz', 'firma').single(), 'ustawienia firma') as { wartosc: Record<string, unknown> }).wartosc
  const dane: Record<string, unknown> = { ...obecne, ...Object.fromEntries(Object.entries(pola).filter(([, v]) => v !== undefined && v !== '')) }
  if (logo && existsSync(join(KORZEN, logo))) dane.logo = `data:image/png;base64,${readFileSync(join(KORZEN, logo)).toString('base64')}`
  sprawdz(await db.from('ustawienia').update({ wartosc: dane }).eq('klucz', 'firma').select('klucz'), 'zapis firmy')
  log(`Firma: ${String(dane.nazwa)}${dane.logo ? ', z logo' : ''}`)
}

async function klienci() {
  for (const k of KLIENCI) {
    sprawdz(await db.from('klienci').upsert(k, { onConflict: 'nazwa' }).select('id'), `klient ${k.nazwa}`)
  }
  log(`Klienci: ${KLIENCI.length}`)
}

async function idKlienta(nazwa: string) {
  return sprawdz(await db.from('klienci').select('id').eq('nazwa', nazwa).single(), `klient ${nazwa}`).id as string
}

async function znajdzLubUtworzZapytanie(z: DefZapytania): Promise<string> {
  const ist = sprawdz(await db.from('zapytania').select('id, numer').eq('przedmiot', z.przedmiot).maybeSingle(), 'zapytanie')
  const dane = {
    przedmiot: z.przedmiot, klient_id: await idKlienta(z.klient), nr_zapytania_klienta: z.nr_zapytania_klienta ?? null,
    nr_zapotrzebowania: z.nr_zapotrzebowania ?? null, zrodlo: z.zrodlo, status: z.status, termin_oferty: z.termin_oferty ?? null,
    uwagi: z.uwagi ?? null, ...(z.utworzono ? { utworzono: z.utworzono } : {}),
  }
  if (ist) {
    sprawdz(await db.from('zapytania').update(dane).eq('id', ist.id).select('id'), 'aktualizacja zapytania')
    return ist.id
  }
  const numer = typeof z.numer === 'string' ? z.numer : (sprawdz(await db.rpc('nastepny_numer_zo', { p_rok: z.numer.rok }), 'numer ZO') as string)
  const nowe = sprawdz(await db.from('zapytania').insert({ ...dane, ...rodzajZPrzedmiotu(String(dane.przedmiot ?? '')), numer }).select('id').single(), `zapytanie ${numer}`)
  log(`  nowe zapytanie ${numer}`)
  return nowe.id
}

async function dokumentIstnieje(pole: 'zapytanie_id' | 'oferta_id' | 'projekt_id', id: string, nazwa: string) {
  const r = await db.from('dokumenty').select('id').eq(pole, id).eq('nazwa_pliku', nazwa).limit(1)
  return (r.data ?? []).length > 0
}

async function zapytania() {
  for (const z of ZAPYTANIA) {
    const id = await znajdzLubUtworzZapytanie(z)
    for (const d of z.dokumenty) {
      const nazwa = d.plik.split('/').pop()!
      if (!existsSync(sciezka(d.plik))) { log(`  ! brak pliku ${d.plik}`); continue }
      if (await dokumentIstnieje('zapytanie_id', id, nazwa)) continue
      const plik = await wczytaj(d.plik)
      const { ostrzezenia } = await zapiszDokument(plik, { zapytanie_id: id }, { typ: d.typ, istotny: d.istotny, limitMb: LIMIT_MB, pominPlik: d.tylkoTekst }, db)
      log(`  + ${nazwa} (${(plik.rozmiar / 1024).toFixed(0)} kB${d.tylkoTekst ? ', tylko tekst' : ''})`)
      ostrzezenia.forEach((o) => log(`    ! ${o}`))
    }
    if (z.mail && !(await dokumentIstnieje('zapytanie_id', id, z.mail.plik))) {
      const mail = await wczytaj(z.mail.plik)
      const zalaczniki = mail.zalaczniki
      const { dokument } = await zapiszDokument({ ...mail, zalaczniki: [] }, { zapytanie_id: id }, { typ: 'korespondencja', istotny: true, limitMb: LIMIT_MB }, db)
      log(`  + mail ${z.mail.plik} (treść jako tekst)`)
      for (const zal of zalaczniki) {
        if (new RegExp(z.mail.pomin, 'i').test(zal.nazwa)) {
          sprawdz(await db.from('dokumenty').insert({
            nadrzedny_id: dokument.id, zapytanie_id: id, nazwa_pliku: zal.nazwa, typ: 'obliczenia', mime: zal.mime, rozmiar: zal.rozmiar,
            stan: 'pominiety_limit', istotny: false, tekst: null, metadane: { powod: 'pominięte – limit planu', stron: zal.metadane.stron ?? null },
          }).select('id'), 'dokument pominięty')
          log(`    - ${zal.nazwa} (${(zal.rozmiar / 1024 / 1024).toFixed(1)} MB) pominięte - limit planu`)
        } else {
          const typ: TypDokumentu = /rysunek/i.test(zal.nazwa) ? 'rysunek' : 'inne'
          await zapiszDokument(zal, { nadrzedny_id: dokument.id, zapytanie_id: id }, { typ, istotny: typ === 'rysunek', limitMb: LIMIT_MB }, db)
          log(`    + ${zal.nazwa}`)
        }
      }
    }
  }
  log(`Zapytania: ${ZAPYTANIA.length}`)
}

async function karty() {
  for (const k of KARTY) {
    const karta = parsujKarteDostawy(wierszePierwszegoArkusza(readFileSync(sciezka(k.plik))))
    sprawdz(await db.rpc('importuj_karte_dostawy', {
      p_naglowek: { numer_karty: karta.numer_karty, nazwa_pliku: k.plik, suma_stopka: karta.suma_stopka, suma_pozycji: karta.suma_pozycji, zgodna: karta.zgodna },
      p_pozycje: karta.pozycje,
    }), `karta ${k.plik}`)
    const projekt = sprawdz(await db.from('projekty').select('id, tytul, typ_aparatu').eq('numer', karta.numer_karty).single(), 'projekt')
    await db.from('projekty').update({ tytul: projekt.tytul || k.tytul, typ_aparatu: projekt.typ_aparatu || k.typ }).eq('id', projekt.id)
    if (!(await dokumentIstnieje('projekt_id', projekt.id, k.plik))) {
      await zapiszDokument(await wczytaj(k.plik), { projekt_id: projekt.id }, { typ: 'karta_dostawy', istotny: false, limitMb: LIMIT_MB }, db)
    }
    log(`Karta ${karta.numer_karty}: ${karta.pozycje.length} pozycji, stopka ${karta.suma_stopka}, suma zamówień ${karta.suma_zamowien}, zgodna: ${karta.zgodna}`)
  }
}

async function registo() {
  // Surowy raport (z nazwiskami) NIE trafia do Storage - tylko agregaty.
  if (!K.registo) { log('  (brak pliku Registo w konfiguracji)'); return }
  const REGISTO = K.registo
  const { miesiace, bledy } = agregujRegisto(wierszePierwszegoArkusza(readFileSync(sciezka(REGISTO))))
  if (bledy.length) throw new Error(bledy.join('; '))
  for (const m of miesiace) {
    sprawdz(await db.rpc('importuj_registo', {
      p_naglowek: { miesiac: m.miesiac, nazwa_pliku: REGISTO.split('/').pop(), wierszy: m.wierszy, pominietych: m.pominietych, godzin: m.godzin },
      p_wiersze: m.agregaty,
    }), `Registo ${m.miesiac}`)
    log(`Registo ${m.miesiac}: ${m.godzin} h, ${m.agregaty.length} agregatów, pominięto ${m.pominietych} wierszy bez projektu`)
  }
}

async function ai<T>(tryb: string, dane: Record<string, unknown>): Promise<{ wynik: T; model: string; koszt_pln: number }> {
  const odp = await fetch(`${env.SUPABASE_URL}/functions/v1/ai`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_JWT}`, apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tryb, ...dane }),
  })
  const json = await odp.json()
  if (!odp.ok || json.error) throw new Error(`AI ${tryb}: ${json.error ?? odp.status}`)
  return json
}

/** Treść oferty dla modelu: mail - tekst (z tekstami PDF-ów w załącznikach); PDF - tekst albo cały PDF, gdy to skan. */
function trescDoAi(p: WczytanyPlik) {
  if (p.rodzaj === 'mail') {
    const zal = p.zalaczniki.filter((z) => z.rodzaj === 'pdf' && z.tekst && !/datasheet|karta techn|aprobata/i.test(z.nazwa))
    return {
      tekst: [`MAIL - temat: ${p.metadane.temat}\nod: ${p.metadane.od}\ndata: ${p.metadane.data ?? ''}\n\n${p.tekst}`,
        ...zal.map((z) => `ZAŁĄCZNIK ${z.nazwa}:\n${z.tekst}`)].join('\n\n==========\n\n'),
      pdfy: [],
    }
  }
  if (p.rodzaj === 'pdf' && p.metadane.skan) {
    return { tekst: `PLIK ${p.nazwa} (skan)`, pdfy: [{ nazwa: p.nazwa, dane: base64ZBajtow(p.dane), stron: Number(p.metadane.stron ?? 1) }] }
  }
  return { tekst: `PLIK ${p.nazwa}:\n${p.tekst}`, pdfy: [] }
}

async function oferty() {
  const [kmat, gat, rodz, dost, zap] = await Promise.all([
    db.from('kategorie_materialow').select('*'), db.from('gatunki').select('*'), db.from('rodzaje_stali').select('*'),
    db.from('dostawcy').select('id, nazwa, aliasy'), db.from('zapytania').select('id, numer'),
  ])
  const slowniki: Slowniki = { kategorieMaterialow: kmat.data ?? [], gatunki: gat.data ?? [], rodzajeStali: rodz.data ?? [] }
  const dostawcy = (dost.data ?? []) as { id: string; nazwa: string; aliasy: string[] }[]
  let koszt = 0
  for (const o of OFERTY) {
    const nazwa = o.plik.split('/').pop()!
    const ist = await db.from('dokumenty').select('id').eq('nazwa_pliku', nazwa).not('oferta_id', 'is', null).limit(1)
    if ((ist.data ?? []).length) { log(`  = ${nazwa} (już w bazie)`); continue }
    const plik = await wczytaj(o.plik)
    const tresc = trescDoAi(plik)
    const klas = await ai<KlasyfikacjaMaila>('klasyfikuj_mail', { tekst: tresc.tekst.slice(0, 30_000), pdfy: tresc.pdfy, metadane: { plik: nazwa } })
    const odp = await ai<OfertaAi>('wyciagnij_oferte', { ...tresc, metadane: { plik: nazwa } })
    koszt += klas.koszt_pln + odp.koszt_pln
    // Nazwa dostawcy bywa tylko w logo (obraz poza warstwą tekstową) - wtedy drugi odczyt z samego PDF-u (model widzi stronę).
    if (!odp.wynik.dostawca.nazwa && plik.rodzaj === 'pdf' && !plik.metadane.skan) {
      const zPdf = await ai<OfertaAi>('wyciagnij_oferte', {
        tekst: `PLIK ${nazwa} - nazwa dostawcy może być tylko w logo / graficznym nagłówku pisma.`,
        pdfy: [{ nazwa, dane: base64ZBajtow(plik.dane), stron: Number(plik.metadane.stron ?? 1) }], metadane: { plik: nazwa },
      })
      koszt += zPdf.koszt_pln
      if (zPdf.wynik.dostawca.nazwa) odp.wynik.dostawca = { ...odp.wynik.dostawca, nazwa: zPdf.wynik.dostawca.nazwa }
    }
    if (!odp.wynik.dostawca.nazwa) { log(`  ! ${nazwa}: brak nazwy dostawcy w dokumencie - pominięto (do dodania ręcznie w aplikacji)`); continue }
    const zrodlo = plik.rodzaj === 'mail' ? 'mail' : plik.metadane.skan ? 'skan' : 'pdf'
    const f = formularzZAi(odp.wynik, dostawcy, zrodlo)
    f.zapytanie_id = zap.data?.find((z) => z.numer === o.zo)?.id ?? null
    if (!f.nr_zo) f.nr_zo = o.zo
    // Kurs NBP z dnia oferty - jak formularz w aplikacji.
    const k = await kursNaDzien(f.waluta, f.data_oferty, db)
    if (k && f.waluta !== 'PLN') Object.assign(f, { kurs: k.kurs, kurs_data: k.data, kurs_zrodlo: `NBP ${k.tabela ?? ''}`.trim() })
    else if (!k) log(`  ! ${nazwa}: brak kursu ${f.waluta} z ${f.data_oferty} - ceny PLN po kursie 1`)
    const id = await zapiszOferte(f, slowniki, 'zatwierdzona', db)
    const { dokument } = await zapiszDokument(plik, { oferta_id: id }, { typ: plik.rodzaj === 'mail' ? 'korespondencja' : 'oferta_dostawcy', istotny: true, limitMb: LIMIT_MB }, db)
    await db.from('oferty_dostawcow').update({ dokument_id: dokument.id }).eq('id', id)
    if (!f.dostawca_id) {
      const nowy = (await db.from('oferty_dostawcow').select('dostawca_id, dostawcy(id, nazwa, aliasy)').eq('id', id).single()).data as unknown as { dostawcy: { id: string; nazwa: string; aliasy: string[] } }
      if (nowy?.dostawcy) dostawcy.push(nowy.dostawcy)
    }
    log(`  + ${nazwa}: ${odp.wynik.dostawca.nazwa} - ${odp.wynik.pozycje.length} poz. (${odp.model}, ${(klas.koszt_pln + odp.koszt_pln).toFixed(3)} zł)`)
  }
  log(`Oferty: koszt AI łącznie ${koszt.toFixed(3)} zł`)

  // Oferty walutowe zapisane wcześniej bez kursu (kurs 1): kurs NBP z dnia oferty i ceny PLN pozycji od nowa.
  const { data: bezKursu } = await db.from('oferty_dostawcow').select('id, waluta, data_oferty, utworzono').neq('waluta', 'PLN').is('kurs_zrodlo', null)
  for (const o of bezKursu ?? []) {
    const k = await kursNaDzien(o.waluta, o.data_oferty ?? String(o.utworzono).slice(0, 10), db)
    if (!k) { log(`  ! oferta ${o.id}: brak kursu ${o.waluta}`); continue }
    sprawdz(await db.from('oferty_dostawcow').update({ kurs: k.kurs, kurs_data: k.data, kurs_zrodlo: `NBP ${k.tabela ?? ''}`.trim() }).eq('id', o.id), 'kurs oferty')
    const { data: poz } = await db.from('pozycje_ofert').select('id, ilosc, jm, cena_jedn, wartosc, masa_jedn, masa_calk, dlugosc, wielkosc_odniesienia').eq('oferta_id', o.id)
    const liczbaLubNull = (v: unknown) => (v === null || v === undefined ? null : Number(v))
    for (const p of poz ?? []) {
      const c = normalizujCene({
        ilosc: Number(p.ilosc), jm: p.jm, cena_jedn: Number(p.cena_jedn), wartosc: liczbaLubNull(p.wartosc), masa_jedn: liczbaLubNull(p.masa_jedn),
        masa_calk: liczbaLubNull(p.masa_calk), dlugosc: liczbaLubNull(p.dlugosc), wielkosc_odniesienia: liczbaLubNull(p.wielkosc_odniesienia),
      }, k.kurs)
      sprawdz(await db.from('pozycje_ofert').update({
        cena_pln_jedn: c.cena_pln_jedn, cena_pln_kg: c.cena_pln_kg, cena_pln_m: c.cena_pln_m, cena_pln_szt: c.cena_pln_szt, cena_pln_odniesienia: c.cena_pln_odniesienia,
      }).eq('id', p.id), 'ceny PLN pozycji')
    }
    log(`  ~ oferta w ${o.waluta} z ${o.data_oferty}: kurs NBP ${k.kurs} (${k.data}), przeliczono ${poz?.length ?? 0} poz.`)
  }
}

// --- Historyczne wyceny w nowej metodzie (dane dla "Podobnych zleceń") ----------------------------------
interface DefWyceny {
  przedmiot: string
  nowe?: { rok: number; klient: string; utworzono?: string }   // zapytanie do utworzenia, gdy go nie ma
  zrodlo: string
  aparaty: (AparatKalk & { typ: string; material_wiodacy: string | null })[]
  narzut_zakupowy_proc: number
  zysk: number
  zaokraglenie: number
  korekta: number
  kurs_eur: number | null
}

async function zapiszHistoryczna(d: DefWyceny) {
  let zap = sprawdz(await db.from('zapytania').select('id, numer').eq('przedmiot', d.przedmiot).maybeSingle(), 'zapytanie')
  if (!zap && d.nowe) {
    const numer = sprawdz(await db.rpc('nastepny_numer_zo', { p_rok: d.nowe.rok }), 'numer') as string
    zap = sprawdz(await db.from('zapytania').insert({
      numer, przedmiot: d.przedmiot, ...rodzajZPrzedmiotu(d.przedmiot), klient_id: await idKlienta(d.nowe.klient), zrodlo: 'mail', status: 'wyslana',
      uwagi: 'Zapytanie historyczne - numer nadany w wersji demo.', ...(d.nowe.utworzono ? { utworzono: d.nowe.utworzono } : {}),
    }).select('id, numer').single(), 'nowe zapytanie')
  }
  if (!zap) { log(`  ! brak zapytania "${d.przedmiot}" - uruchom najpierw krok zapytania`); return }
  const ist = await db.from('wyceny').select('id').eq('zapytanie_id', zap.id).like('nazwa', 'Historyczna%').limit(1)
  if ((ist.data ?? []).length) { log(`  = ${zap.numer} (już jest)`); return }

  const nastepna = ((await db.from('wyceny').select('wersja').eq('zapytanie_id', zap.id).order('wersja', { ascending: false }).limit(1)).data?.[0]?.wersja ?? 0) + 1
  const w = sprawdz(await db.from('wyceny').insert({
    zapytanie_id: zap.id, wersja: nastepna, nazwa: `Historyczna - import z ${d.zrodlo}`, narzut_zakupowy_proc: d.narzut_zakupowy_proc,
    narzut_kooperacja_proc: 0, kurs_eur: d.kurs_eur, kurs_eur_zrodlo: d.kurs_eur ? 'z arkusza' : null,
  }).select('*').single(), 'wycena') as Wycena
  sprawdz(await db.from('wyceny_marze').update({ narzut_zysk_proc: d.zysk, zaokraglenie: d.zaokraglenie, korekta_prezesa_kwota: d.korekta }).eq('wycena_id', w.id).select('wycena_id'), 'marże')
  for (const [i, a] of d.aparaty.entries()) {
    const ap = sprawdz(await db.from('aparaty').insert({
      wycena_id: w.id, lp: i + 1, nazwa: a.nazwa, typ: a.typ, ilosc: a.ilosc, masa_netto_kg: a.masa_netto_kg, material_wiodacy: a.material_wiodacy,
      metoda_robocizny: a.metoda_robocizny, wskaznik_rbh_t: a.wskaznik_rbh_t, stawka_wskaznikowa: a.stawka_wskaznikowa, liczba_osob: a.liczba_osob, naddatki: a.naddatki,
    }).select('id').single(), 'aparat')
    sprawdz(await db.rpc('zapisz_pozycje_aparatu', { p_aparat: ap.id, p_pozycje: a.pozycje.map((p, j) => ({ ...p, lp: j + 1 })) }), 'pozycje')
  }
  // Migawka jak przy zatwierdzeniu przez prezesa.
  const [kmat, gat, rodz] = await Promise.all([db.from('kategorie_materialow').select('*'), db.from('gatunki').select('*'), db.from('rodzaje_stali').select('*')])
  const marze: Marze = { wycena_id: w.id, narzut_zysk_proc: d.zysk, zaokraglenie: d.zaokraglenie, korekta_prezesa_kwota: d.korekta, korekta_prezesa_proc: 0, koszt_calkowity: null, cena: null, cena_koncowa: null, cena_bez_opcji: null }
  const wynik = policzWycene(d.aparaty, parametry(w, marze, { kategorieMaterialow: kmat.data ?? [], gatunki: gat.data ?? [], rodzajeStali: rodz.data ?? [] }))
  sprawdz(await db.from('wyceny_marze').update({ koszt_calkowity: wynik.koszty.koszt, cena: wynik.cena, cena_koncowa: wynik.cena_koncowa, cena_bez_opcji: wynik.cena_bez_opcji }).eq('wycena_id', w.id).select('wycena_id'), 'migawka')
  sprawdz(await db.from('wyceny').update({ status: 'zatwierdzona', zatwierdzono: new Date().toISOString(), podsumowanie: podsumowanieKosztow(wynik), komentarz_prezesa: 'Wycena historyczna wprowadzona z dokumentów.' }).eq('id', w.id).select('id'), 'status')
  log(`  + ${zap.numer} ${d.przedmiot}: koszty ${wynik.koszty.koszt.toFixed(2)}, cena końcowa ${wynik.cena_koncowa?.toFixed(2)}`)
}

async function wyceny() {
  const defs: DefWyceny[] = []
  for (const ark of K.wyceny.arkusze) {
    const e = importujArkuszWyceny(wszystkieArkusze(readFileSync(sciezka(ark.plik))))
    defs.push({
      przedmiot: e.nazwa, nowe: { rok: ark.rok, klient: ark.klient }, zrodlo: ark.plik.split('/').pop()!, narzut_zakupowy_proc: 0, zysk: e.narzut_zysk_proc, zaokraglenie: 0, korekta: 0, kurs_eur: e.kurs_eur,
      aparaty: [{ ...e.aparat, typ: ark.typ, material_wiodacy: ark.material }],
    })
  }
  const stare = K.wyceny.kalkulacje
  const mammoth = await import('mammoth')
  for (const s of stare) {
    const wiersze = wierszeZFormulami(readFileSync(sciezka(s.kalk)))
    const k = importujStaraKalkulacje(wiersze)
    const mat = materialyZeStarejKalkulacji(wiersze)
    const { value } = await mammoth.extractRawText({ buffer: readFileSync(sciezka(s.notatka)) })
    const n = narzutZNotatki(value.split('\n'))
    // Zaokrąglenie, które daje "Łącznie" z notatki.
    const pr = { kategorieMaterialow: (await db.from('kategorie_materialow').select('*')).data ?? [], gatunki: [], rodzajeStali: [] }
    const zaokr = [0, 10, 100, 1000].find((z) => {
      const p = parametry({ narzut_zakupowy_proc: k.narzut_zakupowy_proc, narzut_kooperacja_proc: 0, kurs_eur: null } as Wycena, { narzut_zysk_proc: n.zysk ?? 0, zaokraglenie: z, korekta_prezesa_kwota: 0, korekta_prezesa_proc: 0 } as Marze, pr)
      return Math.abs((policzWycene(k.aparaty, p).cena ?? 0) - (n.lacznie ?? -1)) < 0.01
    }) ?? 0
    defs.push({
      przedmiot: s.przedmiot, zrodlo: s.kalk.split('/').pop()!, narzut_zakupowy_proc: k.narzut_zakupowy_proc, zysk: n.zysk ?? 10, zaokraglenie: zaokr, korekta: 0, kurs_eur: null,
      aparaty: k.aparaty.map((a, i) => ({ ...a, typ: s.typ, material_wiodacy: mat[i] ?? null })),
    })
  }
  const notatki = K.wyceny.notatki
  for (const nt of notatki) {
    const n = await importujNotatkeWyceny(new Uint8Array(readFileSync(sciezka(nt.plik))))
    defs.push({
      przedmiot: nt.przedmiot, zrodlo: 'Wycena.docx', narzut_zakupowy_proc: 0, zysk: n.narzut_zysk_proc, zaokraglenie: n.zaokraglenie, korekta: n.korekta_prezesa_kwota, kurs_eur: null,
      aparaty: [{ ...n.aparat, nazwa: nt.przedmiot.replace(/ \(.*\)$/, ''), typ: nt.typ, material_wiodacy: nt.material }],
    })
  }
  for (const d of defs) await zapiszHistoryczna(d)
}

/**
 * Uzupełnia teksty dokumentów zapisanych bez tekstu (DOCX z wcześniejszych przebiegów seeda - mammoth w Node
 * nie czytał ArrayBuffer). Oryginał z bucketu, tekst wyciągany tym samym kodem co w aplikacji.
 */
async function teksty() {
  const { data } = await db.from('dokumenty').select('id, nazwa_pliku, sciezka').eq('stan', 'zapisany').not('sciezka', 'is', null)
    .or('tekst.is.null,tekst.eq.').neq('nazwa_pliku', '')
  let ile = 0
  for (const d of (data ?? []).filter((x) => /\.(docx|xlsx|xlsm|xls|txt|csv)$/i.test(x.nazwa_pliku))) {
    const { data: plik, error } = await db.storage.from('dokumenty').download(d.sciezka!)
    if (error || !plik) { log(`  ! ${d.nazwa_pliku}: ${error?.message ?? 'brak pliku'}`); continue }
    const w = await wczytajDane(d.nazwa_pliku, new Uint8Array(await plik.arrayBuffer()))
    if (!w.tekst.trim()) { log(`  ! ${d.nazwa_pliku}: nadal bez tekstu`); continue }
    sprawdz(await db.from('dokumenty').update({ tekst: w.tekst }).eq('id', d.id).select('id'), `tekst ${d.nazwa_pliku}`)
    log(`  + ${d.nazwa_pliku}: ${w.tekst.length} znaków`)
    ile++
  }
  log(`Uzupełniono teksty: ${ile}`)
}

async function stan() {
  const tabele = ['klienci', 'zapytania', 'dokumenty', 'dostawcy', 'oferty_dostawcow', 'pozycje_ofert', 'zakupy', 'projekty', 'registo_godziny', 'ai_uzycie']
  for (const t of tabele) {
    const { count } = await db.from(t).select('*', { count: 'exact', head: true })
    log(`  ${t.padEnd(18)} ${count}`)
  }
}

const KROKI: Record<string, () => Promise<void>> = { firma, klienci, zapytania, teksty, karty, registo, wyceny, oferty, stan }
const wybrane = process.argv.slice(2).filter((a) => KROKI[a])
for (const k of wybrane.length ? wybrane : ['firma', 'klienci', 'zapytania', 'teksty', 'karty', 'registo', 'wyceny', 'oferty', 'stan']) {
  log(`\n== ${k}`)
  await KROKI[k]()
}
