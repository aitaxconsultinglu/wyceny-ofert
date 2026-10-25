import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, AlertTriangle, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { dataGodzinaPL, dataPL, liczba, zl } from '@/lib/format'
import { cn } from '@/lib/utils'
import { wierszeZPliku } from '@/lib/arkuszLeniwie'
import { parsujKarteDostawy, type KartaDostawy } from '@/lib/importOptima'
import { uprawnienia, type Profil } from '@/lib/types'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { t } from '@/i18n'

interface Zakup {
  id: number; numer_karty: string; nr_zamowienia: string; dostawca_nazwa: string | null; nazwa: string
  ilosc: number; jm: string | null; cena_jedn: number; wartosc: number; data_dostawy: string | null; status: string | null
  rodzaj: string; kategoria: string | null; kategoria_uslugi: string | null; gatunek: string | null
  masa_kg: number | null; masa_zrodlo: string | null; cena_kg: number | null; poprawiona_recznie: boolean
}
interface ImportOptimy {
  id: string; numer_karty: string; nazwa_pliku: string | null; suma_stopka: number | null; suma_pozycji: number | null; zgodna: boolean | null
  liczba_pozycji: number | null; nowych: number | null; zaktualizowanych: number | null; usunietych: number | null; utworzono: string
}

const RODZAJE: Record<string, string> = { material: t('materiał'), usluga: t('usługa'), doplata: t('dopłata'), pomocnicze: t('pomocnicze') }

/** Kolejka "uzupełnij masę": materiały bez masy, dla których porównanie zł/kg ma sens. */
export const wymagaMasy = (z: Pick<Zakup, 'rodzaj' | 'masa_kg' | 'jm' | 'kategoria'>) =>
  z.rodzaj === 'material' && z.masa_kg === null && (['kpl', t('usł')].includes(String(z.jm).toLowerCase()) || ['blachy', 'odkuwki'].includes(z.kategoria ?? ''))

