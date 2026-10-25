import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useSlowniki } from '@/lib/slowniki'
import { komunikatPL } from '@/lib/config'
import { liczba, rozmiar } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Komunikat } from '../ui/komunikat'
import { t } from '@/i18n'

interface Zajetosc { baza_bajty: number; storage_bajty: number; storage_plikow: number }

function Pasek({ etykieta, bajty, limitMb, progProc, dopisek }: { etykieta: string; bajty: number; limitMb: number; progProc: number; dopisek?: string }) {
  const proc = limitMb > 0 ? (bajty / (limitMb * 1024 * 1024)) * 100 : 0
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-medium">{etykieta}</span>
        <span className={cn('tabular-nums', proc >= progProc && 'font-semibold text-red-700')}>
          {rozmiar(bajty)} z {limitMb >= 1024 ? `${liczba(limitMb / 1024, 1)} GB` : `${limitMb} MB`} ({liczba(proc, 1)}%)
        </span>
      </div>
      <div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={cn('h-full rounded-full', proc >= progProc ? 'bg-red-500' : proc >= progProc * 0.75 ? 'bg-amber-400' : 'bg-limonka')}
          style={{ width: `${Math.min(100, proc)}%` }} />
      </div>
      {dopisek && <p className="mt-1 text-xs text-slate-500">{dopisek}</p>}
    </div>
  )
}

/** Zajętość bazy i Storage względem limitów planu Free (ostrzeżenie od 80%). */
export function Zasoby() {
  const { ustawienia } = useSlowniki()
  const limity = ustawienia.limity_planu
  const [dane, setDane] = useState<Zajetosc | null>(null)
  const [blad, setBlad] = useState<string | null>(null)

  useEffect(() => {
    void supabase.rpc('zajetosc_zasobow').then(({ data, error }) => {
      if (error) setBlad(komunikatPL(error.message))
      else setDane((data as Zajetosc[] | null)?.[0] ?? null)
    })
  }, [])

  const przekroczone = dane && (
    dane.baza_bajty >= limity.baza_mb * 1024 * 1024 * (limity.ostrzezenie_proc / 100) ||
    dane.storage_bajty >= limity.storage_mb * 1024 * 1024 * (limity.ostrzezenie_proc / 100))

  return (
    <div className="space-y-4">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {przekroczone && (
        <Komunikat rodzaj="ostrzezenie">
          {t('Zajętość przekroczyła')}{' '}{limity.ostrzezenie_proc}{t('% limitu planu. Zarchiwizuj dokumenty zakończonych zapytań (ZIP z oryginałami, w aplikacji zostają teksty i wyniki analiz) albo przejdź na plan Pro.')}
        </Komunikat>
      )}
      <section className="sekcja max-w-2xl space-y-5">
        {dane ? (
          <>
            <Pasek etykieta={t('Baza danych')} bajty={dane.baza_bajty} limitMb={limity.baza_mb} progProc={limity.ostrzezenie_proc}
              dopisek="Wliczają się tabele, indeksy i pliki systemowe Supabase (pusta baza zajmuje kilkadziesiąt MB)." />
            <Pasek etykieta={t('Pliki (Storage)')} bajty={dane.storage_bajty} limitMb={limity.storage_mb} progProc={limity.ostrzezenie_proc}
              dopisek={t('{0} plików. Limit jednego pliku: {1} MB.', dane.storage_plikow, limity.plik_mb)} />
          </>
        ) : !blad && <p className="text-sm text-slate-500">{t('Wczytywanie...')}</p>}
      </section>
      <p className="text-xs text-slate-500">
        {t('Limity planu zmienisz w tabeli ustawień (klucz')}{' '}<code>limity_planu</code>{t(') po przejściu na plan Pro. Plan Free usypia projekt po tygodniu bez aktywności - wystarczy wtedy wznowić go w panelu Supabase.')}
      </p>
    </div>
  )
}
