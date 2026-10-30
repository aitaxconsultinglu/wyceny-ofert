import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, FileSearch, FileText, ListPlus, Save, Sparkles, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { dataGodzinaPL, liczba, odmiana } from '@/lib/format'
import { ETYKIETY_TYPU, type TypDokumentu } from '@/lib/dokumenty'
import { PROG_PEWNOSCI, ETYKIETY_OBSZARU, PUSTY_WYNIK, type WynikRysunku } from '@/lib/rysunki'
import { jestObrazem } from '@/lib/obrazPdf'
import { jestRysunkiem } from '@/lib/klasyfikacjaDokumentow'
import { useSlowniki } from '@/lib/slowniki'
import { pobierzBajty } from '@/lib/magazyn'
import { bajtyRysunku, otworzRysunek, tekstStrony } from '@/lib/rysunkiPdf'
import { odczytajArkuszZTekstu } from '@/lib/odczytTekstowy'
import { MIN_ELEMENTOW_TEKSTU } from '@/lib/odczytDokumentu'
import { rozpoznajListe } from '@/lib/importListy'
import { RODZAJ_LISTY, pozycjeZArkusza, zlozListe } from '@/lib/listaMaterialowa'
import { uprawnienia, type Profil } from '@/lib/types'
import { doKosza } from '@/lib/kosz'
import { OdczytCalegoDokumentu } from './OdczytCalegoDokumentu'
import { OdczytRysunku, type DokumentRysunku, type OdczytZapisany } from './OdczytRysunku'
import { SiatkaOdczytu, type ZakladkaSiatki } from './SiatkaOdczytu'
import { PrzeniesDoWyceny } from './PrzeniesDoWyceny'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'
import { t } from '@/i18n'

type Dokument = DokumentRysunku & { typ: TypDokumentu; stan: string }

const ZRODLA: Record<OdczytZapisany['zrodlo'], string> = { recznie: t('ręcznie'), tekst: t('tekst PDF'), ai: t('AI') }
const ARKUSZ = /\.(xlsx?|xlsm|csv)$/i

/** Dokument nadaje się na źródło listy: lista materiałowa i rysunki pierwsze, potem pozostałe PDF / obrazy / arkusze. */
const kolejnoscTypu = (typ: TypDokumentu) => (typ === 'lista_materialowa' ? 0 : jestRysunkiem(typ) ? 1 : 2)

/**
 * Zakładka „Tworzenie listy materiałowej” karty zapytania. Wynik: JEDNA kompletna lista materiałowa zapytania (pozycje
 * uporządkowane po numerze, króćce, dane projektowe) - z dokumentu listy materiałowej (PDF z tekstem, skan, arkusz)
 * albo z rysunku złożeniowego (cały arkusz przez AI albo zaznaczone tabele), bez AI albo przez AI. Kolejne odczyty
 * dopisują się do listy (pozycje o tym samym numerze są scalane) albo ją zastępują. Lista idzie do wyceny.
 */
