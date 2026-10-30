import { useState } from 'react'
import { Mail, Paperclip, Sparkles, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { rozmiar } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ETYKIETY_TYPU, splaszczArchiwa, wczytajPlik, type PominietyZalacznik, type TypDokumentu, type WczytanyPlik } from '@/lib/dokumenty'
import { NIEISTOTNY_TYLKO_TEKST_MB, zapiszDokument } from '@/lib/magazyn'
import { domyslnieIstotny, propozycjaZapytania, STRON_DLUGI_DOKUMENT, type KlientImportu, type PropozycjaZapytania } from '@/lib/importMaila'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { rodzajZPrzedmiotu } from '@/lib/zapytania'
import { t } from '@/i18n'

/** Po otwarciu karty zapytania uruchom od razu przygotowanie automatyczne (flaga na czas przejścia). */
export const FLAGA_PRZYGOTUJ = 'wyceny.przygotuj'

function doPola(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

/**
 * Nowe zapytanie z maila: pracownik przeciąga mail klienta (.msg z Outlooka albo .eml). Aplikacja proponuje
 * pola karty zapytania, zapisuje mail i załączniki jako dokumenty, a na życzenie od razu przygotowuje
 * analizę, listy materiałów, wstępną wycenę i projekt oferty.
 */
export function NoweZMaila({ otwarty, zamknij, utworzone }: { otwarty: boolean; zamknij: () => void; utworzone: (id: string) => void }) {
  const s = useSlowniki()
  const [mail, setMail] = useState<WczytanyPlik | null>(null)
  const [zalaczniki, setZalaczniki] = useState<WczytanyPlik[]>([])
  const [klienci, setKlienci] = useState<KlientImportu[]>([])
  const [p, setP] = useState<PropozycjaZapytania | null>(null)
  const [nowyKlient, setNowyKlient] = useState('')
  // Domena z przekazanego maila bywa pośrednika (biuro projektowe) - zapamiętanie tylko na życzenie.
  const [zapamietajDomene, setZapamietajDomene] = useState(false)
  const [przygotuj, setPrzygotuj] = useState(true)
  const [duplikat, setDuplikat] = useState<{ id: string; numer: string } | null>(null)
  const [zajety, setZajety] = useState<string | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  const [przeciaganie, setPrzeciaganie] = useState(false)

  function wyczysc() { setMail(null); setZalaczniki([]); setP(null); setDuplikat(null); setBlad(null); setNowyKlient(''); setZapamietajDomene(false) }

  async function wczytaj(pliki: FileList | File[]) {
    const f = [...pliki][0]
    if (!f) return
    wyczysc(); setZajety(t('Odczyt {0}...', f.name))
    try {
      const w = await wczytajPlik(f)
      if (w.rodzaj !== 'mail') throw new Error(t('To nie jest mail. Przeciągnij wiadomość z Outlooka (.msg) albo plik .eml. Pojedyncze dokumenty dodaje się w karcie zapytania.'))
      const mid = w.metadane.message_id as string | null
      if (mid) {
        const { data: d } = await supabase.from('dokumenty').select('zapytanie_id, zapytania(id, numer)').eq('metadane->>message_id', mid).not('zapytanie_id', 'is', null).limit(1)
        const z = (d?.[0] as unknown as { zapytania: { id: string; numer: string } | null } | undefined)?.zapytania
        if (z) setDuplikat(z)
      }
      const { data: kl, error } = await supabase.from('klienci').select('id, nazwa, skrot, domeny').order('nazwa')
      if (error) throw new Error(komunikatPL(error.message))
      setKlienci((kl ?? []) as KlientImportu[])
      setP(propozycjaZapytania({ temat: String(w.metadane.temat ?? ''), od: String(w.metadane.od ?? ''), od_email: String(w.metadane.od_email ?? ''), data: (w.metadane.data as string) ?? null, tekst: w.tekst }, (kl ?? []) as KlientImportu[], s.ustawienia.firma.domeny ?? []))
      setMail(w)
      setZalaczniki(splaszczArchiwa(w.zalaczniki).map((z) => ({ ...z, istotny: domyslnieIstotny(z) })))
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setZajety(null)
  }

  async function utworz() {
    if (!mail || !p) return
    setZajety(t('Zakładanie zapytania...')); setBlad(null)
    try {
      let klientId = p.klient_id
      const domena = zapamietajDomene ? p.domena : null
      if (!klientId && nowyKlient.trim()) {
        const { data, error } = await supabase.from('klienci').insert({ nazwa: nowyKlient.trim(), domeny: domena ? [domena] : [] }).select('id').single()
        if (error) throw new Error(komunikatPL(error.message))
        klientId = data.id as string
      } else if (klientId && domena) {
        // Zapamiętaj domenę - kolejny mail od tego klienta rozpozna się sam.
        const k = klienci.find((x) => x.id === klientId)
        if (k && !k.domeny.includes(domena)) await supabase.from('klienci').update({ domeny: [...k.domeny, domena] }).eq('id', klientId)
      }
      const { data: z, error } = await supabase.from('zapytania').insert({
        numer: '', przedmiot: p.przedmiot.trim() || 'Zapytanie z maila', klient_id: klientId, nr_zapytania_klienta: p.nr_zapytania_klienta.trim() || null,
        termin_oferty: p.termin_oferty, zrodlo: 'mail', status: 'nowe', ...rodzajZPrzedmiotu(p.przedmiot),
      }).select('id').single()
      if (error) throw new Error(komunikatPL(error.message))
      setZajety(t('Zapisywanie maila i załączników...'))
      // Treść maila klienta to zwykle główny opis zapytania - istotna dla analizy.
      const doZapisu: WczytanyPlik = { ...mail, zalaczniki }
      const { ostrzezenia } = await zapiszDokument(doZapisu, { zapytanie_id: z.id }, { typ: 'zapytanie_ofertowe', istotny: true, limitMb: s.ustawienia.limity_planu.plik_mb })
      if (ostrzezenia.length) window.alert(t('Zapisano z uwagami: {0}', ostrzezenia.join('\n')))
      try { if (przygotuj) sessionStorage.setItem(FLAGA_PRZYGOTUJ, z.id) } catch { /* bez flagi - przycisk w karcie */ }
      wyczysc(); zamknij()
      utworzone(z.id as string)
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setZajety(null)
  }

  const ustP = (z: Partial<PropozycjaZapytania>) => setP((x) => (x ? { ...x, ...z } : x))
  const pominiete = (mail?.metadane.pominiete_zalaczniki as PominietyZalacznik[] | undefined) ?? []
  return (
    <Dialog open={otwarty} onOpenChange={(o) => { if (!o) { wyczysc(); zamknij() } }}>
      <DialogContent className="max-w-3xl">
        <DialogTitle>{t('Nowe zapytanie z maila')}</DialogTitle>
        <DialogDescription>{t('Przeciągnij wiadomość klienta z Outlooka (albo plik .msg / .eml). Załączniki zapiszą się jako dokumenty zapytania.')}</DialogDescription>
        <div className="mt-3 space-y-3">
          {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
          {zajety && <Komunikat rodzaj="info">{zajety}</Komunikat>}
          {!mail && (
            <label
              onDragOver={(e) => { e.preventDefault(); setPrzeciaganie(true) }} onDragLeave={() => setPrzeciaganie(false)}
              onDrop={(e) => { e.preventDefault(); setPrzeciaganie(false); void wczytaj(e.dataTransfer.files) }}
              className={cn('flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center', przeciaganie ? 'border-blekit bg-blekit-jasny' : 'border-slate-300 hover:border-blekit')}
            >
              <Upload className="h-8 w-8 text-slate-400" />
              <span className="text-sm">{t('Upuść tutaj mail z zapytaniem ofertowym (.msg / .eml) albo kliknij, żeby wybrać plik.')}</span>
              <input type="file" accept=".msg,.eml" className="hidden" onChange={(e) => e.target.files && void wczytaj(e.target.files)} />
            </label>
          )}
          {mail && p && (
            <>
              {duplikat && <Komunikat rodzaj="ostrzezenie">{t('Ten mail jest już w zapytaniu')}{' '}{duplikat.numer}. <button className="underline" onClick={() => { zamknij(); utworzone(duplikat.id) }}>{t('Otwórz je')}</button>.</Komunikat>}
              <div className="flex items-start gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-sm">
                <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                <div><div className="font-medium">{String(mail.metadane.temat ?? mail.nazwa)}</div>
                  <div className="text-xs text-slate-500">{String(mail.metadane.od ?? '')} {mail.metadane.od_email ? `<${String(mail.metadane.od_email)}>` : ''}</div></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2"><span className="etykieta">{t('Przedmiot zapytania')}</span>
                  <input className="pole" value={p.przedmiot} onChange={(e) => ustP({ przedmiot: e.target.value })} /></label>
                <label><span className="etykieta">{t('Klient')}{' '}{p.klient_powod && <span className="font-normal text-slate-400">{t('(rozpoznany:')}{' '}{p.klient_powod})</span>}</span>
                  <select className="pole" value={p.klient_id ?? ''} onChange={(e) => ustP({ klient_id: e.target.value || null })}>
                    <option value="">{t('- nowy / nieznany -')}</option>{klienci.map((k) => <option key={k.id} value={k.id}>{k.nazwa}</option>)}
                  </select></label>
                {!p.klient_id && <label><span className="etykieta">{t('Nowy klient (nazwa)')}</span>
                  <input className="pole" value={nowyKlient} placeholder={t('zostaw puste - uzupełni analiza')} onChange={(e) => setNowyKlient(e.target.value)} /></label>}
                <label><span className="etykieta">{t('Nr zapytania klienta')}</span>
                  <input className="pole" value={p.nr_zapytania_klienta} onChange={(e) => ustP({ nr_zapytania_klienta: e.target.value })} /></label>
                <label><span className="etykieta">{t('Termin złożenia oferty')}</span>
                  <input type="datetime-local" className="pole" value={doPola(p.termin_oferty)} onChange={(e) => ustP({ termin_oferty: e.target.value ? new Date(e.target.value).toISOString() : null })} /></label>
                {p.domena && (p.klient_id || nowyKlient.trim()) && !p.klient_powod?.startsWith('domena') && (
                  <label className="flex items-start gap-2 text-xs sm:col-span-2">
                    <input type="checkbox" className="mt-0.5" checked={zapamietajDomene} onChange={(e) => setZapamietajDomene(e.target.checked)} />
                    <span>{t('Zapamiętaj domenę')}{' '}<strong>{p.domena}</strong> {t('dla tego klienta - kolejne maile z niej rozpoznają się same (nie zaznaczaj, jeśli to pośrednik, np. biuro projektowe).')}</span>
                  </label>
                )}
              </div>
              <div>
                <span className="etykieta">{t('Załączniki (')}{zalaczniki.filter((z) => z.wgraj !== false).length} z {zalaczniki.length} {t('do wgrania,')}{' '}{rozmiar(zalaczniki.filter((z) => z.wgraj !== false).reduce((n, z) => n + z.rozmiar, 0))}{t(') - typ i czy idą do analizy')}
                  <span className="ml-1 font-normal text-slate-400">{t('(obliczenia powyżej')}{' '}{STRON_DLUGI_DOKUMENT} {t('str. domyślnie pominięte - zaznacz, jeśli to jedyne dane projektowe)')}</span></span>
                <div className="max-h-56 overflow-auto rounded border border-slate-200">
                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      {zalaczniki.map((z, i) => (
                        <tr key={i} className={cn((!z.istotny || z.wgraj === false) && 'text-slate-400', z.wgraj === false && 'line-through')}>
                          <td className="komorka w-20 text-xs" title={t('Odznacz, jeśli to nie jest dokument zapytania (logo, stopka, reklama) - plik nie trafi do bazy')}>
                            <label className="flex items-center gap-1"><input type="checkbox" checked={z.wgraj !== false} onChange={(e) => setZalaczniki(zalaczniki.map((x, j) => (j === i ? { ...x, wgraj: e.target.checked } : x)))} /> wgraj</label></td>
                          <td className="komorka"><Paperclip className="mr-1 inline h-3 w-3" />{z.nazwa}
                            <span className="ml-1 text-xs text-slate-400">{rozmiar(z.rozmiar)}{z.metadane?.stron ? t(', {0} str.', String(z.metadane.stron)) : ''}{z.metadane?.skan ? t(', skan') : ''}</span></td>
                          <td className="komorka w-44"><select className="pole-komorki text-xs" value={z.typSugerowany} onChange={(e) => setZalaczniki(zalaczniki.map((x, j) => (j === i ? { ...x, typSugerowany: e.target.value as TypDokumentu } : x)))}>
                            {Object.entries(ETYKIETY_TYPU).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                          <td className="komorka w-24 text-xs"><label className="flex items-center gap-1"><input type="checkbox" checked={z.istotny ?? true} onChange={(e) => setZalaczniki(zalaczniki.map((x, j) => (j === i ? { ...x, istotny: e.target.checked } : x)))} /> istotny</label></td>
                        </tr>
                      ))}
                      {!zalaczniki.length && <tr><td className="komorka text-center text-slate-500">{t('Mail bez załączników - zapisze się sama treść.')}</td></tr>}
                    </tbody>
                  </table>
                </div>
                {pominiete.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">{t('Pominięte automatycznie (')}{pominiete.length}): {pominiete.map((x) => `${x.nazwa} (${rozmiar(x.rozmiar)}, ${x.powod})`).join('; ')}.</p>
                )}
                <p className="mt-1 text-xs text-slate-500">{t('Z maila zapisuje się sama treść (tekst) i zaznaczone pliki - nie cały plik .msg/.eml. Nieistotne pliki powyżej')}{' '}{NIEISTOTNY_TYLKO_TEKST_MB} {t('MB zapisują się jako tekst.')}</p>
              </div>
              {<label className="flex items-start gap-2 rounded border border-blekit bg-blekit-jasny/40 p-2 text-sm">
                <input type="checkbox" className="mt-1" checked={przygotuj} onChange={(e) => setPrzygotuj(e.target.checked)} />
                <span><Sparkles className="mr-1 inline h-4 w-4" /><strong>{t('Od razu przygotuj automatycznie')}</strong>{t(': analiza zapytania, listy materiałów z rysunków, wstępna wycena i projekt oferty do weryfikacji (przed wywołaniem AI zobaczysz koszt).')}</span>
              </label>}
              <div className="flex justify-end gap-2">
                <Button onClick={wyczysc}>{t('Inny mail')}</Button>
                <Button wariant="glowny" disabled={!!zajety} onClick={() => void utworz()}>{t('Utwórz zapytanie')}</Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
