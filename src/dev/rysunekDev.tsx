// Podgląd deweloperski modułu rysunków bez logowania (tylko npm run dev, strona rysunek-dev.html).
// PDF z lokalnego folderu materiałów przez middleware serwera Vite. Zapis do bazy nie zadziała
// (brak sesji) - strona służy do sprawdzenia renderu, zaznaczania obszarów, odczytu z tekstu i siatki.
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import '../index.css'
import { DostawcaSlownikow } from '@/lib/slowniki'
import type { Profil } from '@/lib/types'
import { OdczytRysunku } from '@/components/rysunki/OdczytRysunku'

const PROFIL: Profil = { id: 'dev', email: 'dev@localhost', nazwa: 'Podgląd', rola: 'technolog', widzi_marze: false, wymaga_zmiany_hasla: false }

function Podglad() {
  const sciezka = new URLSearchParams(location.search).get('pdf') ?? ''
  const [bajty, setBajty] = useState<Uint8Array | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  useEffect(() => {
    if (!sciezka) { setBlad('Podaj ?pdf=<ścieżka pliku w folderze materiałów>'); return }
    fetch(`${import.meta.env.BASE_URL}__materialy/${sciezka.split('/').map(encodeURIComponent).join('/')}`)
      .then(async (r) => { if (!r.ok) throw new Error(await r.text()); return new Uint8Array(await r.arrayBuffer()) })
      .then(setBajty).catch((e) => setBlad(String(e)))
  }, [sciezka])
  if (blad) return <p className="p-4 text-red-700">{blad}</p>
  if (!bajty) return <p className="p-4">Wczytywanie...</p>
  return (
    <div className="mx-auto max-w-[1600px] p-4">
      <OdczytRysunku
        zapytanieId="dev" numer="DEV" profil={PROFIL} odczyt={null} bajty={bajty}
        dokument={{ id: 'dev', nazwa_pliku: sciezka.split('/').pop() ?? sciezka, sciezka: null, metadane: {} }}
        zamknij={() => undefined} otworzWycene={() => undefined}
        rodzajAparatu={new URLSearchParams(location.search).get('aparat') === 'wymiennik' ? 'wymiennik' : 'zbiornik'}
      />
    </div>
  )
}

if (import.meta.env.DEV) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><DostawcaSlownikow><Podglad /></DostawcaSlownikow></React.StrictMode>,
  )
}
