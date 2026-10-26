import { useCallback, useEffect, useState } from 'react'
import { FileSearch, Sparkles, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { dataGodzinaPL, liczba } from '@/lib/format'
import { ETYKIETY_TYPU, type TypDokumentu } from '@/lib/dokumenty'
import { PROG_PEWNOSCI, ETYKIETY_OBSZARU } from '@/lib/rysunki'
import { jestObrazem } from '@/lib/obrazPdf'
import { useSlowniki } from '@/lib/slowniki'
import { OdczytCalegoDokumentu } from './OdczytCalegoDokumentu'
import type { Profil } from '@/lib/types'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { OdczytRysunku, type DokumentRysunku, type OdczytZapisany } from './OdczytRysunku'
import { doKosza } from '@/lib/kosz'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'
import { t } from '@/i18n'

type DokumentPdf = DokumentRysunku & { typ: TypDokumentu; stan: string }

const ZRODLA: Record<OdczytZapisany['zrodlo'], string> = { recznie: t('ręcznie'), tekst: t('tekst PDF'), ai: t('AI') }

/** Zakładka „Rysunki i listy materiałowe” karty zapytania: rysunki (PDF, JPG, PNG) zapytania i zapisane odczyty tabel. */
export function RysunkiZapytania({ zapytanieId, numer, profil, otworzWycene, rodzajAparatu = null }: {
  zapytanieId: string; numer: string; profil: Profil; otworzWycene: (id: string) => void; rodzajAparatu?: 'zbiornik' | 'wymiennik' | null
}) {
  const s = useSlowniki()
  const [calyDokument, setCalyDokument] = useState<DokumentRysunku | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [dokumenty, setDokumenty] = useState<DokumentPdf[]>([])
  const [odczyty, setOdczyty] = useState<OdczytZapisany[]>([])
  const [otwarty, setOtwarty] = useState<{ dokument: DokumentRysunku; odczyt: OdczytZapisany | null } | null>(null)
  const [blad, setBlad] = useState<string | null>(null)

  const wczytaj = useCallback(async () => {
    const kolumny = 'id, nazwa_pliku, sciezka, metadane, typ, stan'
    const { data, error } = await supabase.from('dokumenty').select(kolumny).eq('zapytanie_id', zapytanieId).order('utworzono')
    if (error) { setBlad(komunikatPL(error.message)); return }
    const ids = (data ?? []).map((d) => d.id)
    const { data: zal } = ids.length ? await supabase.from('dokumenty').select(kolumny).in('nadrzedny_id', ids).is('zapytanie_id', null) : { data: [] }
    const pdf = [...(data ?? []), ...(zal ?? [])].filter((d) => /\.pdf$/i.test(d.nazwa_pliku) || jestObrazem(d.nazwa_pliku)) as DokumentPdf[]
    // Rysunki najpierw.
    setDokumenty(pdf.sort((a, b) => Number(b.typ === 'rysunek') - Number(a.typ === 'rysunek')))
    const { data: od, error: e2 } = await supabase.from('odczyty_rysunkow').select('*').eq('zapytanie_id', zapytanieId).order('utworzono', { ascending: false })
    if (e2) setBlad(komunikatPL(e2.message))
    setOdczyty((od ?? []) as OdczytZapisany[])
  }, [zapytanieId])
  useEffect(() => { void wczytaj() }, [wczytaj])

  async function usun(o: OdczytZapisany) {
    if (!window.confirm(t('Przenieść odczyt {0}, str. {1} do kosza?', o.nazwa ?? o.nazwa_pliku, o.strona))) return
    try { await doKosza('odczyt_rysunku', [o.id], `zapytanie:${zapytanieId}`); await wczytaj() } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }

  if (otwarty) {
    return (
      <OdczytRysunku
        key={`${otwarty.dokument.id}-${otwarty.odczyt?.id ?? 'nowy'}`}
        zapytanieId={zapytanieId} numer={numer} dokument={otwarty.dokument} odczyt={otwarty.odczyt} profil={profil} rodzajAparatu={rodzajAparatu}
        zamknij={() => { setOtwarty(null); void wczytaj() }} otworzWycene={otworzWycene}
      />
    )
  }

  const dokumentOdczytu = (o: OdczytZapisany): DokumentRysunku =>
    dokumenty.find((d) => d.id === o.dokument_id) ?? { id: o.dokument_id ?? '', nazwa_pliku: o.nazwa_pliku, sciezka: null, metadane: {} }

  const nazwaRodzaju = (o: OdczytZapisany) => s.rodzajeTabel.find((x) => x.kod === o.rodzaj_tabeli && x.rodzaj_aparatu === (rodzajAparatu ?? 'zbiornik'))?.nazwa
    ?? s.rodzajeTabel.find((x) => x.kod === o.rodzaj_tabeli)?.nazwa ?? (o.obszary[0] ? ETYKIETY_OBSZARU[o.obszary[0].rodzaj] : '')
  const doSprawdzenia = (o: OdczytZapisany) => [...o.wynik.pozycje, ...o.wynik.krocce, ...o.wynik.parametry].filter((x) => x.pewnosc < PROG_PEWNOSCI).length
  const kolumnyOdczytow: KolumnaTabeli<OdczytZapisany>[] = [
    { id: 'nazwa', naglowek: t('Tabela'), typ: 'tekst', wartosc: (o) => o.nazwa ?? '', className: 'text-sm font-medium' },
    { id: 'rodzaj', naglowek: t('Rodzaj tabeli'), typ: 'lista', wartosc: nazwaRodzaju, className: 'text-xs' },
    { id: 'plik', naglowek: t('Rysunek'), typ: 'lista', wartosc: (o) => o.nazwa_pliku, className: 'text-sm' },
    { id: 'strona', naglowek: t('Strona'), typ: 'liczba', wartosc: (o) => o.strona, className: 'text-sm' },
    { id: 'zrodlo', naglowek: t('Źródło'), typ: 'lista', wartosc: (o) => ZRODLA[o.zrodlo], className: 'text-sm', komorka: (o) => `${ZRODLA[o.zrodlo]}${o.koszt_pln ? ` (${liczba(o.koszt_pln, 2)} zł)` : ''}` },
    { id: 'pozycje', naglowek: t('Pozycje'), typ: 'liczba', wartosc: (o) => o.wynik.pozycje.length, className: 'text-sm' },
    { id: 'krocce', naglowek: t('Króćce'), typ: 'liczba', wartosc: (o) => o.wynik.krocce.length, className: 'text-sm' },
    { id: 'parametry', naglowek: t('Parametry'), typ: 'liczba', wartosc: (o) => o.wynik.parametry.length, className: 'text-sm' },
    { id: 'tabele', naglowek: t('Tabele własne'), typ: 'liczba', wartosc: (o) => (o.wynik.tabele ?? []).length, className: 'text-sm' },
    { id: 'niepewne', naglowek: t('Do sprawdzenia'), typ: 'liczba', wartosc: (o) => doSprawdzenia(o), className: 'text-sm', komorka: (o) => (doSprawdzenia(o) ? <span className="text-amber-700">{doSprawdzenia(o)}</span> : '-') },
    { id: 'sprawdzony', naglowek: t('Sprawdzony'), typ: 'tak_nie', wartosc: (o) => o.sprawdzony, className: 'text-sm' },
    { id: 'zmieniono', naglowek: t('Zmieniono'), typ: 'data', wartosc: (o) => o.zmodyfikowano, komorka: (o) => dataGodzinaPL(o.zmodyfikowano), className: 'whitespace-nowrap text-xs' },
    {
      id: 'akcje', naglowek: '', typ: 'tekst', wartosc: () => '', bezFiltra: true, bezSortu: true,
      komorka: (o) => (profil.rola === 'administrator' || o.utworzyl === profil.id) && (
        <button className="text-slate-400 hover:text-red-600" title={t('Przenieś odczyt do kosza')} onClick={(e) => { e.stopPropagation(); void usun(o) }}><Trash2 className="h-4 w-4" /></button>
      ),
    },
  ]
  const kolumnyPlikow: KolumnaTabeli<(typeof dokumenty)[number]>[] = [
    { id: 'plik', naglowek: t('Plik'), typ: 'tekst', wartosc: (d) => d.nazwa_pliku, className: 'text-sm' },
    { id: 'typ', naglowek: t('Typ'), typ: 'lista', wartosc: (d) => ETYKIETY_TYPU[d.typ], className: 'text-sm' },
    { id: 'stron', naglowek: t('Stron'), typ: 'liczba', wartosc: (d) => (d.metadane?.stron as number | undefined) ?? null, className: 'text-sm' },
    { id: 'rodzaj', naglowek: t('Rodzaj'), typ: 'lista', wartosc: (d) => (jestObrazem(d.nazwa_pliku) ? t('obraz') : d.metadane?.skan ? t('skan') : t('z warstwą tekstową')), className: 'text-sm' },
    {
      id: 'akcje', naglowek: '', typ: 'tekst', wartosc: () => '', bezFiltra: true, bezSortu: true, className: 'text-right',
      komorka: (d) => (d.sciezka
        ? (
          <span className="inline-flex gap-1">
            <Button rozmiar="maly" onClick={() => setOtwarty({ dokument: d, odczyt: null })}><FileSearch className="h-3 w-3" /> {t('Zaznacz i odczytaj')}</Button>
            <Button rozmiar="maly" wariant="akcent" title={t('AI odczytuje wszystkie strony i tworzy osobne odczyty tabel - z szacunkiem kosztu')} onClick={() => setCalyDokument(d)}><Sparkles className="h-3 w-3" /> {t('Odczytaj cały dokument (AI)')}</Button>
          </span>
        )
        : <span className="text-xs text-slate-400">{t('plik zarchiwizowany')}</span>),
    },
  ]

  return (
    <div className="space-y-4">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {info && <Komunikat rodzaj="sukces">{info}</Komunikat>}
      <OdczytCalegoDokumentu dokument={calyDokument} zapytanieId={zapytanieId} rodzajAparatu={rodzajAparatu} zamknij={() => setCalyDokument(null)}
        poZapisie={(k) => { setCalyDokument(null); setInfo(k); void wczytaj() }} />
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">{t('Zapisane odczyty')}</h4>
        <Tabela id="odczyty-rysunkow" kolumny={kolumnyOdczytow} wiersze={odczyty} klucz={(o) => o.id}
          onKlik={(o) => setOtwarty({ dokument: dokumentOdczytu(o), odczyt: o })} pusto={t('Brak odczytów - otwórz rysunek poniżej.')} />
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold">{t('Rysunki i dokumenty zapytania (PDF, JPG, PNG)')}</h4>
        <Tabela id="pliki-rysunkow" kolumny={kolumnyPlikow} wiersze={dokumenty} klucz={(d) => d.id} pusto={t('Brak rysunków - dodaj pliki PDF, JPG albo PNG w zakładce Dokumenty.')} />
        <p className="text-xs text-slate-500">
          {t('PDF z warstwą tekstową (rysunek z CAD) można odczytać bez AI. Skany i obrazy czyta AI - zaznaczone fragmenty albo cały dokument, w ~300 DPI, pocięte na kafle.')}
        </p>
      </section>
    </div>
  )
}
