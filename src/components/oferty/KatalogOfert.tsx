import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, EyeOff, FileText, FolderOpen, Pencil, RefreshCw, Sparkles, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSlowniki } from '@/lib/slowniki'
import { dataGodzinaPL, liczba } from '@/lib/format'
import { cn } from '@/lib/utils'
import { szacujAi, wywolajAi, type OfertaAi } from '@/lib/ai'
import { otworzDokument } from '@/lib/magazyn'
import { wczytajFormularzOferty, zapiszOferte, type FormularzOferty as Formularz } from '@/lib/oferty'
import {
  daneAiWpisu, dodajDoKatalogu, folderyObslugiwane, plikiFolderu, wpisyKatalogu, wybierzFolder, zapamietajFolder, zapamietanyFolder,
  zapiszOdczytAi, zatwierdzOferty, znaneSkroty, type DostawcaKatalogu, type StatusKatalogu, type UchwytFolderu, type WpisKatalogu,
} from '@/lib/katalogOfert'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'
import { FormularzOferty } from './FormularzOferty'
import { t } from '@/i18n'

const STATUSY: Record<StatusKatalogu, string> = {
  nowy: t('czeka na odczyt'), do_przejrzenia: t('oferta do przejrzenia'), zatwierdzony: t('zatwierdzona - ceny w wycenach'), pominiety: t('pominięty'), blad: t('błąd odczytu'),
}
const KOLORY: Record<StatusKatalogu, string> = {
  nowy: 'bg-slate-100 text-slate-700 ring-slate-300', do_przejrzenia: 'bg-amber-50 text-amber-800 ring-amber-300',
  zatwierdzony: 'bg-limonka-jasna text-limonka-ciemna ring-limonka', pominiety: 'bg-slate-50 text-slate-400 ring-slate-200', blad: 'bg-red-50 text-red-700 ring-red-300',
}

