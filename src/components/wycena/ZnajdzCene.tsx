import { useEffect, useMemo, useState } from 'react'
import { useSlowniki } from '@/lib/slowniki'
import { dataPL, liczba } from '@/lib/format'
import { cn } from '@/lib/utils'
import { cenaZWiersza, cennikEtapu1, filtrujCeny, PUSTY_FILTR, wczytajCeny, wiekMiesiecy, type WierszCeny, type WybranaCena } from '@/lib/bazaCen'
import type { PozycjaWyceny } from '@/lib/wyceny'
import { najlepszeOferty } from '@/lib/prosby'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'
import { KolumnaWymagan, opisWymiarow } from '../oferty/Porownywarka'
import { t } from '@/i18n'

export type { WybranaCena }

let cache: Promise<{ wiersze: WierszCeny[]; blad: string | null }> | null = null
/** Ceny z bazy wczytywane raz na sesję edytora (odświeżenie strony pobiera nowe). */
export function cenyZBazy(odswiez = false) {
  if (!cache || odswiez) cache = wczytajCeny({ zakupy: true })
  return cache
}

/**
 * "Znajdź cenę": dopasowane pozycje z ofert i zakupów (kategoria + gatunek z równoważnikami +
 * zbliżone wymiary). Klik kopiuje cenę i źródło do wiersza wyceny - kopia, nie referencja.
 */
