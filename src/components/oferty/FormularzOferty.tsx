import { useEffect, useMemo, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSlowniki } from '@/lib/slowniki'
import { liczba, zl } from '@/lib/format'
import { cn } from '@/lib/utils'
import { kursNaDzien, przeliczPozycje, pustaPozycja, type FormularzOferty as Formularz, type PozycjaFormularza } from '@/lib/oferty'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { t } from '@/i18n'

interface Props {
  poczatkowy: Formularz
  zapisz: (f: Formularz, status: 'zatwierdzona' | 'do_przejrzenia') => Promise<void>
  anuluj: () => void
}

interface DostawcaListy { id: string; nazwa: string }
interface ZapytanieListy { id: string; numer: string; przedmiot: string }

const WYMAGANIA: { klucz: 'atest_31' | 'ped' | 'ut' | 'nft' | 'pochodzenie_ue' | 'udt'; etykieta: string }[] = [
  { klucz: 'atest_31', etykieta: t('atest 3.1') }, { klucz: 'ped', etykieta: t('PED') }, { klucz: 'ut', etykieta: t('UT') },
  { klucz: 'nft', etykieta: t('NFT') }, { klucz: 'pochodzenie_ue', etykieta: t('pochodzenie UE') }, { klucz: 'udt', etykieta: t('UDT') },
]

function Pole({ etykieta, children, className }: { etykieta: string; children: React.ReactNode; className?: string }) {
  return <label className={cn('block', className)}><span className="etykieta">{etykieta}</span>{children}</label>
}

