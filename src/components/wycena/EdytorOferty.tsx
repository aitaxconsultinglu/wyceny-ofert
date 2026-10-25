import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, FileDown, Plus, Sparkles, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSlowniki } from '@/lib/slowniki'
import { dataPL, liczba, zl } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { WynikWyceny } from '@/lib/kalkulacja'
import type { StanWyceny, Wycena } from '@/lib/wyceny'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { t } from '@/i18n'

type Kategoria = 'obejmuje' | 'nie_obejmuje' | 'uwagi'
interface Klauzula { id: number; kategoria: Kategoria; tekst: string; tagi: string[]; kolejnosc: number }

export interface OfertaWyceny {
  obejmuje: string[]
  nie_obejmuje: string[]
  uwagi: string[]
  zmienne: Record<string, string>
  termin_realizacji: string
  gwarancja_mies: number
  waznosc_dni: number
  platnosc: string
  waluta: 'PLN' | 'EUR'
  pokaz_wariant: boolean
  opis_wariantu: string
  data: string
  podpis: string
  przedmiot: string
}

const TYTULY: Record<Kategoria, string> = { obejmuje: t('Oferta obejmuje'), nie_obejmuje: t('Oferta nie obejmuje'), uwagi: t('Uwagi') }

/** Podstawia {zmienne}; brakująca zmienna zostaje widoczna jako [nazwa]. */
export function podstaw(tekst: string, zmienne: Record<string, string>) {
  return tekst.replace(/\{(\w+)\}/g, (_, n: string) => (zmienne[n]?.trim() ? zmienne[n] : `[${n}]`))
}

interface Props {
  stan: StanWyceny
  wynik: WynikWyceny
  zmienWycene: (zm: Partial<Wycena>) => void
  widziMarze: boolean
  zapisz: () => Promise<boolean>
  zmieniony: boolean
}

