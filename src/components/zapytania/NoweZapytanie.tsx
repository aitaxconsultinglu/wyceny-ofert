import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { PoleRodzajuAparatu, type WyborRodzaju } from './RodzajAparatu'
import { t } from '@/i18n'

/** Nowe zapytanie: rodzaj aparatu (obowiązkowo) i przedmiot; numer ZO nadaje baza. Klienta i osobę prowadzącą wpisuje się na karcie zapytania. */
export function NoweZapytanie({ otwarty, zamknij, utworzone }: { otwarty: boolean; zamknij: () => void; utworzone: (id: string) => void }) {
  const [rodzaj, setRodzaj] = useState<WyborRodzaju>({ rodzaj: null, zakres: null, opis: '' })
  const [przedmiot, setPrzedmiot] = useState('')
  const [blad, setBlad] = useState<string | null>(null)
  const [zajety, setZajety] = useState(false)

  useEffect(() => {
    if (!otwarty) return
    setRodzaj({ rodzaj: null, zakres: null, opis: '' }); setPrzedmiot(''); setBlad(null)
  }, [otwarty])

  async function utworz() {
    if (!rodzaj.rodzaj) { setBlad(t('Wybierz rodzaj aparatu: zbiornik albo wymiennik ciepła.')); return }
    setZajety(true); setBlad(null)
    const { data, error } = await supabase.from('zapytania').insert({
      numer: '', status: 'nowe', przedmiot: przedmiot.trim() || (rodzaj.rodzaj === 'zbiornik' ? 'Zbiornik' : 'Wymiennik ciepła'),
      rodzaj_aparatu: rodzaj.rodzaj,
      zakres_wymiennika: rodzaj.rodzaj === 'wymiennik' ? rodzaj.zakres ?? 'kompletny' : null,
      zakres_opis: rodzaj.rodzaj === 'wymiennik' && rodzaj.zakres === 'czesc' ? rodzaj.opis.trim() || null : null,
    }).select('id').single()
    setZajety(false)
    if (error) { setBlad(komunikatPL(error.message)); return }
    zamknij()
    utworzone(data.id as string)
  }

  return (
    <Dialog open={otwarty} onOpenChange={(o) => !o && zamknij()}>
      <DialogContent className="max-w-xl">
        <DialogTitle>{t('Nowe zapytanie ofertowe')}</DialogTitle>
        <DialogDescription>{t('Rodzaj aparatu decyduje o szablonie elementów, kategoriach tabel rysunków i wymaganiach. Można go później zmienić w karcie zapytania.')}</DialogDescription>
        <div className="mt-3 space-y-3 text-sm">
          {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
          <div><span className="etykieta">{t('Rodzaj aparatu *')}</span><PoleRodzajuAparatu wartosc={rodzaj} zmien={setRodzaj} /></div>
          <label className="block"><span className="etykieta">{t('Przedmiot zapytania')}</span>
            <input className="pole" value={przedmiot} onChange={(e) => setPrzedmiot(e.target.value)} placeholder={t('np. Zbiornik buforowy wody procesowej')} /></label>
          <div className="flex justify-end gap-2">
            <Button onClick={zamknij}>{t('Anuluj')}</Button>
            <Button wariant="glowny" disabled={zajety || !rodzaj.rodzaj} onClick={() => void utworz()}><Plus className="h-4 w-4" /> {t('Utwórz zapytanie')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