export function Zakupy({ profil }: { profil: Profil }) {
  const s = useSlowniki()
  const up = uprawnienia(profil)
  const [widok, setWidok] = useState<'pozycje' | 'kolejka' | 'import' | 'historia'>('pozycje')
  const [zakupy, setZakupy] = useState<Zakup[]>([])
  const [importy, setImporty] = useState<ImportOptimy[]>([])
  const [filtr, setFiltr] = useState({ tekst: '', karta: '', rodzaj: '', kategoria: '' })
  const [podglad, setPodglad] = useState<(KartaDostawy & { plik: string }) | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  const [komunikat, setKomunikat] = useState<string | null>(null)
  const [zajety, setZajety] = useState(false)

  const wczytaj = useCallback(async () => {
    const [z, i] = await Promise.all([
      supabase.from('zakupy').select('*').order('numer_karty').order('nr_zamowienia').limit(10000),
      supabase.from('importy_optima').select('*').order('utworzono', { ascending: false }).limit(100),
    ])
    if (z.error) setBlad(komunikatPL(z.error.message))
    setZakupy((z.data ?? []) as Zakup[])
    setImporty((i.data ?? []) as ImportOptimy[])
  }, [])
  useEffect(() => { void wczytaj() }, [wczytaj])

  async function wczytajPlik(pliki: FileList | null) {
    const p = pliki?.[0]
    if (!p) return
    setBlad(null); setKomunikat(null)
    try {
      const karta = parsujKarteDostawy(await wierszeZPliku(new Uint8Array(await p.arrayBuffer())))
      setPodglad({ ...karta, plik: p.name })
    } catch (e) { setBlad(t('Nie udało się odczytać pliku: {0}', e instanceof Error ? e.message : String(e))) }
  }

  async function zapiszImport() {
    if (!podglad) return
    setZajety(true); setBlad(null)
    const pozycje = podglad.pozycje.map((p) => ({ ...p, pewnosc: undefined }))
    const { error } = await supabase.rpc('importuj_karte_dostawy', {
      p_naglowek: { numer_karty: podglad.numer_karty, nazwa_pliku: podglad.plik, suma_stopka: podglad.suma_stopka, suma_pozycji: podglad.suma_pozycji, zgodna: podglad.zgodna },
      p_pozycje: pozycje,
    })
    setZajety(false)
    if (error) { setBlad(komunikatPL(error.message)); return }
    const { data: ost } = await supabase.from('importy_optima').select('*').eq('numer_karty', podglad.numer_karty).order('utworzono', { ascending: false }).limit(1).single()
    setKomunikat(t('Zaimportowano kartę {0}: nowych {1}, zaktualizowanych {2}, usuniętych {3}. Projekt utworzony / zaktualizowany w „Projektach zrealizowanych”.', podglad.numer_karty, ost?.nowych ?? '?', ost?.zaktualizowanych ?? '?', ost?.usunietych ?? '?'))
    setPodglad(null); setWidok('pozycje')
    await wczytaj()
  }

  async function ustawMase(z: Zakup, masa: number | null) {
    const { error } = await supabase.from('zakupy').update({ masa_kg: masa, masa_zrodlo: masa === null ? null : 'reczna', poprawiona_recznie: true }).eq('id', z.id)
    if (error) { setBlad(komunikatPL(error.message)); return }
    setZakupy((l) => l.map((x) => (x.id === z.id ? { ...x, masa_kg: masa, masa_zrodlo: 'reczna', poprawiona_recznie: true, cena_kg: masa ? Math.round((x.wartosc / masa) * 10000) / 10000 : null } : x)))
  }

  async function ustawKategorie(z: Zakup, wartosc: string) {
    const [rodzaj, kod] = wartosc.split(':')
    const zmiana = rodzaj === 'm' ? { rodzaj: 'material', kategoria: kod, kategoria_uslugi: null }
      : rodzaj === 'u' ? { rodzaj: 'usluga', kategoria: null, kategoria_uslugi: kod }
      : { rodzaj, kategoria: rodzaj === 'pomocnicze' ? 'pomocnicze' : null, kategoria_uslugi: null }
    const { error } = await supabase.from('zakupy').update({ ...zmiana, poprawiona_recznie: true }).eq('id', z.id)
    if (error) { setBlad(komunikatPL(error.message)); return }
    setZakupy((l) => l.map((x) => (x.id === z.id ? { ...x, ...zmiana, poprawiona_recznie: true } : x)))
  }

  const karty = useMemo(() => [...new Set(zakupy.map((z) => z.numer_karty))], [zakupy])
  const widoczne = zakupy.filter((z) =>
    (widok !== 'kolejka' || wymagaMasy(z))
    && (!filtr.karta || z.numer_karty === filtr.karta)
    && (!filtr.rodzaj || z.rodzaj === filtr.rodzaj)
    && (!filtr.kategoria || z.kategoria === filtr.kategoria || z.kategoria_uslugi === filtr.kategoria)
    && (!filtr.tekst || `${z.nazwa} ${z.dostawca_nazwa} ${z.nr_zamowienia}`.toLowerCase().includes(filtr.tekst.toLowerCase())))
  const doUzupelnienia = zakupy.filter(wymagaMasy).length

  const opcjeKategorii = (
    <>
      <optgroup label={t('Materiały')}>{s.kategorieMaterialow.map((k) => <option key={k.kod} value={`m:${k.kod}`}>{k.nazwa}</option>)}</optgroup>
      <optgroup label={t('Usługi')}>{s.kategorieUslug.map((k) => <option key={k.kod} value={`u:${k.kod}`}>{k.nazwa}</option>)}</optgroup>
      <option value="doplata:">{t('dopłata (atest, transport)')}</option>
    </>
  )

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('Zakupy historyczne (karty dostawy Optima)')}</h2>
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {komunikat && <Komunikat rodzaj="sukces">{komunikat}</Komunikat>}
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {([['pozycje', t('Pozycje')], ['kolejka', t('Uzupełnij masę ({0})', doUzupelnienia)], ...(up.importy ? [['import', t('+ Import karty dostawy')]] : []), ['historia', t('Historia importów')]] as [typeof widok, string][]).map(([id, et]) => (
          <button key={id} onClick={() => setWidok(id)}
            className={cn('-mb-px rounded-t-md border px-3 py-1.5 text-sm', widok === id ? 'border-slate-200 border-b-white bg-white font-medium' : 'border-transparent text-slate-600 hover:bg-slate-100')}>{et}</button>
        ))}
      </div>

      {widok === 'import' && (
        <div className="space-y-3">
          <label className="flex max-w-xl cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed border-slate-300 bg-white p-5 hover:border-blekit">
            <Upload className="h-6 w-6 text-slate-400" />
            <span className="text-sm">{t('Wybierz plik „KARTA DOSTAWY” wyeksportowany z Optimy (.XLS). Ponowny import tej samej karty aktualizuje dane zamiast je dublować.')}</span>
            <input type="file" accept=".xls,.xlsx" className="hidden" onChange={(e) => void wczytajPlik(e.target.files)} />
          </label>
          {podglad && (
            <section className="sekcja space-y-2">
              <h3 className="font-semibold">{t('Karta')}{' '}{podglad.numer_karty || t('(brak numeru!)')} <span className="text-sm font-normal text-slate-500">({podglad.plik})</span></h3>
              <div className={cn('flex items-center gap-2 text-sm', podglad.zgodna ? 'text-limonka-ciemna' : 'text-red-700')}>
                {podglad.zgodna ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {t('Kontrola sumy: stopka')}{' '}{podglad.suma_stopka !== null ? zl(podglad.suma_stopka) : 'brak'} {t('· suma zamówień')}{' '}{zl(podglad.suma_zamowien)} {t('· suma pozycji')}{' '}{zl(podglad.suma_pozycji)}
                {podglad.zgodna ? t(' - zgodna') : t(' - NIEZGODNA')}
              </div>
              {podglad.zaokraglenia.length > 0 && (
                <p className="text-xs text-slate-500">{t('Groszowe zaokrąglenia Optimy:')}{' '}{podglad.zaokraglenia.map((z) => `${z.nr_zamowienia} (${zl(z.suma_pozycji)} → ${zl(z.suma_zamowienia)})`).join(', ')}</p>
              )}
              {podglad.ostrzezenia.map((o) => <p key={o} className="text-sm text-amber-800">⚠ {o}</p>)}
              <p className="text-sm">
                {t('Pozycji:')}{' '}{podglad.pozycje.length} - {Object.entries(RODZAJE).map(([k, v]) => `${v}: ${podglad.pozycje.filter((p) => p.rodzaj === k).length}`).join(', ')}{t('. Bez masy (do uzupełnienia):')}{' '}{podglad.pozycje.filter((p) => wymagaMasy({ ...p, kategoria: p.kategoria })).length}.
              </p>
              <div className="flex gap-2">
                <Button wariant="glowny" disabled={zajety || !podglad.numer_karty} onClick={() => void zapiszImport()}>{t('Zapisz w bazie')}</Button>
                <Button onClick={() => setPodglad(null)}>{t('Anuluj')}</Button>
              </div>
              {!podglad.zgodna && <p className="text-xs text-slate-500">{t('Import jest możliwy mimo niezgodności - zapisze się informacja, że suma się nie zgadzała.')}</p>}
            </section>
          )}
        </div>
      )}

      {widok === 'historia' && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse">
            <thead><tr>{[t('Kiedy'), t('Karta'), t('Plik'), t('Stopka'), t('Suma pozycji'), t('Zgodna'), t('Pozycji'), t('Nowe / zaktual. / usunięte')].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
            <tbody>
              {importy.map((i) => (
                <tr key={i.id}>
                  <td className="komorka whitespace-nowrap">{dataGodzinaPL(i.utworzono)}</td>
                  <td className="komorka">{i.numer_karty}</td>
                  <td className="komorka text-xs">{i.nazwa_pliku}</td>
                  <td className="komorka liczba">{i.suma_stopka !== null ? zl(i.suma_stopka) : ''}</td>
                  <td className="komorka liczba">{i.suma_pozycji !== null ? zl(i.suma_pozycji) : ''}</td>
                  <td className="komorka">{i.zgodna ? '✓' : '✗'}</td>
                  <td className="komorka liczba">{i.liczba_pozycji}</td>
                  <td className="komorka text-sm">{i.nowych} / {i.zaktualizowanych} / {i.usunietych}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(widok === 'pozycje' || widok === 'kolejka') && (
        <>
          {widok === 'kolejka' && (
            <p className="text-sm text-slate-600">
              {t('Materiały bez masy (np. „Wypałki … 1 kpl”) nie wchodzą do porównań zł/kg, dopóki ktoś nie wpisze masy. Wpisz masę w kg - zapisuje się od razu.')}
            </p>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label><span className="etykieta">{t('Szukaj')}</span><input className="pole w-56" value={filtr.tekst} onChange={(e) => setFiltr({ ...filtr, tekst: e.target.value })} /></label>
            <label><span className="etykieta">{t('Karta / projekt')}</span>
              <select className="pole w-48" value={filtr.karta} onChange={(e) => setFiltr({ ...filtr, karta: e.target.value })}>
                <option value="">wszystkie</option>{karty.map((k) => <option key={k}>{k}</option>)}
              </select></label>
            <label><span className="etykieta">{t('Rodzaj')}</span>
              <select className="pole w-40" value={filtr.rodzaj} onChange={(e) => setFiltr({ ...filtr, rodzaj: e.target.value })}>
                <option value="">wszystkie</option>{Object.entries(RODZAJE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <label><span className="etykieta">{t('Kategoria')}</span>
              <select className="pole w-48" value={filtr.kategoria} onChange={(e) => setFiltr({ ...filtr, kategoria: e.target.value })}>
                <option value="">wszystkie</option>
                {s.kategorieMaterialow.map((k) => <option key={k.kod} value={k.kod}>{k.nazwa}</option>)}
                {s.kategorieUslug.map((k) => <option key={k.kod} value={k.kod}>{k.nazwa}</option>)}
              </select></label>
            <span className="pb-2 text-sm text-slate-500">{widoczne.length} {t('pozycji ·')}{' '}{zl(widoczne.reduce((a, z) => a + Number(z.wartosc), 0))} {t('zł')}</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[1200px] border-collapse">
              <thead><tr>{[t('Karta'), t('Zamówienie'), t('Dostawca'), t('Nazwa'), t('Kategoria'), t('Gatunek'), t('Ilość'), t('Cena'), t('Wartość'), t('Masa [kg]'), t('zł/kg'), t('Data')].map((n) => <th key={n} className="komorka-naglowek whitespace-nowrap">{n}</th>)}</tr></thead>
              <tbody>
                {widoczne.slice(0, 2000).map((z) => (
                  <tr key={z.id} className={cn(z.rodzaj === 'doplata' && 'text-slate-500', z.rodzaj === 'pomocnicze' && 'text-slate-500 italic')}>
                    <td className="komorka whitespace-nowrap text-xs">{z.numer_karty}</td>
                    <td className="komorka whitespace-nowrap text-xs">{z.nr_zamowienia}</td>
                    <td className="komorka max-w-[11rem] truncate text-xs" title={z.dostawca_nazwa ?? ''}>{z.dostawca_nazwa}</td>
                    <td className="komorka max-w-[20rem] text-sm">{z.nazwa}</td>
                    <td className="komorka w-44">
                      <select className="pole-komorki text-xs"
                        value={z.rodzaj === 'material' ? `m:${z.kategoria}` : z.rodzaj === 'usluga' ? `u:${z.kategoria_uslugi ?? ''}` : `${z.rodzaj}:`}
                        onChange={(e) => void ustawKategorie(z, e.target.value)}>
                        {opcjeKategorii}
                        {z.rodzaj === 'usluga' && !z.kategoria_uslugi && <option value="u:">{t('usługa (bez kategorii)')}</option>}
                      </select>
                    </td>
                    <td className="komorka whitespace-nowrap text-xs">{z.gatunek}</td>
                    <td className="komorka liczba whitespace-nowrap">{liczba(z.ilosc)} {z.jm}</td>
                    <td className="komorka liczba whitespace-nowrap">{zl(z.cena_jedn)}</td>
                    <td className="komorka liczba whitespace-nowrap">{zl(z.wartosc)}</td>
                    <td className={cn('komorka w-24', wymagaMasy(z) && 'bg-amber-50')} title={z.masa_zrodlo ? t('źródło: {0}', z.masa_zrodlo) : t('brak masy')}>
                      {z.rodzaj === 'material'
                        ? <PoleLiczby wartosc={z.masa_kg} puste zmien={(n) => void ustawMase(z, n)} />
                        : null}
                    </td>
                    <td className="komorka liczba whitespace-nowrap">{z.cena_kg !== null ? liczba(z.cena_kg, 2) : ''}</td>
                    <td className="komorka whitespace-nowrap text-xs">{dataPL(z.data_dostawy) || z.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
