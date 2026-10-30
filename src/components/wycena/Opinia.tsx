import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { CheckCircle2, Save, Undo2, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { dataGodzinaPL, dataPL, liczba } from '@/lib/format'
import { uzupelnijKarte, type KartaAnalizy, type OcenaAnalizy } from '@/lib/analiza'
import type { WynikWyceny } from '@/lib/kalkulacja'
import { ETYKIETY_STATUSU_WYCENY, type StanWyceny } from '@/lib/wyceny'
import type { Profil } from '@/lib/types'
import { OcenaDzialow } from '../zapytania/OcenaDzialow'
import { grupyTerminow, terminyZOfert, wyrownajTerminy, type TerminZOferty } from '@/lib/terminyMaterialow'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { TabelaCeny, TabelaKosztow } from './Podsumowanie'
import { t } from '@/i18n'

interface DaneZapytania {
  numer: string; przedmiot: string; nr_zapytania_klienta: string | null; termin_oferty: string | null; utworzono: string
  klienci: { nazwa: string } | null
}

/** Pierwszy mail zapytania - data wpłynięcia (i data zapytania klienta), gdy zapytanie przyszło mailem. */
async function dataWplyniecia(zapytanieId: string): Promise<string | null> {
  const { data } = await supabase.from('dokumenty').select('metadane, utworzono').eq('zapytanie_id', zapytanieId).is('nadrzedny_id', null).limit(200)
  const daty = (data ?? []).map((d) => String((d.metadane as { data?: string } | null)?.data ?? '')).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d)).sort()
  return daty[0] ?? null
}

function Pole({ et, children }: { et: string; children: ReactNode }) {
  return <div><span className="etykieta">{et}</span><p className="min-h-[1.5rem] py-0.5">{children || <span className="text-slate-400">-</span>}</p></div>
}

/**
 * Zakładka „Wycena” - odpowiednik arkusza „Opinia o zapytaniu”: nagłówek z karty zapytania i karty analizy, ocena działów
 * (to samo źródło co karta analizy), ocena ekonomiczna liczona z pozostałych zakładek i przegląd oferty (zatwierdzanie prezesa).
 * Nic nie jest wpisywane drugi raz: dane wyceny pochodzą z zakładek, dane zapytania z karty zapytania i analizy.
 */
