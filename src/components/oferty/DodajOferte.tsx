import { useEffect, useState } from 'react'
import { FileText, Mail, Paperclip, Sparkles, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSlowniki } from '@/lib/slowniki'
import { liczba } from '@/lib/format'
import { cn } from '@/lib/utils'
import { base64ZBajtow, przeskalujObraz, renderujStrone, wczytajPlik, wczytajDane, type PominietyZalacznik, type WczytanyPlik } from '@/lib/dokumenty'
import { szacujAi, wywolajAi, type KlasyfikacjaMaila, type OfertaAi, type SzacunekAi } from '@/lib/ai'
import { zapiszDokument } from '@/lib/magazyn'
import { formularzZAi, pustyFormularz, zapiszOferte, type FormularzOferty as Formularz } from '@/lib/oferty'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { FormularzOferty } from './FormularzOferty'
import { t } from '@/i18n'

const MAKS_STRON_SKANU = 4

/** Treść do AI: tekst maila / PDF i teksty załączników PDF z warstwą tekstową; skany jako obrazy. */
async function przygotujTresc(plik: WczytanyPlik, wybrane: Set<string>) {
  const czesci: string[] = []
  const obrazy: { media_type: 'image/jpeg'; dane: string }[] = []
  const dodaj = async (p: WczytanyPlik, naglowek: string) => {
    if (p.rodzaj === 'pdf' && p.metadane.skan) {
      const stron = Math.min(Number(p.metadane.stron ?? 1), MAKS_STRON_SKANU)
      for (let i = 1; i <= stron; i++) {
        const r = await renderujStrone(p.dane, i, 150)
        const m = await przeskalujObraz(r.dataUrl, 1568)
        obrazy.push({ media_type: 'image/jpeg', dane: m.base64 })
      }
      czesci.push(`${naglowek}: skan (${stron} str.) - treść na obrazach.`)
    } else if (p.rodzaj === 'obraz') {
      const url = `data:${p.mime};base64,${base64ZBajtow(p.dane)}`
      const m = await przeskalujObraz(url, 1568)
      obrazy.push({ media_type: 'image/jpeg', dane: m.base64 })
    } else if (p.tekst) {
      czesci.push(`${naglowek}:\n${p.tekst}`)
    }
  }
  if (plik.rodzaj === 'mail') {
    const m = plik.metadane
    czesci.push(`MAIL - temat: ${m.temat}\nod: ${m.od} ${m.od_email ? `<${m.od_email}>` : ''}\ndata: ${m.data ?? ''}\n\n${plik.tekst}`)
    for (const z of plik.zalaczniki) if (wybrane.has(z.nazwa)) await dodaj(z, `ZAŁĄCZNIK ${z.nazwa}`)
  } else {
    await dodaj(plik, `PLIK ${plik.nazwa}`)
  }
  return { tekst: czesci.join('\n\n==========\n\n'), obrazy }
}

