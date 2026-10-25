// Podgląd deweloperski modułu "Wersje edytowalne" bez logowania (tylko npm run dev, strona edytowalne-dev.html?plik=...).
// Plik z lokalnego folderu materiałów przez middleware serwera Vite. Zapis do bazy i AI nie działają (brak sesji) -
// strona służy do sprawdzenia podglądu, zaznaczania z przewijaniem, odczytu bez AI i eksportu do Worda.
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import '../index.css'
import { DostawcaSlownikow } from '@/lib/slowniki'
import { rodzajPliku } from '@/lib/wersjeEdytowalne'
import { PlikWersji } from '@/components/edytowalne/PlikWersji'

function Podglad() {
  const sciezka = new URLSearchParams(location.search).get('plik') ?? ''
  const [bajty, setBajty] = useState<Uint8Array | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  useEffect(() => {
    if (!sciezka) { setBlad('Podaj ?plik=<ścieżka pliku w folderze materiałów>'); return }
    fetch(`${import.meta.env.BASE_URL}__materialy/${sciezka.split('/').map(encodeURIComponent).join('/')}`)
      .then(async (r) => { if (!r.ok) throw new Error(await r.text()); return new Uint8Array(await r.arrayBuffer()) })
      .then(setBajty).catch((e) => setBlad(String(e)))
  }, [sciezka])
  if (blad) return <p className="p-4 text-red-700">{blad}</p>
  if (!bajty) return <p className="p-4">Wczytywanie...</p>
  const nazwa = sciezka.split('/').pop() ?? sciezka
  const ext = nazwa.toLowerCase().split('.').pop() ?? ''
  return (
    <div className="mx-auto max-w-[1600px] p-4">
      <PlikWersji
        bajty={bajty} zamknij={() => undefined}
        plik={{
          id: 'dev', nazwa_pliku: nazwa, mime: ext === 'png' ? 'image/png' : ext === 'pdf' ? 'application/pdf' : 'image/jpeg', rozmiar: bajty.byteLength,
          rodzaj: rodzajPliku(nazwa), sciezka: null, stron: null, jezyk: null, tresc: { strony: {}, tlumaczenie: {} },
          utworzyl: null, utworzono: new Date().toISOString(), zmodyfikowano: new Date().toISOString(),
        }}
      />
    </div>
  )
}

if (import.meta.env.DEV) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><DostawcaSlownikow><Podglad /></DostawcaSlownikow></React.StrictMode>,
  )
}
