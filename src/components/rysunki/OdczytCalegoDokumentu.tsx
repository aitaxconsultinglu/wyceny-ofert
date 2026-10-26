import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { liczba } from '@/lib/format'
import { pobierzBajty } from '@/lib/magazyn'
import { szacujAi, wywolajAi, type RysunekAi } from '@/lib/ai'
import { PROG_PEWNOSCI, polaczWyniki, zWynikuAi, type WynikRysunku } from '@/lib/rysunki'
import { bajtyRysunku, otworzRysunek } from '@/lib/rysunkiPdf'
import { MAKS_STRON_DOKUMENTU, opisRodzajowDlaAi, rozdzielNaOdczyty, zadaniaStrony, type ZadanieStrony } from '@/lib/odczytDokumentu'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import type { DokumentRysunku } from './OdczytRysunku'
import { t } from '@/i18n'

interface Plan { zadania: ZadanieStrony[]; stron: number; pominiete: number; koszt_pln: number | null; pozostalo: number | null; uwaga: string | null }

/**
 * „Odczytaj cały dokument (AI)”: każda strona (najwyżej MAKS_STRON_DOKUMENTU) - tekst PDF, gdy jest, inaczej kafle;
 * najpierw szacunek kosztu i potwierdzenie, potem osobne odczyty wg rodzaju tabeli (wykaz części, króćce, dane projektowe,
 * uwagi, tabele własne) zapisane od razu jako odczyt AI do sprawdzenia (niepewne wiersze wyróżnione).
 */
