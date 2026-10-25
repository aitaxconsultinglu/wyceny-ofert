import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { dataGodzinaPL, liczba } from '@/lib/format'
import { ETYKIETY_KOSZA, przywroc, usunTrwale, type WpisKosza } from '@/lib/kosz'
import { useOdswiezPoHistorii, useZakresHistorii } from '@/lib/historia'
import type { Profil } from '@/lib/types'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'

const DZIEN = 86_400_000

/** Kosz: co, kto i kiedy usunął, z jakiego zapytania; przywrócenie z całą zawartością albo trwałe usunięcie z plikami. */
export function Kosz({ profil }: { profil: Profil }) {
  const s = useSlowniki()
  const dni = Number((s.ustawienia.kosz as { dni?: number } | undefined)?.dni ?? 30)
  const szef = profil.rola === 'prezes' || profil.rola === 'administrator'
  const [wpisy, setWpisy] = useState<WpisKosza[]>([])
  const [ludzie, setLudzie] = useState<Record<string, string>>({})
  const [blad, setBlad] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [zaznaczone, setZaznaczone] = useState<Set<string | number>>(new Set())
  useZakresHistorii('kosz')

  const wczytaj = useCallback(async () => {
    const [k, l] = await Promise.all([
      supabase.from('kosz').select('id, rodzaj, rekord_id, opis, zapytanie_id, numer_zo, pliki, rozmiar, usunal, usunieto').order('usunieto', { ascending: false }),
      supabase.rpc('lista_pracownikow'),
    ])
    if (k.error) setBlad(komunikatPL(k.error.message))
    setWpisy((k.data ?? []) as WpisKosza[])
    setLudzie(Object.fromEntries(((l.data ?? []) as { id: string; nazwa: string }[]).map((x) => [x.id, x.nazwa])))
  }, [])
  useEffect(() => { void wczytaj() }, [wczytaj])
  useOdswiezPoHistorii(() => void wczytaj())

  const pozostalo = (w: WpisKosza) => Math.max(0, Math.ceil((new Date(w.usunieto).getTime() + dni * DZIEN - Date.now()) / DZIEN))
  const wkrotce = wpisy.filter((w) => pozostalo(w) <= 7)

  async function przywrocWybrane(ids: string[]) {
    setBlad(null); setInfo(null)
    let ile = 0
    for (const id of ids) {
      try { await przywroc(id); ile++ } catch (e) { setBlad(e instanceof Error ? e.message : String(e)); break }
    }
    if (ile) setInfo(`Przywrócono: ${ile}.`)
    setZaznaczone(new Set()); await wczytaj()
  }
  async function usunWybrane(ids: string[]) {
    setBlad(null); setInfo(null)
    const lista = wpisy.filter((w) => ids.includes(w.id))
    if (!window.confirm(`Usunąć trwale ${lista.length} ${lista.length === 1 ? 'wpis' : 'wpisy'} razem z plikami? Tego nie da się cofnąć.`)) return
    let plikow = 0
    for (const w of lista) {
      let potw: string | null = null
      if (w.rodzaj === 'zapytanie') {
        potw = window.prompt(`Wpisz numer zapytania, aby usunąć je trwale: ${w.numer_zo}`)
        if (potw === null) continue
      }
      try { plikow += await usunTrwale(w.id, potw) } catch (e) { setBlad(e instanceof Error ? e.message : String(e)); break }
    }
    setInfo(`Usunięto trwale${plikow ? `, plików: ${plikow}` : ''}.`)
    setZaznaczone(new Set()); await wczytaj()
  }

  const kolumny: KolumnaTabeli<WpisKosza>[] = [
    { id: 'rodzaj', naglowek: 'Co', typ: 'lista', wartosc: (w) => ETYKIETY_KOSZA[w.rodzaj] },
    { id: 'opis', naglowek: 'Opis', typ: 'tekst', wartosc: (w) => w.opis, className: 'font-medium' },
    { id: 'zo', naglowek: 'Zapytanie', typ: 'tekst', wartosc: (w) => w.numer_zo },
    { id: 'kto', naglowek: 'Kto usunął', typ: 'lista', wartosc: (w) => (w.usunal ? ludzie[w.usunal] ?? '' : '') },
    { id: 'kiedy', naglowek: 'Kiedy', typ: 'data', wartosc: (w) => w.usunieto, komorka: (w) => dataGodzinaPL(w.usunieto) },
    { id: 'pliki', naglowek: 'Plików', typ: 'liczba', wartosc: (w) => w.pliki.length },
    { id: 'rozmiar', naglowek: 'Rozmiar [kB]', typ: 'liczba', wartosc: (w) => Math.round(w.rozmiar / 1024), komorka: (w) => liczba(w.rozmiar / 1024, 0) },
    { id: 'zostalo', naglowek: 'Usunięcie za [dni]', typ: 'liczba', wartosc: (w) => pozostalo(w), className: '', komorka: (w) => <span className={pozostalo(w) <= 7 ? 'font-semibold text-red-700' : ''}>{pozostalo(w)}</span> },
    {
      id: 'akcje', naglowek: '', typ: 'tekst', wartosc: () => '', bezFiltra: true, bezSortu: true,
      komorka: (w) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button rozmiar="maly" onClick={() => void przywrocWybrane([w.id])}><RotateCcw className="h-3 w-3" /> Przywróć</Button>
          {szef && <Button rozmiar="maly" wariant="ostrzezenie" onClick={() => void usunWybrane([w.id])}><Trash2 className="h-3 w-3" /> Usuń trwale</Button>}
        </div>
      ),
    },
  ]

  const wybrane = [...zaznaczone].map(String)
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Kosz</h2>
      <p className="text-sm text-slate-600">
        Usunięte zapytania (z dokumentami, odczytami, analizą, wycenami i ofertami), dokumenty, odczyty, wersje wycen, oferty, importy.
        Przywrócenie odtwarza wszystko z tymi samymi danymi. Po {dni} dniach wpisy i pliki są usuwane automatycznie.
        {szef ? ' Trwałe usunięcie wcześniej - prezes i administrator.' : ''}
      </p>
      {wkrotce.length > 0 && <Komunikat rodzaj="ostrzezenie">W ciągu 7 dni zostanie trwale usuniętych: {wkrotce.length} - przywróć to, co jest potrzebne.</Komunikat>}
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {info && <Komunikat rodzaj="sukces">{info}</Komunikat>}
      {wybrane.length > 0 && (
        <div className="flex gap-2">
          <Button onClick={() => void przywrocWybrane(wybrane)}><RotateCcw className="h-4 w-4" /> Przywróć zaznaczone ({wybrane.length})</Button>
          {szef && <Button wariant="ostrzezenie" onClick={() => void usunWybrane(wybrane)}><Trash2 className="h-4 w-4" /> Usuń trwale ({wybrane.length})</Button>}
        </div>
      )}
      <Tabela id="kosz" kolumny={kolumny} wiersze={wpisy} klucz={(w) => w.id} zaznaczanie={{ zaznaczone, zmien: setZaznaczone }} pusto="Kosz jest pusty." />
    </div>
  )
}
