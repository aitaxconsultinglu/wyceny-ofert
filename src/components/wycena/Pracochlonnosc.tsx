import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSlowniki } from '@/lib/slowniki'
import { liczba, zl } from '@/lib/format'
import { policzAparat, type ParametryKalk } from '@/lib/kalkulacja'
import { klucz, type Aparat, type PozycjaWyceny } from '@/lib/wyceny'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { t } from '@/i18n'

interface Props { aparat: Aparat; par: ParametryKalk; tylkoOdczyt: boolean; zmien: (f: (a: Aparat) => Aparat) => void; wycenaId: string }

interface Podobny { zrodlo: string; nazwa: string; typ: string | null; masa: number | null; material: string | null; rbh_t_wycena: number | null; rbh_t_rzecz: number | null; zl_kg: number | null }

/**
 * "Podobne zlecenia": historyczne wyceny i projekty tego samego typu, masa ±50%. Pokazuje rbh/t z wyceny
 * i rzeczywiste z Registo. Tylko podpowiedź - wskaźnik przyjmuje technolog.
 */
function PodobneZlecenia({ aparat, wycenaId, przyjmij, tylkoOdczyt }: { aparat: Aparat; wycenaId: string; przyjmij: (rbhT: number) => void; tylkoOdczyt: boolean }) {
  const [lista, setLista] = useState<Podobny[]>([])
  const masa = aparat.masa_netto_kg ?? 0

  useEffect(() => {
    if (!aparat.typ || !masa) { setLista([]); return }
    let aktywne = true
    void (async () => {
      const [{ data: ap }, { data: pr }] = await Promise.all([
        supabase.from('aparaty').select('id, nazwa, typ, masa_netto_kg, material_wiodacy, metoda_robocizny, wskaznik_rbh_t, wycena_id, wyceny!inner(wersja, status, zapytania(numer)), pozycje_wyceny(zakladka, ilosc)')
          .eq('typ', aparat.typ).gte('masa_netto_kg', masa * 0.5).lte('masa_netto_kg', masa * 1.5).neq('wycena_id', wycenaId).limit(50),
        supabase.from('projekty_podsumowanie').select('numer, tytul, typ_aparatu, masa_kg, material_wiodacy, rbh_na_t, zakupy_zl_na_kg')
          .eq('typ_aparatu', aparat.typ).gte('masa_kg', masa * 0.5).lte('masa_kg', masa * 1.5).limit(50),
      ])
      if (!aktywne) return
      const zWycen: Podobny[] = ((ap ?? []) as unknown as {
        nazwa: string; typ: string; masa_netto_kg: number; material_wiodacy: string | null; metoda_robocizny: string; wskaznik_rbh_t: number | null
        wyceny: { wersja: number; status: string; zapytania: { numer: string } | null }; pozycje_wyceny: { zakladka: string; ilosc: number }[]
      }[]).map((a) => {
        const t = Number(a.masa_netto_kg) / 1000
        const rbh = a.metoda_robocizny === 'wskaznikowa' ? Number(a.wskaznik_rbh_t ?? 0) * t : a.pozycje_wyceny.filter((p) => p.zakladka === 'robocizna').reduce((s, p) => s + Number(p.ilosc), 0)
        return {
          zrodlo: `${a.wyceny.zapytania?.numer ?? ''} v${a.wyceny.wersja} (${a.wyceny.status})`, nazwa: a.nazwa, typ: a.typ, masa: Number(a.masa_netto_kg),
          material: a.material_wiodacy, rbh_t_wycena: t > 0 && rbh > 0 ? rbh / t : null, rbh_t_rzecz: null, zl_kg: null,
        }
      })
      const zProjektow: Podobny[] = (pr ?? []).map((p) => ({
        zrodlo: `projekt ${p.numer}`, nazwa: p.tytul ?? '', typ: p.typ_aparatu, masa: p.masa_kg, material: p.material_wiodacy,
        rbh_t_wycena: null, rbh_t_rzecz: p.rbh_na_t ? Number(p.rbh_na_t) : null, zl_kg: p.zakupy_zl_na_kg ? Number(p.zakupy_zl_na_kg) : null,
      }))
      setLista([...zWycen, ...zProjektow])
    })()
    return () => { aktywne = false }
  }, [aparat.typ, masa, wycenaId])

  return (
    <section className="sekcja space-y-2">
      <h4 className="text-sm font-semibold">{t('Podobne zlecenia')}{' '}<span className="font-normal text-slate-500">{t('(typ „')}{aparat.typ ?? '-'}{t('”, masa')}{' '}{liczba(masa * 0.5, 0)}-{liczba(masa * 1.5, 0)} {t('kg)')}</span></h4>
      {!aparat.typ || !masa ? <p className="text-sm text-slate-500">{t('Uzupełnij typ aparatu i masę netto, żeby zobaczyć podpowiedzi.')}</p> : lista.length === 0 ? (
        <p className="text-sm text-slate-500">{t('Brak podobnych wycen i projektów w bazie.')}</p>
      ) : (
        <table className="w-full border-collapse">
          <thead><tr>{[t('Źródło'), t('Nazwa'), t('Masa kg'), t('Materiał'), t('rbh/t z wyceny'), t('rbh/t rzeczywiste (Registo)'), t('Zakupy zł/kg'), ''].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
          <tbody>
            {lista.map((p, i) => (
              <tr key={i}>
                <td className="komorka text-xs">{p.zrodlo}</td>
                <td className="komorka text-sm">{p.nazwa}</td>
                <td className="komorka liczba">{liczba(p.masa, 0)}</td>
                <td className="komorka text-xs">{p.material}</td>
                <td className="komorka liczba">{p.rbh_t_wycena !== null ? liczba(p.rbh_t_wycena, 1) : ''}</td>
                <td className="komorka liczba">{p.rbh_t_rzecz !== null ? liczba(p.rbh_t_rzecz, 1) : ''}</td>
                <td className="komorka liczba">{p.zl_kg !== null ? liczba(p.zl_kg, 2) : ''}</td>
                <td className="komorka">
                  {!tylkoOdczyt && aparat.metoda_robocizny === 'wskaznikowa' && (p.rbh_t_rzecz ?? p.rbh_t_wycena) !== null && (
                    <Button rozmiar="maly" wariant="cichy" onClick={() => przyjmij(Math.round((p.rbh_t_rzecz ?? p.rbh_t_wycena)!))}>przyjmij</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-slate-500">{t('Aplikacja tylko podpowiada - wskaźnik i stawkę ustala technolog.')}</p>
    </section>
  )
}

export function Pracochlonnosc({ aparat, par, tylkoOdczyt, zmien, wycenaId }: Props) {
  const s = useSlowniki()
  const k = policzAparat(aparat, par)
  const wiersze = aparat.pozycje.filter((p) => p.zakladka === 'robocizna')
  const aktywne = s.stawki.filter((x) => x.aktywna)
  const domyslna = aktywne.find((x) => x.domyslna)
  const ust = (zm: Partial<Aparat>) => zmien((a) => ({ ...a, ...zm }))
  const ustPoz = (kl: string, zm: Partial<PozycjaWyceny>) => zmien((a) => ({ ...a, pozycje: a.pozycje.map((p) => (p.klucz === kl ? { ...p, ...zm } : p)) }))

  return (
    <div className="space-y-4">
      <div className="flex gap-4 text-sm">
        {(['wskaznikowa', 'szczegolowa'] as const).map((m) => (
          <label key={m} className="flex items-center gap-1">
            <input type="radio" disabled={tylkoOdczyt} checked={aparat.metoda_robocizny === m} onChange={() => ust({ metoda_robocizny: m })} />
            {m === 'wskaznikowa' ? t('Wskaźnikowa (masa × rbh/t × stawka)') : t('Szczegółowa (MPK × rbh × stawka)')}
          </label>
        ))}
      </div>

      {aparat.metoda_robocizny === 'wskaznikowa' ? (
        <section className="sekcja grid max-w-3xl grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
          <div><span className="etykieta">{t('Masa netto [t]')}</span><p className="py-1 font-medium">{liczba((aparat.masa_netto_kg ?? 0) / 1000, 3)}</p></div>
          <label><span className="etykieta">{t('Wskaźnik [rbh/t]')}</span>
            <span className="block rounded border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={aparat.wskaznik_rbh_t} puste disabled={tylkoOdczyt} zmien={(n) => ust({ wskaznik_rbh_t: n })} /></span></label>
          <label><span className="etykieta">{t('Stawka [PLN/rbh]')}</span>
            <span className="block rounded border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={aparat.stawka_wskaznikowa} puste disabled={tylkoOdczyt} zmien={(n) => ust({ stawka_wskaznikowa: n })} /></span>
            {!tylkoOdczyt && domyslna && aparat.stawka_wskaznikowa !== Number(domyslna.stawka) && (
              <button className="mt-0.5 text-xs text-blekit-ciemny underline" onClick={() => ust({ stawka_wskaznikowa: Number(domyslna.stawka) })}>{t('domyślna:')}{' '}{zl(domyslna.stawka)}</button>
            )}</label>
          <label><span className="etykieta">{t('Liczba osób')}</span>
            <span className="block rounded border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={aparat.liczba_osob} puste disabled={tylkoOdczyt} zmien={(n) => ust({ liczba_osob: n })} /></span></label>
          <div><span className="etykieta">{t('Ilość rbh')}</span><p className="py-1 font-medium">{liczba(k.robocizna.rbh, 1)}</p></div>
          <div><span className="etykieta">{t('Wartość [PLN]')}</span><p className="py-1 font-semibold">{zl(k.robocizna.wartosc)}</p></div>
          <div className="col-span-2"><span className="etykieta">{t('Czas')}</span><p className="py-1">{k.robocizna.dni !== null ? t('{0} dni przy {1} osobach (8 h)', liczba(k.robocizna.dni, 1), liczba(aparat.liczba_osob)) : '-'}</p></div>
        </section>
      ) : (
        <section className="sekcja space-y-2">
          <table className="w-full border-collapse">
            <thead><tr>{[t('Lp'), 'MPK', t('Rodzaj pracy / stanowisko'), t('Ilość rbh'), t('Stawka PLN/rbh'), t('Wartość PLN'), t('Uwagi'), ''].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
            <tbody>
              {wiersze.map((p, i) => (
                <tr key={p.klucz}>
                  <td className="komorka w-8 text-center text-xs">{i + 1}</td>
                  <td className="komorka w-24">
                    <select className="pole-komorki" disabled={tylkoOdczyt} value={p.mpk ?? ''} onChange={(e) => ustPoz(p.klucz, { mpk: e.target.value || null })}>
                      <option value="">-</option>{s.mpk.map((m) => <option key={m.kod} value={m.kod}>{m.kod}{m.opis ? ` ${m.opis}` : ''}</option>)}
                    </select>
                  </td>
                  <td className="komorka min-w-[14rem]">
                    <div className="flex gap-1">
                      <input className="pole-komorki" disabled={tylkoOdczyt} value={p.nazwa} onChange={(e) => ustPoz(p.klucz, { nazwa: e.target.value })} />
                      {!tylkoOdczyt && (
                        <select className="pole-komorki w-8" title={t('Wybierz ze słownika stawek')} value="" onChange={(e) => {
                          const st = aktywne.find((x) => String(x.id) === e.target.value)
                          if (st) ustPoz(p.klucz, { nazwa: st.rodzaj_pracy, stawka_id: st.id, cena_jedn: Number(st.stawka), mpk: st.mpk_kod ?? p.mpk })
                        }}>
                          <option value="">▾</option>{aktywne.map((x) => <option key={x.id} value={x.id}>{x.rodzaj_pracy} - {zl(x.stawka)}</option>)}
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="komorka w-24"><PoleLiczby wartosc={p.ilosc} disabled={tylkoOdczyt} zmien={(n) => ustPoz(p.klucz, { ilosc: n ?? 0 })} /></td>
                  <td className="komorka w-24" title={p.stawka_id ? t('Stawka ze słownika - można nadpisać dla tego projektu') : undefined}>
                    <PoleLiczby wartosc={p.cena_jedn} disabled={tylkoOdczyt} zmien={(n) => ustPoz(p.klucz, { cena_jedn: n ?? 0 })} />
                  </td>
                  <td className="komorka liczba w-28">{zl(p.wartosc_reczna ?? p.ilosc * p.cena_jedn)}</td>
                  <td className="komorka"><input className="pole-komorki" disabled={tylkoOdczyt} value={p.uwagi ?? ''} onChange={(e) => ustPoz(p.klucz, { uwagi: e.target.value || null })} /></td>
                  <td className="komorka w-8 text-center">{!tylkoOdczyt && <button className="text-slate-400 hover:text-red-600" onClick={() => zmien((a) => ({ ...a, pozycje: a.pozycje.filter((x) => x.klucz !== p.klucz) }))}><Trash2 className="h-4 w-4" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            {!tylkoOdczyt ? (
              <Button rozmiar="maly" wariant="cichy" onClick={() => zmien((a) => ({ ...a, pozycje: [...a.pozycje, {
                klucz: klucz(), lp: 0, zakladka: 'robocizna', sekcja: null, nazwa: domyslna?.rodzaj_pracy ?? '', ilosc: 0, jm: 'rbh',
                cena_jedn: Number(domyslna?.stawka ?? 0), stawka_id: domyslna?.id ?? null, jednostka_ceny: 'jm', zrodlo_ceny: 'recznie', dodatkowe: {},
              }] }))}><Plus className="h-3 w-3" /> wiersz</Button>
            ) : <span />}
            <div className="flex gap-4">
              <span>{t('Razem:')}{' '}<strong>{liczba(k.robocizna.rbh, 1)} rbh</strong></span>
              <span><strong>{zl(k.robocizna.wartosc)} PLN</strong></span>
              <span>{t('rbh/t:')}{' '}<strong>{k.robocizna.rbh_na_t !== null ? liczba(k.robocizna.rbh_na_t, 1) : '-'}</strong></span>
              <span>{t('średnia stawka:')}{' '}<strong>{k.robocizna.srednia_stawka !== null ? zl(k.robocizna.srednia_stawka) : '-'}</strong></span>
            </div>
          </div>
        </section>
      )}

      <PodobneZlecenia aparat={aparat} wycenaId={wycenaId} tylkoOdczyt={tylkoOdczyt} przyjmij={(n) => ust({ wskaznik_rbh_t: n })} />
    </div>
  )
}
