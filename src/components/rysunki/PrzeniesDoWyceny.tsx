import { useEffect, useState } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { pozycjeZListy } from '@/lib/importListy'
import { PROG_PEWNOSCI, listaZRysunku, type PozycjaRysunku } from '@/lib/rysunki'
import { ETYKIETY_STATUSU_WYCENY, nowyAparat, wczytajWycene, zapiszWycene, type StanWyceny, type StatusWyceny } from '@/lib/wyceny'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { t } from '@/i18n'

interface Props {
  otwarty: boolean
  zamknij: () => void
  zapytanieId: string
  pozycje: PozycjaRysunku[]
  opisZrodla: string
  widziMarze: boolean
  otworzWycene: (id: string) => void
}

/** Pozycje wykazu części -> zakładka Materiały wybranego aparatu w wersji roboczej wyceny. */
export function PrzeniesDoWyceny({ otwarty, zamknij, zapytanieId, pozycje, opisZrodla, widziMarze, otworzWycene }: Props) {
  const [wersje, setWersje] = useState<{ id: string; wersja: number; nazwa: string | null; status: StatusWyceny }[]>([])
  const [wycenaId, setWycenaId] = useState('')
  const [stan, setStan] = useState<StanWyceny | null>(null)
  const [aparat, setAparat] = useState('nowy')
  const [nazwaAparatu, setNazwaAparatu] = useState('')
  const [blad, setBlad] = useState<string | null>(null)
  const [gotowe, setGotowe] = useState<string | null>(null)
  const [zajety, setZajety] = useState(false)

  useEffect(() => {
    if (!otwarty) return
    setGotowe(null); setBlad(null)
    void supabase.from('wyceny').select('id, wersja, nazwa, status').eq('zapytanie_id', zapytanieId).in('status', ['robocza', 'zwrocona'])
      .order('wersja', { ascending: false }).then(({ data }) => {
        const l = (data ?? []) as typeof wersje
        setWersje(l)
        setWycenaId(l[0]?.id ?? '')
      })
  }, [otwarty, zapytanieId])

  useEffect(() => {
    setStan(null)
    if (!wycenaId) return
    wczytajWycene(wycenaId).then((s) => {
      setStan(s)
      setAparat(s.aparaty.length ? '0' : 'nowy')
    }).catch((e) => setBlad(e instanceof Error ? e.message : String(e)))
  }, [wycenaId])

  async function nowaWycena() {
    const { data, error } = await supabase.rpc('nowa_wycena', { p_zapytanie: zapytanieId, p_nazwa: null })
    if (error) { setBlad(komunikatPL(error.message)); return }
    const { data: w } = await supabase.from('wyceny').select('id, wersja, nazwa, status').eq('id', data as string).single()
    if (w) { setWersje([w as (typeof wersje)[number], ...wersje]); setWycenaId(w.id) }
  }

  async function przenies() {
    if (!wycenaId) return
    setZajety(true); setBlad(null)
    try {
      // Świeży stan tuż przed zapisem - zapis wyceny i tak sprawdza, czy nikt jej nie zmienił w międzyczasie.
      const s = await wczytajWycene(wycenaId)
      let a = aparat === 'nowy' ? null : s.aparaty[Number(aparat)]
      if (!a) {
        a = nowyAparat(s.aparaty.length + 1, nazwaAparatu.trim() || `Aparat ${s.aparaty.length + 1}`)
        s.aparaty.push(a)
      }
      const nowe = pozycjeZListy(listaZRysunku(pozycje), opisZrodla)
      a.pozycje = [...a.pozycje, ...nowe]
      await zapiszWycene(s, widziMarze)
      setGotowe(t('Dodano {0} pozycji do zakładki Materiały ({1}). Ceny uzupełnij przyciskiem „Znajdź cenę”.', nowe.length, a.nazwa))
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setZajety(false)
  }

  const niepewne = pozycje.filter((p) => p.pewnosc < PROG_PEWNOSCI).length
  return (
    <Dialog open={otwarty} onOpenChange={(o) => !o && zamknij()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{t('Przenieś wykaz części do wyceny')}</DialogTitle>
        <DialogDescription>
          {pozycje.length} {t('pozycji trafi do zakładki Materiały wybranego aparatu (kategorie, wymiary i gatunki z siatki, cena do uzupełnienia).')}
          {niepewne > 0 && t(' {0} niepewnych odczytów dostanie w uwagach dopisek „(?)” - sprawdź je w wycenie.', niepewne)}
        </DialogDescription>
        <div className="mt-3 space-y-3">
          {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
          {gotowe ? (
            <>
              <Komunikat rodzaj="sukces">{gotowe}</Komunikat>
              <div className="flex justify-end gap-2">
                <Button onClick={zamknij}>{t('Zamknij')}</Button>
                <Button wariant="glowny" onClick={() => otworzWycene(wycenaId)}>{t('Otwórz wycenę')}{' '}<ArrowRight className="h-4 w-4" /></Button>
              </div>
            </>
          ) : (
            <>
              <label className="block"><span className="etykieta">{t('Wersja wyceny (robocza albo zwrócona)')}</span>
                <div className="flex gap-2">
                  <select className="pole" value={wycenaId} onChange={(e) => setWycenaId(e.target.value)}>
                    {wersje.length === 0 && <option value="">{t('brak wersji roboczej')}</option>}
                    {wersje.map((w) => <option key={w.id} value={w.id}>v{w.wersja}{w.nazwa ? ` - ${w.nazwa}` : ''} ({ETYKIETY_STATUSU_WYCENY[w.status]})</option>)}
                  </select>
                  <Button rozmiar="maly" title={t('Nowa wersja wyceny')} onClick={() => void nowaWycena()}><Plus className="h-3 w-3" /> nowa</Button>
                </div>
              </label>
              {stan && (
                <label className="block"><span className="etykieta">{t('Aparat')}</span>
                  <select className="pole" value={aparat} onChange={(e) => setAparat(e.target.value)}>
                    {stan.aparaty.map((a, i) => <option key={a.klucz} value={String(i)}>{a.nazwa} ({a.pozycje.filter((p) => p.zakladka === 'materialy').length} {t('poz. materiałów)')}</option>)}
                    <option value="nowy">{t('+ nowy aparat')}</option>
                  </select>
                </label>
              )}
              {stan && aparat === 'nowy' && (
                <label className="block"><span className="etykieta">{t('Nazwa nowego aparatu')}</span>
                  <input className="pole" value={nazwaAparatu} placeholder={t('Aparat {0}', stan.aparaty.length + 1)} onChange={(e) => setNazwaAparatu(e.target.value)} />
                </label>
              )}
              <div className="flex justify-end gap-2">
                <Button onClick={zamknij}>{t('Anuluj')}</Button>
                <Button wariant="glowny" disabled={!stan || zajety || !pozycje.length} onClick={() => void przenies()}>
                  {zajety ? t('Zapisywanie...') : t('Przenieś {0} pozycji', pozycje.length)}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
