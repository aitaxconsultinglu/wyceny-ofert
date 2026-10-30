import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, ClipboardCheck, FilePlus2, Save, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { dataGodzinaPL, liczba, odmiana } from '@/lib/format'
import { szacujAi, wywolajAi } from '@/lib/ai'
import { postepKarty, pustaKarta, terminOfertyISO, uzupelnijKarte, zWynikuAnalizyAi, type AnalizaAi, type KartaAnalizy as Karta } from '@/lib/analiza'
import { dokumentyZapytania, przygotujAnalize, type PrzygotowanaAnaliza } from '@/lib/analizaZapytania'
import { nowyAparat, wczytajWycene, zapiszWycene } from '@/lib/wyceny'
import { uprawnienia, type Profil } from '@/lib/types'
import { opisZmiany, roznica, useHistoriaStanu } from '@/lib/historia'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { KartaAnalizyWidok, type DokumentKarty } from './KartaAnalizyWidok'
import { RaportWidok } from './PrzygotowanieAutomatyczne'
import { ProsbaDialog, type NowaProsba } from '../prosby/ProsbaDialog'
import { t } from '@/i18n'

export interface ZapytanieKarty {
  id: string; numer: string; przedmiot: string; klient: string | null; nr_zapytania_klienta: string | null; termin_oferty: string | null; status: string
}
interface Meta { przeanalizowano: string | null; model: string | null; koszt_pln: number | null; zmodyfikowano: string | null; istnieje: boolean }