/** Formularz oferty do sprawdzenia przez człowieka. Nic nie trafia do bazy bez zatwierdzenia. */
export function FormularzOferty({ poczatkowy, zapisz, anuluj }: Props) {
  const s = useSlowniki()
  const [f, setF] = useState<Formularz>(poczatkowy)
  const [dostawcy, setDostawcy] = useState<DostawcaListy[]>([])
  const [zapytania, setZapytania] = useState<ZapytanieListy[]>([])
  const [blad, setBlad] = useState<string | null>(null)
  const [zajety, setZajety] = useState(false)
  const [kursInfo, setKursInfo] = useState<string | null>(null)

  useEffect(() => {
    void supabase.from('dostawcy').select('id, nazwa').order('nazwa').then(({ data }) => setDostawcy((data ?? []) as DostawcaListy[]))
    void supabase.from('zapytania').select('id, numer, przedmiot').order('utworzono', { ascending: false }).limit(300)
      .then(({ data }) => setZapytania((data ?? []) as ZapytanieListy[]))
  }, [])

  // Kurs NBP z dnia oferty (albo ostatni wcześniejszy) - do zmiany ręcznie.
  useEffect(() => {
    if (f.waluta === 'PLN') { setF((x) => ({ ...x, kurs: 1, kurs_data: null, kurs_zrodlo: null })); setKursInfo(null); return }
    if (f.kurs_zrodlo === 'ręcznie') return
    let aktywne = true
    void kursNaDzien(f.waluta, f.data_oferty || new Date().toISOString().slice(0, 10)).then((k) => {
      if (!aktywne) return
      if (k) {
        setF((x) => ({ ...x, kurs: k.kurs, kurs_data: k.data, kurs_zrodlo: `NBP ${k.tabela ?? ''}`.trim() }))
        setKursInfo(t('Kurs NBP z {0}{1}', k.data, k.data !== f.data_oferty ? ' (ostatni przed datą oferty)' : ''))
      } else setKursInfo(t('Brak kursu {0} w bazie dla tej daty - wpisz kurs ręcznie.', f.waluta))
    })
    return () => { aktywne = false }
  }, [f.waluta, f.data_oferty]) // eslint-disable-line react-hooks/exhaustive-deps

  const ust = (zm: Partial<Formularz>) => setF((x) => ({ ...x, ...zm }))
  const ustPoz = (klucz: string, zm: Partial<PozycjaFormularza>) =>
    setF((x) => ({ ...x, pozycje: x.pozycje.map((p) => (p.klucz === klucz ? { ...p, ...zm } : p)) }))

  const slownikiObliczen = useMemo(() => ({ kategorieMaterialow: s.kategorieMaterialow, gatunki: s.gatunki, rodzajeStali: s.rodzajeStali }), [s])
  const podglad = useMemo(() => f.pozycje.map((p) => przeliczPozycje(p, f.kurs, slownikiObliczen)), [f.pozycje, f.kurs, slownikiObliczen])
  const suma = podglad.reduce((acc, p) => acc + p.ceny.wartosc_pln, 0)

  async function wykonaj(status: 'zatwierdzona' | 'do_przejrzenia') {
    setBlad(null)
    if (!f.dostawca_id && !f.dostawca_nowy?.nazwa.trim()) { setBlad(t('Wybierz dostawcę albo wpisz nazwę nowego.')); return }
    if (!f.pozycje.some((p) => p.opis.trim())) { setBlad(t('Oferta musi mieć co najmniej jedną pozycję.')); return }
    if (f.waluta !== 'PLN' && !(f.kurs > 0)) { setBlad(t('Podaj kurs waluty.')); return }
    setZajety(true)
    try { await zapisz(f, status) } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setZajety(false)
  }

  const opcjeKategorii = [
    ...s.kategorieMaterialow.map((k) => ({ wartosc: `m:${k.kod}`, etykieta: k.nazwa, grupa: 'Materiały' })),
    ...s.kategorieUslug.map((k) => ({ wartosc: `u:${k.kod}`, etykieta: k.nazwa, grupa: 'Usługi' })),
  ]

  return (
    <div className="space-y-4">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}

      <section className="sekcja space-y-3">
        <h3 className="text-sm font-semibold">{t('Nagłówek oferty')}</h3>
        <div className="flex flex-wrap gap-3">
          <Pole etykieta={t('Dostawca / kooperant')} className="w-72">
            <select className="pole" value={f.dostawca_id ?? ''} onChange={(e) => ust({ dostawca_id: e.target.value || null, dostawca_nowy: e.target.value ? null : f.dostawca_nowy ?? { nazwa: '', nip: '', osoba: '', email: '', telefon: '' } })}>
              <option value="">{t('- nowy dostawca -')}</option>
              {dostawcy.map((d) => <option key={d.id} value={d.id}>{d.nazwa}</option>)}
            </select>
          </Pole>
          {!f.dostawca_id && (
            <>
              <Pole etykieta={t('Nazwa nowego dostawcy')} className="w-64">
                <input className="pole" value={f.dostawca_nowy?.nazwa ?? ''} onChange={(e) => ust({ dostawca_nowy: { ...(f.dostawca_nowy ?? { nazwa: '', nip: '', osoba: '', email: '', telefon: '' }), nazwa: e.target.value } })} />
              </Pole>
              <Pole etykieta="NIP" className="w-36">
                <input className="pole" value={f.dostawca_nowy?.nip ?? ''} onChange={(e) => ust({ dostawca_nowy: { ...f.dostawca_nowy!, nip: e.target.value } })} />
              </Pole>
              <Pole etykieta={t('E-mail kontaktowy')} className="w-56">
                <input className="pole" value={f.dostawca_nowy?.email ?? ''} onChange={(e) => ust({ dostawca_nowy: { ...f.dostawca_nowy!, email: e.target.value } })} />
              </Pole>
            </>
          )}
          <Pole etykieta={t('Zapytanie ZO')} className="w-56">
            <select className="pole" value={f.zapytanie_id ?? ''} onChange={(e) => ust({ zapytanie_id: e.target.value || null, nr_zo: zapytania.find((z) => z.id === e.target.value)?.numer ?? f.nr_zo })}>
              <option value="">{f.nr_zo ? t('(nr z oferty: {0})', f.nr_zo) : t('- bez zapytania -')}</option>
              {zapytania.map((z) => <option key={z.id} value={z.id}>{z.numer} {z.przedmiot.slice(0, 40)}</option>)}
            </select>
          </Pole>
          <Pole etykieta={t('Nr oferty dostawcy')} className="w-40"><input className="pole" value={f.numer_oferty} onChange={(e) => ust({ numer_oferty: e.target.value })} /></Pole>
          <Pole etykieta={t('Data oferty')} className="w-40"><input type="date" className="pole" value={f.data_oferty} onChange={(e) => ust({ data_oferty: e.target.value })} /></Pole>
        </div>
        <div className="flex flex-wrap gap-3">
          <Pole etykieta={t('Waluta')} className="w-24">
            <select className="pole" value={f.waluta} onChange={(e) => ust({ waluta: e.target.value, kurs_zrodlo: null })}>
              {['PLN', 'EUR', 'USD'].map((w) => <option key={w}>{w}</option>)}
            </select>
          </Pole>
          {f.waluta !== 'PLN' && (
            <Pole etykieta={t('Kurs [PLN]')} className="w-32">
              <div className="rounded-md border border-slate-300 px-1.5 py-1">
                <PoleLiczby wartosc={f.kurs} zmien={(n) => ust({ kurs: n ?? 0, kurs_zrodlo: 'ręcznie' })} />
              </div>
            </Pole>
          )}
          <Pole etykieta={t('Warunki dostawy')} className="w-28"><input className="pole" placeholder={t('EXW / CPT / DDP')} value={f.warunki_dostawy} onChange={(e) => ust({ warunki_dostawy: e.target.value })} /></Pole>
          <Pole etykieta={t('Miejsce')} className="w-40"><input className="pole" value={f.miejsce_dostawy} onChange={(e) => ust({ miejsce_dostawy: e.target.value })} /></Pole>
          <Pole etykieta={t('Termin realizacji')} className="w-40"><input className="pole" value={f.termin_realizacji} onChange={(e) => ust({ termin_realizacji: e.target.value })} /></Pole>
          <Pole etykieta={t('Termin [dni]')} className="w-24">
            <div className="rounded-md border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={f.termin_dni} puste zmien={(n) => ust({ termin_dni: n === null ? null : Math.round(n) })} /></div>
          </Pole>
          <Pole etykieta={t('Ważna do')} className="w-40"><input type="date" className="pole" value={f.waznosc_do} onChange={(e) => ust({ waznosc_do: e.target.value })} /></Pole>
          <Pole etykieta={t('Ważność (opis)')} className="w-36"><input className="pole" placeholder={t('np. 3 dni robocze')} value={f.waznosc_opis} onChange={(e) => ust({ waznosc_opis: e.target.value })} /></Pole>
          <Pole etykieta={t('Płatność')} className="w-36"><input className="pole" value={f.platnosc} onChange={(e) => ust({ platnosc: e.target.value })} /></Pole>
        </div>
        {kursInfo && <p className="text-xs text-slate-500">{kursInfo}</p>}

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="etykieta mb-0">{t('Potwierdzone wymagania:')}</span>
          {WYMAGANIA.map((w) => (
            <label key={w.klucz} className="flex items-center gap-1">
              <input type="checkbox" checked={f.wymagania[w.klucz] === true}
                onChange={(e) => ust({ wymagania: { ...f.wymagania, [w.klucz]: e.target.checked ? true : null } })} />
              {w.etykieta}
            </label>
          ))}
          <label className="flex items-center gap-1">
            {t('udarność w')}
            <span className="w-16 rounded border border-slate-300 px-1"><PoleLiczby wartosc={f.wymagania.udarnosc_temp ?? null} puste ujemne zmien={(n) => ust({ wymagania: { ...f.wymagania, udarnosc_temp: n } })} /></span>
            {t('°C')}
          </label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={f.czy_zakupiono} onChange={(e) => ust({ czy_zakupiono: e.target.checked })} /> zakupiono</label>
        </div>

        <div>
          <span className="etykieta">{t('Dopłaty (w walucie oferty)')}</span>
          <div className="space-y-1">
            {f.doplaty.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="pole w-48" value={d.opis} onChange={(e) => ust({ doplaty: f.doplaty.map((x, j) => (j === i ? { ...x, opis: e.target.value } : x)) })} />
                <span className="w-28 rounded-md border border-slate-300 px-1.5 py-1"><PoleLiczby wartosc={d.kwota} zmien={(n) => ust({ doplaty: f.doplaty.map((x, j) => (j === i ? { ...x, kwota: n ?? 0 } : x)) })} /></span>
                <select className="pole w-32" value={d.za} onChange={(e) => ust({ doplaty: f.doplaty.map((x, j) => (j === i ? { ...x, za: e.target.value as typeof d.za } : x)) })}>
                  <option value="oferta">{t('za ofertę')}</option><option value="szt">{t('za szt.')}</option><option value="m">{t('za m')}</option><option value="kg">{t('za kg')}</option>
                </select>
                <button className="text-slate-400 hover:text-red-600" onClick={() => ust({ doplaty: f.doplaty.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <Button rozmiar="maly" wariant="cichy" onClick={() => ust({ doplaty: [...f.doplaty, { opis: 'transport', kwota: 0, za: 'oferta' }] })}><Plus className="h-3 w-3" /> {t('dopłata')}</Button>
          </div>
        </div>
        <Pole etykieta={t('Uwagi')}><textarea className="pole h-16" value={f.uwagi} onChange={(e) => ust({ uwagi: e.target.value })} /></Pole>
      </section>

      <section className="sekcja space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t('Pozycje')}</h3>
          <p className="text-xs text-slate-500">{t('Komórki na żółto: niska pewność odczytu - sprawdź z dokumentem. Masę bez podanej w ofercie liczymy z wymiarów.')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px] border-collapse">
            <thead><tr>
              {[t('Lp'), t('Kategoria'), t('Opis'), t('Gatunek'), t('D'), 'd', t('s/g'), 'b', t('L'), 'DN', 'PN', t('Ilość'), t('J.m.'), t('Cena jedn.'), t('Masa całk. [kg]'), t('PLN/kg'), t('PLN/m'), t('PLN/szt'), t('Uwagi'), ''].map((n) => (
                <th key={n} className="komorka-naglowek whitespace-nowrap">{n}</th>
              ))}
            </tr></thead>
            <tbody>
              {f.pozycje.map((p, i) => {
                const pod = podglad[i]
                const niska = p.pewnosc !== null && p.pewnosc < 0.8
                const liczbowe = (pole: keyof PozycjaFormularza, szer = 'w-16') => (
                  <td className={cn('komorka', szer)}>
                    <PoleLiczby wartosc={(p[pole] as number | null) ?? null} puste zmien={(n) => ustPoz(p.klucz, { [pole]: n })} />
                  </td>
                )
                return (
                  <tr key={p.klucz} className={cn(niska && 'bg-amber-50')}>
                    <td className="komorka w-10 text-center text-slate-500">{i + 1}</td>
                    <td className="komorka w-44">
                      <select className="pole-komorki" value={p.kategoria_materialu ? `m:${p.kategoria_materialu}` : p.kategoria_uslugi ? `u:${p.kategoria_uslugi}` : ''}
                        onChange={(e) => {
                          const [t, kod] = e.target.value.split(':')
                          ustPoz(p.klucz, { kategoria_materialu: t === 'm' ? kod : null, kategoria_uslugi: t === 'u' ? kod : null })
                        }}>
                        <option value="">{t('- kategoria -')}</option>
                        <optgroup label={t('Materiały')}>{opcjeKategorii.filter((o) => o.grupa === 'Materiały').map((o) => <option key={o.wartosc} value={o.wartosc}>{o.etykieta}</option>)}</optgroup>
                        <optgroup label={t('Usługi')}>{opcjeKategorii.filter((o) => o.grupa === 'Usługi').map((o) => <option key={o.wartosc} value={o.wartosc}>{o.etykieta}</option>)}</optgroup>
                      </select>
                    </td>
                    <td className="komorka min-w-[16rem]"><input className="pole-komorki" value={p.opis} onChange={(e) => ustPoz(p.klucz, { opis: e.target.value })} /></td>
                    <td className="komorka w-28"><input className="pole-komorki" value={p.gatunek ?? ''} onChange={(e) => ustPoz(p.klucz, { gatunek: e.target.value || null })} /></td>
                    {liczbowe('d_zew')}{liczbowe('d_wew')}{liczbowe('grubosc')}{liczbowe('szerokosc')}{liczbowe('dlugosc')}
                    <td className="komorka w-14"><input className="pole-komorki" value={p.dn ?? ''} onChange={(e) => ustPoz(p.klucz, { dn: e.target.value || null })} /></td>
                    <td className="komorka w-14"><input className="pole-komorki" value={p.pn ?? ''} onChange={(e) => ustPoz(p.klucz, { pn: e.target.value || null })} /></td>
                    <td className="komorka w-20"><PoleLiczby wartosc={p.ilosc} zmien={(n) => ustPoz(p.klucz, { ilosc: n ?? 0 })} /></td>
                    <td className="komorka w-14"><input className="pole-komorki" value={p.jm} onChange={(e) => ustPoz(p.klucz, { jm: e.target.value })} /></td>
                    <td className="komorka w-24"><PoleLiczby wartosc={p.cena_jedn} zmien={(n) => ustPoz(p.klucz, { cena_jedn: n ?? 0, wartosc: null })} /></td>
                    <td className={cn('komorka w-24', pod.masa.wyliczona && 'italic text-slate-500')} title={pod.masa.wyliczona ? t('Wyliczona z wymiarów') : undefined}>
                      <PoleLiczby wartosc={p.masa_calk ?? (pod.masa.wyliczona ? pod.masa.masa_calk : null)} puste zmien={(n) => ustPoz(p.klucz, { masa_calk: n, masa_jedn: null })} />
                    </td>
                    <td className="komorka liczba w-20 text-slate-600">{pod.ceny.cena_pln_kg !== null ? liczba(pod.ceny.cena_pln_kg, 2) : ''}</td>
                    <td className="komorka liczba w-20 text-slate-600">{pod.ceny.cena_pln_m !== null ? liczba(pod.ceny.cena_pln_m, 2) : ''}</td>
                    <td className="komorka liczba w-24 text-slate-600">{pod.ceny.cena_pln_szt !== null ? liczba(pod.ceny.cena_pln_szt, 2) : ''}</td>
                    <td className="komorka min-w-[10rem]"><input className="pole-komorki" value={p.uwagi ?? ''} onChange={(e) => ustPoz(p.klucz, { uwagi: e.target.value || null })} /></td>
                    <td className="komorka w-8 text-center">
                      <button className="text-slate-400 hover:text-red-600" onClick={() => ust({ pozycje: f.pozycje.filter((x) => x.klucz !== p.klucz) })}><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button rozmiar="maly" onClick={() => ust({ pozycje: [...f.pozycje, pustaPozycja(f.pozycje.length + 1)] })}><Plus className="h-4 w-4" /> {t('Dodaj pozycję')}</Button>
          <p className="text-sm">{t('Wartość pozycji:')}{' '}<strong>{zl(suma)} PLN</strong>{f.waluta !== 'PLN' && <span className="text-slate-500"> {t('(kurs')}{' '}{liczba(f.kurs, 4)})</span>}</p>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button wariant="glowny" disabled={zajety} onClick={() => void wykonaj('zatwierdzona')}><Save className="h-4 w-4" /> {t('Zatwierdź i zapisz w bazie')}</Button>
        <Button disabled={zajety} onClick={() => void wykonaj('do_przejrzenia')}>{t('Zapisz do przejrzenia później')}</Button>
        <Button wariant="cichy" onClick={anuluj}>{t('Anuluj')}</Button>
      </div>
    </div>
  )
}