export function ListaMaterialowa({ zapytanieId, numer, profil, otworzWycene, rodzajAparatu = null }: {
  zapytanieId: string; numer: string; profil: Profil; otworzWycene: (id: string) => void; rodzajAparatu?: 'zbiornik' | 'wymiennik' | null
}) {
  const s = useSlowniki()
  const up = uprawnienia(profil)
  const [dokumenty, setDokumenty] = useState<Dokument[]>([])
  const [lista, setLista] = useState<OdczytZapisany | null>(null)
  const [wynik, setWynik] = useState<WynikRysunku>(PUSTY_WYNIK)
  const [zmieniona, setZmieniona] = useState(false)
  const [odczyty, setOdczyty] = useState<OdczytZapisany[]>([])
  const [zastap, setZastap] = useState(false)
  const [zakladka, setZakladka] = useState<ZakladkaSiatki>('pozycje')
  const [calyDokument, setCalyDokument] = useState<DokumentRysunku | null>(null)
  const [otwarty, setOtwarty] = useState<{ dokument: DokumentRysunku; odczyt: OdczytZapisany | null } | null>(null)
  const [przenies, setPrzenies] = useState(false)
  const [zajety, setZajety] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [blad, setBlad] = useState<string | null>(null)

  const wczytaj = useCallback(async () => {
    const kolumny = 'id, nazwa_pliku, sciezka, metadane, typ, stan'
    const { data, error } = await supabase.from('dokumenty').select(kolumny).eq('zapytanie_id', zapytanieId).order('utworzono')
    if (error) { setBlad(komunikatPL(error.message)); return }
    const ids = (data ?? []).map((d) => d.id)
    const { data: zal } = ids.length ? await supabase.from('dokumenty').select(kolumny).in('nadrzedny_id', ids).is('zapytanie_id', null) : { data: [] }
    const pliki = [...(data ?? []), ...(zal ?? [])].filter((d) => /\.pdf$/i.test(d.nazwa_pliku) || jestObrazem(d.nazwa_pliku) || ARKUSZ.test(d.nazwa_pliku)) as Dokument[]
    setDokumenty(pliki.sort((a, b) => kolejnoscTypu(a.typ) - kolejnoscTypu(b.typ)))
    const { data: od, error: e2 } = await supabase.from('odczyty_rysunkow').select('*').eq('zapytanie_id', zapytanieId).order('utworzono', { ascending: false })
    if (e2) setBlad(komunikatPL(e2.message))
    const wszystkie = (od ?? []) as OdczytZapisany[]
    const l = wszystkie.find((o) => o.rodzaj_tabeli === RODZAJ_LISTY) ?? null
    setLista(l); setWynik(l?.wynik ?? PUSTY_WYNIK); setZmieniona(false)
    setOdczyty(wszystkie.filter((o) => o.rodzaj_tabeli !== RODZAJ_LISTY))
  }, [zapytanieId])
  useEffect(() => { void wczytaj() }, [wczytaj])

  /** Zapis listy: nowy wynik dopisany do listy (albo zastępujący ją), źródła w nazwie pliku. */
  async function doListy(nowy: WynikRysunku, zrodlo: { plik: string; dokument_id: string | null; rodzaj: OdczytZapisany['zrodlo']; koszt?: number; model?: string | null }) {
    const bylo = lista && !zastap ? wynik : PUSTY_WYNIK
    const zlozona = zlozListe(bylo, nowy)
    const pliki = [...new Set([...(lista && !zastap ? lista.nazwa_pliku.split(' + ') : []), zrodlo.plik])].join(' + ')
    const wiersz = {
      wynik: zlozona, nazwa_pliku: pliki, zrodlo: zrodlo.rodzaj, model: zrodlo.model ?? null,
      koszt_pln: (lista && !zastap ? Number(lista.koszt_pln ?? 0) : 0) + (zrodlo.koszt ?? 0), sprawdzony: false,
    }
    const { error } = lista
      ? await supabase.from('odczyty_rysunkow').update(wiersz).eq('id', lista.id)
      : await supabase.from('odczyty_rysunkow').insert({
        ...wiersz, zapytanie_id: zapytanieId, dokument_id: zrodlo.dokument_id, strona: 1, obszary: [], nazwa: t('Lista materiałowa'), rodzaj_tabeli: RODZAJ_LISTY,
      })
    if (error) throw new Error(komunikatPL(error.message))
    await wczytaj()
    return t('Lista materiałowa: {0}, {1}{2} (z: {3}).', odmiana(zlozona.pozycje.length, ['pozycja', 'pozycje', 'pozycji']), odmiana(zlozona.krocce.length, ['króciec', 'króćce', 'króćców']),
      zlozona.parametry.length ? t(', danych projektowych: {0}', zlozona.parametry.length) : '', zrodlo.plik)
  }

  /** Bez AI: PDF z warstwą tekstową - tabele ze wszystkich stron; arkusz - rozpoznane kolumny listy. */
  async function bezAi(d: Dokument) {
    if (!d.sciezka) return
    setBlad(null); setInfo(null)
    try {
      setZajety(t('Odczyt bez AI: {0}...', d.nazwa_pliku))
      const bajty = await pobierzBajty(d.sciezka)
      if (ARKUSZ.test(d.nazwa_pliku)) {
        const XLSX = await import('xlsx-js-style')
        const wb = /\.csv$/i.test(d.nazwa_pliku) ? XLSX.read(new TextDecoder().decode(bajty), { type: 'string' }) : XLSX.read(bajty, { type: 'array' })
        const wiersze = wb.SheetNames.flatMap((n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) as (string | number | null)[][])
        const { pozycje, blad: b } = rozpoznajListe(wiersze)
        if (b) throw new Error(b)
        setInfo(await doListy(pozycjeZArkusza(pozycje), { plik: d.nazwa_pliku, dokument_id: d.id, rodzaj: 'tekst' }))
      } else {
        const pdf = await otworzRysunek(await bajtyRysunku(bajty, d.nazwa_pliku))
        const wyniki: WynikRysunku[] = []
        const skany: number[] = []
        for (let nr = 1; nr <= pdf.numPages; nr++) {
          setZajety(t('Odczyt bez AI: {0}, strona {1}/{2}...', d.nazwa_pliku, nr, pdf.numPages))
          const el = await tekstStrony(pdf, nr)
          if (el.length < MIN_ELEMENTOW_TEKSTU) { skany.push(nr); continue }
          wyniki.push(odczytajArkuszZTekstu(el))
        }
        const zlozone = zlozListe(...wyniki)
        if (!zlozone.pozycje.length && !zlozone.krocce.length) {
          throw new Error(skany.length === pdf.numPages
            ? t('{0} to skan bez warstwy tekstowej - użyj „Lista przez AI”.', d.nazwa_pliku)
            : t('Nie rozpoznano tabeli materiałowej w tekście PDF - użyj „Lista przez AI” albo zaznacz tabele.'))
        }
        const komunikat = await doListy(zlozone, { plik: d.nazwa_pliku, dokument_id: d.id, rodzaj: 'tekst' })
        setInfo(skany.length ? `${komunikat} ${t('Strony bez warstwy tekstowej (skan): {0} - odczytaj je przez AI.', skany.join(', '))}` : komunikat)
      }
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setZajety(null)
  }

  async function zapiszZmiany() {
    if (!lista) return
    const { error } = await supabase.from('odczyty_rysunkow').update({ wynik, sprawdzony: true }).eq('id', lista.id)
    if (error) { setBlad(komunikatPL(error.message)); return }
    setInfo(t('Zapisano listę materiałową.')); await wczytaj()
  }

  async function usunListe() {
    if (!lista || !window.confirm(t('Przenieść listę materiałową do kosza? Odczyty źródłowe zostają.'))) return
    try { await doKosza('odczyt_rysunku', [lista.id], `zapytanie:${zapytanieId}`); await wczytaj() } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }

  async function usunOdczyt(o: OdczytZapisany) {
    if (!window.confirm(t('Przenieść odczyt {0}, str. {1} do kosza?', o.nazwa ?? o.nazwa_pliku, o.strona))) return
    try { await doKosza('odczyt_rysunku', [o.id], `zapytanie:${zapytanieId}`); await wczytaj() } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }

  const odczytDoPrzeniesienia = useMemo(() => (lista
    ? { id: lista.id, nazwa_pliku: lista.nazwa_pliku, strona: 1, nazwa: t('Lista materiałowa'), rodzaj_tabeli: RODZAJ_LISTY, obszary: [], wynik }
    : null), [lista, wynik])

  if (otwarty) {
    return (
      <OdczytRysunku
        key={`${otwarty.dokument.id}-${otwarty.odczyt?.id ?? 'nowy'}`}
        zapytanieId={zapytanieId} numer={numer} dokument={otwarty.dokument} odczyt={otwarty.odczyt} profil={profil} rodzajAparatu={rodzajAparatu}
        zamknij={() => { setOtwarty(null); void wczytaj() }} otworzWycene={otworzWycene}
      />
    )
  }

  const nazwaRodzaju = (o: OdczytZapisany) => s.rodzajeTabel.find((x) => x.kod === o.rodzaj_tabeli && x.rodzaj_aparatu === (rodzajAparatu ?? 'zbiornik'))?.nazwa
    ?? s.rodzajeTabel.find((x) => x.kod === o.rodzaj_tabeli)?.nazwa ?? (o.obszary[0] ? ETYKIETY_OBSZARU[o.obszary[0].rodzaj] : '')
  const dokumentOdczytu = (o: OdczytZapisany): DokumentRysunku =>
    dokumenty.find((d) => d.id === o.dokument_id) ?? { id: o.dokument_id ?? '', nazwa_pliku: o.nazwa_pliku, sciezka: null, metadane: {} }
  const niepewne = wynik.pozycje.filter((x) => x.pewnosc < PROG_PEWNOSCI).length + wynik.krocce.filter((x) => x.pewnosc < PROG_PEWNOSCI).length

  const kolumnyPlikow: KolumnaTabeli<Dokument>[] = [
    { id: 'plik', naglowek: t('Dokument'), typ: 'tekst', wartosc: (d) => d.nazwa_pliku, className: 'text-sm' },
    { id: 'typ', naglowek: t('Typ'), typ: 'lista', wartosc: (d) => ETYKIETY_TYPU[d.typ] ?? d.typ, className: 'text-sm' },
    { id: 'stron', naglowek: t('Stron'), typ: 'liczba', wartosc: (d) => (d.metadane?.stron as number | undefined) ?? null, className: 'text-sm' },
    { id: 'rodzaj', naglowek: t('Rodzaj'), typ: 'lista', className: 'text-sm', wartosc: (d) => (ARKUSZ.test(d.nazwa_pliku) ? t('arkusz') : jestObrazem(d.nazwa_pliku) ? t('obraz') : d.metadane?.skan ? t('skan') : t('z warstwą tekstową')) },
    {
      id: 'akcje', naglowek: '', typ: 'tekst', wartosc: () => '', bezFiltra: true, bezSortu: true, className: 'text-right',
      komorka: (d) => (d.sciezka
        ? (
          <span className="inline-flex flex-wrap justify-end gap-1">
            {(ARKUSZ.test(d.nazwa_pliku) || (!jestObrazem(d.nazwa_pliku) && !d.metadane?.skan)) && (
              <Button rozmiar="maly" disabled={!!zajety} title={t('Tabele z warstwy tekstowej PDF albo kolumny arkusza - bez kosztów')} onClick={() => void bezAi(d)}>
                <FileText className="h-3 w-3" /> {t('Lista bez AI')}
              </Button>
            )}
            {!ARKUSZ.test(d.nazwa_pliku) && (
              <>
                <Button rozmiar="maly" wariant="akcent" disabled={!!zajety} title={t('AI czyta wszystkie strony i składa jedną listę - koszt pokazany przed odczytem')} onClick={() => setCalyDokument(d)}>
                  <Sparkles className="h-3 w-3" /> {t('Lista przez AI')}
                </Button>
                <Button rozmiar="maly" disabled={!!zajety} title={t('Zaznacz na rysunku tabele (wykaz części, króćce, U-rury...) i odczytaj je bez AI albo przez AI; potem „Dodaj do listy”')} onClick={() => setOtwarty({ dokument: d, odczyt: null })}>
                  <FileSearch className="h-3 w-3" /> {t('Zaznacz tabele')}
                </Button>
              </>
            )}
          </span>
        )
        : <span className="text-xs text-slate-400">{t('plik zarchiwizowany')}</span>),
    },
  ]

  const kolumnyOdczytow: KolumnaTabeli<OdczytZapisany>[] = [
    { id: 'nazwa', naglowek: t('Tabela'), typ: 'tekst', wartosc: (o) => o.nazwa ?? '', className: 'text-sm font-medium' },
    { id: 'rodzaj', naglowek: t('Rodzaj tabeli'), typ: 'lista', wartosc: nazwaRodzaju, className: 'text-xs' },
    { id: 'plik', naglowek: t('Dokument'), typ: 'lista', wartosc: (o) => o.nazwa_pliku, className: 'text-sm' },
    { id: 'strona', naglowek: t('Strona'), typ: 'liczba', wartosc: (o) => o.strona, className: 'text-sm' },
    { id: 'zrodlo', naglowek: t('Źródło'), typ: 'lista', wartosc: (o) => ZRODLA[o.zrodlo], className: 'text-sm' },
    { id: 'pozycje', naglowek: t('Pozycje'), typ: 'liczba', wartosc: (o) => o.wynik.pozycje.length, className: 'text-sm' },
    { id: 'krocce', naglowek: t('Króćce'), typ: 'liczba', wartosc: (o) => o.wynik.krocce.length, className: 'text-sm' },
    { id: 'zmieniono', naglowek: t('Zmieniono'), typ: 'data', wartosc: (o) => o.zmodyfikowano, komorka: (o) => dataGodzinaPL(o.zmodyfikowano), className: 'whitespace-nowrap text-xs' },
    {
      id: 'akcje', naglowek: '', typ: 'tekst', wartosc: () => '', bezFiltra: true, bezSortu: true, className: 'text-right',
      komorka: (o) => (
        <span className="inline-flex items-center gap-2">
          <Button rozmiar="maly" disabled={!!zajety || !(o.wynik.pozycje.length + o.wynik.krocce.length + o.wynik.parametry.length)}
            onClick={(e) => { e.stopPropagation(); void doListy(o.wynik, { plik: o.nazwa_pliku, dokument_id: o.dokument_id, rodzaj: o.zrodlo }).then(setInfo).catch((x) => setBlad(String(x))) }}>
            <ListPlus className="h-3 w-3" /> {t('Dodaj do listy')}
          </Button>
          {(profil.rola === 'administrator' || o.utworzyl === profil.id) && (
            <button className="text-slate-400 hover:text-red-600" title={t('Przenieś odczyt do kosza')} onClick={(e) => { e.stopPropagation(); void usunOdczyt(o) }}><Trash2 className="h-4 w-4" /></button>
          )}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {info && <Komunikat rodzaj="sukces">{info}</Komunikat>}
      {zajety && <Komunikat rodzaj="info">{zajety}</Komunikat>}
      <OdczytCalegoDokumentu dokument={calyDokument} zapytanieId={zapytanieId} rodzajAparatu={rodzajAparatu} zamknij={() => setCalyDokument(null)}
        poZapisie={(k) => { setCalyDokument(null); setInfo(k) }}
        doListy={(w, koszt, model) => doListy(w, { plik: calyDokument!.nazwa_pliku, dokument_id: calyDokument!.id, rodzaj: 'ai', koszt, model })} />

      <section className="sekcja space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h4 className="text-sm font-semibold">{t('1. Dokument źródłowy')}</h4>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={zastap} onChange={(e) => setZastap(e.target.checked)} />
            {t('nowy odczyt zastępuje listę (bez zaznaczenia - dopisuje do niej; pozycje o tym samym numerze są scalane)')}
          </label>
        </div>
        <Tabela id="pliki-listy" kolumny={kolumnyPlikow} wiersze={dokumenty} klucz={(d) => d.id} pusto={t('Brak dokumentów - dodaj listę materiałową albo rysunek złożeniowy w zakładce Dokumenty.')} />
        <p className="text-xs text-slate-500">
          {t('Jest dokument listy materiałowej - „Lista bez AI” (PDF z tekstem, arkusz) albo „Lista przez AI” (skan, zdjęcie). Nie ma - utwórz listę z rysunku złożeniowego: „Lista przez AI” czyta cały arkusz (wykaz części, tabela U-rur, króćce, dane projektowe), „Zaznacz tabele” - tylko wskazane tabele. Skan obrócony? Obróć go w zakładce Dokumenty.')}
        </p>
      </section>

      <section className="sekcja space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold">{t('2. Lista materiałowa')}</h4>
          {lista && (
            <span className="text-xs text-slate-500">
              {t('z: {0}', lista.nazwa_pliku)} · {dataGodzinaPL(lista.zmodyfikowano)}{lista.koszt_pln ? ` · AI ${liczba(Number(lista.koszt_pln), 2)} zł` : ''}
              {niepewne > 0 && <span className="text-amber-700"> · {t('do sprawdzenia: {0}', niepewne)}</span>}
            </span>
          )}
          <span className="ml-auto" />
          {lista && (
            <>
              <Button rozmiar="maly" disabled={!zmieniona} onClick={() => void zapiszZmiany()}><Save className="h-3 w-3" /> {t('Zapisz zmiany')}</Button>
              <Button rozmiar="maly" wariant="akcent" disabled={zmieniona || !wynik.pozycje.length} title={zmieniona ? t('Najpierw zapisz zmiany') : undefined} onClick={() => setPrzenies(true)}>
                <ArrowRightLeft className="h-3 w-3" /> {t('Przenieś do wyceny')}
              </Button>
              <button className="text-slate-400 hover:text-red-600" title={t('Przenieś listę do kosza')} onClick={() => void usunListe()}><Trash2 className="h-4 w-4" /></button>
            </>
          )}
        </div>
        {lista
          ? (
            <SiatkaOdczytu wynik={wynik} zmien={(w) => { setWynik(w); setZmieniona(true) }} kategorie={s.kategorieMaterialow} zakladka={zakladka} setZakladka={setZakladka}
              podglad={null} pokaz={() => undefined} tylkoOdczyt={false} />
          )
          : <p className="text-sm text-slate-500">{t('Brak listy materiałowej - utwórz ją z dokumentu powyżej.')}</p>}
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold">{t('Odczyty zaznaczonych tabel')}</h4>
        <Tabela id="odczyty-rysunkow" kolumny={kolumnyOdczytow} wiersze={odczyty} klucz={(o) => o.id}
          onKlik={(o) => setOtwarty({ dokument: dokumentOdczytu(o), odczyt: o })} pusto={t('Brak odczytów - „Zaznacz tabele” przy dokumencie.')} />
      </section>

      <PrzeniesDoWyceny otwarty={przenies} zamknij={() => setPrzenies(false)} zapytanieId={zapytanieId} odczyt={odczytDoPrzeniesienia} widziMarze={up.widziMarze} otworzWycene={otworzWycene} />
    </div>
  )
}