export function OdczytCalegoDokumentu({ dokument, zapytanieId, rodzajAparatu, zamknij, poZapisie }: {
  dokument: DokumentRysunku | null
  zapytanieId: string
  rodzajAparatu: 'zbiornik' | 'wymiennik' | null
  zamknij: () => void
  poZapisie: (komunikat: string) => void
}) {
  const s = useSlowniki()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [zajety, setZajety] = useState<string | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  const rodzaje = s.rodzajeTabel.filter((x) => x.rodzaj_aparatu === (rodzajAparatu ?? 'zbiornik'))

  useEffect(() => {
    setPlan(null); setBlad(null)
    if (!dokument?.sciezka) return
    let anuluj = false
    void (async () => {
      try {
        setZajety(t('Przygotowanie stron (tekst PDF albo kafle skanów)...'))
        const pdf = await otworzRysunek(await bajtyRysunku(await pobierzBajty(dokument.sciezka!), dokument.nazwa_pliku))
        const stron = Math.min(pdf.numPages, MAKS_STRON_DOKUMENTU)
        const zadania: ZadanieStrony[] = []
        for (let nr = 1; nr <= stron && !anuluj; nr++) {
          setZajety(t('Strona {0} z {1}...', nr, stron))
          zadania.push(...await zadaniaStrony(pdf, nr, { zapytanie_id: zapytanieId, dokument_id: dokument.id }, dokument.nazwa_pliku, opisRodzajowDlaAi(rodzaje)))
        }
        setZajety(t('Szacowanie kosztu...'))
        let suma = 0
        let pozostalo: number | null = null
        let uwaga: string | null = null
        for (const z of zadania) {
          const { szacunek, blad: b } = await szacujAi('wyciagnij_liste_z_rysunku', z.dane)
          if (b || !szacunek) { uwaga = b ?? t('Nie udało się oszacować kosztu.'); break }
          suma += szacunek.koszt_pln
          pozostalo = szacunek.pozostalo_miesiac_pln
        }
        if (!anuluj) setPlan({ zadania, stron, pominiete: pdf.numPages - stron, koszt_pln: uwaga ? null : suma, pozostalo, uwaga })
      } catch (e) { if (!anuluj) setBlad(e instanceof Error ? e.message : String(e)) }
      if (!anuluj) setZajety(null)
    })()
    return () => { anuluj = true }
    // Rodzaje tabel czytane raz przy otwarciu okna (słownik nie zmienia się w trakcie).
  }, [dokument?.id, dokument?.sciezka, dokument?.nazwa_pliku, zapytanieId])

  async function wykonaj() {
    if (!plan || !dokument) return
    setBlad(null)
    const kody = s.kategorieMaterialow.map((k) => k.kod)
    let odczytow = 0
    let niepewnych = 0
    let koszt = 0
    try {
      const strony = [...new Set(plan.zadania.map((z) => z.strona))]
      for (const nr of strony) {
        const wyniki: WynikRysunku[] = []
        const surowe: RysunekAi[] = []
        let kosztStrony = 0
        let model: string | null = null
        for (const [i, z] of plan.zadania.filter((x) => x.strona === nr).entries()) {
          setZajety(t('Odczyt AI: strona {0} ({1}), część {2}...', nr, z.opis, i + 1))
          const { odp, blad: b } = await wywolajAi<RysunekAi>('wyciagnij_liste_z_rysunku', z.dane)
          if (b || !odp) throw new Error(b ?? t('Brak odpowiedzi.'))
          kosztStrony += odp.koszt_pln; model = odp.model
          surowe.push(odp.wynik)
          wyniki.push(zWynikuAi(odp.wynik, z.kafleNaStronie, kody))
        }
        koszt += kosztStrony
        const czesci = rozdzielNaOdczyty(polaczWyniki(...wyniki), nr, rodzaje)
        // Koszt i surowa odpowiedź przy pierwszym odczycie strony (żeby suma kosztów odczytów się zgadzała).
        const wiersze = czesci.map((c, i) => ({
          zapytanie_id: zapytanieId, dokument_id: dokument.id, nazwa_pliku: dokument.nazwa_pliku, strona: nr, obszary: c.obszary, wynik: c.wynik,
          nazwa: c.nazwa, rodzaj_tabeli: c.rodzaj_tabeli, zrodlo: 'ai', model, koszt_pln: i === 0 ? kosztStrony : 0, ekstrakcja_ai: i === 0 ? surowe : null, sprawdzony: false,
        }))
        if (wiersze.length) {
          const { error } = await supabase.from('odczyty_rysunkow').insert(wiersze)
          if (error) throw new Error(komunikatPL(error.message))
        }
        odczytow += wiersze.length
        niepewnych += czesci.reduce((a, c) => a + [...c.wynik.pozycje, ...c.wynik.krocce, ...c.wynik.parametry].filter((x) => x.pewnosc < PROG_PEWNOSCI).length, 0)
      }
      poZapisie(t('Odczytano cały dokument: {0} odczytów do sprawdzenia, koszt {1} zł{2}.', odczytow, liczba(koszt, 2), niepewnych ? t(', niepewnych wierszy: {0}', niepewnych) : ''))
    } catch (e) {
      setBlad(e instanceof Error ? e.message : String(e))
      if (odczytow) poZapisie(t('Zapisano {0} odczytów przed błędem.', odczytow))
    }
    setZajety(null)
  }

  return (
    <Dialog open={!!dokument} onOpenChange={(o) => !o && !zajety && zamknij()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{t('Odczytaj cały dokument (AI)')}</DialogTitle>
        <DialogDescription>{dokument?.nazwa_pliku}</DialogDescription>
        <div className="mt-3 space-y-3 text-sm">
          {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
          {zajety && <Komunikat rodzaj="info">{zajety}</Komunikat>}
          {plan && !zajety && (
            <>
              <p>{t('AI odczyta {0} str. i sam utworzy osobne odczyty: wykaz części, króćce, dane projektowe, uwagi oraz tabele wg rodzaju aparatu. Strony z warstwą tekstową idą jako tekst (taniej), skany jako kafle ~300 DPI.', plan.stron)}</p>
              {plan.pominiete > 0 && <Komunikat rodzaj="ostrzezenie">{t('Dokument ma więcej stron - odczytanych zostanie pierwszych {0}. Pozostałe strony odczytaj zaznaczeniem.', MAKS_STRON_DOKUMENTU)}</Komunikat>}
              <ul className="max-h-40 list-disc overflow-auto pl-5 text-xs">{plan.zadania.map((z, i) => <li key={i}>{z.opis}</li>)}</ul>
              {plan.uwaga
                ? <Komunikat rodzaj="ostrzezenie">{plan.uwaga}</Komunikat>
                : <p>{t('Szacowany koszt:')}{' '}<strong>{liczba(plan.koszt_pln ?? 0, 2)} {t('zł')}</strong>{plan.pozostalo !== null && t(' · w budżecie miesiąca zostało {0} zł', liczba(plan.pozostalo, 2))}.</p>}
              <div className="flex justify-end gap-2">
                <Button onClick={zamknij}>{t('Anuluj')}</Button>
                <Button wariant="akcent" disabled={!!plan.uwaga || !plan.zadania.length} onClick={() => void wykonaj()}><Sparkles className="h-4 w-4" /> {t('Odczytaj')}</Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
