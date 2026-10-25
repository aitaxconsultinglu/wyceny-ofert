import { useCallback, useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { liczba, zl } from '@/lib/format'
import { wierszeZPliku } from '@/lib/arkuszLeniwie'
import { agregujRegisto, type MiesiacRegisto } from '@/lib/importRegisto'
import { uprawnienia, type Profil } from '@/lib/types'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'

interface Projekt {
  id: string; numer: string; tytul: string | null; klient_id: string | null; typ_aparatu: string | null; masa_kg: number | null
  material_wiodacy: string | null; zapytanie_id: string | null
  koszt_materialow: number; koszt_uslug: number; koszt_doplat: number; koszt_pomocniczych: number; koszt_zakupow: number
  pozycji_bez_masy: number; godziny: number; godziny_wlasne: number; godziny_podwykonawcow: number
  rbh_na_t: number | null; zakupy_zl_na_kg: number | null
}
interface GodzinyMpk { mpk: string | null; rodzaj_umowy: string | null; firma: string | null; godziny: number; miesiac: string }

export const TYPY_APARATOW = [
  'zbiornik pionowy', 'zbiornik poziomy', 'wymiennik płaszczowo-rurowy', 'wkład rurowy', 'reaktor', 'separator', 'kolumna', 'inne',
]

export function Projekty({ profil }: { profil: Profil }) {
  const up = uprawnienia(profil)
  const [projekty, setProjekty] = useState<Projekt[]>([])
  const [otwarty, setOtwarty] = useState<string | null>(null)
  const [godziny, setGodziny] = useState<GodzinyMpk[]>([])
  const [podglad, setPodglad] = useState<{ plik: string; miesiace: MiesiacRegisto[]; bledy: string[] } | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  const [komunikat, setKomunikat] = useState<string | null>(null)
  const [zajety, setZajety] = useState(false)

  const wczytaj = useCallback(async () => {
    const { data, error } = await supabase.from('projekty_podsumowanie').select('*').order('numer', { ascending: false })
    if (error) setBlad(komunikatPL(error.message)); else setProjekty((data ?? []) as Projekt[])
  }, [])
  useEffect(() => { void wczytaj() }, [wczytaj])

  useEffect(() => {
    const p = projekty.find((x) => x.id === otwarty)
    if (!p) { setGodziny([]); return }
    void supabase.from('registo_godziny').select('mpk, rodzaj_umowy, firma, godziny, miesiac').eq('projekt_numer', p.numer)
      .then(({ data }) => setGodziny((data ?? []) as GodzinyMpk[]))
  }, [otwarty, projekty])

  async function zmien(p: Projekt, zmiana: Partial<Projekt>) {
    const { error } = await supabase.from('projekty').update(zmiana).eq('id', p.id)
    if (error) { setBlad(komunikatPL(error.message)); return }
    await wczytaj()
  }

  async function wczytajRegisto(pliki: FileList | null) {
    const p = pliki?.[0]
    if (!p) return
    setBlad(null); setKomunikat(null)
    const wynik = agregujRegisto(await wierszeZPliku(new Uint8Array(await p.arrayBuffer())))
    setPodglad({ plik: p.name, ...wynik })
  }

  async function zapiszRegisto() {
    if (!podglad) return
    setZajety(true)
    for (const m of podglad.miesiace) {
      const { error } = await supabase.rpc('importuj_registo', {
        p_naglowek: { miesiac: m.miesiac, nazwa_pliku: podglad.plik, wierszy: m.wierszy, pominietych: m.pominietych, godzin: m.godzin },
        p_wiersze: m.agregaty,
      })
      if (error) { setZajety(false); setBlad(komunikatPL(error.message)); return }
    }
    setZajety(false)
    setKomunikat(`Zaimportowano godziny z Registo: ${podglad.miesiace.map((m) => `${m.miesiac.slice(0, 7)} - ${liczba(m.godzin)} h (${m.agregaty.length} agregatów)`).join(', ')}. Wcześniejszy import tego samego miesiąca został zastąpiony.`)
    setPodglad(null)
    await wczytaj()
  }

  const otwartyProjekt = projekty.find((x) => x.id === otwarty)
  const godzinyMpk = Object.values(godziny.reduce<Record<string, { mpk: string; wlasne: number; obce: number }>>((acc, g) => {
    const k = g.mpk ?? '-'
    acc[k] ??= { mpk: k, wlasne: 0, obce: 0 }
    if (g.rodzaj_umowy === 'umowa o pracę') acc[k].wlasne += Number(g.godziny); else acc[k].obce += Number(g.godziny)
    return acc
  }, {})).sort((a, b) => a.mpk.localeCompare(b.mpk))

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  const kolumny: KolumnaTabeli<Projekt>[] = [
    { id: 'numer', naglowek: 'Projekt', typ: 'tekst', wartosc: (p) => p.numer, className: 'whitespace-nowrap font-medium' },
    { id: 'tytul', naglowek: 'Tytuł', typ: 'tekst', wartosc: (p) => p.tytul, className: 'min-w-[16rem]', komorka: (p) => <span onClick={stop}><input className="pole-komorki" defaultValue={p.tytul ?? ''} onBlur={(e) => e.target.value !== (p.tytul ?? '') && void zmien(p, { tytul: e.target.value || null })} /></span> },
    {
      id: 'typ', naglowek: 'Typ aparatu', typ: 'lista', wartosc: (p) => p.typ_aparatu, className: 'w-44',
      komorka: (p) => <span onClick={stop}><select className="pole-komorki" value={p.typ_aparatu ?? ''} onChange={(e) => void zmien(p, { typ_aparatu: e.target.value || null })}><option value="">-</option>{TYPY_APARATOW.map((t) => <option key={t}>{t}</option>)}</select></span>,
    },
    { id: 'masa', naglowek: 'Masa [kg]', typ: 'liczba', wartosc: (p) => p.masa_kg, className: 'w-24', komorka: (p) => <span onClick={stop}><PoleLiczby wartosc={p.masa_kg} puste zmien={(n) => void zmien(p, { masa_kg: n })} /></span> },
    { id: 'material', naglowek: 'Materiał wiodący', typ: 'tekst', wartosc: (p) => p.material_wiodacy, className: 'w-32', komorka: (p) => <span onClick={stop}><input className="pole-komorki" defaultValue={p.material_wiodacy ?? ''} onBlur={(e) => e.target.value !== (p.material_wiodacy ?? '') && void zmien(p, { material_wiodacy: e.target.value || null })} /></span> },
    { id: 'materialy', naglowek: 'Materiały', typ: 'liczba', wartosc: (p) => Number(p.koszt_materialow), className: 'whitespace-nowrap', komorka: (p) => <>{zl(p.koszt_materialow)}{p.pozycji_bez_masy > 0 && <span className="ml-1 text-xs text-amber-700" title="pozycje bez masy">({p.pozycji_bez_masy} bez masy)</span>}</> },
    { id: 'uslugi', naglowek: 'Usługi', typ: 'liczba', wartosc: (p) => Number(p.koszt_uslug), komorka: (p) => zl(p.koszt_uslug), className: 'whitespace-nowrap' },
    { id: 'doplaty', naglowek: 'Dopłaty + pomocn.', typ: 'liczba', wartosc: (p) => Number(p.koszt_doplat) + Number(p.koszt_pomocniczych), komorka: (p) => zl(Number(p.koszt_doplat) + Number(p.koszt_pomocniczych)), className: 'whitespace-nowrap' },
    { id: 'razem', naglowek: 'Zakupy razem', typ: 'liczba', wartosc: (p) => Number(p.koszt_zakupow), komorka: (p) => zl(p.koszt_zakupow), className: 'whitespace-nowrap font-medium' },
    { id: 'zlkg', naglowek: 'zł/kg (zakupy)', typ: 'liczba', wartosc: (p) => p.zakupy_zl_na_kg, komorka: (p) => (p.zakupy_zl_na_kg !== null ? liczba(p.zakupy_zl_na_kg, 2) : '') },
    { id: 'godziny', naglowek: 'Godziny (własne / obce)', typ: 'liczba', wartosc: (p) => Number(p.godziny), className: 'whitespace-nowrap', komorka: (p) => <>{liczba(p.godziny, 1)} <span className="text-xs text-slate-500">({liczba(p.godziny_wlasne, 0)} / {liczba(p.godziny_podwykonawcow, 0)})</span></> },
    { id: 'rbh', naglowek: 'rbh/t', typ: 'liczba', wartosc: (p) => p.rbh_na_t, komorka: (p) => (p.rbh_na_t !== null ? liczba(p.rbh_na_t, 1) : '') },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Projekty zrealizowane</h2>
        {up.importy && (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-white px-3 py-2 text-sm ring-1 ring-slate-300 hover:bg-slate-100">
            <Upload className="h-4 w-4" /> Import czasu pracy z Registo (Raport_EN Export 3)
            <input type="file" accept=".xlsx" className="hidden" onChange={(e) => void wczytajRegisto(e.target.files)} />
          </label>
        )}
      </div>
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {komunikat && <Komunikat rodzaj="sukces">{komunikat}</Komunikat>}
      {podglad && (
        <section className="sekcja space-y-2">
          <h3 className="font-semibold">Registo: {podglad.plik}</h3>
          {podglad.bledy.map((b) => <p key={b} className="text-sm text-red-700">{b}</p>)}
          {podglad.miesiace.map((m) => (
            <p key={m.miesiac} className="text-sm">
              {m.miesiac.slice(0, 7)}: {m.wierszy} wierszy, {liczba(m.godzin)} h przypisanych do {new Set(m.agregaty.map((a) => a.projekt_numer)).size} projektów,
              pominięto {m.pominietych} wierszy bez numeru projektu. Do bazy trafiają tylko sumy (bez nazwisk).
            </p>
          ))}
          <div className="flex gap-2">
            <Button wariant="glowny" disabled={zajety || !podglad.miesiace.length} onClick={() => void zapiszRegisto()}>Zapisz (zastąpi poprzedni import tych miesięcy)</Button>
            <Button onClick={() => setPodglad(null)}>Anuluj</Button>
          </div>
        </section>
      )}

      <p className="text-xs text-slate-500">
        Projekty powstają z kart dostawy Optimy. Wpisz masę i typ aparatu, żeby policzyć zł/kg i rbh/t - te dane zasilą podpowiedzi „Podobne zlecenia” w wycenie.
      </p>
      <Tabela id="projekty" kolumny={kolumny} wiersze={projekty} klucz={(p) => p.id} onKlik={(p) => setOtwarty(otwarty === p.id ? null : p.id)}
        klasaWiersza={(p) => (otwarty === p.id ? 'bg-blekit-jasny/40' : undefined)} pusto="Brak projektów - zaimportuj kartę dostawy w zakładce Zakupy." />


      {otwartyProjekt && (
        <section className="sekcja space-y-2">
          <h3 className="font-semibold">{otwartyProjekt.numer} {otwartyProjekt.tytul && `- ${otwartyProjekt.tytul}`}</h3>
          <p className="text-sm text-slate-600">
            Porównanie wycena ↔ wykonanie (zł/kg, rbh/t, udział materiałów) pojawi się po powiązaniu projektu z wyceną w etapie 3.
          </p>
          {godzinyMpk.length > 0 ? (
            <table className="border-collapse">
              <thead><tr>{['MPK', 'Godziny własne', 'Podwykonawcy / umowy cywilne', 'Razem'].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
              <tbody>
                {godzinyMpk.map((g) => (
                  <tr key={g.mpk}>
                    <td className="komorka">{g.mpk}</td>
                    <td className="komorka liczba">{liczba(g.wlasne, 1)}</td>
                    <td className="komorka liczba">{liczba(g.obce, 1)}</td>
                    <td className="komorka liczba font-medium">{liczba(g.wlasne + g.obce, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-sm text-slate-500">Brak godzin z Registo dla tego projektu.</p>}
        </section>
      )}
    </div>
  )
}