export function DodajOferte({ gotowe }: { gotowe: (ofertaId: string) => void }) {
  const s = useSlowniki()
  const [plik, setPlik] = useState<WczytanyPlik | null>(null)
  const [wybrane, setWybrane] = useState<Set<string>>(new Set())
  const [wklejony, setWklejony] = useState('')
  const [szacunek, setSzacunek] = useState<SzacunekAi | null>(null)
  const [klasyfikacja, setKlasyfikacja] = useState<KlasyfikacjaMaila | null>(null)
  const [formularz, setFormularz] = useState<Formularz | null>(null)
  const [dostawcy, setDostawcy] = useState<{ id: string; nazwa: string; aliasy: string[] }[]>([])
  const [blad, setBlad] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [zajety, setZajety] = useState<string | null>(null)
  const [przeciaganie, setPrzeciaganie] = useState(false)

  useEffect(() => {
    void supabase.from('dostawcy').select('id, nazwa, aliasy').then(({ data }) => setDostawcy((data ?? []) as typeof dostawcy))
  }, [])

  async function przyjmij(pliki: FileList | File[]) {
    setBlad(null); setInfo(null); setSzacunek(null); setKlasyfikacja(null)
    const p = [...pliki][0]
    if (!p) return
    setZajety(t('Wczytywanie pliku...'))
    try {
      const w = await wczytajPlik(p)
      setPlik(w)
      // Domyślnie do AI idą załączniki wyglądające na ofertę (PDF / obraz / DOCX), nie karty techniczne.
      setWybrane(new Set(w.zalaczniki.filter((z) => ['pdf', 'obraz', 'docx', 'arkusz'].includes(z.rodzaj) && !/datasheet|karta techn|aprobata/i.test(z.nazwa)).map((z) => z.nazwa)))
    } catch (e) { setBlad(t('Nie udało się odczytać pliku: {0}', e instanceof Error ? e.message : String(e))) }
    setZajety(null)
  }

  async function plikZWklejonego() {
    if (!wklejony.trim()) return
    setPlik(await wczytajDane('wklejona-tresc.txt', new TextEncoder().encode(wklejony)))
    setWybrane(new Set())
  }

  async function oszacuj() {
    if (!plik) return
    setBlad(null); setZajety(t('Przygotowanie treści i szacowanie kosztu...'))
    const tresc = await przygotujTresc(plik, wybrane)
    const { szacunek: sz, blad: b } = await szacujAi('wyciagnij_oferte', { tekst: tresc.tekst, obrazy: tresc.obrazy })
    setZajety(null)
    if (b) { setBlad(b); return }
    setSzacunek(sz)
  }

  async function odczytaj() {
    if (!plik) return
    setBlad(null)
    const tresc = await przygotujTresc(plik, wybrane)
    setZajety(t('Klasyfikacja (model tani)...'))
    const { odp: k } = await wywolajAi<KlasyfikacjaMaila>('klasyfikuj_mail', { tekst: tresc.tekst.slice(0, 30_000), metadane: { plik: plik.nazwa } })
    if (k) setKlasyfikacja(k.wynik)
    setZajety(t('Odczyt pozycji oferty...'))
    const { odp, blad: b } = await wywolajAi<OfertaAi>('wyciagnij_oferte', { tekst: tresc.tekst, obrazy: tresc.obrazy, metadane: { plik: plik.nazwa } })
    setZajety(null)
    if (b || !odp) { setBlad(b); return }
    const zrodlo = plik.rodzaj === 'mail' ? 'mail' : plik.rodzaj === 'pdf' ? (plik.metadane.skan ? 'skan' : 'pdf') : plik.rodzaj === 'obraz' ? 'skan' : 'reczne'
    const f = formularzZAi(odp.wynik, dostawcy, zrodlo)
    if (!f.nr_zo && k?.wynik.nr_zo) f.nr_zo = k.wynik.nr_zo
    setFormularz(f)
    setInfo(t('Odczytano {0} pozycji (model {1}, koszt {2} zł). Sprawdź dane przed zatwierdzeniem.', odp.wynik.pozycje.length, odp.model, liczba(odp.koszt_pln, 3)) +
      (odp.wynik.czy_oferta ? '' : t(' Uwaga: model ocenił, że to nie jest oferta.')))
  }

  async function zapisz(f: Formularz, status: 'zatwierdzona' | 'do_przejrzenia') {
    const id = await zapiszOferte(f, s, status)
    // Dokument źródłowy po zapisie oferty (dokument musi być z czymś powiązany).
    if (plik && plik.nazwa !== 'wklejona-tresc.txt') {
      try {
        // Z maila: treść jako tekst i tylko zaznaczone załączniki (oferta) - bez logo, stopek i reszty maila.
        const doZapisu = plik.rodzaj === 'mail' ? { ...plik, zalaczniki: plik.zalaczniki.map((z) => ({ ...z, wgraj: wybrane.has(z.nazwa) })) } : plik
        const { dokument, ostrzezenia } = await zapiszDokument(doZapisu, { oferta_id: id }, { typ: plik.rodzaj === 'mail' ? 'korespondencja' : 'oferta_dostawcy', istotny: true, limitMb: s.ustawienia.limity_planu.plik_mb })
        await supabase.from('oferty_dostawcow').update({ dokument_id: dokument.id }).eq('id', id)
        if (ostrzezenia.length) window.alert(ostrzezenia.join('\n'))
      } catch (e) {
        window.alert(t('Oferta zapisana, ale nie udało się zapisać dokumentu: {0}', e instanceof Error ? e.message : String(e)))
      }
    } else if (plik) {
      await supabase.from('oferty_dostawcow').update({ uwagi: [f.uwagi, `Treść wklejona:\n${plik.tekst.slice(0, 4000)}`].filter(Boolean).join('\n\n') }).eq('id', id)
    }
    gotowe(id)
  }

  if (formularz) {
    return (
      <div className="space-y-3">
        {info && <Komunikat rodzaj="info">{info}</Komunikat>}
        {klasyfikacja && (
          <p className="text-xs text-slate-500">
            {t('Klasyfikacja:')}{' '}{klasyfikacja.typ.replace(/_/g, ' ')}{t(', dostawca:')}{' '}{klasyfikacja.dostawca_nazwa ?? '?'}{t(', ZO:')}{' '}{klasyfikacja.nr_zo ?? '-'} - {klasyfikacja.czego_dotyczy}
          </p>
        )}
        <FormularzOferty poczatkowy={formularz} zapisz={zapisz} anuluj={() => setFormularz(null)} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {zajety && <Komunikat rodzaj="info">{zajety}</Komunikat>}

      <div className="grid gap-4 lg:grid-cols-2">
        <label
          onDragOver={(e) => { e.preventDefault(); setPrzeciaganie(true) }}
          onDragLeave={() => setPrzeciaganie(false)}
          onDrop={(e) => { e.preventDefault(); setPrzeciaganie(false); void przyjmij(e.dataTransfer.files) }}
          className={cn('flex min-h-[10rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-white p-6 text-center',
            przeciaganie ? 'border-blekit bg-blekit-jasny' : 'border-slate-300 hover:border-blekit')}
        >
          <Upload className="h-8 w-8 text-slate-400" />
          <span className="text-sm font-medium">{t('Przeciągnij tu maila z Outlooka (.msg), plik .eml, PDF albo skan')}</span>
          <span className="text-xs text-slate-500">{t('albo kliknij, żeby wybrać plik')}</span>
          <input type="file" className="hidden" accept=".msg,.eml,.pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt" onChange={(e) => e.target.files && void przyjmij(e.target.files)} />
        </label>
        <div className="sekcja flex flex-col gap-2">
          <span className="etykieta">{t('...albo wklej treść maila z ofertą')}</span>
          <textarea className="pole min-h-[7rem] flex-1" value={wklejony} onChange={(e) => setWklejony(e.target.value)} />
          <div className="flex gap-2">
            <Button rozmiar="maly" disabled={!wklejony.trim()} onClick={() => void plikZWklejonego()}>{t('Użyj wklejonej treści')}</Button>
            <Button rozmiar="maly" wariant="cichy" onClick={() => setFormularz(pustyFormularz())}>{t('Wprowadź ofertę ręcznie')}</Button>
          </div>
        </div>
      </div>

      {plik && (
        <section className="sekcja space-y-3">
          <div className="flex items-start gap-3">
            {plik.rodzaj === 'mail' ? <Mail className="mt-0.5 h-5 w-5 text-blekit-ciemny" /> : <FileText className="mt-0.5 h-5 w-5 text-blekit-ciemny" />}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{plik.rodzaj === 'mail' ? String(plik.metadane.temat || plik.nazwa) : plik.nazwa}</p>
              {plik.rodzaj === 'mail' && <p className="text-xs text-slate-500">{t('od:')}{' '}{String(plik.metadane.od)} · {String(plik.metadane.data ?? '')}</p>}
              {plik.rodzaj === 'pdf' && <p className="text-xs text-slate-500">{t('PDF, stron:')}{' '}{String(plik.metadane.stron)}{plik.metadane.skan ? t(' - skan bez warstwy tekstowej (do AI idą obrazy stron)') : ''}</p>}
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-700">{plik.tekst.slice(0, 3000) || t('(brak tekstu)')}</pre>
            </div>
          </div>
          {plik.zalaczniki.length > 0 && (
            <div>
              <span className="etykieta">{t('Załączniki - zaznacz te, które są ofertą (pójdą do odczytu AI i zapiszą się przy ofercie; reszta nie trafi do bazy):')}</span>
              <ul className="space-y-1">
                {plik.zalaczniki.map((z) => (
                  <li key={z.nazwa} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={wybrane.has(z.nazwa)} onChange={(e) => {
                      const n = new Set(wybrane); if (e.target.checked) n.add(z.nazwa); else n.delete(z.nazwa); setWybrane(n)
                    }} />
                    <Paperclip className="h-3 w-3 text-slate-400" /> {z.nazwa}
                    <span className="text-xs text-slate-400">{(z.rozmiar / 1024).toFixed(0)} {t('kB')}{z.rodzaj === 'pdf' && z.metadane.skan ? t(', skan') : ''}</span>
                  </li>
                ))}
              </ul>
              {((plik.metadane.pominiete_zalaczniki as PominietyZalacznik[] | undefined) ?? []).length > 0 && (
                <p className="mt-1 text-xs text-slate-500">{t('Pominięte automatycznie:')}{' '}{((plik.metadane.pominiete_zalaczniki as PominietyZalacznik[]) ?? []).map((x) => `${x.nazwa} (${x.powod})`).join('; ')}.</p>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!szacunek ? (
              <Button wariant="akcent" disabled={!!zajety} onClick={() => void oszacuj()}><Sparkles className="h-4 w-4" /> {t('Odczytaj ofertę (AI) - najpierw szacunek kosztu')}</Button>
            ) : (
              <>
                <span className="text-sm">
                  {t('Szacowany koszt:')}{' '}<strong>{liczba(szacunek.koszt_pln, 3)} {t('zł')}</strong> ({szacunek.model}{t(', ok.')}{' '}{liczba(szacunek.tokeny_wejscie, 0)} {t('tokenów wejścia). W tym miesiącu zostało')}{' '}{liczba(szacunek.pozostalo_miesiac_pln, 2)} {t('zł budżetu.')}
                </span>
                <Button wariant="glowny" disabled={!!zajety} onClick={() => void odczytaj()}><Sparkles className="h-4 w-4" /> {t('Uruchom odczyt')}</Button>
              </>
            )}
            <Button wariant="cichy" onClick={() => setFormularz({ ...pustyFormularz(), zrodlo: plik.rodzaj === 'mail' ? 'mail' : 'pdf' })}>{t('Wprowadź ręcznie')}</Button>
          </div>
        </section>
      )}
    </div>
  )
}
