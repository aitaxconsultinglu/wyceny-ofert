import { useCallback, useEffect, useState } from 'react'
import { Archive, FileText, Mail, Paperclip, Trash2, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { dataGodzinaPL, rozmiar } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ETYKIETY_TYPU, splaszczArchiwa, wczytajPlik, type TypDokumentu } from '@/lib/dokumenty'
import { bezpiecznaNazwa, otworzDokument, pobierzBajty, zapiszDokument } from '@/lib/magazyn'
import type { Profil } from '@/lib/types'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { doKosza } from '@/lib/kosz'

export interface Dokument {
  id: string; nazwa_pliku: string; typ: TypDokumentu; mime: string | null; rozmiar: number | null; sciezka: string | null
  stan: 'zapisany' | 'tylko_tekst' | 'pominiety_limit' | 'zarchiwizowany'; istotny: boolean; nadrzedny_id: string | null
  metadane: Record<string, unknown>; utworzono: string; utworzyl: string | null; dl_tekstu: number
}

const STANY: Record<Dokument['stan'], string> = {
  zapisany: '', tylko_tekst: 'tylko tekst', pominiety_limit: 'pominięty - limit planu', zarchiwizowany: 'zarchiwizowany (oryginał w ZIP)',
}

export function DokumentyZapytania({ zapytanieId, numer, profil }: { zapytanieId: string; numer: string; profil: Profil }) {
  const s = useSlowniki()
  const [dokumenty, setDokumenty] = useState<Dokument[]>([])
  const [blad, setBlad] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [zajety, setZajety] = useState<string | null>(null)
  const [przeciaganie, setPrzeciaganie] = useState(false)

  const wczytaj = useCallback(async () => {
    // Bez pełnego tekstu (może być duży) - tylko jego długość z RPC byłaby lepsza; tu wystarczy brak kolumny.
    const { data, error } = await supabase.from('dokumenty')
      .select('id, nazwa_pliku, typ, mime, rozmiar, sciezka, stan, istotny, nadrzedny_id, metadane, utworzono, utworzyl')
      .eq('zapytanie_id', zapytanieId).order('utworzono')
    if (error) { setBlad(komunikatPL(error.message)); return }
    // Załączniki maili zapisane tylko z nadrzedny_id - doczytujemy je osobno.
    const ids = (data ?? []).map((d) => d.id)
    const { data: zal } = ids.length
      ? await supabase.from('dokumenty').select('id, nazwa_pliku, typ, mime, rozmiar, sciezka, stan, istotny, nadrzedny_id, metadane, utworzono, utworzyl').in('nadrzedny_id', ids).is('zapytanie_id', null)
      : { data: [] }
    setDokumenty([...(data ?? []), ...(zal ?? [])].map((d) => ({ ...d, dl_tekstu: 0 })) as Dokument[])
  }, [zapytanieId])
  useEffect(() => { void wczytaj() }, [wczytaj])

  async function dodaj(pliki: FileList | File[]) {
    setBlad(null); setInfo(null)
    const ostrz: string[] = []
    let ile = 0
    for (const f of [...pliki]) {
      setZajety(`Wczytywanie ${f.name}...`)
      try {
        const wczytane = splaszczArchiwa([await wczytajPlik(f)])
        for (const w of wczytane) {
          setZajety(`Zapisywanie ${w.nazwa}...`)
          const { ostrzezenia } = await zapiszDokument(w, { zapytanie_id: zapytanieId }, { limitMb: s.ustawienia.limity_planu.plik_mb })
          ostrz.push(...ostrzezenia)
          ile += 1 + w.zalaczniki.length
        }
      } catch (e) { ostrz.push(e instanceof Error ? e.message : String(e)) }
    }
    setZajety(null)
    setInfo(`Dodano ${ile} dokumentów.${ostrz.length ? ' Uwagi: ' + ostrz.join(' ') : ''}`)
    await wczytaj()
  }

  async function zmien(d: Dokument, zmiana: Partial<Dokument>) {
    const { error } = await supabase.from('dokumenty').update(zmiana).eq('id', d.id)
    if (error) setBlad(komunikatPL(error.message))
    else setDokumenty((l) => l.map((x) => (x.id === d.id ? { ...x, ...zmiana } : x)))
  }

  async function usun(d: Dokument) {
    if (!window.confirm(`Przenieść dokument ${d.nazwa_pliku}${d.nadrzedny_id ? '' : ' (razem z załącznikami)'} do kosza?`)) return
    try { await doKosza('dokument', [d.id], `zapytanie:${zapytanieId}`); await wczytaj() } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }

  /** ZIP z oryginałami, potem usunięcie plików ze Storage - zostają teksty i wyniki analiz. */
  async function archiwizuj() {
    const zPlikami = dokumenty.filter((d) => d.sciezka && d.stan === 'zapisany')
    if (!zPlikami.length) { setInfo('Brak plików do archiwizacji.'); return }
    if (!window.confirm(`Pobrać ZIP z ${zPlikami.length} oryginałami i usunąć je z bazy? Teksty dokumentów i wyniki analiz zostaną w aplikacji.`)) return
    setBlad(null)
    try {
      const { zipSync } = await import('fflate')
      const pliki: Record<string, Uint8Array> = {}
      for (const [i, d] of zPlikami.entries()) {
        setZajety(`Pobieranie ${i + 1}/${zPlikami.length}: ${d.nazwa_pliku}`)
        pliki[`${String(i + 1).padStart(2, '0')}_${bezpiecznaNazwa(d.nazwa_pliku)}`] = await pobierzBajty(d.sciezka!)
      }
      const zip = zipSync(pliki, { level: 6 })
      const url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }))
      const a = document.createElement('a')
      a.href = url; a.download = `${numer.replace(/\//g, '-')}_dokumenty.zip`; a.click()
      URL.revokeObjectURL(url)
      setZajety('Usuwanie oryginałów z bazy...')
      for (const d of zPlikami) {
        const { error } = await supabase.from('dokumenty').update({ stan: 'zarchiwizowany' }).eq('id', d.id)
        if (error) throw new Error(komunikatPL(error.message))
      }
      const { error } = await supabase.storage.from('dokumenty').remove(zPlikami.map((d) => d.sciezka!))
      if (error) throw new Error(komunikatPL(error.message))
      await supabase.from('dokumenty').update({ sciezka: null }).in('id', zPlikami.map((d) => d.id))
      setInfo(`Zarchiwizowano ${zPlikami.length} plików (ZIP pobrany). Zwolniono ${rozmiar(zPlikami.reduce((a, d) => a + (d.rozmiar ?? 0), 0))}.`)
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setZajety(null)
    await wczytaj()
  }

  const glowne = dokumenty.filter((d) => !d.nadrzedny_id || !dokumenty.some((x) => x.id === d.nadrzedny_id))
  const wiersz = (d: Dokument, zalacznik = false) => (
    <tr key={d.id} className={cn(!d.istotny && 'text-slate-400')}>
      <td className={cn('komorka', zalacznik && 'pl-8')}>
        <div className="flex items-center gap-2">
          {d.metadane?.temat !== undefined ? <Mail className="h-4 w-4 shrink-0" /> : zalacznik ? <Paperclip className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
          {d.sciezka
            ? <button className="text-left text-blekit-ciemny underline" onClick={() => void otworzDokument(d.sciezka!).catch((e) => setBlad(String(e.message)))}>{d.nazwa_pliku}</button>
            : <span>{d.nazwa_pliku}</span>}
        </div>
        {typeof d.metadane?.temat === 'string' && <div className="ml-6 text-xs text-slate-500">{String(d.metadane.temat)} · {String(d.metadane.od ?? '')}</div>}
      </td>
      <td className="komorka w-44">
        <select className="pole-komorki text-sm" value={d.typ} onChange={(e) => void zmien(d, { typ: e.target.value as TypDokumentu })}>
          {Object.entries(ETYKIETY_TYPU).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </td>
      <td className="komorka text-center">
        <input type="checkbox" checked={d.istotny} title="Istotny dla wyceny (idzie do analizy AI)" onChange={(e) => void zmien(d, { istotny: e.target.checked })} />
      </td>
      <td className="komorka whitespace-nowrap text-xs">{rozmiar(d.rozmiar)}{d.metadane?.stron ? `, ${String(d.metadane.stron)} str.` : ''}{d.metadane?.skan ? ', skan' : ''}</td>
      <td className="komorka text-xs text-amber-800">{STANY[d.stan]}</td>
      <td className="komorka whitespace-nowrap text-xs text-slate-500">{dataGodzinaPL(d.utworzono)}</td>
      <td className="komorka text-center">
        {(profil.rola === 'administrator' || d.utworzyl === profil.id) && (
          <button className="text-slate-400 hover:text-red-600" title="Usuń" onClick={() => void usun(d)}><Trash2 className="h-4 w-4" /></button>
        )}
      </td>
    </tr>
  )

  return (
    <div className="space-y-3">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {info && <Komunikat rodzaj="info">{info}</Komunikat>}
      {zajety && <Komunikat rodzaj="info">{zajety}</Komunikat>}
      <label
        onDragOver={(e) => { e.preventDefault(); setPrzeciaganie(true) }}
        onDragLeave={() => setPrzeciaganie(false)}
        onDrop={(e) => { e.preventDefault(); setPrzeciaganie(false); void dodaj(e.dataTransfer.files) }}
        className={cn('flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed bg-white p-4', przeciaganie ? 'border-blekit bg-blekit-jasny' : 'border-slate-300 hover:border-blekit')}
      >
        <Upload className="h-6 w-6 text-slate-400" />
        <span className="text-sm">Przeciągnij pliki (PDF, DOCX, XLSX, maile .msg / .eml, ZIP) albo kliknij. Z maili wyciągamy załączniki jako osobne dokumenty, ZIP rozpakowujemy. Limit pliku: {s.ustawienia.limity_planu.plik_mb} MB.</span>
        <input type="file" multiple className="hidden" onChange={(e) => e.target.files && void dodaj(e.target.files)} />
      </label>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse">
          <thead><tr>{['Dokument', 'Typ', 'Istotny', 'Rozmiar', 'Stan', 'Dodano', ''].map((n) => <th key={n} className="komorka-naglowek">{n}</th>)}</tr></thead>
          <tbody>
            {glowne.map((d) => [wiersz(d), ...dokumenty.filter((x) => x.nadrzedny_id === d.id).map((x) => wiersz(x, true))])}
            {dokumenty.length === 0 && <tr><td colSpan={7} className="komorka text-center text-slate-500">Brak dokumentów.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">„Istotny” = dokument idzie do analizy AI. Standardy klienta po kilkadziesiąt stron domyślnie są pomijane.</p>
        <Button rozmiar="maly" onClick={() => void archiwizuj()} disabled={!!zajety}><Archive className="h-4 w-4" /> Archiwizuj dokumenty zapytania (ZIP)</Button>
      </div>
    </div>
  )
}
