import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BookOpen, KeyRound, LogOut, Settings, Trash2, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { DostawcaSlownikow, useSlowniki } from '@/lib/slowniki'
import { ETYKIETY_ROLI, uprawnienia, type Profil } from '@/lib/types'
import { cn } from '@/lib/utils'
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
import { Kosz } from './components/kosz/Kosz'
import { Button } from './components/ui/button'
import { PasekHistorii } from './components/ui/PasekHistorii'
import { ustawUzytkownikaTabel } from '@/lib/tabela'
import { JEZYKI, jezyk, t, ustawJezyk, type Jezyk } from '@/i18n'

type Widok = 'zapytania' | 'wyceny' | 'edytowalne' | 'kosz' | 'zatwierdzanie' | 'oferty' | 'zakupy' | 'uslugi' | 'projekty' | 'ustawienia' | 'uzytkownicy' | 'instrukcja'

const WIDOKI: Widok[] = ['zapytania', 'wyceny', 'edytowalne', 'kosz', 'zatwierdzanie', 'oferty', 'zakupy', 'uslugi', 'projekty', 'ustawienia', 'uzytkownicy', 'instrukcja']

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
      .select('id, email, nazwa, rola, widzi_marze, wymaga_zmiany_hasla, jezyk').eq('id', userId).maybeSingle()
    const p = (data as Profil | null) ?? null
    // Język z profilu ma pierwszeństwo przed zapamiętanym w tej przeglądarce (inny komputer, inne konto).
    if (p?.jezyk && p.jezyk !== jezyk()) { ustawJezyk(p.jezyk); return }
    setProfil(p)
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
    return <div className="flex min-h-screen items-center justify-center text-slate-500">{t('Wczytywanie...')}</div>
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
    return <div className="flex min-h-screen items-center justify-center text-slate-500">{t('Wczytywanie profilu...')}</div>
  }
  if (profil === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="max-w-md text-slate-700">
          {t('Konto')}{' '}<strong>{sesja.user.email}</strong> {t('nie ma nadanych uprawnień w aplikacji. Poproś administratora o dodanie konta.')}
        </p>
        <Button onClick={() => supabase.auth.signOut()}>{t('Wyloguj')}</Button>
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
  const [{ widok, id }, ustawWidok] = useWidok()
  const up = uprawnienia(profil)
  ustawUzytkownikaTabel(profil.id)
  async function zmienJezyk(j: Jezyk) {
    if (j === jezyk()) return
    await supabase.rpc('ustaw_jezyk', { p_jezyk: j })
    ustawJezyk(j)
  }

  // Dwa moduły: proces od zapytania do wyceny i dane historyczne (cennik). Ustawienia, użytkownicy, instrukcja - osobno.
  const modul1: { id: Widok; etykieta: string }[] = [
    { id: 'zapytania', etykieta: t('Zapytania') },
    { id: 'edytowalne', etykieta: t('Wersje edytowalne') },
    { id: 'oferty', etykieta: t('Oferty dostawców') },
    ...(profil.rola === 'prezes' ? [{ id: 'zatwierdzanie' as Widok, etykieta: t('Do zatwierdzenia') }] : []),
  ]
  const modul2: { id: Widok; etykieta: string }[] = [
    { id: 'zakupy', etykieta: t('Zakupy (Optima)') },
    { id: 'uslugi', etykieta: t('Usługi kooperacyjne') },
    { id: 'projekty', etykieta: t('Projekty zrealizowane') },
  ]
  const poza: { id: Widok; etykieta: string; ikona: typeof Settings }[] = [
    ...(up.ustawienia ? [{ id: 'ustawienia' as Widok, etykieta: t('Ustawienia'), ikona: Settings }] : []),
    ...(up.uzytkownicy ? [{ id: 'uzytkownicy' as Widok, etykieta: t('Użytkownicy'), ikona: Users }] : []),
    { id: 'kosz', etykieta: t('Kosz'), ikona: Trash2 },
    { id: 'instrukcja', etykieta: t('Instrukcja'), ikona: BookOpen },
  ]
  // Widok niedostępny dla roli (np. technolog wpisał #/ustawienia) - pokazujemy start.
  // Edytor wyceny (#/wyceny/<id>) należy do modułu zapytań.
  const wszystkie = [...modul1, ...modul2, ...poza]
  const aktywny = widok === 'wyceny' ? 'wyceny' : wszystkie.some((z) => z.id === widok) ? widok : 'zapytania'
  const wModule2 = modul2.some((z) => z.id === aktywny)
  const zakladki = poza.some((z) => z.id === aktywny) ? [] : wModule2 ? modul2 : modul1

  return (
    <div className="min-h-screen">
      <NowaWersja />
      <header className="bez-druku border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Logo i nazwa firmy z ustawień (baza) - w repozytorium nie ma danych firmy. */}
            <img src={firma?.logo || `${import.meta.env.BASE_URL}ikona.svg`} alt="" className="h-7 w-auto" />
            <div className="border-l border-slate-200 pl-3">
              <h1 className="text-sm font-semibold leading-tight">{t('Wyceny i oferty')}</h1>
              {firma?.nazwa && <p className="text-xs text-slate-500">{firma.nazwa}</p>}
            </div>
          </div>
          <nav className="flex rounded-lg bg-slate-100 p-0.5" aria-label={t('Moduły')}>
            {([['zapytania', t('Zapytania ofertowe i wyceny'), !wModule2 && zakladki.length > 0], ['zakupy', t('Historyczny cennik'), wModule2]] as [Widok, string, boolean][]).map(([cel, et, akt]) => (
              <button key={cel} onClick={() => ustawWidok(cel)}
                className={cn('rounded-md px-3 py-1.5 text-sm font-semibold', akt ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
                {et}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <PasekHistorii />
            <div className="flex rounded-md border border-slate-200 text-xs" role="group" aria-label={t('Język')}>
              {JEZYKI.map((j) => (
                <button key={j.id} title={j.id === 'pl' ? t('Polski') : t('English')} onClick={() => void zmienJezyk(j.id)}
                  className={cn('px-2 py-1 font-semibold', jezyk() === j.id ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100')}>{j.etykieta}</button>
              ))}
            </div>
            {poza.map((z) => (
              <Button key={z.id} wariant="cichy" rozmiar="maly" title={z.etykieta} onClick={() => ustawWidok(z.id)}
                className={cn(aktywny === z.id && 'bg-limonka-jasna')}><z.ikona className="h-4 w-4" /><span className="hidden xl:inline">{z.etykieta}</span></Button>
            ))}
            <span className="mx-1 h-6 w-px bg-slate-200" />
            <div className="text-right">
              <p className="text-sm font-medium leading-tight">{profil.nazwa || profil.email}</p>
              <p className="text-xs text-slate-500">
                {ETYKIETY_ROLI[profil.rola]}{up.widziMarze && profil.rola !== 'prezes' && profil.rola !== 'administrator' ? t(' · widzi marże') : ''}
              </p>
            </div>
            <Button wariant="cichy" rozmiar="maly" onClick={zmienHaslo} title={t('Zmień hasło')}><KeyRound className="h-4 w-4" /></Button>
            <Button wariant="cichy" rozmiar="maly" onClick={() => supabase.auth.signOut()} title={t('Wyloguj')}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
        {zakladki.length > 0 && (
          <div className="mx-auto flex max-w-[1500px] flex-wrap gap-1 px-4 pb-2">
            {zakladki.map((z) => (
              <button key={z.id} onClick={() => ustawWidok(z.id)}
                className={cn('rounded-md px-3 py-1 text-sm font-medium',
                  (aktywny === z.id || (aktywny === 'wyceny' && z.id === 'zapytania')) ? 'bg-limonka-jasna text-slate-900' : 'text-slate-600 hover:bg-slate-100')}>
                {z.etykieta}
              </button>
            ))}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-6">
        {blad ? (
          <div className="sekcja text-center">
            <p className="text-red-700">{t('Nie udało się wczytać słowników:')}{' '}{blad}</p>
            <Button className="mt-3" onClick={() => void odswiez()}>{t('Spróbuj ponownie')}</Button>
          </div>
        ) : !gotowe ? (
          <p className="text-center text-slate-500">{t('Wczytywanie słowników...')}</p>
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
          <EdytorWyceny key={id} id={id} profil={profil} otworzWycene={(w) => ustawWidok('wyceny', w)} />
        ) : aktywny === 'kosz' ? (
          <Kosz profil={profil} />
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
            <h2 className="text-lg font-semibold">{t('Usługi kooperacyjne')}</h2>
            <p className="text-sm text-slate-600">
              {t('Oferty kooperantów i usługi z kart dostawy. Porównanie wg wielkości odniesienia kategorii (malowanie zł/m², PWHT kwota za aparat, NDT zł/mb, transport kwota za kurs). Nowe oferty usług dodajesz w zakładce Oferty dostawców.')}
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
