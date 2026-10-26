import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleSlash, FileText, Sparkles, XCircle } from 'lucide-react'
import { useSlowniki } from '@/lib/slowniki'
import { liczba } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RaportPrzygotowania } from '@/lib/analiza'
import { wykonajPrzygotowanie, zaplanujPrzygotowanie, type PlanPrzygotowania, type ZapytanieDoPrzygotowania } from '@/lib/przygotowanieAuto'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { t } from '@/i18n'

type Etap = 'opcje' | 'planowanie' | 'plan' | 'trwa' | 'gotowe'
const GDZIE: Record<'wycena' | 'rysunki' | 'karta', string> = { wycena: t('wycena'), rysunki: t('rysunki i listy'), karta: t('karta analizy') }

/** Lista kroków i punktów do weryfikacji (też w karcie analizy). */
export function RaportWidok({ raport, otworzWycene, otworzZakladke, bezKarty }: {
  raport: RaportPrzygotowania; otworzWycene?: (id: string) => void; otworzZakladke?: (z: 'analiza' | 'rysunki') => void
  /** Raport pokazany w samej karcie analizy - bez przycisku do niej. */
  bezKarty?: boolean
}) {
  return (
    <div className="space-y-3 text-sm">
      <ul className="space-y-1">
        {raport.kroki.map((k) => (
          <li key={k.nazwa} className="flex items-start gap-2">
            {k.stan === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : k.stan === 'blad' ? <XCircle className="mt-0.5 h-4 w-4 text-red-600" /> : <CircleSlash className="mt-0.5 h-4 w-4 text-slate-400" />}
            <span><strong>{k.nazwa}</strong> - {k.opis}</span>
          </li>
        ))}
      </ul>
      {raport.weryfikacja.length > 0 && (
        <div>
          <p className="etykieta">{t('Do sprawdzenia (')}{raport.weryfikacja.length})</p>
          <ul className="space-y-1">
            {raport.weryfikacja.map((p, i) => (
              <li key={i} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><span>{p.opis} <span className="text-xs text-slate-400">({GDZIE[p.gdzie]})</span></span></li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {raport.wycena_id && otworzWycene && <Button rozmiar="maly" wariant="glowny" onClick={() => otworzWycene(raport.wycena_id!)}><FileText className="h-3 w-3" /> {t('Otwórz wycenę v')}{raport.wersja}</Button>}
        {otworzZakladke && !bezKarty && <Button rozmiar="maly" onClick={() => otworzZakladke('analiza')}>{t('Karta analizy')}</Button>}
        {otworzZakladke && <Button rozmiar="maly" onClick={() => otworzZakladke('rysunki')}>{t('Rysunki i listy')}</Button>}
      </div>
    </div>
  )
}

/**
 * Przygotowanie automatyczne: analiza zapytania (AI), listy materiałów z rysunków (AI), wstępna wycena z cenami
 * z bazy i projekt oferty. Najpierw plan z kosztem do potwierdzenia; bez klucza AI - tylko wycena i oferta.
 */
export function PrzygotowanieAutomatyczne({ otwarty, zamknij, zapytanie, widziMarze, otworzWycene, otworzZakladke, poZakonczeniu, odRazu }: {
  otwarty: boolean
  zamknij: () => void
  zapytanie: ZapytanieDoPrzygotowania
  widziMarze: boolean
  otworzWycene: (id: string) => void
  otworzZakladke: (z: 'analiza' | 'rysunki') => void
  poZakonczeniu: () => void
  /** Otwarte zaraz po imporcie z maila - plan liczy się od razu. */
  odRazu?: boolean
}) {
  const s = useSlowniki()
  const [etap, setEtap] = useState<Etap>('opcje')
  const [opcje, setOpcje] = useState({ analiza: true, rysunki: true, wycena: true, oferta: true })
  const [postep, setPostep] = useState('')
  const [plan, setPlan] = useState<PlanPrzygotowania | null>(null)
  const [raport, setRaport] = useState<RaportPrzygotowania | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  const startowane = useRef(false)

  useEffect(() => {
    if (!otwarty) { startowane.current = false; return }
    setEtap('opcje'); setPlan(null); setRaport(null); setBlad(null)
    if (odRazu && !startowane.current && s.gotowe) { startowane.current = true; void planuj() }
  }, [otwarty, s.gotowe]) // eslint-disable-line react-hooks/exhaustive-deps

  async function planuj() {
    setBlad(null); setEtap('planowanie')
    try {
      setPlan(await zaplanujPrzygotowanie(zapytanie, { analiza: opcje.analiza, rysunki: opcje.rysunki }, setPostep))
      setEtap('plan')
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)); setEtap('opcje') }
  }

  async function wykonaj() {
    if (!plan) return
    setBlad(null); setEtap('trwa')
    try {
      const r = await wykonajPrzygotowanie(zapytanie, plan, { wycena: opcje.wycena, oferta: opcje.oferta && opcje.wycena }, s, widziMarze, setPostep)
      setRaport(r); setEtap('gotowe')
      poZakonczeniu()
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)); setEtap('plan') }
  }

  const opcja = (k: keyof typeof opcje, et: string, opis: string) => (
    <label className="flex items-start gap-2">
      <input type="checkbox" className="mt-1" checked={opcje[k]} disabled={k === 'oferta' && !opcje.wycena} onChange={(e) => setOpcje({ ...opcje, [k]: e.target.checked })} />
      <span><strong>{et}</strong> <span className="text-slate-500">- {opis}</span></span>
    </label>
  )

  return (
    <Dialog open={otwarty} onOpenChange={(o) => { if (!o && etap !== 'trwa' && etap !== 'planowanie') zamknij() }}>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-blekit-ciemny" /> {t('Wycena automatyczna z AI -')}{' '}{zapytanie.numer}</DialogTitle>
        <DialogDescription>{t('Wynik to wersja wstępna do weryfikacji przez pracownika - niczego nie wysyła klientowi.')}</DialogDescription>
        <div className="mt-3 space-y-3 text-sm">
          {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
          {etap === 'opcje' && (
            <>
              <div className="space-y-2">
                {opcja('analiza', t('Analiza zapytania (AI)'), t('karta analizy: wymagania kosztotwórcze, usługi, pytania, niespójności; uzupełnia kartę zapytania'))}
                {opcja('rysunki', t('Listy materiałów z rysunków (AI)'), t('rysunki PDF oznaczone jako istotne, najwyżej 3 strony z pliku i 8 stron razem'))}
                {opcja('wycena', t('Wstępna wycena'), t('aparaty, materiały z list z cenami z bazy ofert i zakupów, robocizna wskaźnikowa, usługi z karty'))}
                {opcja('oferta', t('Projekt oferty'), t('klauzule dobrane do wymagań z karty, terminy i warunki domyślne'))}
              </div>
              <p className="text-xs text-slate-500">{t('Każde uruchomienie tworzy nową wersję wyceny - wcześniejsze zostają bez zmian.')}</p>
              <div className="flex justify-end gap-2">
                <Button onClick={zamknij}>{t('Anuluj')}</Button>
                <Button wariant="akcent" disabled={!Object.values(opcje).some(Boolean)} onClick={() => void planuj()}>{t('Dalej - szacunek kosztu')}</Button>
              </div>
            </>
          )}
          {(etap === 'planowanie' || etap === 'trwa') && <Komunikat rodzaj="info">{postep || t('Przygotowanie...')}</Komunikat>}
          {etap === 'plan' && plan && (
            <>
              {plan.zadania.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5">
                  {plan.zadania.map((zd, i) => <li key={i}>{zd.opis}{zd.koszt_pln !== null && <span className="text-slate-500"> {t('- ok.')}{' '}{liczba(zd.koszt_pln, 2)} {t('zł')}</span>}</li>)}
                </ul>
              )}
              {plan.pominiete.length > 0 && <p className="text-xs text-amber-800">{t('Pominięte:')}{' '}{plan.pominiete.join('; ')}.</p>}
              {plan.uwaga
                ? <Komunikat rodzaj="ostrzezenie">{plan.uwaga}</Komunikat>
                : plan.zadania.length > 0 && <p>{t('Szacowany koszt AI:')}{' '}<strong>{liczba(plan.koszt_pln, 2)} {t('zł')}</strong>.</p>}
              <div className="flex justify-end gap-2">
                <Button onClick={() => setEtap('opcje')}>{t('Wstecz')}</Button>
                <Button wariant="akcent" disabled={!plan.aiDostepne && !opcje.wycena} onClick={() => void wykonaj()}>
                  <Sparkles className="h-4 w-4" /> {plan.aiDostepne && plan.zadania.length ? t('Uruchom') : t('Uruchom bez AI')}
                </Button>
              </div>
            </>
          )}
          {etap === 'gotowe' && raport && (
            <>
              <Komunikat rodzaj="sukces">{t('Gotowe')}{raport.koszt_pln ? t(' (koszt AI {0} zł)', liczba(raport.koszt_pln, 2)) : ''}{t('. Raport zapisał się w karcie analizy.')}</Komunikat>
              <RaportWidok raport={raport} otworzWycene={(id) => { zamknij(); otworzWycene(id) }} otworzZakladke={(z) => { zamknij(); otworzZakladke(z) }} />
            </>
          )}
          {etap === 'trwa' && <p className={cn('text-xs text-slate-500')}>{t('Nie zamykaj okna do końca - kolejne kroki zapisują się na bieżąco.')}</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
