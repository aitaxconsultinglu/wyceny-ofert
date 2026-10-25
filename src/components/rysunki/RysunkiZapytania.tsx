import { useCallback, useEffect, useState } from 'react'
import { FileSearch, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { dataGodzinaPL, liczba } from '@/lib/format'
import { ETYKIETY_TYPU, type TypDokumentu } from '@/lib/dokumenty'
import { PROG_PEWNOSCI } from '@/lib/rysunki'
import type { Profil } from '@/lib/types'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { OdczytRysunku, type DokumentRysunku, type OdczytZapisany } from './OdczytRysunku'
import { doKosza } from '@/lib/kosz'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'

type DokumentPdf = DokumentRysunku & { typ: TypDokumentu; stan: string }

const ZRODLA: Record<OdczytZapisany['zrodlo'], string> = { recznie: 'ręcznie', tekst: 'tekst PDF', ai: 'AI' }

/** Zakładka „Rysunki i listy” karty zapytania: PDF-y zapytania i zapisane odczyty list z rysunków. */
export function RysunkiZapytania({ zapytanieId, numer, profil, otworzWycene }: { zapytanieId: string; numer: string; profil: Profil; otworzWycene: (id: string) => void }) {
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
    const pdf = [...(data ?? []), ...(zal ?? [])].filter((d) => /\.pdf$/i.test(d.nazwa_pliku)) as DokumentPdf[]
    // Rysunki najpierw.
    setDokumenty(pdf.sort((a, b) => Number(b.typ === 'rysunek') - Number(a.typ === 'rysunek')))
    const { data: od, error: e2 } = await supabase.from('odczyty_rysunkow').select('*').eq('zapytanie_id', zapytanieId).order('utworzono', { ascending: false })
    if (e2) setBlad(komunikatPL(e2.message))
    setOdczyty((od ?? []) as OdczytZapisany[])
  }, [zapytanieId])
  useEffect(() => { void wczytaj() }, [wczytaj])

  async function usun(o: OdczytZapisany) {
    if (!window.confirm(`Przenieść odczyt ${o.nazwa_pliku}, str. ${o.strona} do kosza?`)) return
    try { await doKosza('odczyt_rysunku', [o.id], `zapytanie:${zapytanieId}`); await wczytaj() } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }

  if (otwarty) {
    return (
      <OdczytRysunku
        key={`${otwarty.dokument.id}-${otwarty.odczyt?.id ?? 'nowy'}`}
        zapytanieId={zapytanieId} numer={numer} dokument={otwarty.dokument} odczyt={otwarty.odczyt} profil={profil}
        zamknij={() => { setOtwarty(null); void wczytaj() }} otworzWycene={otworzWycene}
      />
    )
  }

  const dokumentOdczytu = (o: OdczytZapisany): DokumentRysunku =>
    dokumenty.find((d) => d.id === o.dokument_id) ?? { id: o.dokument_id ?? '', nazwa_pliku: o.nazwa_pliku, sciezka: null, metadane: {} }

  const doSprawdzenia = (o: OdczytZapisany) => [...o.wynik.pozycje, ...o.wynik.krocce, ...o.wynik.parametry].filter((x) => x.pewnosc < PROG_PEWNOSCI).length
  const kolumnyOdczytow: KolumnaTabeli<OdczytZapisany>[] = [
    { id: 'plik', naglowek: 'Rysunek', typ: 'lista', wartosc: (o) => o.nazwa_pliku, className: 'text-sm' },
    { id: 'strona', naglowek: 'Strona', typ: 'liczba', wartosc: (o) => o.strona, className: 'text-sm' },
    { id: 'zrodlo', naglowek: 'Źródło', typ: 'lista', wartosc: (o) => ZRODLA[o.zrodlo], className: 'text-sm', komorka: (o) => `${ZRODLA[o.zrodlo]}${o.koszt_pln ? ` (${liczba(o.koszt_pln, 2)} zł)` : ''}` },
    { id: 'pozycje', naglowek: 'Pozycje', typ: 'liczba', wartosc: (o) => o.wynik.pozycje.length, className: 'text-sm' },
    { id: 'krocce', naglowek: 'Króćce', typ: 'liczba', wartosc: (o) => o.wynik.krocce.length, className: 'text-sm' },
    { id: 'parametry', naglowek: 'Parametry', typ: 'liczba', wartosc: (o) => o.wynik.parametry.length, className: 'text-sm' },
    { id: 'niepewne', naglowek: 'Do sprawdzenia', typ: 'liczba', wartosc: (o) => doSprawdzenia(o), className: 'text-sm', komorka: (o) => (doSprawdzenia(o) ? <span className="text-amber-700">{doSprawdzenia(o)}</span> : '-') },
    { id: 'sprawdzony', naglowek: 'Sprawdzony', typ: 'tak_nie', wartosc: (o) => o.sprawdzony, className: 'text-sm' },
    { id: 'zmieniono', naglowek: 'Zmieniono', typ: 'data', wartosc: (o) => o.zmodyfikowano, komorka: (o) => dataGodzinaPL(o.zmodyfikowano), className: 'whitespace-nowrap text-xs' },
    {
      id: 'akcje', naglowek: '', typ: 'tekst', wartosc: () => '', bezFiltra: true, bezSortu: true,
      komorka: (o) => (profil.rola === 'administrator' || o.utworzyl === profil.id) && (
        <button className="text-slate-400 hover:text-red-600" title="Przenieś odczyt do kosza" onClick={(e) => { e.stopPropagation(); void usun(o) }}><Trash2 className="h-4 w-4" /></button>
      ),
    },
  ]
  const kolumnyPlikow: KolumnaTabeli<(typeof dokumenty)[number]>[] = [
    { id: 'plik', naglowek: 'Plik', typ: 'tekst', wartosc: (d) => d.nazwa_pliku, className: 'text-sm' },
    { id: 'typ', naglowek: 'Typ', typ: 'lista', wartosc: (d) => ETYKIETY_TYPU[d.typ], className: 'text-sm' },
    { id: 'stron', naglowek: 'Stron', typ: 'liczba', wartosc: (d) => (d.metadane?.stron as number | undefined) ?? null, className: 'text-sm' },
    { id: 'rodzaj', naglowek: 'Rodzaj', typ: 'lista', wartosc: (d) => (d.metadane?.skan ? 'skan' : 'z warstwą tekstową'), className: 'text-sm' },
    {
      id: 'akcje', naglowek: '', typ: 'tekst', wartosc: () => '', bezFiltra: true, bezSortu: true, className: 'text-right',
      komorka: (d) => (d.sciezka
        ? <Button rozmiar="maly" onClick={() => setOtwarty({ dokument: d, odczyt: null })}><FileSearch className="h-3 w-3" /> Odczytaj listę</Button>
        : <span className="text-xs text-slate-400">plik zarchiwizowany</span>),
    },
  ]

  return (
    <div className="space-y-4">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Zapisane odczyty</h4>
        <Tabela id="odczyty-rysunkow" kolumny={kolumnyOdczytow} wiersze={odczyty} klucz={(o) => o.id}
          onKlik={(o) => setOtwarty({ dokument: dokumentOdczytu(o), odczyt: o })} pusto="Brak odczytów - otwórz rysunek poniżej." />
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Pliki PDF zapytania</h4>
        <Tabela id="pliki-rysunkow" kolumny={kolumnyPlikow} wiersze={dokumenty} klucz={(d) => d.id} pusto="Brak plików PDF - dodaj rysunki w zakładce Dokumenty." />
        <p className="text-xs text-slate-500">
          PDF z warstwą tekstową (rysunek z CAD) można odczytać bez AI. Skany czyta AI - tylko zaznaczone fragmenty, w ~300 DPI, pocięte na kafle.
        </p>
      </section>
    </div>
  )
}