export function ZnajdzCene({ pozycja, uslugi, zamknij, wybierz, zapytanieId = null, cennikEtapu1: etap1 = false }: {
  pozycja: PozycjaWyceny | null
  uslugi?: boolean
  zamknij: () => void
  wybierz: (c: WybranaCena) => void
  zapytanieId?: string | null
  /** Etap 1: domyślnie tylko zakupy z Optimy i oferty do tego zapytania. */
  cennikEtapu1?: boolean
}) {
  const s = useSlowniki()
  const [wiersze, setWiersze] = useState<WierszCeny[]>([])
  const [tylkoKategoria, setTylkoKategoria] = useState(true)
  const [tolerancja, setTolerancja] = useState(15)
  const [tekst, setTekst] = useState('')
  const [tylkoEtap1, setTylkoEtap1] = useState(etap1)
  useEffect(() => { setTylkoEtap1(etap1) }, [etap1, pozycja])
  // Usługi (kooperacja, badania, transport): cena tylko z ofert zebranych do tego zapytania; reszta - orientacyjnie.
  const [tylkoZapytanie, setTylkoZapytanie] = useState(true)
  useEffect(() => { setTylkoZapytanie(true) }, [pozycja])

  useEffect(() => { if (pozycja) void cenyZBazy().then((r) => setWiersze(r.wiersze)) }, [pozycja])
  useEffect(() => { setTekst('') }, [pozycja])

  const miara: 'cena_pln_kg' | 'cena_pln_m' | 'cena_pln_szt' | 'cena_pln_odniesienia' =
    uslugi ? 'cena_pln_odniesienia' : pozycja?.jednostka_ceny === 'kg' ? 'cena_pln_kg' : pozycja?.jednostka_ceny === 'm' ? 'cena_pln_m' : 'cena_pln_szt'

  const wynik = useMemo(() => {
    if (!pozycja) return []
    const kat = uslugi ? (pozycja.sekcja ? `u:${pozycja.sekcja}` : '') : pozycja.sekcja ? `m:${pozycja.sekcja}` : ''
    // Zakupy usług (kooperacja, badania) tylko jako orientacyjne - gdy włączone w Ustawieniach.
    const zakres = uslugi ? wiersze.filter((w) => w.kategoria_uslugi && (w.zrodlo !== 'zakup' || !!s.ustawienia.cena_historyczna_uslug) && (!tylkoZapytanie || !zapytanieId || (w.zrodlo === 'oferta' && w.zapytanie_id === zapytanieId))) : tylkoEtap1 ? cennikEtapu1(wiersze, zapytanieId) : wiersze.filter((w) => !w.kategoria_uslugi)
    const doZapytania = (w: WierszCeny) => (w.zrodlo === 'oferta' && !!zapytanieId && w.zapytanie_id === zapytanieId ? 0 : 1)
    return filtrujCeny(zakres, {
      ...PUSTY_FILTR, tekst, kategoria: tylkoKategoria ? kat : '', gatunek: uslugi ? '' : pozycja.gatunek ?? '',
      d_zew: uslugi ? null : pozycja.d_zew ?? null, grubosc: uslugi ? null : pozycja.grubosc ?? null, tolerancja_proc: tolerancja,
    }, s.gatunki).sort((a, b) => {
      // Najpierw oferty do tego zapytania, potem pozycje z ceną w potrzebnej mierze, potem najtańsze.
      if (doZapytania(a) !== doZapytania(b)) return doZapytania(a) - doZapytania(b)
      const x = a[miara] ?? (uslugi ? a.wartosc_pln : null); const y = b[miara] ?? (uslugi ? b.wartosc_pln : null)
      if (x === null && y === null) return 0
      if (x === null) return 1
      if (y === null) return -1
      return x - y
    }).slice(0, 200)
  }, [pozycja, wiersze, tylkoKategoria, tolerancja, tekst, s.gatunki, s.ustawienia.cena_historyczna_uslug, uslugi, miara, tylkoEtap1, zapytanieId, tylkoZapytanie])
  // Porównanie ofert usług: najtańsza (wartość w PLN) i najszybsza (termin w dniach).
  const najlepsze = uslugi ? najlepszeOferty(wynik.filter((w) => w.zrodlo === 'oferta').map((w) => ({ id: w.klucz, dostawca: w.dostawca, cena_pln: w.wartosc_pln, termin_dni: w.termin_dni, waznosc_do: w.waznosc_do }))) : { najtansza: null, najszybsza: null }

  const dzis = new Date().toISOString().slice(0, 10)

  function wez(w: WierszCeny) {
    // Zakup usługi to tylko orientacyjna cena historyczna - nie źródło ceny w wycenie.
    if (uslugi && w.zrodlo === 'zakup') return
    wybierz(cenaZWiersza(w, pozycja?.jednostka_ceny ?? 'jm', uslugi))
  }

  const kolumnyZnajdz: KolumnaTabeli<WierszCeny>[] = [
    { id: 'zrodlo', naglowek: t('Źródło'), typ: 'lista', wartosc: (w) => (w.zrodlo === 'zakup' ? (uslugi ? t('Optima (orientacyjnie)') : 'Optima') : zapytanieId && w.zapytanie_id === zapytanieId ? 'oferta do ZO' : 'oferta'), className: 'text-xs' },
    { id: 'data', naglowek: t('Data'), typ: 'data', wartosc: (w) => w.data, komorka: (w) => dataPL(w.data), className: 'whitespace-nowrap text-xs' },
    {
      id: 'dostawca', naglowek: t('Dostawca'), typ: 'lista', wartosc: (w) => w.dostawca, className: 'max-w-[12rem] text-xs',
      komorka: (w) => <span>{w.dostawca}{najlepsze.najtansza === w.klucz && <span className="ml-1 rounded bg-limonka-jasna px-1 text-[10px] font-semibold">{t('najtańsza')}</span>}{najlepsze.najszybsza === w.klucz && <span className="ml-1 rounded bg-blekit-jasny px-1 text-[10px] font-semibold">{t('najszybsza')}</span>}</span>,
    },
    { id: 'opis', naglowek: t('Opis'), typ: 'tekst', wartosc: (w) => w.opis, className: 'max-w-[20rem] text-xs' },
    { id: 'gatunek', naglowek: t('Gatunek'), typ: 'lista', wartosc: (w) => w.gatunek, className: 'whitespace-nowrap text-xs' },
    { id: 'wymiary', naglowek: t('Wymiary'), typ: 'tekst', wartosc: (w) => opisWymiarow(w) || null, className: 'whitespace-nowrap text-xs' },
    ...(['cena_pln_kg', 'cena_pln_m', 'cena_pln_szt'] as const).map((k): KolumnaTabeli<WierszCeny> => ({
      id: k, naglowek: k === 'cena_pln_kg' ? t('PLN/kg') : k === 'cena_pln_m' ? t('PLN/m') : t('PLN/szt'), typ: 'liczba', wartosc: (w) => w[k],
      komorka: (w) => (w[k] !== null ? liczba(w[k]!, 2) : ''), className: cn('text-xs', k === miara && 'font-semibold'),
    })),
    ...(uslugi ? [
      { id: 'cena', naglowek: t('Cena jedn.'), typ: 'liczba', wartosc: (w) => w.cena_jedn, komorka: (w) => `${liczba(w.cena_jedn, 2)} ${w.waluta}/${w.jm}`, className: 'whitespace-nowrap text-xs' },
      { id: 'wartosc', naglowek: t('Wartość PLN'), typ: 'liczba', wartosc: (w) => w.wartosc_pln, komorka: (w) => liczba(w.wartosc_pln, 2), className: 'text-xs font-semibold' },
    ] as KolumnaTabeli<WierszCeny>[] : []),
    { id: 'termin', naglowek: t('Termin'), typ: 'tekst', wartosc: (w) => w.termin ?? (w.termin_dni ? t('{0} dni', w.termin_dni) : null), className: 'whitespace-nowrap text-xs' },
    { id: 'waznosc', naglowek: t('Ważność'), typ: 'data', wartosc: (w) => w.waznosc_do, komorka: (w) => (w.waznosc_do ? dataPL(w.waznosc_do) : w.waznosc_opis), className: 'whitespace-nowrap text-xs' },
    { id: 'wymagania', naglowek: t('Wymagania'), typ: 'tekst', wartosc: () => null, bezFiltra: true, komorka: (w) => <KolumnaWymagan w={w.wymagania} /> },
  ]

  return (
    <Dialog open={!!pozycja} onOpenChange={(o) => !o && zamknij()}>
      <DialogContent className="max-w-6xl">
        <DialogTitle>{t('Znajdź cenę:')}{' '}{pozycja?.nazwa || pozycja?.rodzaj || ''} {pozycja?.gatunek ?? ''}</DialogTitle>
        <DialogDescription>
          {t('Oferty dostawców i zakupy z Optimy. Klik w wiersz kopiuje cenę (')}{uslugi ? t('PLN za jm') : miara === 'cena_pln_kg' ? t('PLN/kg') : miara === 'cena_pln_m' ? t('PLN/m') : t('PLN/szt')}{t(') i jej źródło do wyceny.')}
          <span className="ml-1 rounded bg-amber-100 px-1">{t('starsze niż')}{' '}{s.ustawienia.wiek_ceny_ostrzezenie_mies} {t('mies.')}</span>
          <span className="ml-1 rounded bg-red-100 px-1">{t('oferta po terminie')}</span>
        </DialogDescription>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <input className="pole w-56" placeholder={t('zawęź: opis, dostawca...')} value={tekst} onChange={(e) => setTekst(e.target.value)} />
          {uslugi && zapytanieId && <label className="flex items-center gap-1" title={t('Ceny kooperacji i badań pochodzą z ofert zebranych pod to zapytanie; inne oferty - tylko orientacyjnie')}><input type="checkbox" checked={tylkoZapytanie} onChange={(e) => setTylkoZapytanie(e.target.checked)} /> {t('tylko oferty do tego zapytania')}</label>}
          {!uslugi && <label className="flex items-center gap-1" title={t('Etap 1: ceny z przeszłych zleceń (karty dostawy Optimy) i oferty zebrane do tego zapytania')}><input type="checkbox" checked={tylkoEtap1} onChange={(e) => setTylkoEtap1(e.target.checked)} /> {t('tylko Optima i oferty do tego zapytania')}</label>}
          <label className="flex items-center gap-1"><input type="checkbox" checked={tylkoKategoria} onChange={(e) => setTylkoKategoria(e.target.checked)} /> {t('tylko ta kategoria')}</label>
          {!uslugi && (
            <label className="flex items-center gap-1">{t('wymiary ±')}
              <select className="pole w-20" value={tolerancja} onChange={(e) => setTolerancja(Number(e.target.value))}>
                {[5, 15, 30, 100, 1000].map((t) => <option key={t} value={t}>{t === 1000 ? 'dowolne' : `${t}%`}</option>)}
              </select></label>
          )}
          <span className="text-slate-500">{wynik.length} pozycji</span>
        </div>
        <div className="mt-2 max-h-[60vh] overflow-auto rounded border border-slate-200">
          <Tabela id="znajdz-cene" kolumny={kolumnyZnajdz} wiersze={wynik} klucz={(w) => w.klucz} onKlik={wez} bezPaska
            klasaWiersza={(w) => (uslugi && w.zrodlo === 'zakup' ? 'cursor-default italic text-slate-400' : w.zrodlo === 'oferta' && !!w.waznosc_do && w.waznosc_do < dzis ? 'bg-red-50' : (wiekMiesiecy(w.data) ?? 0) >= s.ustawienia.wiek_ceny_ostrzezenie_mies ? 'bg-amber-50' : 'hover:bg-limonka-jasna')}
            pusto={t('Brak dopasowanych cen - poszerz kryteria.')} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
