import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { PoleRodzajuAparatu, type WyborRodzaju } from './RodzajAparatu'

/** Nowe zapytanie: najpierw (obowiązkowo) rodzaj aparatu, potem przedmiot i klient; numer ZO nadaje baza. */
export function NoweZapytanie({ otwarty, zamknij, utworzone }: { otwarty: boolean; zamknij: () => void; utworzone: (id: string) => void }) {
  const [rodzaj, setRodzaj] = useState<WyborRodzaju>({ rodzaj: null, zakres: null, opis: '' })
  const [przedmiot, setPrzedmiot] = useState('')
  const [klient, setKlient] = useState('')
  const [klienci, setKlienci] = useState<{ id: string; nazwa: string }[]>([])
  const [blad, setBlad] = useState<string | null>(null)
  const [zajety, setZajety] = useState(false)

  useEffect(() => {
    if (!otwarty) return
    setRodzaj({ rodzaj: null, zakres: null, opis: '' }); setPrzedmiot(''); setKlient(''); setBlad(null)
    void supabase.from('klienci').select('id, nazwa').order('nazwa').then(({ data }) => setKlienci(data ?? []))
  }, [otwarty])

  async function utworz() {
    if (!rodzaj.rodzaj) { setBlad('Wybierz rodzaj aparatu: zbiornik albo wymiennik ciepła.'); return }
    setZajety(true); setBlad(null)
    const { data, error } = await supabase.from('zapytania').insert({
      numer: '', status: 'nowe', przedmiot: przedmiot.trim() || (rodzaj.rodzaj === 'zbiornik' ? 'Zbiornik' : 'Wymiennik ciepła'),
      klient_id: klient || null, rodzaj_aparatu: rodzaj.rodzaj,
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
        <DialogTitle>Nowe zapytanie ofertowe</DialogTitle>
        <DialogDescription>Rodzaj aparatu decyduje o szablonie elementów, kategoriach tabel rysunków i wymaganiach. Można go później zmienić w karcie zapytania.</DialogDescription>
        <div className="mt-3 space-y-3 text-sm">
          {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
          <div><span className="etykieta">Rodzaj aparatu *</span><PoleRodzajuAparatu wartosc={rodzaj} zmien={setRodzaj} /></div>
          <label className="block"><span className="etykieta">Przedmiot zapytania</span>
            <input className="pole" value={przedmiot} onChange={(e) => setPrzedmiot(e.target.value)} placeholder="np. Zbiornik buforowy wody procesowej" /></label>
          <label className="block"><span className="etykieta">Klient</span>
            <select className="pole" value={klient} onChange={(e) => setKlient(e.target.value)}>
              <option value="">-</option>{klienci.map((k) => <option key={k.id} value={k.id}>{k.nazwa}</option>)}
            </select></label>
          <div className="flex justify-end gap-2">
            <Button onClick={zamknij}>Anuluj</Button>
            <Button wariant="glowny" disabled={zajety || !rodzaj.rodzaj} onClick={() => void utworz()}><Plus className="h-4 w-4" /> Utwórz zapytanie</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
