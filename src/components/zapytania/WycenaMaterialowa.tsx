import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { useSlowniki } from '@/lib/slowniki'
import { liczba } from '@/lib/format'
import { dokumentyZapytania } from '@/lib/analizaZapytania'
import { przygotujWyceneMaterialowa, type RaportWycenyMaterialowej } from '@/lib/wycenaMaterialowa'
import { szablonDlaTypu } from '@/lib/szablony'
import { etykietaRodzaju, typAparatuZRodzaju, type RodzajAparatu, type ZakresWymiennika } from '@/lib/zapytania'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { jestRysunkiem } from '@/lib/klasyfikacjaDokumentow'
import { t } from '@/i18n'

/** Etap 1: wycena materiałowa z rysunków zapytania (bez AI), wg szablonu wymiennika / zbiornika. */
export function WycenaMaterialowa({ otwarty, zamknij, zapytanie, otworzWycene, poZakonczeniu }: {
  otwarty: boolean
  zamknij: () => void
  zapytanie: { id: string; numer: string; przedmiot: string; status: string; rodzaj_aparatu: RodzajAparatu | null; zakres_wymiennika: ZakresWymiennika | null; zakres_opis: string | null }
  otworzWycene: (id: string) => void
  poZakonczeniu: () => void
}) {
  const s = useSlowniki()
  // Rodzaj aparatu (a z nim szablon) wynika z zapytania - tu nie ma wyboru.
  const typ = typAparatuZRodzaju(zapytanie.rodzaj_aparatu, zapytanie.zakres_wymiennika) ?? ''
  const [rysunki, setRysunki] = useState<string[]>([])
  const [postep, setPostep] = useState<string | null>(null)
  const [raport, setRaport] = useState<RaportWycenyMaterialowej | null>(null)
  const [blad, setBlad] = useState<string | null>(null)

  useEffect(() => {
    if (!otwarty) return
    setRaport(null); setBlad(null)
    void dokumentyZapytania(zapytanie.id).then((d) => setRysunki(d.filter((x) => jestRysunkiem(x.typ) && /\.pdf$/i.test(x.nazwa_pliku)).map((x) => x.nazwa_pliku)))
  }, [otwarty, zapytanie.id])

  async function uruchom() {
    setBlad(null); setRaport(null)
    try {
      const r = await przygotujWyceneMaterialowa(zapytanie, typ, s.gatunki, setPostep)
      setRaport(r)
      poZakonczeniu()
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setPostep(null)
  }

  const szablon = szablonDlaTypu(typ)
  return (
    <Dialog open={otwarty} onOpenChange={(o) => { if (!o && !postep) zamknij() }}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>{t('Wycena automatyczna bez AI -')}{' '}{zapytanie.numer}</DialogTitle>
        <DialogDescription>
          {t('Lista materiałów i parametry projektu z rysunków zapytania, ceny z kart dostawy Optimy i ofert na materiały zebranych do tego zapytania. Bez kosztów AI: rysunki z CAD są czytane z warstwy tekstowej, skany - z odczytów zapisanych w zakładce Rysunki i listy materiałowe.')}
        </DialogDescription>
        <div className="mt-3 space-y-3 text-sm">
          {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
          {postep && <Komunikat rodzaj="info">{postep}</Komunikat>}
          {!raport && (
            <>
              <p><span className="etykieta">{t('Rodzaj aparatu (z zapytania)')}</span>{etykietaRodzaju(zapytanie.rodzaj_aparatu, zapytanie.zakres_wymiennika, zapytanie.zakres_opis)}</p>
              {szablon && <div>
                <span className="etykieta">{t('Elementy szablonu „')}{szablon.nazwa}{t('” (wymagane pogrubione - zawsze w wycenie)')}</span>
                <p className="text-xs text-slate-600">{szablon.elementy.map((e, i) => <span key={e.kod}>{i > 0 && ' · '}{e.wymagany ? <strong>{e.nazwa}</strong> : e.nazwa}</span>)}</p>
              </div>}
              <div>
                <span className="etykieta">{t('Rysunki PDF zapytania (')}{rysunki.length})</span>
                {rysunki.length ? <ul className="list-disc pl-5 text-xs">{rysunki.map((r) => <li key={r}>{r}</li>)}</ul>
                  : <p className="text-xs text-amber-700">{t('Brak rysunków PDF - dodaj je w zakładce Dokumenty (typ „rysunek”).')}</p>}
              </div>
              <div className="flex justify-end gap-2">
                <Button onClick={zamknij} disabled={!!postep}>{t('Anuluj')}</Button>
                <Button wariant="glowny" disabled={!!postep || !rysunki.length || !szablon} onClick={() => void uruchom()}><Sparkles className="h-4 w-4" /> {t('Przygotuj wycenę materiałową')}</Button>
              </div>
            </>
          )}
          {raport && (
            <>
              <Komunikat rodzaj="sukces">{t('Wycena v')}{raport.wersja} {t('„Wycena materiałowa”:')}{' '}{raport.pozycji} {t('pozycji materiałów.')}</Komunikat>
              <ul className="list-disc space-y-1 pl-5">
                <li>{t('Rysunki z CAD odczytane z tekstu:')}{' '}{raport.stron_tekst} {t('str.; parametrów projektu')}{' '}{raport.parametrow}{t(', króćców')}{' '}{raport.krocow}.</li>
                {raport.skany_bez_odczytu.length > 0 && <li className="text-amber-800">{t('Skany bez odczytu (')}{raport.skany_bez_odczytu.join('; ')}{t(') - odczytaj wykaz części w zakładce Rysunki i listy materiałowe (AI z potwierdzeniem kosztu), potem uruchom wycenę automatyczną jeszcze raz.')}</li>}
                <li>{t('Ceny: z ofert do tego zapytania')}{' '}{raport.z_oferty_zapytania}{t(', z kart dostawy Optimy')}{' '}{raport.z_optimy}{t(', bez ceny')}{' '}{raport.bez_ceny}.
                  {raport.z_innego_gatunku > 0 && t(' W tym {0} cen zastępczych (inny gatunek tej samej grupy stali - gatunku z rysunku nie ma w zakupach; potwierdź ofertą).', raport.z_innego_gatunku)}</li>
                {raport.braki_szablonu.length > 0 && <li>{t('Elementy szablonu do uzupełnienia (ilość / masa z rysunku):')}{' '}{raport.braki_szablonu.join(', ')}.</li>}
                <li>{t('Masa pusta z rysunku:')}{' '}{raport.masa_z_rysunku ? `${liczba(raport.masa_z_rysunku, 0)} kg` : 'brak'} {t('- porównaj z sumą mas pozycji w wycenie.')}</li>
              </ul>
              <div className="flex justify-end gap-2">
                <Button onClick={zamknij}>{t('Zamknij')}</Button>
                <Button wariant="glowny" onClick={() => { zamknij(); otworzWycene(raport.wycena_id) }}>{t('Otwórz wycenę')}</Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
