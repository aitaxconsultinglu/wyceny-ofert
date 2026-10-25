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

  return (
    <div className="space-y-4">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Zapisane odczyty</h4>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse">
            <thead><tr>{['Rysunek', 'Strona', 'Źródło', 'Pozycje', 'Króćce', 'Parametry', 'Do sprawdzenia', 'Sprawdzony', 'Zmieniono', ''].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
            <tbody>
              {odczyty.map((o) => {
                const doSprawdzenia = [...o.wynik.pozycje, ...o.wynik.krocce, ...o.wynik.parametry].filter((x) => x.pewnosc < PROG_PEWNOSCI).length
                return (
                  <tr key={o.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOtwarty({ dokument: dokumentOdczytu(o), odczyt: o })}>
                    <td className="komorka text-sm">{o.nazwa_pliku}</td>
                    <td className="komorka text-sm">{o.strona}</td>
                    <td className="komorka text-sm">{ZRODLA[o.zrodlo]}{o.koszt_pln ? ` (${liczba(o.koszt_pln, 2)} zł)` : ''}</td>
                    <td className="komorka liczba text-sm">{o.wynik.pozycje.length}</td>
                    <td className="komorka liczba text-sm">{o.wynik.krocce.length}</td>
                    <td className="komorka liczba text-sm">{o.wynik.parametry.length}</td>
                    <td className="komorka liczba text-sm">{doSprawdzenia ? <span className="text-amber-700">{doSprawdzenia}</span> : '-'}</td>
                    <td className="komorka text-sm">{o.sprawdzony ? 'tak' : 'nie'}</td>
                    <td className="komorka whitespace-nowrap text-xs">{dataGodzinaPL(o.zmodyfikowano)}</td>
                    <td className="komorka" onClick={(e) => e.stopPropagation()}>
                      {(profil.rola === 'administrator' || o.utworzyl === profil.id) && (
                        <button className="text-slate-400 hover:text-red-600" title="Usuń odczyt" onClick={() => void usun(o)}><Trash2 className="h-4 w-4" /></button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {odczyty.length === 0 && <tr><td colSpan={10} className="komorka text-center text-sm text-slate-500">Brak odczytów - otwórz rysunek poniżej.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Pliki PDF zapytania</h4>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse">
            <thead><tr>{['Plik', 'Typ', 'Stron', 'Rodzaj', ''].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
            <tbody>
              {dokumenty.map((d) => (
                <tr key={d.id}>
                  <td className="komorka text-sm">{d.nazwa_pliku}</td>
                  <td className="komorka text-sm">{ETYKIETY_TYPU[d.typ]}</td>
                  <td className="komorka text-sm">{String(d.metadane?.stron ?? '')}</td>
                  <td className="komorka text-sm">{d.metadane?.skan ? 'skan' : 'z warstwą tekstową'}</td>
                  <td className="komorka text-right">
                    {d.sciezka
                      ? <Button rozmiar="maly" onClick={() => setOtwarty({ dokument: d, odczyt: null })}><FileSearch className="h-3 w-3" /> Odczytaj listę</Button>
                      : <span className="text-xs text-slate-400">plik zarchiwizowany</span>}
                  </td>
                </tr>
              ))}
              {dokumenty.length === 0 && <tr><td colSpan={5} className="komorka text-center text-sm text-slate-500">Brak plików PDF - dodaj rysunki w zakładce Dokumenty.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          PDF z warstwą tekstową (rysunek z CAD) można odczytać bez AI. Skany czyta AI - tylko zaznaczone fragmenty, w ~300 DPI, pocięte na kafle.
        </p>
      </section>
    </div>
  )
}
