import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Pencil, ShieldCheck, Trash2 } from 'lucide-react'
import { supabase, wywolajFunkcje } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { dataGodzinaPL } from '@/lib/format'
import { ETYKIETY_ROLI, OPISY_ROLI, type Profil, type Rola } from '@/lib/types'
import { Button } from './ui/button'
import { Komunikat } from './ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog'
import { Tabela, type KolumnaTabeli } from './ui/Tabela'
import { t } from '@/i18n'

interface WierszUzytkownika {
  id: string
  email: string
  nazwa: string | null
  rola: Rola
  widzi_marze: boolean
  wymaga_zmiany_hasla: boolean
  chroniony: boolean
  ostatnie_logowanie: string | null
}

type OdpowiedzKonta = { haslo_tymczasowe?: string; email?: string }
const ROLE: Rola[] = ['technolog', 'handlowy', 'prezes', 'administrator']
const PUSTY = { email: '', nazwa: '', rola: 'technolog' as Rola, widzi_marze: false }

/** Prezes i administrator widzą marże zawsze - flaga ma znaczenie tylko dla pozostałych ról. */
const marzeZRoli = (r: Rola) => r === 'prezes' || r === 'administrator'

export function Uzytkownicy({ profil }: { profil: Profil }) {
  const [uzytkownicy, setUzytkownicy] = useState<WierszUzytkownika[]>([])
  const [nowy, setNowy] = useState(PUSTY)
  const [doEdycji, setDoEdycji] = useState<WierszUzytkownika | null>(null)
  const [doResetu, setDoResetu] = useState<WierszUzytkownika | null>(null)
  const [doUsuniecia, setDoUsuniecia] = useState<WierszUzytkownika | null>(null)
  const [hasloDoPrzekazania, setHasloDoPrzekazania] = useState<{ email: string; haslo: string } | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  const [komunikat, setKomunikat] = useState<string | null>(null)
  const [zajety, setZajety] = useState(false)

  const wczytaj = useCallback(async () => {
    const { data, error } = await supabase.rpc('lista_uzytkownikow')
    if (error) { setBlad(komunikatPL(error.message)); return }
    setUzytkownicy((data ?? []) as WierszUzytkownika[])
  }, [])

  useEffect(() => { void wczytaj() }, [wczytaj])

  async function dodaj(e: React.FormEvent) {
    e.preventDefault()
    setBlad(null); setKomunikat(null); setZajety(true)
    const { dane, blad: b } = await wywolajFunkcje<OdpowiedzKonta>('zarzadzanie-uzytkownikami', { akcja: 'dodaj', ...nowy, email: nowy.email.trim() })
    setZajety(false)
    if (b || !dane) { setBlad(b); return }
    setHasloDoPrzekazania({ email: dane.email!, haslo: dane.haslo_tymczasowe! })
    setNowy(PUSTY)
    await wczytaj()
  }

  async function zapiszEdycje() {
    if (!doEdycji) return
    setBlad(null); setKomunikat(null); setZajety(true)
    const { error } = await supabase.rpc('zmien_uprawnienia', {
      p_user: doEdycji.id, p_rola: doEdycji.rola, p_widzi_marze: doEdycji.widzi_marze, p_nazwa: doEdycji.nazwa ?? '',
    })
    setZajety(false)
    if (error) { setBlad(komunikatPL(error.message)); return }
    setKomunikat(t('{0}: zapisano. Zmiana działa od następnego odświeżenia strony u tej osoby.', doEdycji.email))
    setDoEdycji(null)
    await wczytaj()
  }

  async function resetujHaslo() {
    if (!doResetu) return
    setBlad(null); setZajety(true)
    const { dane, blad: b } = await wywolajFunkcje<OdpowiedzKonta>('zarzadzanie-uzytkownikami', { akcja: 'resetuj', user_id: doResetu.id })
    setZajety(false); setDoResetu(null)
    if (b || !dane) { setBlad(b); return }
    setHasloDoPrzekazania({ email: dane.email!, haslo: dane.haslo_tymczasowe! })
    await wczytaj()
  }

  async function usun() {
    if (!doUsuniecia) return
    setBlad(null); setZajety(true)
    const { blad: b } = await wywolajFunkcje('zarzadzanie-uzytkownikami', { akcja: 'usun', user_id: doUsuniecia.id })
    setZajety(false); setDoUsuniecia(null)
    if (b) setBlad(b)
    await wczytaj()
  }

  const kolumny: KolumnaTabeli<WierszUzytkownika>[] = [
    { id: 'login', naglowek: t('Login'), typ: 'tekst', wartosc: (u) => u.email, className: 'font-medium', komorka: (u) => <>{u.email}{u.id === profil.id && <span className="ml-2 text-xs text-slate-400">{t('(Ty)')}</span>}</> },
    { id: 'nazwa', naglowek: t('Nazwa'), typ: 'tekst', wartosc: (u) => u.nazwa, className: 'text-slate-600' },
    {
      id: 'rola', naglowek: t('Rola'), typ: 'lista', wartosc: (u) => ETYKIETY_ROLI[u.rola],
      komorka: (u) => (u.chroniony ? (
        <span title={t('Konto administratora aplikacji - nie można go usunąć ani zmienić mu roli')} className="znacznik bg-limonka-jasna text-limonka-ciemna ring-limonka">
          <ShieldCheck className="h-3 w-3" /> {ETYKIETY_ROLI[u.rola]}
        </span>
      ) : ETYKIETY_ROLI[u.rola]),
    },
    {
      id: 'marze', naglowek: t('Marże'), typ: 'lista', wartosc: (u) => (marzeZRoli(u.rola) ? 'z roli' : u.widzi_marze ? 'tak' : 'nie'), className: 'text-sm',
      komorka: (u) => (marzeZRoli(u.rola) ? <span className="text-slate-500">{t('z roli')}</span> : u.widzi_marze ? 'tak' : <span className="text-slate-400">nie</span>),
    },
    {
      id: 'logowanie', naglowek: t('Ostatnie logowanie'), typ: 'data', wartosc: (u) => u.ostatnie_logowanie, className: 'text-sm text-slate-600',
      komorka: (u) => <>{u.ostatnie_logowanie ? dataGodzinaPL(u.ostatnie_logowanie) : <span className="text-amber-700">nigdy</span>}{u.wymaga_zmiany_hasla && <span className="ml-2 text-xs text-amber-700">{t('(hasło tymczasowe)')}</span>}</>,
    },
    {
      id: 'akcje', naglowek: '', typ: 'tekst', wartosc: () => '', bezFiltra: true, bezSortu: true,
      komorka: (u) => (
        <div className="flex justify-end gap-2">
          <Button rozmiar="maly" title={t('Zmień rolę i uprawnienia')} disabled={zajety} onClick={() => setDoEdycji({ ...u })}><Pencil className="h-4 w-4" /></Button>
          <Button rozmiar="maly" wariant="akcent" title={t('Nadaj nowe hasło tymczasowe')} disabled={zajety} onClick={() => setDoResetu(u)}><KeyRound className="h-4 w-4" /></Button>
          <Button rozmiar="maly" wariant="ostrzezenie" disabled={u.id === profil.id || u.chroniony || zajety}
            title={u.chroniony ? t('Konta administratora aplikacji nie można usunąć') : u.id === profil.id ? t('Nie możesz usunąć własnego konta') : t('Usuń konto')}
            onClick={() => setDoUsuniecia(u)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold">{t('Użytkownicy')}</h2>
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {komunikat && <Komunikat rodzaj="sukces">{komunikat}</Komunikat>}

      <form onSubmit={dodaj} className="sekcja">
        <h3 className="text-sm font-semibold">{t('Dodaj użytkownika')}</h3>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label>
            <span className="etykieta">{t('Adres e-mail')}</span>
            <input type="email" required className="pole w-64" value={nowy.email}
              onChange={(e) => setNowy({ ...nowy, email: e.target.value })} />
          </label>
          <label>
            <span className="etykieta">{t('Nazwa wyświetlana (stanowisko, opcjonalnie)')}</span>
            <input className="pole w-64" placeholder={t('np. Dział technologów')} value={nowy.nazwa}
              onChange={(e) => setNowy({ ...nowy, nazwa: e.target.value })} />
          </label>
          <label>
            <span className="etykieta">{t('Rola')}</span>
            <select className="pole w-auto" value={nowy.rola} onChange={(e) => setNowy({ ...nowy, rola: e.target.value as Rola })}>
              {ROLE.map((r) => <option key={r} value={r}>{ETYKIETY_ROLI[r]}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" disabled={marzeZRoli(nowy.rola)} checked={nowy.widzi_marze || marzeZRoli(nowy.rola)}
              onChange={(e) => setNowy({ ...nowy, widzi_marze: e.target.checked })} />
            {t('widzi narzuty i marże')}
          </label>
          <Button type="submit" wariant="glowny" disabled={zajety}>{t('Dodaj konto')}</Button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {OPISY_ROLI[nowy.rola]}{t('. Konto dostanie hasło tymczasowe, które pokażemy raz po utworzeniu. Przy pierwszym logowaniu użytkownik musi ustawić własne.')}
        </p>
      </form>

      <Tabela id="uzytkownicy" kolumny={kolumny} wiersze={uzytkownicy} klucz={(u) => u.id} pusto={t('Brak kont.')} />


      <Dialog open={!!hasloDoPrzekazania} onOpenChange={(o) => !o && setHasloDoPrzekazania(null)}>
        <DialogContent>
          <DialogTitle>{t('Hasło tymczasowe')}</DialogTitle>
          <DialogDescription>
            {t('Przekaż te dane pracownikowi.')}{' '}<strong>{t('Hasło pokazujemy tylko teraz')}</strong> {t('- później można je jedynie zresetować ponownie.')}
          </DialogDescription>
          <div className="mt-4 space-y-2 rounded-md bg-slate-50 p-4 font-mono text-sm">
            <div><span className="text-slate-500">{t('Adres aplikacji:')}</span> {window.location.origin}{import.meta.env.BASE_URL}</div>
            <div><span className="text-slate-500">{t('Login:')}</span> {hasloDoPrzekazania?.email}</div>
            <div><span className="text-slate-500">{t('Hasło:')}</span> {hasloDoPrzekazania?.haslo}</div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button wariant="glowny" onClick={() => setHasloDoPrzekazania(null)}>{t('Zapisałem, zamknij')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!doEdycji} onOpenChange={(o) => !o && setDoEdycji(null)}>
        <DialogContent>
          <DialogTitle>{t('Uprawnienia:')}{' '}{doEdycji?.email}</DialogTitle>
          {doEdycji && (
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="etykieta">{t('Nazwa wyświetlana')}</span>
                <input className="pole" value={doEdycji.nazwa ?? ''} onChange={(e) => setDoEdycji({ ...doEdycji, nazwa: e.target.value })} />
              </label>
              <fieldset disabled={doEdycji.chroniony}>
                <span className="etykieta">{t('Rola')}{' '}{doEdycji.chroniony && t('(konto chronione - roli nie można zmienić)')}</span>
                <div className="space-y-1">
                  {ROLE.map((r) => (
                    <label key={r} className="flex items-start gap-2 text-sm">
                      <input type="radio" name="rola" className="mt-1" checked={doEdycji.rola === r}
                        onChange={() => setDoEdycji({ ...doEdycji, rola: r })} />
                      <span><strong>{ETYKIETY_ROLI[r]}</strong> <span className="text-slate-500">- {OPISY_ROLI[r]}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={marzeZRoli(doEdycji.rola)} checked={doEdycji.widzi_marze || marzeZRoli(doEdycji.rola)}
                  onChange={(e) => setDoEdycji({ ...doEdycji, widzi_marze: e.target.checked })} />
                {t('widzi narzuty i marże (zysk, korekta prezesa)')}
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button onClick={() => setDoEdycji(null)}>{t('Anuluj')}</Button>
                <Button wariant="glowny" disabled={zajety} onClick={() => void zapiszEdycje()}>{t('Zapisz')}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!doResetu} onOpenChange={(o) => !o && setDoResetu(null)}>
        <DialogContent>
          <DialogTitle>{t('Zresetować hasło:')}{' '}{doResetu?.email}?</DialogTitle>
          <DialogDescription>
            {t('Dotychczasowe hasło przestanie działać. Otrzymasz nowe hasło tymczasowe do przekazania tej osobie.')}
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setDoResetu(null)}>{t('Anuluj')}</Button>
            <Button wariant="glowny" disabled={zajety} onClick={() => void resetujHaslo()}>{t('Resetuj hasło')}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!doUsuniecia} onOpenChange={(o) => !o && setDoUsuniecia(null)}>
        <DialogContent>
          <DialogTitle>{t('Usunąć konto')}{' '}{doUsuniecia?.email}?</DialogTitle>
          <DialogDescription>
            {t('Użytkownik straci dostęp do aplikacji. Jego zapytania, wyceny i historia zmian zostają nienaruszone.')}
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setDoUsuniecia(null)}>{t('Anuluj')}</Button>
            <Button wariant="ostrzezenie" disabled={zajety} onClick={() => void usun()}>{t('Usuń konto')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
