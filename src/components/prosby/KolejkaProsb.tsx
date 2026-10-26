import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Mail, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { dataGodzinaPL, dataPL } from '@/lib/format'
import { cn } from '@/lib/utils'
import { adresWidoku } from '@/lib/adres'
import { ETYKIETY_STATUSU_PROSBY, parametryKategorii, type ProsbaOOferte, type StatusProsby } from '@/lib/prosby'
import { uprawnienia, type Profil } from '@/lib/types'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'
import { DodajOferte } from '../oferty/DodajOferte'
import { t } from '@/i18n'

type Wiersz = ProsbaOOferte & { zapytania: { numer: string; przedmiot: string } | null; ofert: number }

/**
 * Kolejka próśb o oferty dla działu handlowego (moduł 1): przyjęcie, przypisanie, status, dodanie maila z ofertą,
 * zamknięcie. Zapytania do kooperantów - generator w karcie zapytania (mailto), bez wysyłania maili z serwera.
 */
export function KolejkaProsb({ profil, poZmianie }: { profil: Profil; poZmianie?: () => void }) {
  const s = useSlowniki()
  const up = uprawnienia(profil)
  const handlowy = up.bazaOfert
  const [prosby, setProsby] = useState<Wiersz[]>([])
  const [ludzie, setLudzie] = useState<{ id: string; nazwa: string | null; email: string }[]>([])
  const [tylkoOtwarte, setTylkoOtwarte] = useState(true)
  const [oferta, setOferta] = useState<Wiersz | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const wczytaj = useCallback(async () => {
    let q = supabase.from('prosby_o_oferte').select('*, zapytania(numer, przedmiot), oferty_dostawcow!oferty_dostawcow_prosba_id_fkey(id)').order('utworzono', { ascending: false }).limit(500)
    if (tylkoOtwarte) q = q.in('status', ['nowa', 'przyjeta', 'wyslana', 'oferta_otrzymana'])
    const [{ data, error }, { data: p }] = await Promise.all([q, supabase.rpc('lista_pracownikow')])
    if (error) { setBlad(komunikatPL(error.message)); return }
    setProsby(((data ?? []) as (ProsbaOOferte & { zapytania: Wiersz['zapytania']; oferty_dostawcow: { id: string }[] })[])
      .map(({ oferty_dostawcow: o, ...x }) => ({ ...x, ofert: o?.length ?? 0 })))
    setLudzie((p ?? []) as typeof ludzie)
  }, [tylkoOtwarte])
  useEffect(() => { void wczytaj() }, [wczytaj])

  async function zmien(p: Wiersz, zm: Partial<ProsbaOOferte>) {
    setBlad(null)
    const { error } = await supabase.from('prosby_o_oferte').update(zm).eq('id', p.id)
    if (error) { setBlad(komunikatPL(error.message)); return }
    await wczytaj(); poZmianie?.()
  }

  const kto = (id: string | null) => ludzie.find((l) => l.id === id)?.nazwa ?? ludzie.find((l) => l.id === id)?.email ?? ''
  const kategoria = (kod: string | null) => s.kategorieUslug.find((k) => k.kod === kod)?.nazwa ?? kod ?? ''
  const opisParametrow = (p: Wiersz) => parametryKategorii(p.kategoria_uslugi).filter(([k]) => p.parametry?.[k]).map(([k, et]) => `${et}: ${p.parametry[k]}`).join('; ')

  const kolumny: KolumnaTabeli<Wiersz>[] = [
    {
      id: 'zapytanie', naglowek: t('Zapytanie'), typ: 'lista', wartosc: (p) => p.zapytania?.numer ?? '', className: 'whitespace-nowrap text-sm',
      komorka: (p) => <a className="text-blekit-ciemny underline" href={adresWidoku('zapytania', p.zapytanie_id, 'wyceny')} title={p.zapytania?.przedmiot}>{p.zapytania?.numer}</a>,
    },
    { id: 'kategoria', naglowek: t('Usługa'), typ: 'lista', wartosc: (p) => kategoria(p.kategoria_uslugi), className: 'text-sm' },
    { id: 'opis', naglowek: t('Opis'), typ: 'tekst', wartosc: (p) => p.opis, className: 'max-w-[18rem] text-sm', komorka: (p) => <span title={p.uwagi ?? undefined}>{p.opis}</span> },
    { id: 'parametry', naglowek: t('Parametry'), typ: 'tekst', wartosc: opisParametrow, className: 'max-w-[18rem] text-xs text-slate-600' },
    {
      id: 'status', naglowek: t('Status'), typ: 'lista', wartosc: (p) => ETYKIETY_STATUSU_PROSBY[p.status], className: 'text-sm',
      komorka: (p) => (handlowy
        ? <select className="pole-komorki text-xs" value={p.status} onChange={(e) => void zmien(p, { status: e.target.value as StatusProsby })}>
            {Object.entries(ETYKIETY_STATUSU_PROSBY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        : <span className={cn('znacznik', p.status === 'nowa' ? 'bg-amber-50 text-amber-800 ring-amber-300' : 'bg-slate-50 text-slate-700 ring-slate-200')}>{ETYKIETY_STATUSU_PROSBY[p.status]}</span>),
    },
    {
      id: 'odpowiedzialny', naglowek: t('Odpowiedzialny'), typ: 'lista', wartosc: (p) => kto(p.odpowiedzialny), className: 'text-xs',
      komorka: (p) => (handlowy
        ? <select className="pole-komorki text-xs" value={p.odpowiedzialny ?? ''} onChange={(e) => void zmien(p, { odpowiedzialny: e.target.value || null })}>
            <option value="">-</option>{ludzie.map((l) => <option key={l.id} value={l.id}>{l.nazwa ?? l.email}</option>)}
          </select>
        : kto(p.odpowiedzialny)),
    },
    { id: 'termin', naglowek: t('Oferta do'), typ: 'data', wartosc: (p) => p.termin, komorka: (p) => dataPL(p.termin), className: 'whitespace-nowrap text-xs' },
    { id: 'zlecajacy', naglowek: t('Zlecający'), typ: 'lista', wartosc: (p) => kto(p.zlecajacy), className: 'text-xs' },
    { id: 'ofert', naglowek: t('Oferty'), typ: 'liczba', wartosc: (p) => p.ofert, className: 'text-center text-sm' },
    { id: 'utworzono', naglowek: t('Zgłoszono'), typ: 'data', wartosc: (p) => p.utworzono, komorka: (p) => dataGodzinaPL(p.utworzono), className: 'whitespace-nowrap text-xs text-slate-500' },
    {
      id: 'akcje', naglowek: '', typ: 'tekst', wartosc: () => '', bezFiltra: true, bezSortu: true,
      komorka: (p) => (
        <span className="inline-flex flex-wrap gap-1">
          {handlowy && p.status === 'nowa' && <Button rozmiar="maly" onClick={() => void zmien(p, { status: 'przyjeta', odpowiedzialny: p.odpowiedzialny ?? profil.id })}><CheckCircle2 className="h-3 w-3" /> {t('Przyjmij')}</Button>}
          {handlowy && <Button rozmiar="maly" wariant="akcent" onClick={() => setOferta(p)}><Mail className="h-3 w-3" /> {t('Dodaj mail z ofertą')}</Button>}
          {handlowy && <a className="inline-flex items-center rounded-md border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50" href={adresWidoku('zapytania', p.zapytanie_id, 'dostawcy')}>{t('Zapytania do kooperantów')}</a>}
          {(handlowy || p.zlecajacy === profil.id) && !['zamknieta', 'anulowana'].includes(p.status) && (
            <button className="text-slate-400 hover:text-red-600" title={t('Zamknij prośbę')} onClick={() => void zmien(p, { status: p.ofert ? 'zamknieta' : 'anulowana' })}><XCircle className="h-4 w-4" /></button>
          )}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">{t('Prośby o oferty (kooperacja, badania, transport)')}</h2>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={tylkoOtwarte} onChange={(e) => setTylkoOtwarte(e.target.checked)} /> {t('tylko otwarte')}</label>
      </div>
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {info && <Komunikat rodzaj="sukces">{info}</Komunikat>}
      <p className="text-xs text-slate-500">{t('Technolog zgłasza prośbę przy pozycji wyceny (zakładki Kooperacja i Badania). Dział handlowy przyjmuje ją, zbiera oferty (zapytania do kooperantów w karcie zapytania), dodaje mail z ofertą i zamyka. Wybór oferty - w wycenie.')}</p>
      <Tabela id="kolejka-prosb" kolumny={kolumny} wiersze={prosby} klucz={(p) => p.id} pusto={t('Brak próśb o oferty.')} />

      <Dialog open={!!oferta} onOpenChange={(o) => !o && setOferta(null)}>
        <DialogContent className="max-w-6xl">
          <DialogTitle>{t('Mail z ofertą do prośby')}: {oferta?.zapytania?.numer} - {oferta?.opis}</DialogTitle>
          <DialogDescription>{t('Najpierw odczyt bez AI (kwoty, waluta, termin, ważność); AI tylko gdy trzeba - z szacunkiem kosztu.')}</DialogDescription>
          {oferta && (
            <div className="mt-3 max-h-[75vh] overflow-auto">
              <DodajOferte kontekst={{ zapytanie_id: oferta.zapytanie_id, nr_zo: oferta.zapytania?.numer ?? '', prosba_id: oferta.id, kategoria_uslugi: oferta.kategoria_uslugi, opis: oferta.opis }}
                gotowe={() => { setOferta(null); setInfo(t('Oferta zapisana i powiązana z prośbą.')); void wczytaj(); poZmianie?.() }} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
