import { Search } from 'lucide-react'
import { dataPL } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PozycjaWyceny } from '@/lib/wyceny'
import { t } from '@/i18n'

/** Źródło ceny w wierszu wyceny + przycisk "Znajdź cenę". Kolor: stara cena / oferta po terminie. */
export function ZrodloCeny({ p, wiekMies, onZnajdz, tylkoOdczyt }: { p: PozycjaWyceny; wiekMies: number; onZnajdz: () => void; tylkoOdczyt: boolean }) {
  const dzis = new Date().toISOString().slice(0, 10)
  const mies = p.zrodlo_data ? (new Date(dzis).getTime() - new Date(p.zrodlo_data).getTime()) / 86400000 / 30.44 : 0
  const stara = !!p.zrodlo_data && mies >= wiekMies
  const po = p.zrodlo_ceny === 'oferta' && !!p.zrodlo_waznosc_do && p.zrodlo_waznosc_do < dzis
  return (
    <div className="flex items-center gap-1">
      <span className={cn('max-w-[9rem] truncate text-xs', po ? 'text-red-700' : stara ? 'text-amber-700' : 'text-slate-500')}
        title={p.zrodlo_ceny !== 'recznie' ? `${p.zrodlo_ceny}: ${p.zrodlo_dostawca ?? ''} ${p.zrodlo_data ? dataPL(p.zrodlo_data) : ''}\n${p.zrodlo_opis ?? ''}${p.zrodlo_waznosc_do ? `\nważna do ${dataPL(p.zrodlo_waznosc_do)}` : ''}` : t('cena wpisana ręcznie')}>
        {p.zrodlo_ceny === 'recznie' ? t('ręcznie') : `${p.zrodlo_ceny === 'oferta' ? 'of.' : 'zak.'} ${p.zrodlo_dostawca ?? ''} ${p.zrodlo_data ? dataPL(p.zrodlo_data) : ''}`}
      </span>
      {!tylkoOdczyt && (
        <button className="rounded p-0.5 text-blekit-ciemny hover:bg-blekit-jasny" title={t('Znajdź cenę w bazie ofert i zakupów')} onClick={onZnajdz}>
          <Search className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
