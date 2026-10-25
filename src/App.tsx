import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { LogOut, KeyRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DostawcaSlownikow, useSlowniki } from '@/lib/slowniki'
import { ETYKIETY_ROLI, uprawnienia, type Profil } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useModuly } from '@/lib/moduly'
import { Logowanie } from './components/Logowanie'
import { UstawHaslo } from './components/UstawHaslo'
import { NowaWersja } from './components/NowaWersja'
import { Ustawienia } from './components/ustawienia/Ustawienia'
import { Uzytkownicy } from './components/Uzytkownicy'
import { Instrukcja } from './components/Instrukcja'
import { OfertyDostawcow } from './components/oferty/OfertyDostawcow'
import { Porownywarka } from './components/oferty/Porownywarka'
import { Zakupy } from './components/zakupy/Zakupy'
import { Projekty } from './components/projekty/Projekty'
import { ListaZapytan } from './components/zapytania/ListaZapytan'
import { KartaZapytania } from './components/zapytania/KartaZapytania'
import { EdytorWyceny } from './components/wycena/EdytorWyceny'
import { KolejkaZatwierdzania } from './components/wycena/KolejkaZatwierdzania'
import { WersjeEdytowalne } from './components/edytowalne/WersjeEdytowalne'
import { Button } from './components/ui/button'

type Widok = 'zapytania' | 'wyceny' | 'edytowalne' | 'zatwierdzanie' | 'oferty' | 'zakupy' | 'uslugi' | 'projekty' | 'ustawienia' | 'uzytkownicy' | 'instrukcja'

const WIDOKI: Widok[] = ['zapytania', 'wyceny', 'edytowalne', 'zatwierdzanie', 'oferty', 'zakupy', 'uslugi', 'projekty', 'ustawienia', 'uzytkownicy', 'instrukcja']

