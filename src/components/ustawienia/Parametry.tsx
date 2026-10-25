import { useState } from 'react'
import { Save } from 'lucide-react'
import { useSlowniki } from '@/lib/slowniki'
import type { OfertaDomyslne } from '@/lib/types'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { zapiszUstawienia } from './zapiszUstawienie'

function Pole({ etykieta, opis, children }: { etykieta: string; opis?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="etykieta">{etykieta}</span>
      <div className="w-40 rounded-md border border-slate-300 px-1.5 py-1">{children}</div>
      {opis && <span className="mt-1 block max-w-xs text-xs text-slate-500">{opis}</span>}
    </label>
  )
}

/** Narzuty domyślne i progi ostrzeżeń. Każdy narzut można zmienić w konkretnej wycenie. */
export function Parametry() {
  const { ustawienia: u, odswiez } = useSlowniki()
  const [stan, setStan] = useState({
    narzut_zakupowy_proc: u.narzut_zakupowy_proc,
    narzut_kooperacja_proc: u.narzut_kooperacja_proc,
    narzut_zysk_proc: u.narzut_zysk_proc ?? 10,
    zaokraglenie_ceny: u.zaokraglenie_ceny ?? 100,
    wiek_ceny_ostrzezenie_mies: u.wiek_ceny_ostrzezenie_mies,
    waznosc_oferty_dostawcy_ryzyko_dni: u.waznosc_oferty_dostawcy_ryzyko_dni,
    wspolczynnik_ilosci_materialu: u.wspolczynnik_ilosci_materialu,
  })
  const [oferta, setOferta] = useState<OfertaDomyslne>(u.oferta_domyslne)
  const [blad, setBlad] = useState<string | null>(null)
  const [komunikat, setKomunikat] = useState<string | null>(null)
  const [zajety, setZajety] = useState(false)

  const ustaw = (k: keyof typeof stan) => (n: number | null) => { setStan({ ...stan, [k]: n ?? 0 }); setKomunikat(null) }

  async function zapisz() {
    setBlad(null); setZajety(true)
    const b = await zapiszUstawienia({ ...stan, oferta_domyslne: oferta })
    setZajety(false)
    if (b) { setBlad(b); return }
    setKomunikat('Zapisano. Nowe wartości obowiązują w nowych wycenach - istniejące wyceny mają własne narzuty.')
    await odswiez()
  }

  return (
    <div className="space-y-5">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {komunikat && <Komunikat rodzaj="sukces">{komunikat}</Komunikat>}

      <section className="sekcja">
        <h3 className="text-sm font-semibold">Narzuty domyślne</h3>
        <div className="mt-3 flex flex-wrap gap-6">
          <Pole etykieta="Narzut zakupowy na materiały [%]" opis="Zwykle 5% albo 10%. Dolicza się do kosztu materiałów.">
            <PoleLiczby wartosc={stan.narzut_zakupowy_proc} zmien={ustaw('narzut_zakupowy_proc')} />
          </Pole>
          <Pole etykieta="Narzut na kooperację [%]">
            <PoleLiczby wartosc={stan.narzut_kooperacja_proc} zmien={ustaw('narzut_kooperacja_proc')} />
          </Pole>
          <Pole etykieta="Narzut / zysk końcowy [%]" opis="Zwykle 10% albo 15%. Widoczny tylko dla osób z uprawnieniem do marż.">
            <PoleLiczby wartosc={stan.narzut_zysk_proc} zmien={ustaw('narzut_zysk_proc')} />
          </Pole>
          <label className="block">
            <span className="etykieta">Zaokrąglenie ceny aparatu</span>
            <select className="pole w-40" value={stan.zaokraglenie_ceny}
              onChange={(e) => setStan({ ...stan, zaokraglenie_ceny: Number(e.target.value) })}>
              <option value={0}>bez zaokrąglenia</option>
              <option value={10}>do 10 zł</option>
              <option value={100}>do 100 zł</option>
              <option value={1000}>do 1000 zł</option>
            </select>
            <span className="mt-1 block max-w-xs text-xs text-slate-500">Cena po narzucie zaokrąglana do najbliższej wielokrotności.</span>
          </label>
        </div>
      </section>

      <section className="sekcja">
        <h3 className="text-sm font-semibold">Ilości i ostrzeżenia</h3>
        <div className="mt-3 flex flex-wrap gap-6">
          <Pole etykieta="Mnożnik masy materiału" opis="Wycena uproszczona: masa × 1,1 (naddatek na odpad).">
            <PoleLiczby wartosc={stan.wspolczynnik_ilosci_materialu} zmien={ustaw('wspolczynnik_ilosci_materialu')} />
          </Pole>
          <Pole etykieta="Cena nieaktualna po [mies.]" opis="Ceny starsze są oznaczane kolorem.">
            <PoleLiczby wartosc={stan.wiek_ceny_ostrzezenie_mies} zmien={ustaw('wiek_ceny_ostrzezenie_mies')} />
          </Pole>
          <Pole etykieta="Ryzyko cenowe: oferta dostawcy ważna krócej niż [dni]">
            <PoleLiczby wartosc={stan.waznosc_oferty_dostawcy_ryzyko_dni} zmien={ustaw('waznosc_oferty_dostawcy_ryzyko_dni')} />
          </Pole>
        </div>
      </section>

      <section className="sekcja">
        <h3 className="text-sm font-semibold">Domyślne warunki oferty dla klienta</h3>
        <div className="mt-3 flex flex-wrap gap-6">
          <Pole etykieta="Gwarancja [mies.]">
            <PoleLiczby wartosc={oferta.gwarancja_mies} zmien={(n) => setOferta({ ...oferta, gwarancja_mies: n ?? 0 })} />
          </Pole>
          <Pole etykieta="Ważność oferty [dni]" opis="Zwykle 30 albo 60 dni.">
            <PoleLiczby wartosc={oferta.waznosc_dni} zmien={(n) => setOferta({ ...oferta, waznosc_dni: n ?? 0 })} />
          </Pole>
          <label className="block">
            <span className="etykieta">Płatność</span>
            <input className="pole w-40" value={oferta.platnosc} onChange={(e) => setOferta({ ...oferta, platnosc: e.target.value })} />
          </label>
          <Pole etykieta="VAT [%]">
            <PoleLiczby wartosc={oferta.vat_proc} zmien={(n) => setOferta({ ...oferta, vat_proc: n ?? 0 })} />
          </Pole>
        </div>
      </section>

      <Button wariant="glowny" disabled={zajety} onClick={() => void zapisz()}><Save className="h-4 w-4" /> Zapisz parametry</Button>
    </div>
  )
}
