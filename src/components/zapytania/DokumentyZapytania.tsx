import { useCallback, useEffect, useState, type DragEvent } from 'react'
import { Archive, ChevronDown, ChevronRight, FileText, FolderUp, GripVertical, Mail, Paperclip, Trash2, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { dataGodzinaPL, rozmiar } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ETYKIETY_TYPU, splaszczArchiwa, wczytajDane, type TypDokumentu, type WczytanyPlik } from '@/lib/dokumenty'
import { bezpiecznaNazwa, otworzDokument, pobierzBajty, zapiszDokument } from '@/lib/magazyn'
import { polaZapytaniaZDokumentow, type DokumentDoPol } from '@/lib/polaZDokumentow'
import { PUSTY_WYNIK, type Obszar } from '@/lib/rysunki'
import type { Profil } from '@/lib/types'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { doKosza } from '@/lib/kosz'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'
import { t } from '@/i18n'

export interface Dokument {
  id: string; nazwa_pliku: string; typ: TypDokumentu; mime: string | null; rozmiar: number | null; sciezka: string | null
  stan: 'zapisany' | 'tylko_tekst' | 'pominiety_limit' | 'zarchiwizowany'; istotny: boolean; nadrzedny_id: string | null
  metadane: Record<string, unknown>; utworzono: string; utworzyl: string | null; dl_tekstu: number
  rozmiar_oryginalny: number | null; rozmiar_zapisany: number | null; metoda_kompresji: string
}

const STANY: Record<Dokument['stan'], string> = {
  zapisany: '', tylko_tekst: t('tylko tekst'), pominiety_limit: t('pominięty - limit pliku'), zarchiwizowany: t('zarchiwizowany (oryginał w ZIP)'),
}

/** Grupy w widoku dokumentów (kolejność jak w zapytaniu: od zapytania, przez rysunki, do korespondencji). */
const GRUPY: [string, string][] = [
  ['zapytanie', t('Zapytanie ofertowe')], ['projekt', t('Projekt / opis techniczny')], ['rysunki', t('Rysunki')],
  ['wymagania', t('Wymagania techniczne / standardy')], ['karta_danych', t('Arkusz danych (datasheet)')], ['specyfikacja', t('Specyfikacja techniczna')],
  ['obliczenia', t('Obliczenia')], ['korespondencja', t('Korespondencja / pytania i odpowiedzi')], ['oferty', t('Oferty / dokumenty od dostawców')], ['inne', t('Inne')],
]
const KOLUMNY = 'id, nazwa_pliku, typ, mime, rozmiar, sciezka, stan, istotny, nadrzedny_id, metadane, utworzono, utworzyl, rozmiar_oryginalny, rozmiar_zapisany, metoda_kompresji'

/** Pliki z przeciągniętego folderu (Chrome, Edge, Firefox - webkitGetAsEntry); zwykłe pliki bez zmian. */
async function plikiZPrzeciagniecia(e: DragEvent): Promise<File[]> {
  const wpisy = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean) as FileSystemEntry[]
  if (!wpisy.some((w) => w.isDirectory)) return [...e.dataTransfer.files]
  const pliki: File[] = []
  const czytaj = async (w: FileSystemEntry): Promise<void> => {
    if (w.isFile) { pliki.push(await new Promise<File>((ok, zle) => (w as FileSystemFileEntry).file(ok, zle))); return }
    const czytnik = (w as FileSystemDirectoryEntry).createReader()
    for (;;) {
      const partia = await new Promise<FileSystemEntry[]>((ok, zle) => czytnik.readEntries(ok, zle))
      if (!partia.length) break
      for (const x of partia) await czytaj(x)
    }
  }
  for (const w of wpisy) await czytaj(w)
  return pliki
}

/**
 * Zakładka „Dokumenty”: przeciągnięcie wielu plików albo folderu, typ dokumentu bez AI (nazwa, treść, format arkusza),
 * kompresja przed zapisem z testem czytelności, duplikaty po SHA-256, grupy wg typu (zwijane, przeciągnij dokument na
 * grupę, żeby zmienić typ). Po dodaniu: puste pola karty zapytania z treści dokumentów (ze źródłem) i dane projektowe z datasheet.
 */