/** Karta analizy zapytania (następca zakładki "Opinia o zapytaniu" z dotychczasowego arkusza wyceny): ręczna edycja + analiza AI. */
export function KartaAnalizy({ zapytanie, profil, otworzZakladke, otworzWycene, poZmianieZapytania }: {
  zapytanie: ZapytanieKarty
  profil: Profil
  otworzZakladke: (z: 'rysunki' | 'dostawcy') => void
  otworzWycene: (id: string) => void
  poZmianieZapytania: () => void
}) {
  const up = uprawnienia(profil)
  const [karta, setKarta] = useState<Karta>(pustaKarta())
  const [meta, setMeta] = useState<Meta>({ przeanalizowano: null, model: null, koszt_pln: null, zmodyfikowano: null, istnieje: false })
  const [dokumenty, setDokumenty] = useState<DokumentKarty[]>([])
  const [odczytow, setOdczytow] = useState(0)
  const [zmieniona, setZmieniona] = useState(false)
  const [zajety, setZajety] = useState<string | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [plan, setPlan] = useState<{ przygotowana: PrzygotowanaAnaliza; koszt: number | null; pozostalo: number | null; uwaga: string | null } | null>(null)
  const [prosba, setProsba] = useState<NowaProsba | null>(null)

  const wczytaj = useCallback(async () => {
    const [{ data, error }, dok, od] = await Promise.all([
      supabase.from('analizy_zapytan').select('dane, model, koszt_pln, przeanalizowano, zmodyfikowano').eq('zapytanie_id', zapytanie.id).maybeSingle(),
      dokumentyZapytania(zapytanie.id).catch(() => []),
      supabase.from('odczyty_rysunkow').select('id', { count: 'exact', head: true }).eq('zapytanie_id', zapytanie.id),
    ])
    if (error) { setBlad(komunikatPL(error.message)); return }
    setKarta(uzupelnijKarte(data?.dane as Partial<Karta> | undefined))
    setMeta({ przeanalizowano: data?.przeanalizowano ?? null, model: data?.model ?? null, koszt_pln: data?.koszt_pln ?? null, zmodyfikowano: data?.zmodyfikowano ?? null, istnieje: !!data })
    setDokumenty(dok.map((d) => ({ id: d.id, nazwa: d.nazwa_pliku, typ: d.typ, istotny: d.istotny })))
    setOdczytow(od.count ?? 0)
    setZmieniona(false)
  }, [zapytanie.id])
  useEffect(() => { void wczytaj() }, [wczytaj])

  // Cofnij / Ponów: stos per karta analizy zapytania.
  const kartaRef = useRef(karta)
  kartaRef.current = karta
  const ustawZHistorii = useCallback((f: (k: Karta) => Karta) => { const n = f(kartaRef.current); kartaRef.current = n; setKarta(n); setZmieniona(true) }, [])
  const zapiszKrok = useHistoriaStanu<Karta>(`analiza:${zapytanie.id}`, ustawZHistorii)
  const zmien = (k: Karta) => {
    zapiszKrok(kartaRef.current, k, t('karta analizy - {0}', opisZmiany(roznica(kartaRef.current, k))))
    kartaRef.current = k
    setKarta(k); setZmieniona(true); setInfo(null)
  }

  async function zapisz(dodatkowe: Record<string, unknown> = {}, k: Karta = karta) {
    setBlad(null)
    const { error } = await supabase.from('analizy_zapytan').upsert({ zapytanie_id: zapytanie.id, dane: k, ...dodatkowe })
    if (error) { setBlad(komunikatPL(error.message)); return false }
    // Pierwsza analiza przesuwa nowe zapytanie do statusu "w analizie".
    if (zapytanie.status === 'nowe') { await supabase.from('zapytania').update({ status: 'w_analizie' }).eq('id', zapytanie.id); poZmianieZapytania() }
    await wczytaj()
    return true
  }

  async function przygotuj() {
    setBlad(null); setInfo(null); setZajety(t('Przygotowanie dokumentów (teksty i strony skanów)...'))
    try {
      const przygotowana = await przygotujAnalize(zapytanie)
      if (!przygotowana.znakow && !przygotowana.dane.obrazy?.length) throw new Error(t('Brak treści do analizy - oznacz dokumenty jako istotne w zakładce Dokumenty.'))
      setZajety(t('Szacowanie kosztu...'))
      const { szacunek, blad: b } = await szacujAi('analizuj_zapytanie', przygotowana.dane)
      setPlan({ przygotowana, koszt: szacunek?.koszt_pln ?? null, pozostalo: szacunek?.pozostalo_miesiac_pln ?? null, uwaga: b ?? (szacunek ? null : t('Nie udało się oszacować kosztu.')) })
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setZajety(null)
  }

  async function analizuj() {
    if (!plan) return
    const p = plan
    setPlan(null); setZajety(t('Analiza dokumentów przez AI - to może potrwać do 2 minut...'))
    const { odp, blad: b } = await wywolajAi<AnalizaAi>('analizuj_zapytanie', p.przygotowana.dane)
    setZajety(null)
    if (b || !odp) { setBlad(b ?? t('Brak odpowiedzi.')); return }
    const nowa = zWynikuAnalizyAi(odp.wynik, karta)
    setKarta(nowa)
    // Wynik zapisujemy od razu - nie liczymy analizy ponownie bez decyzji użytkownika.
    const ok = await zapisz({ ekstrakcja_ai: odp.wynik, model: odp.model, koszt_pln: odp.koszt_pln, przeanalizowano: new Date().toISOString() }, nowa)
    if (ok) setInfo(t('Analiza zapisana ({0} zł). Poprawki ręczne mają pierwszeństwo - AI uzupełniła tylko puste pola i dopisała nowe pozycje list.', liczba(odp.koszt_pln, 2)))
  }

  async function uzupelnijZapytanie() {
    const zmiany: Record<string, unknown> = {}
    const termin = terminOfertyISO(karta.podsumowanie)
    if (termin && !zapytanie.termin_oferty) zmiany.termin_oferty = termin
    if (karta.podsumowanie.nr_zapytania_klienta.trim() && !zapytanie.nr_zapytania_klienta) zmiany.nr_zapytania_klienta = karta.podsumowanie.nr_zapytania_klienta.trim()
    if (!Object.keys(zmiany).length) { setInfo(t('Karta zapytania ma już termin i numer zapytania klienta - nic nie zmieniono.')); return }
    const { error } = await supabase.from('zapytania').update(zmiany).eq('id', zapytanie.id)
    if (error) { setBlad(komunikatPL(error.message)); return }
    setInfo(t('Uzupełniono kartę zapytania: {0}.', Object.keys(zmiany).map((k) => (k === 'termin_oferty' ? 'termin złożenia oferty' : 'nr zapytania klienta')).join(', ')))
    poZmianieZapytania()
  }

  async function szkicWyceny() {
    if (!karta.aparaty.length) { setBlad(t('Dodaj aparaty w podsumowaniu.')); return }
    setZajety(t('Tworzenie szkicu wyceny...')); setBlad(null)
    try {
      const { data, error } = await supabase.rpc('nowa_wycena', { p_zapytanie: zapytanie.id, p_nazwa: 'Szkic z karty analizy' })
      if (error) throw new Error(komunikatPL(error.message))
      const s = await wczytajWycene(data as string)
      s.aparaty = karta.aparaty.map((a, i) => ({
        ...(s.aparaty[i] ?? nowyAparat(i + 1)), nazwa: a.nazwa || `Aparat ${i + 1}`, typ: a.typ, ilosc: a.ilosc || 1, masa_netto_kg: a.masa_kg,
        srednica_mm: a.srednica_mm, dlugosc_mm: a.dlugosc_mm, wysokosc_mm: a.wysokosc_mm, material_wiodacy: a.material,
      }))
      await zapiszWycene(s, up.widziMarze)
      if (['nowe', 'w_analizie', 'zapytania_do_dostawcow'].includes(zapytanie.status)) await supabase.from('zapytania').update({ status: 'kalkulacja' }).eq('id', zapytanie.id)
      otworzWycene(data as string)
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setZajety(null)
  }

  async function ustawIstotny(zmiany: { id: string; istotny: boolean }[]) {
    for (const z of zmiany) {
      const { error } = await supabase.from('dokumenty').update({ istotny: z.istotny }).eq('id', z.id)
      if (error) { setBlad(komunikatPL(error.message)); return }
    }
    setDokumenty((l) => l.map((d) => ({ ...d, istotny: zmiany.find((z) => z.id === d.id)?.istotny ?? d.istotny })))
  }

  const postep = postepKarty(karta)
  return (
    <div className="space-y-4">
      <div className="sekcja flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">{t('Kooperacja - wymagania, usługi, pytania do klienta')}</h3>
        <span className="znacznik bg-slate-100 text-slate-700">checklista {postep.sprawdzone}/{postep.razem}</span>
        {postep.wymagane > 0 && <span className="znacznik bg-sky-100 text-sky-800">{t('wymagań')}{' '}{postep.wymagane}</span>}
        {postep.doWyjasnienia > 0 && <span className="znacznik bg-amber-100 text-amber-800">{t('do wyjaśnienia')}{' '}{postep.doWyjasnienia}</span>}
        {postep.niespojnosci > 0 && <span className="znacznik bg-red-100 text-red-800">{t('niespójności')}{' '}{postep.niespojnosci}</span>}
        <span className="text-xs text-slate-500">
          {meta.przeanalizowano ? t('AI: {0}{1}{2}', dataGodzinaPL(meta.przeanalizowano), meta.model ? ` (${meta.model})` : '', meta.koszt_pln ? `, ${liczba(meta.koszt_pln, 2)} zł` : '') : t('bez analizy AI')}
          {meta.zmodyfikowano && t(' · zapisano {0}', dataGodzinaPL(meta.zmodyfikowano))}
        </span>
        <span className="ml-auto flex gap-2">
          <Button wariant="akcent" disabled={!!zajety} onClick={() => void przygotuj()}><Sparkles className="h-4 w-4" /> {t('Analizuj zapytanie (AI)')}</Button>
          <Button wariant="glowny" disabled={!zmieniona || !!zajety} onClick={() => void zapisz().then((ok) => ok && setInfo(t('Zapisano kartę analizy.')))}><Save className="h-4 w-4" /> {t('Zapisz')}</Button>
        </span>
      </div>
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {info && <Komunikat rodzaj="sukces">{info}</Komunikat>}
      {zajety && <Komunikat rodzaj="info">{zajety}</Komunikat>}
      {zmieniona && <Komunikat rodzaj="ostrzezenie">{t('Karta ma niezapisane zmiany.')}</Komunikat>}

      {karta.przygotowanie && (
        <section className="sekcja space-y-2 border-blekit">
          <h4 className="font-semibold">{t('Ostatnie automatyczne przygotowanie')}{' '}<span className="font-normal text-slate-500">({dataGodzinaPL(karta.przygotowanie.data)})</span></h4>
          <RaportWidok raport={karta.przygotowanie} otworzWycene={otworzWycene} otworzZakladke={(z) => { if (z === 'rysunki') otworzZakladke('rysunki') }} bezKarty />
        </section>
      )}

      <KartaAnalizyWidok
        kto={profil.nazwa ?? profil.email}
        karta={karta} zmien={zmien} dokumenty={dokumenty} ustawIstotny={(z) => void ustawIstotny(z)} liczbaOdczytow={odczytow}
        otworzRysunki={() => otworzZakladke('rysunki')}
        akcjePodsumowania={<>
          <Button rozmiar="maly" onClick={() => void uzupelnijZapytanie()} title={t('Termin złożenia oferty i nr zapytania klienta - tylko puste pola')}><ClipboardCheck className="h-3 w-3" /> {t('Uzupełnij kartę zapytania')}</Button>
          <Button rozmiar="maly" disabled={!karta.aparaty.length || !!zajety} onClick={() => void szkicWyceny()}><FilePlus2 className="h-3 w-3" /> {t('Szkic wyceny z aparatami')}</Button>
        </>}
        poprosOOferte={(u) => setProsba({
          zapytanie_id: zapytanie.id, wycena_id: null, zakladka: 'kooperacja', kategoria_uslugi: u.kategoria, opis: u.opis,
          parametry: u.ilosc !== null ? { ilosc: `${u.ilosc} ${u.jm}`.trim() } : undefined,
        })}
        akcjeUslug={karta.uslugi.length > 0 && up.bazaOfert && (
          <Button rozmiar="maly" onClick={() => { if (zmieniona) void zapisz(); otworzZakladke('dostawcy') }}><ArrowRight className="h-3 w-3" /> {t('Zapytaj kooperantów')}</Button>
        )}
      />

      <ProsbaDialog nowa={prosba} zamknij={() => setProsba(null)}
        utworzona={() => { setProsba(null); setInfo(t('Prośba o ofertę trafiła do kolejki działu handlowego (menu „Prośby o oferty”).')) }} />

      <Dialog open={!!plan} onOpenChange={(o) => !o && setPlan(null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t('Analiza zapytania przez AI - potwierdzenie kosztu')}</DialogTitle>
          <DialogDescription>{t('Do Claude API trafią tylko dokumenty oznaczone jako istotne.')}</DialogDescription>
          {plan && (
            <div className="mt-3 space-y-2 text-sm">
              <p>
                {odmiana(plan.przygotowana.dokumentow, ['dokument istotny', 'dokumenty istotne', 'dokumentów istotnych'])}{t(': tekst')}{' '}{liczba(plan.przygotowana.znakow / 1000, 0)} {t('tys. znaków')}
                {plan.przygotowana.skany.length > 0 && t(', strony skanów: {0}', plan.przygotowana.skany.join(', '))}.
              </p>
              {plan.przygotowana.uciete.length > 0 && <p className="text-amber-800">{t('Ucięte (limit długości):')}{' '}{plan.przygotowana.uciete.join(', ')}.</p>}
              {plan.przygotowana.pominiete.length > 0 && <p className="text-amber-800">{t('Pominięte:')}{' '}{plan.przygotowana.pominiete.join(', ')}.</p>}
              {plan.uwaga
                ? <Komunikat rodzaj="ostrzezenie">{plan.uwaga}</Komunikat>
                : <p>{t('Szacowany koszt:')}{' '}<strong>{liczba(plan.koszt ?? 0, 2)} {t('zł')}</strong>{plan.pozostalo !== null && t(' · w budżecie miesiąca zostało {0} zł', liczba(plan.pozostalo, 2))}.</p>}
              <p className="text-xs text-slate-500">{t('Wynik uzupełni kartę: puste pola i nowe pozycje list. Twoje wpisy zostaną bez zmian.')}</p>
              <div className="flex justify-end gap-2">
                <Button onClick={() => setPlan(null)}>{t('Anuluj')}</Button>
                <Button wariant="akcent" disabled={!!plan.uwaga} onClick={() => void analizuj()}><Sparkles className="h-4 w-4" /> {t('Analizuj')}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
