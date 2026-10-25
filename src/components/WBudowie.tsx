import { Construction } from 'lucide-react'
import { t } from '@/i18n'

/** Miejsce na moduł z kolejnego etapu - żeby menu od początku pokazywało docelowy układ. */
export function WBudowie({ tytul, etap, opis }: { tytul: string; etap: number; opis: string }) {
  return (
    <div className="sekcja mx-auto max-w-2xl text-center">
      <Construction className="mx-auto h-8 w-8 text-slate-400" />
      <h2 className="mt-3 text-lg font-semibold">{tytul}</h2>
      <p className="mt-1 text-sm text-slate-500">{t('Moduł powstaje w etapie')}{' '}{etap}.</p>
      <p className="mt-3 text-sm text-slate-700">{opis}</p>
    </div>
  )
}
