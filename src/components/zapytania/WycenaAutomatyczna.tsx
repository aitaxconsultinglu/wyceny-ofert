import { FileSpreadsheet, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { t } from '@/i18n'

/**
 * „Wycena automatyczna” - jeden przycisk w karcie zapytania i wybór sposobu: bez AI (wycena materiałowa z odczytów rysunków
 * i cennika, bez kosztów) albo pełne przygotowanie z AI (analiza, listy z rysunków, wstępna wycena, projekt oferty - z szacunkiem
 * kosztu). Oba kończą się raportem listy pozycji do sprawdzenia; rodzaj aparatu bierze się z zapytania.
 */
export function WycenaAutomatyczna({ otwarty, zamknij, wybierz }: { otwarty: boolean; zamknij: () => void; wybierz: (sposob: 'bez_ai' | 'z_ai') => void }) {
  const karta = (sposob: 'bez_ai' | 'z_ai', ikona: JSX.Element, tytul: string, opis: string) => (
    <button className="flex w-full items-start gap-3 rounded-lg border border-slate-200 p-3 text-left hover:border-blekit hover:bg-blekit-jasny/40"
      onClick={() => { zamknij(); wybierz(sposob) }}>
      {ikona}
      <span><strong className="block text-sm">{tytul}</strong><span className="text-xs text-slate-600">{opis}</span></span>
    </button>
  )
  return (
    <Dialog open={otwarty} onOpenChange={(o) => !o && zamknij()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{t('Wycena automatyczna')}</DialogTitle>
        <DialogDescription>{t('Każde uruchomienie tworzy nową wersję wyceny do sprawdzenia - wcześniejsze wersje zostają bez zmian.')}</DialogDescription>
        <div className="mt-3 space-y-2">
          {karta('bez_ai', <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-limonka-ciemna" />, t('Bez AI - wycena materiałowa'),
            t('Lista materiałów i parametry z odczytów rysunków (CAD z warstwy tekstowej), ceny z historycznego cennika materiałów i ofert do tego zapytania. Bez kosztów.'))}
          {karta('z_ai', <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-blekit-ciemny" />, t('Z AI - pełne przygotowanie'),
            t('Analiza zapytania, listy materiałów z rysunków, wstępna wycena i projekt oferty. Najpierw szacunek kosztu i potwierdzenie.'))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