/** Pliki z przeciągniętego folderu (Chrome, Edge, Firefox - webkitGetAsEntry) razem ze ścieżką względną. */
async function plikiZPrzeciagniecia(e: React.DragEvent): Promise<{ plik: File; sciezka: string | null }[]> {
  const wpisy = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[]
  if (!wpisy.some((w) => w.isDirectory)) return [...e.dataTransfer.files].map((plik) => ({ plik, sciezka: null }))
  const wynik: { plik: File; sciezka: string | null }[] = []
  const czytaj = async (w: FileSystemEntry): Promise<void> => {
    if (w.isFile) { wynik.push({ plik: await new Promise<File>((ok, zle) => (w as FileSystemFileEntry).file(ok, zle)), sciezka: w.fullPath.replace(/^\//, '') }); return }
    const czytnik = (w as FileSystemDirectoryEntry).createReader()
    let partia: FileSystemEntry[]
    do {
      partia = await new Promise<FileSystemEntry[]>((ok, zle) => czytnik.readEntries(ok, zle))
      for (const x of partia) await czytaj(x)
    } while (partia.length)
  }
  for (const w of wpisy) await czytaj(w)
  return wynik
}

interface PlanAi { wpisy: WpisKatalogu[]; koszt: number | null; pozostalo: number | null; uwaga: string | null }

/**
 * Katalog ofert materiałowych: zaopatrzenie wrzuca oferty do podłączonego folderu firmowego (aplikacja sama sprawdza
 * nowe pliki) albo przeciąga je tutaj. Odczyt bez AI przy imporcie, przez AI na życzenie (koszt przed odczytem);
 * powstaje oferta do przejrzenia, a po zatwierdzeniu jej ceny są w „Znajdź cenę” i wycenie automatycznej.
 */
export function KatalogOfert({ mozeEdytowac }: { mozeEdytowac: boolean }) {
  const s = useSlowniki()
  const [wpisy, setWpisy] = useState<WpisKatalogu[]>([])
  const [zaznaczone, setZaznaczone] = useState<Set<string | number>>(new Set())
  const [dostawcy, setDostawcy] = useState<DostawcaKatalogu[]>([])
  const [folder, setFolder] = useState<UchwytFolderu | null>(null)
  const [dostep, setDostep] = useState<PermissionState | null>(null)
  const [plan, setPlan] = useState<PlanAi | null>(null)
  const [edytowana, setEdytowana] = useState<{ wpis: WpisKatalogu; f: Formularz } | null>(null)
  const [przeciaganie, setPrzeciaganie] = useState(false)
  const [zajety, setZajety] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  const sprawdzony = useRef(false)

  const wczytaj = useCallback(async () => {
    try {
      const [w, { data: d }] = await Promise.all([wpisyKatalogu(), supabase.from('dostawcy').select('id, nazwa, aliasy, kontakty')])
      setWpisy(w); setDostawcy((d ?? []) as DostawcaKatalogu[])
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }, [])
  useEffect(() => { void wczytaj() }, [wczytaj])

  /** Import plików do katalogu - duplikaty (ten sam plik) pomijane, odczyt bez AI od razu. */
  const importuj = useCallback(async (pliki: { plik: File; sciezka: string | null }[]) => {
    if (!mozeEdytowac || !pliki.length) return
    setBlad(null); setInfo(null)
    const znane = await znaneSkroty()
    const { data: d } = await supabase.from('dostawcy').select('id, nazwa, aliasy, kontakty')
    const listaDostawcow = (d ?? []) as DostawcaKatalogu[]
    let nowych = 0, ofert = 0, duplikatow = 0, pominietych = 0
    const bledy: string[] = []
    for (const [i, { plik, sciezka }] of pliki.entries()) {
      setZajety(t('Katalog: {0} ({1}/{2})...', plik.name, i + 1, pliki.length))
      try {
        const w = await dodajDoKatalogu(plik, { folder: sciezka, dostawcy: listaDostawcow, s, limitMb: s.ustawienia.limity_planu.plik_mb, znane })
        if (w.stan === 'dodany') { nowych++; if (w.oferta) ofert++ } else if (w.stan === 'duplikat') duplikatow++; else pominietych++
      } catch (e) { bledy.push(`${plik.name}: ${e instanceof Error ? e.message : String(e)}`) }
    }
    setZajety(null)
    setInfo(t('Nowych plików: {0} (oferty od razu z odczytu bez AI: {1}, czeka na odczyt AI: {2}); już w katalogu: {3}{4}.',
      nowych, ofert, nowych - ofert, duplikatow, pominietych ? t('; pominięte (inny typ pliku): {0}', pominietych) : ''))
    if (bledy.length) setBlad(bledy.join('\n'))
    await wczytaj()
  }, [mozeEdytowac, s, wczytaj])

  /** Nowe pliki z podłączonego folderu (przy pierwszym razie - wybór folderu). */
  const sprawdzFolder = useCallback(async (u?: UchwytFolderu | null, bezPytania = false) => {
    try {
      let uchwyt = u ?? folder
      if (!uchwyt) { uchwyt = await wybierzFolder(); await zapamietajFolder(uchwyt); setFolder(uchwyt) }
      let d = await uchwyt.queryPermission({ mode: 'read' })
      if (d !== 'granted' && !bezPytania) d = await uchwyt.requestPermission({ mode: 'read' })
      setDostep(d)
      if (d !== 'granted') return
      setZajety(t('Sprawdzanie folderu {0}...', uchwyt.name))
      const pliki = await plikiFolderu(uchwyt)
      await importuj(pliki.map((p) => ({ plik: p.plik, sciezka: `${uchwyt!.name}/${p.sciezka}` })))
    } catch (e) {
      setZajety(null)
      if (!(e instanceof DOMException && e.name === 'AbortError')) setBlad(e instanceof Error ? e.message : String(e))
    }
  }, [folder, importuj])

  // Zapamiętany folder: przy otwarciu katalogu nowe pliki sprawdzają się same, gdy przeglądarka pamięta zgodę.
  useEffect(() => {
    if (!folderyObslugiwane() || sprawdzony.current) return
    sprawdzony.current = true
    void zapamietanyFolder().then(async (u) => {
      if (!u) return
      setFolder(u)
      const d = await u.queryPermission({ mode: 'read' }).catch(() => 'prompt' as PermissionState)
      setDostep(d)
      if (d === 'granted' && mozeEdytowac) void sprawdzFolder(u, true)
    })
  }, [mozeEdytowac, sprawdzFolder])

  const wybrane = wpisy.filter((w) => zaznaczone.has(w.id))

  async function szacuj() {
    const doAi = wybrane.filter((w) => w.dokument_id && w.status !== 'zatwierdzony')
    if (!doAi.length) { setBlad(t('Zaznacz pliki do odczytu przez AI (bez zatwierdzonych).')); return }
    setBlad(null)
    let suma = 0
    let pozostalo: number | null = null
    let uwaga: string | null = null
    for (const [i, w] of doAi.entries()) {
      setZajety(t('Szacowanie kosztu {0}/{1}: {2}...', i + 1, doAi.length, w.nazwa_pliku))
      try {
        const { dane } = await daneAiWpisu(w)
        const { szacunek, blad: b } = await szacujAi('wyciagnij_oferte', dane)
        if (b || !szacunek) { uwaga = b ?? t('Nie udało się oszacować kosztu.'); break }
        suma += szacunek.koszt_pln; pozostalo = szacunek.pozostalo_miesiac_pln
      } catch (e) { uwaga = `${w.nazwa_pliku}: ${e instanceof Error ? e.message : String(e)}`; break }
    }
    setZajety(null)
    setPlan({ wpisy: doAi, koszt: uwaga ? null : suma, pozostalo, uwaga })
  }

  async function odczytajAi() {
    if (!plan) return
    const p = plan
    setPlan(null)
    let ok = 0
    let koszt = 0
    const bledy: string[] = []
    for (const [i, w] of p.wpisy.entries()) {
      setZajety(t('Odczyt AI {0}/{1}: {2}...', i + 1, p.wpisy.length, w.nazwa_pliku))
      try {
        const { plik, dane } = await daneAiWpisu(w)
        const { odp, blad: b } = await wywolajAi<OfertaAi>('wyciagnij_oferte', dane)
        if (b || !odp) throw new Error(b ?? t('Brak odpowiedzi.'))
        koszt += odp.koszt_pln
        await zapiszOdczytAi(w, odp.wynik, odp.koszt_pln, plik, dostawcy, s)
        ok++
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e)
        bledy.push(`${w.nazwa_pliku}: ${m}`)
        await supabase.from('katalog_ofert').update({ status: 'blad', uwagi: m.slice(0, 500) }).eq('id', w.id)
      }
    }
    setZajety(null)
    setInfo(t('Odczytano przez AI: {0} z {1} plików, koszt {2} zł. Oferty są do przejrzenia - sprawdź je i zatwierdź.', ok, p.wpisy.length, liczba(koszt, 2)))
    if (bledy.length) setBlad(bledy.join('\n'))
    setZaznaczone(new Set())
    await wczytaj()
  }

  async function zatwierdz() {
    setBlad(null)
    try {
      const n = await zatwierdzOferty(wybrane)
      setInfo(n ? t('Zatwierdzono ofert: {0} - ich ceny są w „Znajdź cenę” i wycenie automatycznej.', n) : t('Zaznacz oferty do przejrzenia (z odczytaną ofertą).'))
      setZaznaczone(new Set()); await wczytaj()
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }

  async function pomin() {
    const { error } = await supabase.from('katalog_ofert').update({ status: 'pominiety' }).in('id', wybrane.map((w) => w.id))
    if (error) setBlad(error.message)
    setZaznaczone(new Set()); await wczytaj()
  }

  async function otworzPlik(w: WpisKatalogu) {
    if (!w.dokument_id) return
    const { data } = await supabase.from('dokumenty').select('sciezka, mime').eq('id', w.dokument_id).single()
    if (data?.sciezka) await otworzDokument(data.sciezka, data.mime ?? undefined).catch((e) => setBlad(String(e.message ?? e)))
    else setBlad(t('Plik zapisany jako tekst (mail) - otwórz ofertę, żeby zobaczyć treść.'))
  }

  async function popraw(w: WpisKatalogu) {
    if (!w.oferta_id) return
    const f = await wczytajFormularzOferty(w.oferta_id)
    if (f) setEdytowana({ wpis: w, f })
  }

  if (edytowana) {
    return (
      <FormularzOferty poczatkowy={edytowana.f} anuluj={() => setEdytowana(null)}
        zapisz={async (f, st) => {
          await zapiszOferte(f, s, st)
          await supabase.from('katalog_ofert').update({ status: st === 'zatwierdzona' ? 'zatwierdzony' : 'do_przejrzenia', pozycji: f.pozycje.filter((p) => p.opis.trim()).length, nr_zo: f.nr_zo || null }).eq('id', edytowana.wpis.id)
          setEdytowana(null); await wczytaj()
        }} />
    )
  }

  const kolumny: KolumnaTabeli<WpisKatalogu>[] = [
    { id: 'plik', naglowek: t('Plik'), typ: 'tekst', wartosc: (w) => w.nazwa_pliku, className: 'text-sm font-medium' },
    { id: 'folder', naglowek: t('Folder'), typ: 'tekst', wartosc: (w) => w.folder?.split('/').slice(0, -1).join('/') || null, className: 'text-xs text-slate-500' },
    { id: 'dodano', naglowek: t('Dodano'), typ: 'data', wartosc: (w) => w.utworzono, komorka: (w) => dataGodzinaPL(w.utworzono), className: 'whitespace-nowrap text-xs' },
    { id: 'status', naglowek: t('Stan'), typ: 'lista', wartosc: (w) => STATUSY[w.status], komorka: (w) => <span className={cn('znacznik', KOLORY[w.status])} title={w.uwagi ?? undefined}>{STATUSY[w.status]}</span> },
    { id: 'dostawca', naglowek: t('Dostawca'), typ: 'lista', wartosc: (w) => w.dostawca, className: 'text-sm' },
    { id: 'zo', naglowek: t('ZO'), typ: 'lista', wartosc: (w) => w.nr_zo, className: 'whitespace-nowrap text-sm' },
    { id: 'pozycji', naglowek: t('Pozycji'), typ: 'liczba', wartosc: (w) => w.pozycji },
    { id: 'koszt', naglowek: t('Koszt AI'), typ: 'liczba', wartosc: (w) => (w.koszt_pln ? Number(w.koszt_pln) : null), komorka: (w) => (w.koszt_pln ? `${liczba(Number(w.koszt_pln), 2)} zł` : ''), className: 'text-xs' },
    {
      id: 'akcje', naglowek: '', typ: 'tekst', wartosc: () => '', bezFiltra: true, bezSortu: true, className: 'text-right',
      komorka: (w) => (
        <span className="inline-flex gap-1">
          {w.dokument_id && <Button rozmiar="maly" title={t('Otwórz plik')} onClick={(e) => { e.stopPropagation(); void otworzPlik(w) }}><FileText className="h-4 w-4" /></Button>}
          {mozeEdytowac && w.oferta_id && <Button rozmiar="maly" title={t('Sprawdź i popraw ofertę')} onClick={(e) => { e.stopPropagation(); void popraw(w) }}><Pencil className="h-4 w-4" /></Button>}
        </span>
      ),
    },
  ]

  const doPrzejrzenia = wpisy.filter((w) => w.status === 'do_przejrzenia').length
  const czeka = wpisy.filter((w) => w.status === 'nowy' || w.status === 'blad').length

  return (
    <div className="space-y-3">
      {blad && <Komunikat rodzaj="blad"><span className="whitespace-pre-wrap">{blad}</span></Komunikat>}
      {info && <Komunikat rodzaj="sukces">{info}</Komunikat>}
      {zajety && <Komunikat rodzaj="info">{zajety}</Komunikat>}

      {mozeEdytowac && (
        <div className="grid gap-3 lg:grid-cols-2">
          <section className="sekcja space-y-2">
            <h4 className="flex items-center gap-2 text-sm font-semibold"><FolderOpen className="h-4 w-4" /> {t('Folder ofert (dysk / serwer firmy)')}</h4>
            {folderyObslugiwane() ? (
              <>
                <p className="text-xs text-slate-600">
                  {folder
                    ? t('Podłączony folder: {0}. Nowe pliki wrzucone do niego (także do podfolderów) sprawdzają się same przy otwarciu katalogu - albo przyciskiem.', folder.name)
                    : t('Wskaż folder, do którego zaopatrzenie wrzuca oferty materiałowe (np. dysk sieciowy). Aplikacja zapamięta go w tej przeglądarce i będzie z niego zaciągać nowe pliki.')}
                  {folder && dostep !== 'granted' && ` ${t('Przeglądarka prosi o potwierdzenie dostępu - kliknij „Sprawdź nowe pliki”.')}`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button wariant="akcent" rozmiar="maly" disabled={!!zajety} onClick={() => void sprawdzFolder()}>
                    <RefreshCw className="h-3 w-3" /> {folder ? t('Sprawdź nowe pliki') : t('Podłącz folder ofert')}
                  </Button>
                  {folder && <Button rozmiar="maly" wariant="cichy" disabled={!!zajety} onClick={() => { setFolder(null); void zapamietajFolder(null).then(() => sprawdzFolder(null)) }}>{t('Zmień folder')}</Button>}
                </div>
              </>
            ) : <p className="text-xs text-amber-800">{t('Podłączanie folderu działa w Chrome i Edge. W tej przeglądarce przeciągnij pliki albo folder obok.')}</p>}
          </section>
          <label
            onDragOver={(e) => { e.preventDefault(); setPrzeciaganie(true) }} onDragLeave={() => setPrzeciaganie(false)}
            onDrop={(e) => { e.preventDefault(); setPrzeciaganie(false); void plikiZPrzeciagniecia(e).then(importuj) }}
            className={cn('flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed bg-white p-4 text-center', przeciaganie ? 'border-blekit bg-blekit-jasny' : 'border-slate-300 hover:border-blekit')}>
            <Upload className="h-6 w-6 text-slate-400" />
            <span className="text-sm font-medium">{t('Przeciągnij oferty albo cały folder')}</span>
            <span className="text-xs text-slate-500">{t('PDF, skany, maile .msg / .eml, Excel, Word, zdjęcia - ten sam plik drugi raz się nie doda')}</span>
            <input type="file" multiple className="hidden" accept=".pdf,.msg,.eml,.xlsx,.xls,.docx,.jpg,.jpeg,.png,.txt"
              onChange={(e) => { if (e.target.files) void importuj([...e.target.files].map((plik) => ({ plik, sciezka: null }))); e.target.value = '' }} />
          </label>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">{t('Do przejrzenia: {0} · czeka na odczyt AI: {1}', doPrzejrzenia, czeka)}</span>
        <span className="ml-auto" />
        {mozeEdytowac && (
          <>
            <Button rozmiar="maly" wariant="akcent" disabled={!wybrane.length || !!zajety} onClick={() => void szacuj()}
              title={t('Pozycje z wymiarami, gatunkami i cenami - najpierw szacunek kosztu')}><Sparkles className="h-3 w-3" /> {t('Odczytaj przez AI ({0})', wybrane.length)}</Button>
            <Button rozmiar="maly" wariant="glowny" disabled={!wybrane.length || !!zajety} onClick={() => void zatwierdz()}
              title={t('Ceny zatwierdzonych ofert są w „Znajdź cenę” i wycenie automatycznej')}><CheckCircle2 className="h-3 w-3" /> {t('Zatwierdź oferty ({0})', wybrane.length)}</Button>
            <Button rozmiar="maly" wariant="cichy" disabled={!wybrane.length || !!zajety} onClick={() => void pomin()}><EyeOff className="h-3 w-3" /> {t('Pomiń')}</Button>
          </>
        )}
      </div>
      <Tabela id="katalog-ofert" kolumny={kolumny} wiersze={wpisy} klucz={(w) => w.id}
        zaznaczanie={mozeEdytowac ? { zaznaczone, zmien: setZaznaczone } : undefined}
        klasaWiersza={(w) => (w.status === 'pominiety' ? 'text-slate-400' : undefined)}
        pusto={t('Katalog jest pusty - podłącz folder ofert albo przeciągnij pliki.')} />

      <Dialog open={!!plan} onOpenChange={(o) => !o && setPlan(null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t('Odczyt ofert przez AI - potwierdzenie kosztu')}</DialogTitle>
          <DialogDescription>{t('Do Claude API trafi treść zaznaczonych plików (tekst; skany jako obrazy stron).')}</DialogDescription>
          {plan && (
            <div className="mt-3 space-y-3 text-sm">
              <ul className="max-h-40 list-disc overflow-auto pl-5 text-xs">{plan.wpisy.map((w) => <li key={w.id}>{w.nazwa_pliku}</li>)}</ul>
              {plan.uwaga
                ? <Komunikat rodzaj="ostrzezenie">{plan.uwaga}</Komunikat>
                : <p>{t('Szacowany koszt:')}{' '}<strong>{liczba(plan.koszt ?? 0, 2)} {t('zł')}</strong>{plan.pozostalo !== null && t(' · w budżecie miesiąca zostało {0} zł', liczba(plan.pozostalo, 2))}.</p>}
              <div className="flex justify-end gap-2">
                <Button onClick={() => setPlan(null)}>{t('Anuluj')}</Button>
                <Button wariant="akcent" disabled={!!plan.uwaga} onClick={() => void odczytajAi()}><Sparkles className="h-4 w-4" /> {t('Odczytaj')}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