export function DokumentyZapytania({ zapytanieId, numer, profil, rodzajAparatu = null, poZmianieZapytania }: {
  zapytanieId: string; numer: string; profil: Profil; rodzajAparatu?: 'zbiornik' | 'wymiennik' | null; poZmianieZapytania?: () => void
}) {
  const s = useSlowniki()
  const [dokumenty, setDokumenty] = useState<Dokument[]>([])
  const [blad, setBlad] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [zajety, setZajety] = useState<string | null>(null)
  const [przeciaganie, setPrzeciaganie] = useState(false)
  const [zwiniete, setZwiniete] = useState<Set<string>>(new Set())
  const [nadGrupa, setNadGrupa] = useState<string | null>(null)

  const typy = s.typyDokumentow.length ? s.typyDokumentow : Object.entries(ETYKIETY_TYPU).map(([kod, nazwa], i) => ({ kod, nazwa, grupa: kod, istotny_domyslnie: true, kolejnosc: i }))
  const grupaTypu = (typ: string) => typy.find((x) => x.kod === typ)?.grupa ?? 'inne'
  const nazwaTypu = (typ: string) => typy.find((x) => x.kod === typ)?.nazwa ?? ETYKIETY_TYPU[typ] ?? typ

  const wczytaj = useCallback(async () => {
    const { data, error } = await supabase.from('dokumenty').select(KOLUMNY).eq('zapytanie_id', zapytanieId).order('utworzono')
    if (error) { setBlad(komunikatPL(error.message)); return }
    // Załączniki maili zapisane tylko z nadrzedny_id - doczytujemy je osobno.
    const ids = (data ?? []).map((d) => d.id)
    const { data: zal } = ids.length ? await supabase.from('dokumenty').select(KOLUMNY).in('nadrzedny_id', ids).is('zapytanie_id', null) : { data: [] }
    setDokumenty([...(data ?? []), ...(zal ?? [])].map((d) => ({ ...d, dl_tekstu: 0 })) as Dokument[])
  }, [zapytanieId])
  useEffect(() => { void wczytaj() }, [wczytaj])

  /** Puste pola karty zapytania z treści nowych dokumentów (bez AI) - z zapisem źródła (plik, strona). */
  async function uzupelnijZapytanie(wczytane: WczytanyPlik[]): Promise<string[]> {
    const wszystkie = wczytane.flatMap((w) => [w, ...w.zalaczniki.filter((z) => z.wgraj !== false)])
    const docs: DokumentDoPol[] = wszystkie.map((w) => ({ nazwa: w.nazwa, typ: w.typSugerowany, tekst: w.tekst }))
    const [{ data: z }, { data: kl }] = await Promise.all([
      supabase.from('zapytania').select('nr_zapytania_klienta, termin_oferty, klient_id, zrodla_pol').eq('id', zapytanieId).single(),
      supabase.from('klienci').select('id, nazwa, skrot, domeny'),
    ])
    if (!z) return []
    const pola = polaZapytaniaZDokumentow(docs, z, (kl ?? []).map((k) => ({ ...k, domeny: k.domeny ?? [] })), s.ustawienia.firma.domeny ?? [])
    if (!pola.length) return []
    const zmiany: Record<string, unknown> = Object.fromEntries(pola.map((p) => [p.pole, p.wartosc]))
    zmiany.zrodla_pol = { ...(z.zrodla_pol ?? {}), ...Object.fromEntries(pola.map((p) => [p.pole, p.zrodlo])) }
    const { error } = await supabase.from('zapytania').update(zmiany).eq('id', zapytanieId)
    if (error) return [komunikatPL(error.message)]
    poZmianieZapytania?.()
    const nazwy: Record<string, string> = { nr_zapytania_klienta: t('nr zapytania klienta'), termin_oferty: t('termin złożenia oferty'), klient_id: t('klient') }
    return [t('Uzupełniono z dokumentów: {0}.', pola.map((p) => `${nazwy[p.pole]} (${p.zrodlo})`).join(', '))]
  }

  /** Dane projektowe z arkusza danych PDF z warstwą tekstową - odczyt do sprawdzenia w zakładce Rysunki i listy materiałowe. */
  async function daneZDatasheet(w: WczytanyPlik, dokumentId: string | null): Promise<string | null> {
    if (w.typSugerowany !== 'karta_danych' || w.rodzaj !== 'pdf' || w.metadane.skan) return null
    const [{ otworzRysunek, tekstStrony }, { odczytajArkuszZTekstu }] = await Promise.all([import('@/lib/rysunkiPdf'), import('@/lib/odczytTekstowy')])
    const pdf = await otworzRysunek(w.dane)
    const parametry = []
    const krocce = []
    for (let nr = 1; nr <= Math.min(pdf.numPages, 3); nr++) {
      const wyn = odczytajArkuszZTekstu(await tekstStrony(pdf, nr))
      parametry.push(...wyn.parametry)
      if (!krocce.length) krocce.push(...wyn.krocce)
    }
    if (!parametry.length && !krocce.length) return null
    const kod = rodzajAparatu === 'wymiennik' ? 'warunki_pracy' : 'dane_projektowe'
    const nazwa = t('Dane projektowe z arkusza danych')
    const obszary: Obszar[] = [{ id: crypto.randomUUID(), rodzaj: 'parametry', rodzaj_tabeli: kod, nazwa, x: 0, y: 0, w: 1, h: 1 }]
    const { error } = await supabase.from('odczyty_rysunkow').insert({
      zapytanie_id: zapytanieId, dokument_id: dokumentId, nazwa_pliku: w.nazwa, strona: 1, obszary, nazwa, rodzaj_tabeli: kod,
      wynik: { ...PUSTY_WYNIK, parametry, krocce }, zrodlo: 'tekst', sprawdzony: false,
    })
    return error ? komunikatPL(error.message) : t('{0}: odczytano {1} parametrów projektu (zakładka Rysunki i listy materiałowe - do sprawdzenia).', w.nazwa, parametry.length)
  }

  async function dodaj(pliki: File[]) {
    if (!pliki.length) return
    setBlad(null); setInfo(null)
    const ostrz: string[] = []
    const wczytane: WczytanyPlik[] = []
    let ile = 0
    for (const f of pliki) {
      setZajety(t('Wczytywanie {0}...', f.name))
      try {
        for (const w of splaszczArchiwa([await wczytajDane(f.name, new Uint8Array(await f.arrayBuffer()))])) {
          setZajety(t('Kompresja i zapis {0}...', w.nazwa))
          const { dokument, ostrzezenia } = await zapiszDokument(w, { zapytanie_id: zapytanieId }, { limitMb: s.ustawienia.limity_planu.plik_mb })
          ostrz.push(...ostrzezenia)
          if (!dokument) continue
          wczytane.push(w)
          ile += 1 + w.zalaczniki.length
          const d = await daneZDatasheet(w, dokument.id).catch(() => null)
          if (d) ostrz.push(d)
        }
      } catch (e) { ostrz.push(e instanceof Error ? e.message : String(e)) }
    }
    setZajety(t('Karta zapytania z dokumentów...'))
    ostrz.push(...await uzupelnijZapytanie(wczytane).catch(() => []))
    setZajety(null)
    setInfo(t('Dodano {0} dokumentów.{1}', ile, ostrz.length ? ` ${ostrz.join(' ')}` : ''))
    await wczytaj()
  }

  async function zmien(d: Dokument, zmiana: Partial<Dokument>) {
    const { error } = await supabase.from('dokumenty').update(zmiana).eq('id', d.id)
    if (error) setBlad(komunikatPL(error.message))
    else setDokumenty((l) => l.map((x) => (x.id === d.id ? { ...x, ...zmiana } : x)))
  }

  async function usun(d: Dokument) {
    if (!window.confirm(t('Przenieść dokument {0}{1} do kosza?', d.nazwa_pliku, d.nadrzedny_id ? '' : t(' (razem z załącznikami)')))) return
    try { await doKosza('dokument', [d.id], `zapytanie:${zapytanieId}`); await wczytaj() } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }

  /** ZIP z oryginałami, potem usunięcie plików ze Storage - zostają teksty i wyniki analiz. */
  async function archiwizuj() {
    const zPlikami = dokumenty.filter((d) => d.sciezka && d.stan === 'zapisany')
    if (!zPlikami.length) { setInfo(t('Brak plików do archiwizacji.')); return }
    if (!window.confirm(t('Pobrać ZIP z {0} oryginałami i usunąć je z bazy? Teksty dokumentów i wyniki analiz zostaną w aplikacji.', zPlikami.length))) return
    setBlad(null)
    try {
      const { zipSync } = await import('fflate')
      const pliki: Record<string, Uint8Array> = {}
      for (const [i, d] of zPlikami.entries()) {
        setZajety(t('Pobieranie {0}/{1}: {2}', i + 1, zPlikami.length, d.nazwa_pliku))
        pliki[`${String(i + 1).padStart(2, '0')}_${bezpiecznaNazwa(d.nazwa_pliku)}`] = await pobierzBajty(d.sciezka!)
      }
      const zip = zipSync(pliki, { level: 6 })
      const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }))
      const a = document.createElement('a')
      a.href = url; a.download = `${numer.replace(/\//g, '-')}_dokumenty.zip`; a.click()
      URL.revokeObjectURL(url)
      setZajety(t('Usuwanie oryginałów z bazy...'))
      for (const d of zPlikami) {
        const { error } = await supabase.from('dokumenty').update({ stan: 'zarchiwizowany' }).eq('id', d.id)
        if (error) throw new Error(komunikatPL(error.message))
      }
      const { error } = await supabase.storage.from('dokumenty').remove(zPlikami.map((d) => d.sciezka!))
      if (error) throw new Error(komunikatPL(error.message))
      await supabase.from('dokumenty').update({ sciezka: null }).in('id', zPlikami.map((d) => d.id))
      setInfo(t('Zarchiwizowano {0} plików (ZIP pobrany). Zwolniono {1}.', zPlikami.length, rozmiar(zPlikami.reduce((a, d) => a + (d.rozmiar_zapisany ?? d.rozmiar ?? 0), 0))))
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setZajety(null)
    await wczytaj()
  }

  /** Dokument upuszczony na grupę: pierwszy typ tej grupy (np. rysunek), chyba że już jest w tej grupie. */
  async function upusc(grupa: string, e: DragEvent) {
    e.preventDefault(); setNadGrupa(null)
    const d = dokumenty.find((x) => x.id === e.dataTransfer.getData('application/x-dokument'))
    const typ = typy.filter((x) => x.grupa === grupa).sort((a, b) => a.kolejnosc - b.kolejnosc)[0]?.kod
    if (d && typ && grupaTypu(d.typ) !== grupa) await zmien(d, { typ })
  }

  const zalacznikDo = (d: Dokument) => !!d.nadrzedny_id && dokumenty.some((x) => x.id === d.nadrzedny_id)
  const kolumny: KolumnaTabeli<Dokument>[] = [
    {
      id: 'nazwa', naglowek: t('Dokument'), typ: 'tekst', wartosc: (d) => d.nazwa_pliku,
      komorka: (d) => (
        <div className={cn(zalacznikDo(d) && 'pl-6', !d.istotny && 'text-slate-400')}>
          <div className="flex items-center gap-2">
            <span draggable title={t('Przeciągnij na inną grupę, żeby zmienić typ')} className="cursor-grab text-slate-300 hover:text-slate-500"
              onDragStart={(e) => { e.dataTransfer.setData('application/x-dokument', d.id); e.dataTransfer.effectAllowed = 'move' }}><GripVertical className="h-4 w-4" /></span>
            {d.metadane?.temat !== undefined ? <Mail className="h-4 w-4 shrink-0" /> : zalacznikDo(d) ? <Paperclip className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
            {d.sciezka
              ? <button className="text-left text-blekit-ciemny underline" onClick={() => void otworzDokument(d.sciezka!, d.mime ?? undefined).catch((e) => setBlad(String(e.message)))}>{d.nazwa_pliku}</button>
              : <span>{d.nazwa_pliku}</span>}
          </div>
          {typeof d.metadane?.temat === 'string' && <div className="ml-12 text-xs text-slate-500">{String(d.metadane.temat)} · {String(d.metadane.od ?? '')}</div>}
        </div>
      ),
    },
    {
      id: 'typ', naglowek: t('Typ'), typ: 'lista', wartosc: (d) => nazwaTypu(d.typ), className: 'w-52',
      komorka: (d) => (
        <select className="pole-komorki text-sm" value={d.typ} title={d.metadane?.klasyfikacja ? t('Rozpoznano: {0}', String(d.metadane.klasyfikacja)) : undefined}
          onChange={(e) => void zmien(d, { typ: e.target.value })}>
          {typy.map((x) => <option key={x.kod} value={x.kod}>{x.nazwa}</option>)}
          {!typy.some((x) => x.kod === d.typ) && <option value={d.typ}>{d.typ}</option>}
        </select>
      ),
    },
    {
      id: 'istotny', naglowek: t('Istotny'), typ: 'tak_nie', wartosc: (d) => d.istotny, className: 'text-center',
      komorka: (d) => <input type="checkbox" checked={d.istotny} title={t('Istotny dla wyceny (idzie do analizy AI)')} onChange={(e) => void zmien(d, { istotny: e.target.checked })} />,
    },
    {
      id: 'rozmiar', naglowek: t('Rozmiar'), typ: 'liczba', wartosc: (d) => d.rozmiar, className: 'whitespace-nowrap text-xs text-left',
      komorka: (d) => {
        const po = d.rozmiar_zapisany
        const oszcz = d.metoda_kompresji !== 'brak' && po && d.rozmiar ? Math.round((1 - po / d.rozmiar) * 100) : 0
        return (
          <span title={d.metadane?.kompresja ? t('Kompresja: {0} ({1})', d.metoda_kompresji, String(d.metadane.kompresja)) : undefined}>
            {rozmiar(d.rozmiar)}{oszcz > 0 && <span className="text-limonka-ciemna"> → {rozmiar(po)} (−{oszcz}%)</span>}
            {d.metadane?.stron ? `, ${String(d.metadane.stron)} str.` : ''}{d.metadane?.skan ? t(', skan') : ''}{d.metadane?.tylko_przechowanie ? t(', tylko przechowanie') : ''}
          </span>
        )
      },
    },
    { id: 'stan', naglowek: t('Stan'), typ: 'lista', wartosc: (d) => STANY[d.stan] ?? null, className: 'text-xs text-amber-800' },
    { id: 'dodano', naglowek: t('Dodano'), typ: 'data', wartosc: (d) => d.utworzono, komorka: (d) => dataGodzinaPL(d.utworzono), className: 'whitespace-nowrap text-xs text-slate-500' },
    {
      id: 'akcje', naglowek: '', typ: 'tekst', wartosc: () => '', bezFiltra: true, bezSortu: true, className: 'text-center',
      komorka: (d) => (profil.rola === 'administrator' || d.utworzyl === profil.id) && (
        <button className="text-slate-400 hover:text-red-600" title={t('Przenieś do kosza')} onClick={() => void usun(d)}><Trash2 className="h-4 w-4" /></button>
      ),
    },
  ]

  // Kolejność w grupie: dokument, pod nim jego załączniki (mail, ZIP) - z wcięciem. Załącznik należy do grupy swojego typu.
  const wGrupie = (g: string) => {
    const moje = dokumenty.filter((d) => grupaTypu(d.typ) === g)
    const glowne = moje.filter((d) => !d.nadrzedny_id || !moje.some((x) => x.id === d.nadrzedny_id))
    return glowne.flatMap((d) => [d, ...moje.filter((x) => x.nadrzedny_id === d.id)])
  }
  const zapisanoRazem = dokumenty.reduce((a, d) => a + (d.rozmiar_zapisany ?? 0), 0)
  const oryginalRazem = dokumenty.filter((d) => d.stan === 'zapisany').reduce((a, d) => a + (d.rozmiar ?? 0), 0)

  return (
    <div className="space-y-3">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {info && <Komunikat rodzaj="info">{info}</Komunikat>}
      {zajety && <Komunikat rodzaj="info">{zajety}</Komunikat>}
      <div
        onDragOver={(e) => { if (!e.dataTransfer.types.includes('application/x-dokument')) { e.preventDefault(); setPrzeciaganie(true) } }}
        onDragLeave={() => setPrzeciaganie(false)}
        onDrop={(e) => { if (e.dataTransfer.types.includes('application/x-dokument')) return; e.preventDefault(); setPrzeciaganie(false); void plikiZPrzeciagniecia(e).then(dodaj) }}
        className={cn('flex flex-wrap items-center gap-3 rounded-lg border-2 border-dashed bg-white p-4', przeciaganie ? 'border-blekit bg-blekit-jasny' : 'border-slate-300')}
      >
        <Upload className="h-6 w-6 text-slate-400" />
        <span className="min-w-[16rem] flex-1 text-sm">
          {t('Przeciągnij pliki albo cały folder (PDF, DOCX, XLSX, JPG, PNG, TIF, DWG/DXF, maile .msg / .eml, ZIP). Typ rozpoznajemy bez AI, pliki kompresujemy przed zapisem. Limit pliku:')}{' '}{s.ustawienia.limity_planu.plik_mb} {t('MB.')}
        </span>
        <label className="cursor-pointer"><span className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"><Upload className="h-4 w-4" /> {t('Wybierz pliki')}</span>
          <input type="file" multiple className="hidden" onChange={(e) => e.target.files && void dodaj([...e.target.files])} /></label>
        <label className="cursor-pointer"><span className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-sm hover:bg-slate-50"><FolderUp className="h-4 w-4" /> {t('Wybierz folder')}</span>
          <input type="file" multiple className="hidden" {...({ webkitdirectory: '' } as Record<string, string>)} onChange={(e) => e.target.files && void dodaj([...e.target.files])} /></label>
      </div>

      {GRUPY.map(([g, nazwa]) => {
        const lista = wGrupie(g)
        const zwinieta = zwiniete.has(g)
        return (
          <section key={g} className={cn('rounded-lg border bg-white', nadGrupa === g ? 'border-blekit ring-2 ring-blekit/40' : 'border-slate-200')}
            onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-dokument')) { e.preventDefault(); setNadGrupa(g) } }}
            onDragLeave={() => setNadGrupa((x) => (x === g ? null : x))} onDrop={(e) => void upusc(g, e)}>
            <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold"
              onClick={() => setZwiniete((x) => { const n = new Set(x); if (n.has(g)) n.delete(g); else n.add(g); return n })}>
              {zwinieta ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {nazwa} <span className="rounded-full bg-slate-100 px-2 text-xs font-normal text-slate-600">{lista.length}</span>
            </button>
            {!zwinieta && lista.length > 0 && (
              <div className="border-t border-slate-100 p-2">
                <Tabela id={`dokumenty-${g}`} kolumny={kolumny} wiersze={lista} klucz={(d) => d.id} pusto={t('Brak dokumentów.')} />
              </div>
            )}
          </section>
        )
      })}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {t('„Istotny” = dokument idzie do analizy AI. Przeciągnij dokument (uchwyt przy nazwie) na inną grupę, żeby zmienić typ.')}
          {oryginalRazem > 0 && ' ' + t('Pliki w bazie: {0} (oryginały: {1}).', rozmiar(zapisanoRazem), rozmiar(oryginalRazem))}
        </p>
        <Button rozmiar="maly" onClick={() => void archiwizuj()} disabled={!!zajety}><Archive className="h-4 w-4" /> {t('Archiwizuj dokumenty zapytania (ZIP)')}</Button>
      </div>
    </div>
  )
}
