import { useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { parametryKategorii, type ProsbaOOferte } from '@/lib/prosby'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { t } from '@/i18n'

export interface NowaProsba {
  zapytanie_id: string
  wycena_id: string | null
  zakladka: ProsbaOOferte['zakladka']
  kategoria_uslugi: string | null
  opis: string
  /** Wartości startowe parametrów (np. ilość i jm z pozycji wyceny). */
  parametry?: Record<string, string>
}

/**
 * „Poproś dział handlowy o ofertę”: kategoria usługi, opis, parametry zależne od kategorii (powierzchnia, system powłokowy,
 * masa, trasa, gabaryt...), termin potrzebnej oferty. Prośba trafia do kolejki działu handlowego (licznik w menu).
 */
export function ProsbaDialog({ nowa, zamknij, utworzona }: { nowa: NowaProsba | null; zamknij: () => void; utworzona: (p: ProsbaOOferte) => void }) {
  const s = useSlowniki()
  const [kategoria, setKategoria] = useState<string>('')
  const [opis, setOpis] = useState('')
  const [parametry, setParametry] = useState<Record<string, string>>({})
  const [termin, setTermin] = useState('')
  const [uwagi, setUwagi] = useState('')
  const [blad, setBlad] = useState<string | null>(null)
  const [zajety, setZajety] = useState(false)

  useEffect(() => {
    if (!nowa) return
    setKategoria(nowa.kategoria_uslugi ?? ''); setOpis(nowa.opis); setParametry(nowa.parametry ?? {}); setTermin(''); setUwagi(''); setBlad(null)
  }, [nowa])

  async function wyslij() {
    if (!nowa) return
    setZajety(true); setBlad(null)
    const kat = s.kategorieUslug.find((k) => k.kod === kategoria)
    const { data, error } = await supabase.from('prosby_o_oferte').insert({
      zapytanie_id: nowa.zapytanie_id, wycena_id: nowa.wycena_id, zakladka: (kat?.zakladka as ProsbaOOferte['zakladka'] | undefined) ?? nowa.zakladka,
      kategoria_uslugi: kategoria || null, opis: opis.trim(), parametry: Object.fromEntries(Object.entries(parametry).filter(([, v]) => v.trim())),
      termin: termin || null, uwagi: uwagi.trim() || null,
    }).select('*').single()
    setZajety(false)
    if (error) { setBlad(komunikatPL(error.message)); return }
    utworzona(data as ProsbaOOferte)
  }

  return (
    <Dialog open={!!nowa} onOpenChange={(o) => !o && !zajety && zamknij()}>
      <DialogContent className="max-w-xl">
        <DialogTitle>{t('Poproś dział handlowy o ofertę')}</DialogTitle>
        <DialogDescription>{t('Prośba trafi do kolejki działu handlowego. Oferty dodane do prośby zobaczysz przy pozycji wyceny (porównanie i „Użyj w wycenie”).')}</DialogDescription>
        <div className="mt-3 space-y-3 text-sm">
          {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
          <div className="grid gap-2 md:grid-cols-2">
            <label><span className="etykieta">{t('Rodzaj usługi')}</span>
              <select className="pole" value={kategoria} onChange={(e) => setKategoria(e.target.value)}>
                <option value="">-</option>{s.kategorieUslug.map((k) => <option key={k.kod} value={k.kod}>{k.nazwa}</option>)}
              </select></label>
            <label><span className="etykieta">{t('Oferta potrzebna do')}</span><input type="date" className="pole" value={termin} onChange={(e) => setTermin(e.target.value)} /></label>
            <label className="md:col-span-2"><span className="etykieta">{t('Opis (element, zakres robót)')}</span><input className="pole" value={opis} onChange={(e) => setOpis(e.target.value)} /></label>
            {parametryKategorii(kategoria || null).map(([k, et]) => (
              <label key={k}><span className="etykieta">{et}</span>
                <input className="pole" value={parametry[k] ?? ''} onChange={(e) => setParametry({ ...parametry, [k]: e.target.value })} /></label>
            ))}
            <label className="md:col-span-2"><span className="etykieta">{t('Uwagi dla działu handlowego (dokumenty, rysunki, wymagania)')}</span>
              <textarea className="pole h-16" value={uwagi} onChange={(e) => setUwagi(e.target.value)} /></label>
          </div>
          <div className="flex justify-end gap-2">
            <Button onClick={zamknij} disabled={zajety}>{t('Anuluj')}</Button>
            <Button wariant="glowny" disabled={zajety || !opis.trim()} onClick={() => void wyslij()}><Send className="h-4 w-4" /> {t('Wyślij prośbę')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