export function Opinia({ stan, wynik, profil, widziMarze, zmienStatus, zajety }: {
  stan: StanWyceny
  wynik: WynikWyceny
  profil: Profil
  widziMarze: boolean
  zmienStatus: (s: 'zatwierdzona' | 'zwrocona') => void
  zajety: boolean
}) {
  const s = useSlowniki()
  const w = stan.wycena
  const [z, setZ] = useState<DaneZapytania | null>(null)
  const [wplyniecie, setWplyniecie] = useState<string | null>(null)
  const [karta, setKarta] = useState<KartaAnalizy | null>(null)
  const [zmieniona, setZmieniona] = useState(false)
  const [zOfert, setZOfert] = useState<Record<string, string>>({})
  const [blad, setBlad] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const wczytaj = useCallback(async () => {
    const [zap, an, wpl, of] = await Promise.all([
      supabase.from('zapytania').select('numer, przedmiot, nr_zapytania_klienta, termin_oferty, utworzono, klienci(nazwa)').eq('id', stan.zapytanie.id).single(),
      supabase.from('analizy_zapytan').select('dane').eq('zapytanie_id', stan.zapytanie.id).maybeSingle(),
      dataWplyniecia(stan.zapytanie.id),
      // Terminy dostaw z ofert dostawców do tego zapytania (pozycja albo cała oferta).
      supabase.from('pozycje_ofert').select('kategoria_materialu, termin_dni, oferty_dostawcow!inner(zapytanie_id, termin_dni, dostawcy(nazwa))').eq('oferty_dostawcow.zapytanie_id', stan.zapytanie.id),
    ])
    if (zap.error) setBlad(komunikatPL(zap.error.message))
    setZ(zap.data as unknown as DaneZapytania)
    // Grupy terminów zakupu z materiałów tej wyceny (bez materiałów - wg rodzaju aparatu).
    const k = uzupelnijKarte(an.data?.dane as Partial<KartaAnalizy> | undefined)
    const sekcje = stan.aparaty.flatMap((a) => a.pozycje.filter((x) => x.zakladka === 'materialy').map((x) => x.sekcja ?? 'inne'))
    const grupy = grupyTerminow(sekcje, stan.zapytanie.rodzaj_aparatu, s.kategorieMaterialow)
    setKarta({ ...k, ocena: { ...k.ocena, terminy_materialow: wyrownajTerminy(k.ocena.terminy_materialow.filter((x) => x.termin.trim() || grupy.includes(x.grupa)), grupy) } })
    type WierszOferty = { kategoria_materialu: string | null; termin_dni: number | null; oferty_dostawcow: { termin_dni: number | null; dostawcy: { nazwa: string } | null } }
    setZOfert(terminyZOfert(((of.data ?? []) as unknown as WierszOferty[]).map((x): TerminZOferty => ({
      kategoria: x.kategoria_materialu, termin_dni: x.termin_dni ?? x.oferty_dostawcow?.termin_dni ?? null, dostawca: x.oferty_dostawcow?.dostawcy?.nazwa ?? null,
    })), s.kategorieMaterialow))
    setWplyniecie(wpl)
    setZmieniona(false)
    // Materiały i słownik czytane przy otwarciu zakładki; zmiana materiałów odświeża grupy przy kolejnym wejściu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stan.zapytanie.id, s.kategorieMaterialow])
  useEffect(() => { void wczytaj() }, [wczytaj])

  async function zapiszOcene() {
    if (!karta) return
    setBlad(null); setInfo(null)
    // Świeża karta z bazy - zmieniamy tylko ocenę działów, reszta karty analizy zostaje taka, jaka jest.
    const { data } = await supabase.from('analizy_zapytan').select('dane').eq('zapytanie_id', stan.zapytanie.id).maybeSingle()
    const aktualna = uzupelnijKarte(data?.dane as Partial<KartaAnalizy> | undefined)
    const { error } = await supabase.from('analizy_zapytan').upsert({ zapytanie_id: stan.zapytanie.id, dane: { ...aktualna, ocena: karta.ocena } })
    if (error) { setBlad(komunikatPL(error.message)); return }
    setInfo(t('Zapisano ocenę działów (karta analizy).'))
    await wczytaj()
  }

  async function odrzuc() {
    if (!window.confirm(t('Odrzucić zapytanie {0}? Status zapytania zmieni się na „rezygnacja”.', stan.zapytanie.numer))) return
    const { error } = await supabase.from('zapytania').update({ status: 'rezygnacja' }).eq('id', stan.zapytanie.id)
    if (error) setBlad(komunikatPL(error.message))
    else setInfo(t('Zapytanie oznaczone jako rezygnacja.'))
  }

  const ap = stan.aparaty
  const masaSzt = ap.length === 1 ? ap[0].masa_netto_kg : null
  const ilosc = ap.reduce((a, x) => a + x.ilosc, 0)
  const wymiary = ap.map((a) => [a.srednica_mm && `Ø${liczba(a.srednica_mm)}`, a.wysokosc_mm && `H ${liczba(a.wysokosc_mm)}`, a.dlugosc_mm && `L ${liczba(a.dlugosc_mm)}`, a.szerokosc_mm && `B ${liczba(a.szerokosc_mm)}`].filter(Boolean).join(' × ')).filter(Boolean).join('; ')
  const pod = karta?.podsumowanie
  const platnosc = String((w.oferta as { platnosc?: string }).platnosc ?? '') || pod?.platnosc || s.ustawienia.oferta_domyslne.platnosc
  const jestPrezesem = profil.rola === 'prezes'

  return (
    <div className="space-y-4">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {info && <Komunikat rodzaj="sukces">{info}</Komunikat>}

      <section className="sekcja space-y-2">
        <h4 className="text-sm font-semibold">{t('Opinia o zapytaniu')}</h4>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
          <Pole et={t('Nr rejestracyjny')}>{z?.numer}</Pole>
          <Pole et={t('Zamawiający')}>{z?.klienci?.nazwa ?? pod?.klient}</Pole>
          <Pole et={t('Data wpłynięcia')}>{dataPL(wplyniecie ?? z?.utworzono)}</Pole>
          <Pole et={t('Data rejestracji')}>{dataPL(z?.utworzono)}</Pole>
          <Pole et={t('Termin złożenia oferty')}>{z?.termin_oferty ? dataGodzinaPL(z.termin_oferty) : pod?.termin_oferty}</Pole>
          <Pole et={t('Nr zapytania klienta i data')}>{[z?.nr_zapytania_klienta ?? pod?.nr_zapytania_klienta, wplyniecie && dataPL(wplyniecie)].filter(Boolean).join(t(' z dnia '))}</Pole>
          <Pole et={t('Żądany termin wykonania / dostawy')}>{pod?.termin_realizacji}</Pole>
          <Pole et={t('Miejsce dostawy')}>{pod?.miejsce_dostawy}</Pole>
          <div className="col-span-2"><Pole et={t('Przedmiot zapytania')}>{z?.przedmiot}</Pole></div>
          <Pole et={t('Ciężar netto [kg / szt.]')}>{masaSzt !== null ? liczba(masaSzt, 0) : ap.length > 1 ? t('kilka aparatów') : ''}</Pole>
          <Pole et={t('Ilość [szt.]')}>{liczba(ilosc)}</Pole>
          <Pole et={t('Ciężar całkowity [kg]')}>{liczba(wynik.masa_kg, 0)}</Pole>
          <div className="col-span-3"><Pole et={t('Wymiary [mm]')}>{wymiary || pod?.wymiary}</Pole></div>
        </div>
        <p className="text-xs text-slate-500">{t('Dane z karty zapytania, karty analizy i aparatów wyceny - zmieniaj je tam.')}</p>
      </section>

      <section className="sekcja space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">{t('Ocena działów')}</h4>
          {karta && <Button rozmiar="maly" wariant="glowny" disabled={!zmieniona} onClick={() => void zapiszOcene()}><Save className="h-3 w-3" /> {t('Zapisz ocenę')}</Button>}
        </div>
        {karta
          ? <OcenaDzialow ocena={karta.ocena} kto={profil.nazwa ?? profil.email} zOfert={zOfert}
              zmien={(zm: Partial<OcenaAnalizy>) => { setKarta({ ...karta, ocena: { ...karta.ocena, ...zm } }); setZmieniona(true); setInfo(null) }} />
          : <p className="text-sm text-slate-500">{t('Wczytywanie...')}</p>}
        <p className="text-xs text-slate-500">{t('To ta sama ocena co w karcie analizy zapytania (jedno źródło danych).')}</p>
      </section>

      <section className="sekcja space-y-3">
        <TabelaKosztow wynik={wynik} />
        {widziMarze && wynik.cena !== null
          ? <TabelaCeny wynik={wynik} zaokraglenie={Number(stan.marze?.zaokraglenie ?? 0)} />
          : <p className="text-sm text-slate-600">{t('Zysk i cena są widoczne tylko dla osób z uprawnieniem „widzi narzuty i marże”.')}</p>}
        <div className="grid grid-cols-2 gap-x-6 text-sm md:grid-cols-4">
          <Pole et={t('Kurs EUR (NBP)')}>{w.kurs_eur ? `${liczba(w.kurs_eur, 4)} ${w.kurs_eur_data ? t('z {0}', dataPL(w.kurs_eur_data)) : ''}` : ''}</Pole>
          {widziMarze && <Pole et={t('Cena EUR / kg')}>{wynik.cena_koncowa_eur !== null && wynik.masa_kg > 0 ? liczba(wynik.cena_koncowa_eur / wynik.masa_kg, 2) : ''}</Pole>}
          <div className="col-span-2"><Pole et={t('Forma płatności')}>{platnosc}</Pole></div>
        </div>
        <p className="text-xs text-slate-500">{t('Ocena ekonomiczna liczy się z zakładek Materiały, Robocizna, Kooperacja i Badania; zysk, zaokrąglenie i kurs ustawiasz w Podsumowaniu.')}</p>
      </section>

      <section className="sekcja space-y-2">
        <h4 className="text-sm font-semibold">{t('Przegląd oferty')}</h4>
        <p className="text-sm">
          {t('Status wersji:')}{' '}<strong>{ETYKIETY_STATUSU_WYCENY[w.status]}</strong>
          {w.zatwierdzono && <> · {t('zatwierdzono {0}', dataGodzinaPL(w.zatwierdzono))}</>}
          {w.komentarz_prezesa && <> · {t('komentarz:')}{' '}{w.komentarz_prezesa}</>}
        </p>
        {jestPrezesem && w.status === 'do_zatwierdzenia' && (
          <div className="flex flex-wrap gap-2">
            <Button wariant="glowny" disabled={zajety} onClick={() => zmienStatus('zatwierdzona')}><CheckCircle2 className="h-4 w-4" /> {t('Zatwierdzam')}</Button>
            <Button wariant="ostrzezenie" disabled={zajety} onClick={() => zmienStatus('zwrocona')}><Undo2 className="h-4 w-4" /> {t('Poprawić')}</Button>
            <Button disabled={zajety} onClick={() => void odrzuc()}><XCircle className="h-4 w-4" /> {t('Odrzucić')}</Button>
          </div>
        )}
        {!jestPrezesem && w.status !== 'zatwierdzona' && <p className="text-xs text-slate-500">{t('Zatwierdza prezes - przekaż wersję przyciskiem „Do zatwierdzenia”.')}</p>}
      </section>
    </div>
  )
}
