import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Bold, ChevronDown, ChevronRight, Eye, EyeOff, FileDown, GripVertical, History, List, Plus, Save, Trash2, Wand2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSlowniki } from '@/lib/slowniki'
import { dataGodzinaPL, dataPL, liczba, zl } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { WynikWyceny } from '@/lib/kalkulacja'
import type { StanWyceny, Wycena } from '@/lib/wyceny'
import { uzupelnijKarte, type KartaAnalizy } from '@/lib/analiza'
import { klauzuleZAnalizy, zmienneOferty } from '@/lib/przygotowanie'
import {
  brakujaceZmienne, dodajWersje, idSekcji, klauzulaWJezyku, normalizujOferte, podstaw, przesunSekcje, przywrocWersje, rozbierzTekst,
  tytulSekcji, zmienneWTekstach, type Kategoria, type OfertaWyceny, type SekcjaOferty,
} from '@/lib/ofertaKlienta'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { t } from '@/i18n'

export { podstaw, type OfertaWyceny } from '@/lib/ofertaKlienta'

interface Klauzula { id: number; kategoria: Kategoria; tekst: string; tekst_en: string | null; tagi: string[]; kolejnosc: number }

const TYTULY: Record<Kategoria, string> = { obejmuje: t('Oferta obejmuje'), nie_obejmuje: t('Oferta nie obejmuje'), uwagi: t('Uwagi') }

interface Props {
  stan: StanWyceny
  wynik: WynikWyceny
  zmienWycene: (zm: Partial<Wycena>) => void
  widziMarze: boolean
  zapisz: () => Promise<boolean>
  zmieniony: boolean
  kto: string
}

/** Tekst ze zmiennymi: {zmienna} z wartością - niebieska, bez wartości - czerwona ramka. */
function Podglad({ tekst, zmienne }: { tekst: string; zmienne: Record<string, string> }) {
  if (!tekst.trim()) return null
  const zmiennaWTekscie = (s: string, k: string) => s.split(/(\{\w+\})/).map((f, i) => {
    const m = /^\{(\w+)\}$/.exec(f)
    if (!m) return <span key={`${k}${i}`}>{f}</span>
    const v = zmienne[m[1]]?.trim()
    return v ? <span key={`${k}${i}`} className="rounded bg-blekit-jasny px-0.5">{v}</span>
      : <span key={`${k}${i}`} className="rounded px-0.5 text-red-700 ring-1 ring-red-400" title={t('Brak wartości zmiennej')}>{f}</span>
  })
  return (
    <div className="rounded border border-slate-100 bg-slate-50 p-2 text-sm">
      {rozbierzTekst(tekst).map((l, i) => (
        <p key={i} className={cn(l.punkt && 'ml-4 list-item list-disc')}>
          {l.fragmenty.map((f, j) => (f.pogrubiony ? <strong key={j}>{zmiennaWTekscie(f.tekst, `${i}-${j}`)}</strong> : <span key={j}>{zmiennaWTekscie(f.tekst, `${i}-${j}`)}</span>))}
        </p>
      ))}
    </div>
  )
}

/** Pole tekstu sekcji z prostym formatowaniem (pogrubienie, punkty) i podglądem. */
function TekstSekcji({ wartosc, zmien, zmienne }: { wartosc: string; zmien: (v: string) => void; zmienne: Record<string, string> }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const pogrub = () => {
    const el = ref.current
    if (!el) return
    const [a, b] = [el.selectionStart, el.selectionEnd]
    zmien(`${wartosc.slice(0, a)}**${wartosc.slice(a, b) || t('tekst')}**${wartosc.slice(b)}`)
  }
  const punkty = () => {
    const el = ref.current
    if (!el) return
    const a = wartosc.lastIndexOf('\n', el.selectionStart - 1) + 1
    const b = wartosc.indexOf('\n', el.selectionEnd)
    const kon = b < 0 ? wartosc.length : b
    zmien(wartosc.slice(0, a) + wartosc.slice(a, kon).split('\n').map((l) => (/^\s*[-•]\s/.test(l) ? l.replace(/^\s*[-•]\s/, '') : `- ${l}`)).join('\n') + wartosc.slice(kon))
  }
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <button type="button" className="rounded p-1 hover:bg-slate-100" title={t('Pogrubienie')} onClick={pogrub}><Bold className="h-3.5 w-3.5" /></button>
        <button type="button" className="rounded p-1 hover:bg-slate-100" title={t('Lista punktowana')} onClick={punkty}><List className="h-3.5 w-3.5" /></button>
        <span className="text-xs text-slate-400">{t('**pogrubienie**, „- ” na początku linii = punkt, {zmienna} = wartość podstawiana')}</span>
      </div>
      <textarea ref={ref} className="pole h-20 text-sm" value={wartosc} onChange={(e) => zmien(e.target.value)} />
      <Podglad tekst={wartosc} zmienne={zmienne} />
    </div>
  )
}