export function EdytorOferty({ stan, wynik, zmienWycene, widziMarze, zapisz, zmieniony }: Props) {
  const s = useSlowniki()
  const w = stan.wycena
  const [klauzule, setKlauzule] = useState<Klauzula[]>([])
  const [nowa, setNowa] = useState<Record<Kategoria, string>>({ obejmuje: '', nie_obejmuje: '', uwagi: '' })
  const [cenaZatw, setCenaZatw] = useState<{ cena_koncowa: number; cena_bez_opcji: number | null } | null>(null)
  const [zapytanie, setZapytanie] = useState<{ nr_zapytania_klienta: string | null } | null>(null)
  const [blad, setBlad] = useState<string | null>(null)

  useEffect(() => {
    void supabase.from('klauzule').select('*').eq('aktywna', true).order('kategoria').order('kolejnosc').then(({ data }) => setKlauzule((data ?? []) as Klauzula[]))
    void supabase.from('zapytania').select('nr_zapytania_klienta').eq('id', stan.zapytanie.id).single().then(({ data }) => setZapytanie(data))
  }, [stan.zapytanie.id])
  useEffect(() => {
    if (w.status !== 'zatwierdzona') { setCenaZatw(null); return }
    void supabase.rpc('cena_zatwierdzona', { p_wycena: w.id }).then(({ data }) => setCenaZatw((data as { cena_koncowa: number; cena_bez_opcji: number | null }[] | null)?.[0] ?? null))
  }, [w.id, w.status])

  const domyslne = s.ustawienia.oferta_domyslne
  const masa = wynik.masa_kg
  const o: OfertaWyceny = useMemo(() => ({
    obejmuje: [], nie_obejmuje: [], uwagi: [], zmienne: {},
    termin_realizacji: w.termin_realizacji_tyg ? `${w.termin_realizacji_tyg} tygodni od daty otrzymania zamówienia` : '',
    gwarancja_mies: domyslne.gwarancja_mies, waznosc_dni: domyslne.waznosc_dni, platnosc: domyslne.platnosc,
    waluta: 'PLN', pokaz_wariant: wynik.ma_opcje, opis_wariantu: 'bez pozycji opcjonalnych', data: new Date().toISOString().slice(0, 10),
    podpis: '', przedmiot: stan.zapytanie.przedmiot,
    ...(w.oferta as Partial<OfertaWyceny>),
  }), [w.oferta, w.termin_realizacji_tyg, domyslne, stan.zapytanie.przedmiot, wynik.ma_opcje])

  const ust = (zm: Partial<OfertaWyceny>) => zmienWycene({ oferta: { ...o, ...zm } as unknown as Record<string, unknown> })

  // Zmienne użyte w wybranych klauzulach + wartości podpowiadane z wyceny.
  const automatyczne: Record<string, string> = {
    masa_kg: masa ? liczba(masa, 0) : '', przedmiot: stan.zapytanie.przedmiot,
    gatunki: [...new Set(stan.aparaty.map((a) => a.material_wiodacy).filter(Boolean))].join('/'),
    termin_tyg: w.termin_realizacji_tyg ? String(w.termin_realizacji_tyg) : '',
    podstawa_wykonania: 'dokumentacji zamawiającego',
  }
  const zmienne = { ...automatyczne, ...o.zmienne }
  const uzyte = [...new Set([...o.obejmuje, ...o.nie_obejmuje, ...o.uwagi].flatMap((t) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1])))]

  function przelacz(k: Klauzula) {
    const lista = o[k.kategoria]
    ust({ [k.kategoria]: lista.includes(k.tekst) ? lista.filter((t) => t !== k.tekst) : [...lista, k.tekst] } as Partial<OfertaWyceny>)
  }
  function przesun(kat: Kategoria, i: number, kier: -1 | 1) {
    const l = [...o[kat]]
    const j = i + kier
    if (j < 0 || j >= l.length) return
    ;[l[i], l[j]] = [l[j], l[i]]
    ust({ [kat]: l } as Partial<OfertaWyceny>)
  }

  const cena = widziMarze ? wynik.cena_koncowa : cenaZatw?.cena_koncowa ?? null
  const cenaBezOpcji = widziMarze ? wynik.cena_bez_opcji : cenaZatw?.cena_bez_opcji ?? null
  const projekt = w.status !== 'zatwierdzona'

  async function pobierz() {
    setBlad(null)
    if (cena === null) { setBlad(t('Cena będzie dostępna po zatwierdzeniu wyceny przez prezesa.')); return }
    if (zmieniony && !(await zapisz())) return
    const { ofertaDlaKlienta } = await import('@/lib/eksportWord')
    await ofertaDlaKlienta({
      numer: stan.zapytanie.numer, data: dataPL(o.data), klient: stan.zapytanie.klient ?? '', nr_zapytania_klienta: zapytanie?.nr_zapytania_klienta ?? '',
      przedmiot: podstaw(o.przedmiot, zmienne),
      pozycje: stan.aparaty.map((a, i) => ({ nazwa: a.nazwa, ilosc: a.ilosc, material: a.material_wiodacy ?? '', masa_kg: a.masa_netto_kg ? a.masa_netto_kg * a.ilosc : null, cena: widziMarze ? wynik.aparaty[i]?.cena ?? null : null })),
      cena_netto: cena, cena_bez_opcji: o.pokaz_wariant ? cenaBezOpcji : null, opis_wariantu: o.opis_wariantu,
      vat_proc: domyslne.vat_proc, waluta: o.waluta, kurs_eur: w.kurs_eur,
      obejmuje: o.obejmuje.map((t) => podstaw(t, zmienne)), nie_obejmuje: o.nie_obejmuje.map((t) => podstaw(t, zmienne)), uwagi: o.uwagi.map((t) => podstaw(t, zmienne)),
      termin_realizacji: podstaw(o.termin_realizacji, zmienne), gwarancja: `${o.gwarancja_mies} miesięcy`, waznosc: `${o.waznosc_dni} dni`, platnosc: o.platnosc,
      podpis: o.podpis, projekt,
    }, s.ustawienia.firma)
  }

  return (
    <div className="space-y-4">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {projekt && <Komunikat rodzaj="ostrzezenie">{t('Wycena nie jest zatwierdzona - dokument dostanie oznaczenie „PROJEKT OFERTY”.')}</Komunikat>}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="sekcja space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">{t('Biblioteka klauzul')}</h4>
            <Button rozmiar="maly" wariant="cichy" disabled title={t('Propozycja zestawu klauzul z karty analizy - etap 4 (AI)')}><Sparkles className="h-3 w-3" /> {t('AI: zaproponuj')}</Button>
          </div>
          {(['obejmuje', 'nie_obejmuje', 'uwagi'] as Kategoria[]).map((kat) => (
            <div key={kat}>
              <p className="etykieta">{TYTULY[kat]}</p>
              <ul className="space-y-0.5 text-sm">
                {klauzule.filter((k) => k.kategoria === kat).map((k) => (
                  <li key={k.id}>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={o[kat].includes(k.tekst)} onChange={() => przelacz(k)} />
                      <span>{k.tekst}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-slate-500">{t('Bibliotekę rozbudowuje administrator. Własne punkty dopiszesz po prawej.')}</p>
        </section>

        <section className="sekcja space-y-3">
          <h4 className="text-sm font-semibold">{t('Treść oferty')}</h4>
          <label className="block"><span className="etykieta">{t('Przedmiot oferty')}</span><input className="pole" value={o.przedmiot} onChange={(e) => ust({ przedmiot: e.target.value })} /></label>
          {(['obejmuje', 'nie_obejmuje', 'uwagi'] as Kategoria[]).map((kat) => (
            <div key={kat}>
              <p className="etykieta">{TYTULY[kat]}</p>
              <ul className="space-y-1">
                {o[kat].map((t, i) => (
                  <li key={`${kat}${i}`} className="flex items-start gap-1">
                    <textarea className="pole min-h-[2.2rem] flex-1 text-sm" rows={1} value={t} onChange={(e) => ust({ [kat]: o[kat].map((x, j) => (j === i ? e.target.value : x)) } as Partial<OfertaWyceny>)} />
                    <button className="p-1 text-slate-400 hover:text-slate-700" onClick={() => przesun(kat, i, -1)}><ArrowUp className="h-3 w-3" /></button>
                    <button className="p-1 text-slate-400 hover:text-slate-700" onClick={() => przesun(kat, i, 1)}><ArrowDown className="h-3 w-3" /></button>
                    <button className="p-1 text-slate-400 hover:text-red-600" onClick={() => ust({ [kat]: o[kat].filter((_, j) => j !== i) } as Partial<OfertaWyceny>)}><Trash2 className="h-3 w-3" /></button>
                  </li>
                ))}
              </ul>
              <div className="mt-1 flex gap-1">
                <input className="pole text-sm" placeholder={t('własny punkt...')} value={nowa[kat]} onChange={(e) => setNowa({ ...nowa, [kat]: e.target.value })} />
                <Button rozmiar="maly" disabled={!nowa[kat].trim()} onClick={() => { ust({ [kat]: [...o[kat], nowa[kat].trim()] } as Partial<OfertaWyceny>); setNowa({ ...nowa, [kat]: '' }) }}><Plus className="h-3 w-3" /></Button>
              </div>
            </div>
          ))}

          {uzyte.length > 0 && (
            <div>
              <p className="etykieta">{t('Zmienne w klauzulach')}</p>
              <div className="grid gap-2 md:grid-cols-2">
                {uzyte.map((n) => (
                  <label key={n} className="text-sm"><span className="text-xs text-slate-500">{`{${n}}`}</span>
                    <input className={cn('pole', !zmienne[n] && 'border-amber-400')} value={o.zmienne[n] ?? automatyczne[n] ?? ''} onChange={(e) => ust({ zmienne: { ...o.zmienne, [n]: e.target.value } })} />
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-2">
            <label className="text-sm md:col-span-2"><span className="etykieta">{t('Termin realizacji')}</span><input className="pole" value={o.termin_realizacji} onChange={(e) => ust({ termin_realizacji: e.target.value })} /></label>
            <label className="text-sm"><span className="etykieta">{t('Gwarancja [mies.]')}</span><input type="number" className="pole" value={o.gwarancja_mies} onChange={(e) => ust({ gwarancja_mies: Number(e.target.value) })} /></label>
            <label className="text-sm"><span className="etykieta">{t('Ważność oferty [dni]')}</span><input type="number" className="pole" value={o.waznosc_dni} onChange={(e) => ust({ waznosc_dni: Number(e.target.value) })} /></label>
            <label className="text-sm"><span className="etykieta">{t('Płatność')}</span><input className="pole" value={o.platnosc} onChange={(e) => ust({ platnosc: e.target.value })} /></label>
            <label className="text-sm"><span className="etykieta">{t('Data oferty')}</span><input type="date" className="pole" value={o.data} onChange={(e) => ust({ data: e.target.value })} /></label>
            <label className="text-sm"><span className="etykieta">{t('Waluta oferty')}</span>
              <select className="pole" value={o.waluta} onChange={(e) => ust({ waluta: e.target.value as 'PLN' | 'EUR' })}><option>PLN</option><option>EUR</option></select></label>
            <label className="text-sm"><span className="etykieta">{t('Podpis (stanowisko)')}</span><input className="pole" placeholder={t('np. Dział handlowy')} value={o.podpis} onChange={(e) => ust({ podpis: e.target.value })} /></label>
            {wynik.ma_opcje && (
              <label className="flex items-center gap-2 text-sm md:col-span-2">
                <input type="checkbox" checked={o.pokaz_wariant} onChange={(e) => ust({ pokaz_wariant: e.target.checked })} /> {t('pokaż wariant')}
                <input className="pole" value={o.opis_wariantu} onChange={(e) => ust({ opis_wariantu: e.target.value })} />
              </label>
            )}
          </div>
          {o.waluta === 'EUR' && !w.kurs_eur && <p className="text-xs text-amber-700">{t('Ustaw kurs EUR w zakładce Podsumowanie.')}</p>}
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <span className="text-sm">{cena !== null ? <>{t('Cena netto:')}{' '}<strong>{zl(cena)} PLN</strong></> : <span className="text-slate-500">{t('Cena po zatwierdzeniu przez prezesa.')}</span>}</span>
            <Button wariant="glowny" disabled={cena === null} onClick={() => void pobierz()}><FileDown className="h-4 w-4" /> {t('Oferta (Word)')}</Button>
          </div>
        </section>
      </div>
    </div>
  )
}