/** Widok w adresie (#/zapytania/<id>, #/wyceny/<id>) - odświeżenie strony nie wyrzuca na start. */
function useWidok(): [{ widok: Widok; id: string | null }, (w: Widok, id?: string | null) => void] {
  const odczytaj = () => {
    const [w, id] = window.location.hash.replace(/^#\/?/, '').split('/') as [Widok, string | undefined]
    return { widok: WIDOKI.includes(w) ? w : 'zapytania' as Widok, id: id || null }
  }
  const [stan, setStan] = useState(odczytaj)
  useEffect(() => {
    const przy = () => setStan(odczytaj())
    window.addEventListener('hashchange', przy)
    return () => window.removeEventListener('hashchange', przy)
  }, [])
  return [stan, (w, id) => { window.location.hash = id ? `/${w}/${id}` : `/${w}` }]
}

export default function App() {
  const [sesja, setSesja] = useState<Session | null>(null)
  const [profil, setProfil] = useState<Profil | null | undefined>(undefined)
  const [ladowanie, setLadowanie] = useState(true)
  const [odzyskiwanie, setOdzyskiwanie] = useState(false)
  const [zmianaHasla, setZmianaHasla] = useState(false)

  const wczytajProfil = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles')
      .select('id, email, nazwa, rola, widzi_marze, wymaga_zmiany_hasla').eq('id', userId).maybeSingle()
    setProfil((data as Profil | null) ?? null)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesja(data.session)
      setLadowanie(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((zdarzenie, s) => {
      if (zdarzenie === 'PASSWORD_RECOVERY') setOdzyskiwanie(true)
      setSesja(s)
      if (!s) {
        setProfil(undefined)
        setOdzyskiwanie(false)
        setZmianaHasla(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (sesja) void wczytajProfil(sesja.user.id)
  }, [sesja?.user.id, wczytajProfil]) // eslint-disable-line react-hooks/exhaustive-deps

  if (ladowanie) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Wczytywanie...</div>
  }
  if (!sesja) return <Logowanie />

  if (odzyskiwanie || zmianaHasla) {
    return (
      <UstawHaslo
        powod={odzyskiwanie ? 'odzyskiwanie' : 'zmiana'}
        email={sesja.user.email ?? ''}
        anuluj={zmianaHasla && !odzyskiwanie ? () => setZmianaHasla(false) : undefined}
        gotowe={() => {
          setOdzyskiwanie(false)
          setZmianaHasla(false)
          void wczytajProfil(sesja.user.id)
        }}
      />
    )
  }
  if (profil === undefined) {
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Wczytywanie profilu...</div>
  }
  if (profil === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="max-w-md text-slate-700">
          Konto <strong>{sesja.user.email}</strong> nie ma nadanych uprawnień w aplikacji.
          Poproś administratora o dodanie konta.
        </p>
        <Button onClick={() => supabase.auth.signOut()}>Wyloguj</Button>
      </div>
    )
  }
  if (profil.wymaga_zmiany_hasla) {
    return <UstawHaslo powod="pierwsze-logowanie" email={profil.email} gotowe={() => void wczytajProfil(sesja.user.id)} />
  }

  return (
    <DostawcaSlownikow>
      <Aplikacja profil={profil} zmienHaslo={() => setZmianaHasla(true)} />
    </DostawcaSlownikow>
  )
}

function Aplikacja({ profil, zmienHaslo }: { profil: Profil; zmienHaslo: () => void }) {
  const { gotowe, blad, odswiez, ustawienia } = useSlowniki()
  const firma = ustawienia?.firma
  const { widac } = useModuly()
  const [{ widok, id }, ustawWidok] = useWidok()
  const up = uprawnienia(profil)

  const zakladki: { id: Widok; etykieta: string; grupa?: string }[] = [
    { id: 'zapytania', etykieta: 'Zapytania i wyceny' },
    ...(widac('wersjeEdytowalne') ? [{ id: 'edytowalne' as Widok, etykieta: 'Wersje edytowalne' }] : []),
    ...(profil.rola === 'prezes' && widac('zatwierdzanie') ? [{ id: 'zatwierdzanie' as Widok, etykieta: 'Do zatwierdzenia' }] : []),
    { id: 'zakupy', etykieta: 'Zakupy (Optima)', grupa: 'Baza cen' },
    { id: 'oferty', etykieta: widac('uslugi') ? 'Oferty dostawców' : 'Oferty na materiały', grupa: 'Baza cen' },
    ...(widac('uslugi') ? [{ id: 'uslugi' as Widok, etykieta: 'Usługi kooperacyjne', grupa: 'Baza cen' }] : []),
    ...(widac('projekty') ? [{ id: 'projekty' as Widok, etykieta: 'Projekty zrealizowane' }] : []),
    ...(up.ustawienia ? [{ id: 'ustawienia' as Widok, etykieta: 'Ustawienia' }] : []),
    ...(up.uzytkownicy ? [{ id: 'uzytkownicy' as Widok, etykieta: 'Użytkownicy' }] : []),
    { id: 'instrukcja', etykieta: 'Instrukcja' },
  ]
  // Widok niedostępny dla roli (np. technolog wpisał #/ustawienia) - pokazujemy start.
  // Edytor wyceny (#/wyceny/<id>) należy do zakładki zapytań.
  const aktywny = widok === 'wyceny' ? 'wyceny' : zakladki.some((z) => z.id === widok) ? widok : 'zapytania'

  return (
    <div className="min-h-screen">
      <NowaWersja />
      <header className="bez-druku border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Logo i nazwa firmy z ustawień (baza) - w repozytorium nie ma danych firmy. */}
            <img src={firma?.logo || `${import.meta.env.BASE_URL}ikona.svg`} alt="" className="h-7 w-auto" />
            <div className="border-l border-slate-200 pl-3">
              <h1 className="text-sm font-semibold leading-tight">Wyceny i oferty</h1>
              {firma?.nazwa && <p className="text-xs text-slate-500">{firma.nazwa}</p>}
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {zakladki.map((z, i) => (
              <span key={z.id} className="flex items-center">
                {z.grupa && zakladki[i - 1]?.grupa !== z.grupa && (
                  <span className="ml-2 mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{z.grupa}:</span>
                )}
                <button
                  onClick={() => ustawWidok(z.id)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium',
                    (aktywny === z.id || (aktywny === 'wyceny' && z.id === 'zapytania')) ? 'bg-limonka-jasna text-slate-900' : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  {z.etykieta}
                </button>
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="text-right">
              <p className="text-sm font-medium leading-tight">{profil.nazwa || profil.email}</p>
              <p className="text-xs text-slate-500">
                {ETYKIETY_ROLI[profil.rola]}{up.widziMarze && profil.rola !== 'prezes' && profil.rola !== 'administrator' ? ' · widzi marże' : ''}
              </p>
            </div>
            <Button wariant="cichy" rozmiar="maly" onClick={zmienHaslo} title="Zmień hasło"><KeyRound className="h-4 w-4" /></Button>
            <Button wariant="cichy" rozmiar="maly" onClick={() => supabase.auth.signOut()} title="Wyloguj"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6">
        {blad ? (
          <div className="sekcja text-center">
            <p className="text-red-700">Nie udało się wczytać słowników: {blad}</p>
            <Button className="mt-3" onClick={() => void odswiez()}>Spróbuj ponownie</Button>
          </div>
        ) : !gotowe ? (
          <p className="text-center text-slate-500">Wczytywanie słowników...</p>
        ) : aktywny === 'ustawienia' ? (
          <Ustawienia />
        ) : aktywny === 'uzytkownicy' ? (
          <Uzytkownicy profil={profil} />
        ) : aktywny === 'instrukcja' ? (
          <Instrukcja profil={profil} />
        ) : aktywny === 'zapytania' ? (
          id
            ? <KartaZapytania key={id} id={id} profil={profil} zamknij={() => ustawWidok('zapytania')} otworzWycene={(w) => ustawWidok('wyceny', w)} />
            : <ListaZapytan otworz={(z) => ustawWidok('zapytania', z)} />
        ) : aktywny === 'wyceny' && id ? (
          <EdytorWyceny key={id} id={id} profil={profil} otworzWycene={(w) => ustawWidok('wyceny', w)}
            zamknij={() => { window.history.length > 1 ? window.history.back() : ustawWidok('zapytania') }} />
        ) : aktywny === 'edytowalne' ? (
          <WersjeEdytowalne profil={profil} id={id} otworz={(p) => ustawWidok('edytowalne', p)} />
        ) : aktywny === 'zatwierdzanie' ? (
          <KolejkaZatwierdzania otworz={(w) => ustawWidok('wyceny', w)} />
        ) : aktywny === 'oferty' ? (
          <OfertyDostawcow profil={profil} />
        ) : aktywny === 'zakupy' ? (
          <Zakupy profil={profil} />
        ) : aktywny === 'uslugi' ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Usługi kooperacyjne</h2>
            <p className="text-sm text-slate-600">
              Oferty kooperantów i usługi z kart dostawy. Porównanie wg wielkości odniesienia kategorii (malowanie zł/m², PWHT kwota za aparat,
              NDT zł/mb, transport kwota za kurs). Nowe oferty usług dodajesz w zakładce Oferty dostawców.
            </p>
            <Porownywarka tylkoUslugi />
          </div>
        ) : (
          <Projekty profil={profil} />
        )}
      </main>
    </div>
  )
}