export function EdytorOferty({ stan, wynik, zmienWycene, widziMarze, zapisz, zmieniony, kto }: Props) {
  const s = useSlowniki()
  const w = stan.wycena
  const [klauzule, setKlauzule] = useState<Klauzula[]>([])
  const [karta, setKarta] = useState<KartaAnalizy | null>(null)
  const [nowa, setNowa] = useState<Record<Kategoria, string>>({ obejmuje: '', nie_obejmuje: '', uwagi: '' })
  const [cenaZatw, setCenaZatw] = useState<{ cena_koncowa: number; cena_bez_opcji: number | null } | null>(null)
  const [zapytanie, setZapytanie] = useState<{ nr_zapytania_klienta: string | null } | null>(null)
  const [otwarte, setOtwarte] = useState<Set<string>>(new Set(['dane']))
  const [przeciagana, setPrzeciagana] = useState<number | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    void supabase.from('klauzule').select('*').eq('aktywna', true).order('kategoria').order('kolejnosc').then(({ data }) => setKlauzule((data ?? []) as Klauzula[]))
    void supabase.from('zapytania').select('nr_zapytania_klienta').eq('id', stan.zapytanie.id).single().then(({ data }) => setZapytanie(data))
    void supabase.from('analizy_zapytan').select('dane').eq('zapytanie_id', stan.zapytanie.id).maybeSingle()
      .then(({ data }) => setKarta(data ? uzupelnijKarte(data.dane as Partial<KartaAnalizy>) : null))
  }, [stan.zapytanie.id])
  useEffect(() => {
    if (w.status !== 'zatwierdzona') { setCenaZatw(null); return }
    void supabase.rpc('cena_zatwierdzona', { p_wycena: w.id }).then(({ data }) => setCenaZatw((data as { cena_koncowa: number; cena_bez_opcji: number | null }[] | null)?.[0] ?? null))
  }, [w.id, w.status])

  const domyslne = s.ustawienia.oferta_domyslne
  const o = useMemo(() => normalizujOferte(w.oferta as Partial<OfertaWyceny>, {
    ...domyslne, przedmiot: stan.zapytanie.przedmiot, termin_tyg: w.termin_realizacji_tyg, numer: stan.zapytanie.numer, ma_opcje: wynik.ma_opcje,
  }), [w.oferta, w.termin_realizacji_tyg, domyslne, stan.zapytanie.przedmiot, stan.zapytanie.numer, wynik.ma_opcje])
  const ust = (zm: Partial<OfertaWyceny>) => zmienWycene({ oferta: { ...o, ...zm } as unknown as Record<string, unknown> })
  const ustSekcje = (id: string, zm: Partial<SekcjaOferty>) => ust({ sekcje: o.sekcje.map((x) => (x.id === id ? { ...x, ...zm } : x)) })
  const j = o.jezyk

  // Zmienne: z wyceny i karty analizy (automatyczne) + wpisane ręcznie (pierwszeństwo).
  const automatyczne: Record<string, string> = {
    ...zmienneOferty(karta, stan.aparaty),
    masa_kg: wynik.masa_kg ? liczba(wynik.masa_kg, 0) : '', przedmiot: stan.zapytanie.przedmiot,
    termin_tyg: w.termin_realizacji_tyg ? String(w.termin_realizacji_tyg) : '',
    podstawa_wykonania: t('dokumentacji zamawiającego'),
  }
  const zmienne = { ...automatyczne, ...Object.fromEntries(Object.entries(o.zmienne).filter(([, v]) => v.trim())) }
  const wszystkieTeksty = [o.przedmiot, o.termin_realizacji, ...o.obejmuje, ...o.nie_obejmuje, ...o.uwagi, ...o.sekcje.map((x) => x.tekst)]
  const uzyte = zmienneWTekstach(wszystkieTeksty)
  const brakuje = brakujaceZmienne(wszystkieTeksty, zmienne)

  const przelaczKlauzule = (k: Klauzula) => {
    const l = o[k.kategoria]
    ust({ [k.kategoria]: l.includes(k.tekst) ? l.filter((x) => x !== k.tekst) : [...l, k.tekst] } as Partial<OfertaWyceny>)
  }
  const przesunPunkt = (kat: Kategoria, i: number, kier: -1 | 1) => {
    const l = [...o[kat]]
    const k = i + kier
    if (k < 0 || k >= l.length) return
    ;[l[i], l[k]] = [l[k], l[i]]
    ust({ [kat]: l } as Partial<OfertaWyceny>)
  }
  const dobierz = () => {
    const d = klauzuleZAnalizy(karta, klauzule)
    ust({ obejmuje: [...new Set([...o.obejmuje, ...d.obejmuje])], nie_obejmuje: [...new Set([...o.nie_obejmuje, ...d.nie_obejmuje])], uwagi: [...new Set([...o.uwagi, ...d.uwagi])] })
    setInfo(t('Dobrano klauzule do wymagań z karty analizy (bez AI).'))
  }
  const przelacz = (id: string) => setOtwarte((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const cena = widziMarze ? wynik.cena_koncowa : cenaZatw?.cena_koncowa ?? null
  const cenaBezOpcji = widziMarze ? wynik.cena_bez_opcji : cenaZatw?.cena_bez_opcji ?? null
  const projekt = w.status !== 'zatwierdzona'

  async function pobierz() {
    setBlad(null)
    if (cena === null) { setBlad(t('Cena będzie dostępna po zatwierdzeniu wyceny przez prezesa.')); return }
    if (zmieniony && !(await zapisz())) return
    const kl = (l: string[]) => l.map((x) => podstaw(klauzulaWJezyku(x, j, klauzule), zmienne))
    const { ofertaDlaKlienta } = await import('@/lib/eksportWord')
    await ofertaDlaKlienta({
      numer: stan.zapytanie.numer, numer_oferty: o.numer_oferty, data: dataPL(o.data), klient: stan.zapytanie.klient ?? '', nr_zapytania_klienta: zapytanie?.nr_zapytania_klienta ?? '',
      osoba_kontaktowa: o.osoba_kontaktowa, nazwa_projektu: o.nazwa_projektu, przedmiot: podstaw(o.przedmiot, zmienne),
      pozycje: stan.aparaty.map((a, i) => ({ nazwa: a.nazwa, ilosc: a.ilosc, material: a.material_wiodacy ?? '', masa_kg: a.masa_netto_kg ? a.masa_netto_kg * a.ilosc : null, cena: widziMarze ? wynik.aparaty[i]?.cena ?? null : null })),
      cena_netto: cena, cena_bez_opcji: o.pokaz_wariant ? cenaBezOpcji : null, opis_wariantu: o.opis_wariantu,
      vat_proc: domyslne.vat_proc, waluta: o.waluta, kurs_eur: w.kurs_eur,
      obejmuje: kl(o.obejmuje), nie_obejmuje: kl(o.nie_obejmuje), uwagi: kl(o.uwagi),
      termin_realizacji: podstaw(o.termin_realizacji, zmienne),
      gwarancja: j === 'en' ? `${o.gwarancja_mies} months` : `${o.gwarancja_mies} miesięcy`, waznosc: j === 'en' ? `${o.waznosc_dni} days` : `${o.waznosc_dni} dni`,
      platnosc: o.platnosc, incoterms: o.incoterms, miejsce_dostawy: o.miejsce_dostawy, kary: o.kary, zaliczki: o.zaliczki, zalaczniki: o.zalaczniki,
      podpis: o.podpis, projekt, jezyk: j,
      sekcje: o.sekcje.filter((x) => x.widoczna).map((x) => ({ rodzaj: x.rodzaj, tytul: x.tytul, tekst: podstaw(x.tekst, zmienne) })),
    }, s.ustawienia.firma)
  }

  const pole = (et: string, el: ReactNode, szer = '') => <label className={cn('text-sm', szer)}><span className="etykieta">{et}</span>{el}</label>

  function trescSekcji(x: SekcjaOferty) {
    switch (x.rodzaj) {
      case 'dane':
        return (
          <div className="grid gap-2 md:grid-cols-3">
            {pole(t('Numer oferty'), <input className="pole" value={o.numer_oferty} onChange={(e) => ust({ numer_oferty: e.target.value })} />)}
            {pole(t('Data oferty'), <input type="date" className="pole" value={o.data} onChange={(e) => ust({ data: e.target.value })} />)}
            {pole(t('Ważność oferty [dni]'), <input type="number" className="pole" value={o.waznosc_dni} onChange={(e) => ust({ waznosc_dni: Number(e.target.value) })} />)}
            {pole(t('Klient'), <p className="py-1">{stan.zapytanie.klient ?? '-'}</p>)}
            {pole(t('Osoba kontaktowa'), <input className="pole" value={o.osoba_kontaktowa} onChange={(e) => ust({ osoba_kontaktowa: e.target.value })} />)}
            {pole(t('Nr zapytania klienta'), <p className="py-1">{zapytanie?.nr_zapytania_klienta ?? '-'}</p>)}
            {pole(t('Nazwa projektu / zapytania'), <input className="pole" value={o.nazwa_projektu} onChange={(e) => ust({ nazwa_projektu: e.target.value })} />, 'md:col-span-2')}
            {pole(t('Język oferty'), (
              <select className="pole" value={j} onChange={(e) => ust({ jezyk: e.target.value as 'pl' | 'en' })}><option value="pl">{t('polski')}</option><option value="en">{t('angielski')}</option></select>
            ))}
          </div>
        )
      case 'przedmiot':
        return (
          <div className="space-y-2">
            {pole(t('Przedmiot oferty'), <input className="pole" value={o.przedmiot} onChange={(e) => ust({ przedmiot: e.target.value })} />)}
            <table className="w-full border-collapse text-sm">
              <thead><tr>{[t('Aparat / element'), t('Ilość'), t('Masa [kg]'), t('Cena jedn.'), t('Wartość')].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
              <tbody>
                {stan.aparaty.map((a, i) => (
                  <tr key={a.klucz}>
                    <td className="komorka">{a.nazwa}{a.material_wiodacy ? ` · ${a.material_wiodacy}` : ''}</td>
                    <td className="komorka liczba">{liczba(a.ilosc)}</td>
                    <td className="komorka liczba">{a.masa_netto_kg ? liczba(a.masa_netto_kg * a.ilosc, 0) : ''}</td>
                    <td className="komorka liczba">{widziMarze && wynik.aparaty[i]?.cena_szt !== null ? zl(wynik.aparaty[i].cena_szt) : ''}</td>
                    <td className="komorka liczba">{widziMarze && wynik.aparaty[i]?.cena !== null ? zl(wynik.aparaty[i].cena) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {wynik.ma_opcje && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={o.pokaz_wariant} onChange={(e) => ust({ pokaz_wariant: e.target.checked })} /> {t('pokaż wariant')}
                <input className="pole" value={o.opis_wariantu} onChange={(e) => ust({ opis_wariantu: e.target.value })} />
              </label>
            )}
          </div>
        )
      case 'zakres':
      case 'uwagi': {
        const kategorie: Kategoria[] = x.rodzaj === 'zakres' ? ['obejmuje', 'nie_obejmuje'] : ['uwagi']
        return (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="etykieta">{t('Biblioteka klauzul')}</span>
                <Button rozmiar="maly" wariant="cichy" onClick={dobierz} title={t('Klauzule dobrane tagami do wymagań kosztotwórczych z karty analizy')}><Wand2 className="h-3 w-3" /> {t('Dobierz wg karty analizy')}</Button>
              </div>
              {kategorie.map((kat) => (
                <div key={kat}>
                  <p className="text-xs font-medium text-slate-500">{TYTULY[kat]}</p>
                  <ul className="space-y-0.5 text-sm">
                    {klauzule.filter((k) => k.kategoria === kat).map((k) => (
                      <li key={k.id}><label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={o[kat].includes(k.tekst)} onChange={() => przelaczKlauzule(k)} />
                        <span>{klauzulaWJezyku(k.tekst, j, klauzule)}</span></label></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {kategorie.map((kat) => (
                <div key={kat}>
                  <p className="etykieta">{TYTULY[kat]}</p>
                  <ul className="space-y-1">
                    {o[kat].map((tx, i) => (
                      <li key={`${kat}${i}`} className="flex items-start gap-1">
                        <textarea className="pole min-h-[2.2rem] flex-1 text-sm" rows={1} value={tx} onChange={(e) => ust({ [kat]: o[kat].map((y, k) => (k === i ? e.target.value : y)) } as Partial<OfertaWyceny>)} />
                        <button className="p-1 text-slate-400 hover:text-slate-700" onClick={() => przesunPunkt(kat, i, -1)}><ArrowUp className="h-3 w-3" /></button>
                        <button className="p-1 text-slate-400 hover:text-slate-700" onClick={() => przesunPunkt(kat, i, 1)}><ArrowDown className="h-3 w-3" /></button>
                        <button className="p-1 text-slate-400 hover:text-red-600" onClick={() => ust({ [kat]: o[kat].filter((_, k) => k !== i) } as Partial<OfertaWyceny>)}><Trash2 className="h-3 w-3" /></button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 flex gap-1">
                    <input className="pole text-sm" placeholder={t('własny punkt...')} value={nowa[kat]} onChange={(e) => setNowa({ ...nowa, [kat]: e.target.value })} />
                    <Button rozmiar="maly" disabled={!nowa[kat].trim()} onClick={() => { ust({ [kat]: [...o[kat], nowa[kat].trim()] } as Partial<OfertaWyceny>); setNowa({ ...nowa, [kat]: '' }) }}><Plus className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      }
      case 'warunki':
        return (
          <div className="grid gap-2 md:grid-cols-3">
            {pole(t('Termin realizacji'), <input className="pole" value={o.termin_realizacji} onChange={(e) => ust({ termin_realizacji: e.target.value })} />, 'md:col-span-2')}
            {pole(t('Gwarancja [mies.]'), <input type="number" className="pole" value={o.gwarancja_mies} onChange={(e) => ust({ gwarancja_mies: Number(e.target.value) })} />)}
            {pole(t('Forma i termin płatności'), <input className="pole" value={o.platnosc} onChange={(e) => ust({ platnosc: e.target.value })} />, 'md:col-span-2')}
            {pole(t('Zaliczki'), <input className="pole" value={o.zaliczki} onChange={(e) => ust({ zaliczki: e.target.value })} />)}
            {pole(t('Warunki dostawy (Incoterms)'), <input className="pole" placeholder="FCA, DAP..." value={o.incoterms} onChange={(e) => ust({ incoterms: e.target.value })} />)}
            {pole(t('Miejsce dostawy'), <input className="pole" placeholder={karta?.podsumowanie.miejsce_dostawy} value={o.miejsce_dostawy} onChange={(e) => ust({ miejsce_dostawy: e.target.value })} />)}
            {pole(t('Kary umowne'), <input className="pole" value={o.kary} onChange={(e) => ust({ kary: e.target.value })} />)}
            <p className="text-xs text-slate-500 md:col-span-3">{t('Materiały, normy, badania, odbiory, dokumentację opisz w tekście sekcji poniżej.')}</p>
          </div>
        )
      case 'cena':
        return (
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <span>{cena !== null ? <>{t('Cena netto:')}{' '}<strong>{zl(cena)} PLN</strong></> : <span className="text-slate-500">{t('Cena po zatwierdzeniu przez prezesa.')}</span>}</span>
            {pole(t('Waluta oferty'), <select className="pole w-24" value={o.waluta} onChange={(e) => ust({ waluta: e.target.value as 'PLN' | 'EUR' })}><option>PLN</option><option>EUR</option></select>)}
            {o.waluta === 'EUR' && (w.kurs_eur
              ? <span>{t('kurs {0} PLN/EUR', liczba(w.kurs_eur, 4))}{cena !== null && <> = <strong>{zl(cena / w.kurs_eur)} EUR</strong></>}</span>
              : <span className="text-xs text-amber-700">{t('Ustaw kurs EUR w zakładce Podsumowanie.')}</span>)}
            <span className="text-xs text-slate-500">{t('W ofercie nie pokazujemy kosztów ani marż.')}</span>
          </div>
        )
      case 'zalaczniki':
        return (
          <div className="space-y-1">
            {o.zalaczniki.map((z, i) => (
              <div key={i} className="flex gap-1">
                <input className="pole text-sm" value={z} onChange={(e) => ust({ zalaczniki: o.zalaczniki.map((y, k) => (k === i ? e.target.value : y)) })} />
                <button className="p-1 text-slate-400 hover:text-red-600" onClick={() => ust({ zalaczniki: o.zalaczniki.filter((_, k) => k !== i) })}><Trash2 className="h-3 w-3" /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button rozmiar="maly" wariant="cichy" onClick={() => ust({ zalaczniki: [...o.zalaczniki, ''] })}><Plus className="h-3 w-3" /> {t('załącznik')}</Button>
              {karta?.podsumowanie.dokumenty_oferty && !o.zalaczniki.length && (
                <Button rozmiar="maly" wariant="cichy" onClick={() => ust({ zalaczniki: karta.podsumowanie.dokumenty_oferty.split(/[;\n]+/).map((x) => x.trim()).filter(Boolean) })}>{t('z karty analizy (dokumenty oferty)')}</Button>
              )}
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-3">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {info && <Komunikat rodzaj="sukces">{info}</Komunikat>}
      {projekt && <Komunikat rodzaj="ostrzezenie">{t('Wycena nie jest zatwierdzona - dokument dostanie oznaczenie „PROJEKT OFERTY”.')}</Komunikat>}

      <div className="flex flex-wrap items-center gap-2">
        <Button rozmiar="maly" onClick={() => setOtwarte(new Set(o.sekcje.map((x) => x.id)))}>{t('Rozwiń wszystkie')}</Button>
        <Button rozmiar="maly" onClick={() => setOtwarte(new Set())}>{t('Zwiń wszystkie')}</Button>
        <Button rozmiar="maly" onClick={() => { const opis = window.prompt(t('Opis wersji oferty (opcjonalnie):')) ?? ''; ust(dodajWersje(o, kto, opis)); setInfo(t('Zapisano wersję oferty - zapisz wycenę, aby utrwalić.')) }}><Save className="h-3 w-3" /> {t('Zapisz wersję oferty')}</Button>
        {o.wersje.length > 0 && (
          <label className="flex items-center gap-1 text-sm"><History className="h-4 w-4 text-slate-400" />
            <select className="pole w-64" value="" onChange={(e) => {
              const wer = o.wersje[Number(e.target.value)]
              if (wer && window.confirm(t('Przywrócić treść oferty z wersji {0}?', dataGodzinaPL(wer.czas)))) ust(przywrocWersje(o, wer))
            }}>
              <option value="">{t('Wersje oferty ({0})...', o.wersje.length)}</option>
              {o.wersje.map((wer, i) => <option key={wer.czas} value={i}>{dataGodzinaPL(wer.czas)} · {wer.kto}{wer.opis ? ` · ${wer.opis}` : ''}</option>)}
            </select></label>
        )}
        <div className="ml-auto flex items-center gap-2">
          {brakuje.length > 0 && <span className="text-xs text-red-700">{t('Brak wartości zmiennych: {0}', brakuje.map((n) => `{${n}}`).join(', '))}</span>}
          <Button wariant="glowny" disabled={cena === null} onClick={() => void pobierz()}><FileDown className="h-4 w-4" /> {j === 'en' ? t('Oferta (Word, EN)') : t('Oferta (Word)')}</Button>
        </div>
      </div>

      {o.sekcje.map((x, i) => {
        const otw = otwarte.has(x.id)
        return (
          <section key={x.id} className={cn('sekcja p-0', !x.widoczna && 'opacity-60', przeciagana !== null && przeciagana !== i && 'ring-1 ring-dashed ring-slate-200')}
            onDragOver={(e) => { if (przeciagana !== null) e.preventDefault() }}
            onDrop={() => { if (przeciagana !== null) ust({ sekcje: przesunSekcje(o.sekcje, przeciagana, i) }); setPrzeciagana(null) }}>
            <div className="flex items-center gap-2 px-3 py-2">
              <span draggable onDragStart={() => setPrzeciagana(i)} onDragEnd={() => setPrzeciagana(null)} className="cursor-grab text-slate-400" title={t('Przeciągnij, aby zmienić kolejność')}><GripVertical className="h-4 w-4" /></span>
              <button className="flex flex-1 items-center gap-1 text-left text-sm font-semibold" onClick={() => przelacz(x.id)}>
                {otw ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{i + 1}. {tytulSekcji(x, j)}
              </button>
              <button className="p-1 text-slate-400 hover:text-slate-700" title={x.widoczna ? t('Widoczna w wydruku - kliknij, aby ukryć') : t('Ukryta w wydruku - kliknij, aby pokazać')} onClick={() => ustSekcje(x.id, { widoczna: !x.widoczna })}>
                {x.widoczna ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
              <button className="p-1 text-slate-400 hover:text-slate-700" onClick={() => ust({ sekcje: przesunSekcje(o.sekcje, i, i - 1) })}><ArrowUp className="h-3.5 w-3.5" /></button>
              <button className="p-1 text-slate-400 hover:text-slate-700" onClick={() => ust({ sekcje: przesunSekcje(o.sekcje, i, i + 1) })}><ArrowDown className="h-3.5 w-3.5" /></button>
              {x.rodzaj === 'wlasna' && <button className="p-1 text-slate-400 hover:text-red-600" onClick={() => { if (window.confirm(t('Usunąć sekcję {0}?', tytulSekcji(x, j)))) ust({ sekcje: o.sekcje.filter((y) => y.id !== x.id) }) }}><Trash2 className="h-3.5 w-3.5" /></button>}
            </div>
            {otw && (
              <div className="space-y-3 border-t border-slate-100 px-3 py-3">
                <label className="block max-w-md text-sm"><span className="etykieta">{t('Tytuł sekcji')}</span>
                  <input className="pole" placeholder={tytulSekcji({ ...x, tytul: '' }, j)} value={x.tytul} onChange={(e) => ustSekcje(x.id, { tytul: e.target.value })} /></label>
                {trescSekcji(x)}
                <div>
                  <span className="etykieta">{x.rodzaj === 'wlasna' ? t('Treść') : t('Tekst dodatkowy sekcji')}</span>
                  <TekstSekcji wartosc={x.tekst} zmienne={zmienne} zmien={(v) => ustSekcje(x.id, { tekst: v })} />
                </div>
              </div>
            )}
          </section>
        )
      })}
      <Button rozmiar="maly" wariant="cichy" onClick={() => { const id = idSekcji(); ust({ sekcje: [...o.sekcje, { id, rodzaj: 'wlasna', tytul: t('Nowa sekcja'), tekst: '', widoczna: true }] }); setOtwarte((x) => new Set([...x, id])) }}>
        <Plus className="h-3 w-3" /> {t('Dodaj własną sekcję')}
      </Button>

      {uzyte.length > 0 && (
        <section className="sekcja space-y-2">
          <h4 className="text-sm font-semibold">{t('Zmienne oferty')}</h4>
          <div className="grid gap-2 md:grid-cols-3">
            {uzyte.map((n) => (
              <label key={n} className="text-sm"><span className="text-xs text-slate-500">{`{${n}}`}</span>
                <input className={cn('pole', !zmienne[n]?.trim() && 'border-red-400')} placeholder={automatyczne[n]} value={o.zmienne[n] ?? ''} onChange={(e) => ust({ zmienne: { ...o.zmienne, [n]: e.target.value } })} />
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500">{t('Puste pole = wartość z wyceny lub karty analizy (podpowiedź w polu). Czerwona ramka = brak wartości.')}</p>
        </section>
      )}
      <section className="sekcja grid gap-2 md:grid-cols-3">
        {pole(t('Podpis (stanowisko)'), <input className="pole" placeholder={t('np. Dział handlowy')} value={o.podpis} onChange={(e) => ust({ podpis: e.target.value })} />)}
      </section>
    </div>
  )
}
