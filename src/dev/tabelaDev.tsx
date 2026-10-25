// Podgląd deweloperski wspólnej tabeli (filtry i sortowanie w nagłówkach) na danych fikcyjnych - tylko npm run dev.
import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import '../index.css'
import { Tabela, type KolumnaTabeli } from '@/components/ui/Tabela'
import { PasekHistorii } from '@/components/ui/PasekHistorii'
import { useHistoriaStanu } from '@/lib/historia'

interface W { id: number; numer: string; klient: string; kwota: number | null; termin: string | null; pilne: boolean }
const DANE: W[] = Array.from({ length: 60 }, (_, i) => ({
  id: i, numer: `ZO/${i + 1}/2026`, klient: ['Alfa', 'Beta', 'Gamma', 'Delta'][i % 4], kwota: i % 7 === 0 ? null : (i * 1234) % 50000,
  termin: i % 5 === 0 ? null : `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`, pilne: i % 3 === 0,
}))

function Podglad() {
  const [wiersze, setWiersze] = useState(DANE)
  const [zazn, setZazn] = useState<Set<string | number>>(new Set())
  const zapisz = useHistoriaStanu<W[]>('dev-tabela', (f) => setWiersze((s) => f(s)))
  const zmien = (id: number, kwota: number) => { const po = wiersze.map((w) => (w.id === id ? { ...w, kwota } : w)); zapisz(wiersze, po, `kwota w ZO ${id + 1}`); setWiersze(po) }
  const kolumny: KolumnaTabeli<W>[] = [
    { id: 'numer', naglowek: 'Numer', typ: 'tekst', wartosc: (w) => w.numer },
    { id: 'klient', naglowek: 'Klient', typ: 'lista', wartosc: (w) => w.klient },
    { id: 'kwota', naglowek: 'Kwota', typ: 'liczba', wartosc: (w) => w.kwota, komorka: (w) => <input className="pole-komorki text-right" value={w.kwota ?? ''} onChange={(e) => zmien(w.id, Number(e.target.value))} /> },
    { id: 'termin', naglowek: 'Termin', typ: 'data', wartosc: (w) => w.termin },
    { id: 'pilne', naglowek: 'Pilne', typ: 'tak_nie', wartosc: (w) => w.pilne },
  ]
  return (
    <div className="mx-auto max-w-5xl space-y-3 p-4">
      <div className="flex justify-end"><PasekHistorii /></div>
      <Tabela id="dev" kolumny={kolumny} wiersze={wiersze} klucz={(w) => w.id} zaznaczanie={{ zaznaczone: zazn, zmien: setZazn }} />
    </div>
  )
}

if (import.meta.env.DEV) {
  ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Podglad /></React.StrictMode>)
}
