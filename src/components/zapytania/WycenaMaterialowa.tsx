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
    void dokumentyZapytania(zapytanie.id).then((d) => setRysunki(d.filter((x) => x.typ === 'rysunek' && /\.pdf$/i.test(x.nazwa_pliku)).map((x) => x.nazwa_pliku)))
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
        <DialogTitle>Wycena materiałowa - {zapytanie.numer}</DialogTitle>
        <DialogDescription>
          Lista materiałów i parametry projektu z rysunków zapytania, ceny z kart dostawy Optimy i ofert na materiały zebranych do tego zapytania.
          Bez kosztów AI: rysunki z CAD są czytane z warstwy tekstowej, skany - z odczytów zapisanych w zakładce Rysunki i listy.
        </DialogDescription>
        <div className="mt-3 space-y-3 text-sm">
          {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
          {postep && <Komunikat rodzaj="info">{postep}</Komunikat>}
          {!raport && (
            <>
              <p><span className="etykieta">Rodzaj aparatu (z zapytania)</span>{etykietaRodzaju(zapytanie.rodzaj_aparatu, zapytanie.zakres_wymiennika, zapytanie.zakres_opis)}</p>
              {szablon && <div>
                <span className="etykieta">Elementy szablonu „{szablon.nazwa}” (wymagane pogrubione - zawsze w wycenie)</span>
                <p className="text-xs text-slate-600">{szablon.elementy.map((e, i) => <span key={e.kod}>{i > 0 && ' · '}{e.wymagany ? <strong>{e.nazwa}</strong> : e.nazwa}</span>)}</p>
              </div>}
              <div>
                <span className="etykieta">Rysunki PDF zapytania ({rysunki.length})</span>
                {rysunki.length ? <ul className="list-disc pl-5 text-xs">{rysunki.map((r) => <li key={r}>{r}</li>)}</ul>
                  : <p className="text-xs text-amber-700">Brak rysunków PDF - dodaj je w zakładce Dokumenty (typ „rysunek”).</p>}
              </div>
              <div className="flex justify-end gap-2">
                <Button onClick={zamknij} disabled={!!postep}>Anuluj</Button>
                <Button wariant="glowny" disabled={!!postep || !rysunki.length || !szablon} onClick={() => void uruchom()}><Sparkles className="h-4 w-4" /> Przygotuj wycenę materiałową</Button>
              </div>
            </>
          )}
          {raport && (
            <>
              <Komunikat rodzaj="sukces">Wycena v{raport.wersja} „Wycena materiałowa”: {raport.pozycji} pozycji materiałów.</Komunikat>
              <ul className="list-disc space-y-1 pl-5">
                <li>Rysunki z CAD odczytane z tekstu: {raport.stron_tekst} str.; parametrów projektu {raport.parametrow}, króćców {raport.krocow}.</li>
                {raport.skany_bez_odczytu.length > 0 && <li className="text-amber-800">Skany bez odczytu ({raport.skany_bez_odczytu.join('; ')}) - odczytaj wykaz części w zakładce Rysunki i listy
                  (AI z potwierdzeniem kosztu), potem uruchom wycenę materiałową jeszcze raz.</li>}
                <li>Ceny: z ofert do tego zapytania {raport.z_oferty_zapytania}, z kart dostawy Optimy {raport.z_optimy}, bez ceny {raport.bez_ceny}.
                  {raport.z_innego_gatunku > 0 && ` W tym ${raport.z_innego_gatunku} cen zastępczych (inny gatunek tej samej grupy stali - gatunku z rysunku nie ma w zakupach; potwierdź ofertą).`}</li>
                {raport.braki_szablonu.length > 0 && <li>Elementy szablonu do uzupełnienia (ilość / masa z rysunku): {raport.braki_szablonu.join(', ')}.</li>}
                <li>Masa pusta z rysunku: {raport.masa_z_rysunku ? `${liczba(raport.masa_z_rysunku, 0)} kg` : 'brak'} - porównaj z sumą mas pozycji w wycenie.</li>
              </ul>
              <div className="flex justify-end gap-2">
                <Button onClick={zamknij}>Zamknij</Button>
                <Button wariant="glowny" onClick={() => { zamknij(); otworzWycene(raport.wycena_id) }}>Otwórz wycenę</Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
