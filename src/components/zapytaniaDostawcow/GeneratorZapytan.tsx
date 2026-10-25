import { useEffect, useMemo, useState } from 'react'
import { Copy, Mail, Plus, RotateCcw, Save, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { liczba } from '@/lib/format'
import { cn } from '@/lib/utils'
import { wczytajWycene } from '@/lib/wyceny'
import type { WynikRysunku } from '@/lib/rysunki'
import { uslugiDoZapytan, uzupelnijKarte, type KartaAnalizy } from '@/lib/analiza'
import {
  grupujWgKategorii, poprawnyEmail, pozycjeZOdczytu, pozycjeZWyceny, tematZapytania, terminRoboczy, trescZapytania, wymaganiaDomyslne,
  zapiszZapytanieDostawcy, type Odbiorca, type PozycjaZapytania, type RodzajZapytania,
} from '@/lib/zapytaniaDostawcow'
import type { UstawieniaZapytan } from '@/lib/types'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { t } from '@/i18n'

export interface DostawcaZapytania { id: string; nazwa: string; kategorie: string[]; kontakty: { osoba?: string; email?: string }[] }
export interface GrupaZapytania { kategoria: string; rodzaj: RodzajZapytania; pozycje: PozycjaZapytania[] }
type Zrodlo = { klucz: string; etykieta: string }

/** Nazwa kategorii materiału albo usługi ze słownika (kod, gdy brak). */
export function useNazwaKategorii() {
  const s = useSlowniki()
  return (kod: string) => s.kategorieMaterialow.find((k) => k.kod === kod)?.nazwa ?? s.kategorieUslug.find((k) => k.kod === kod)?.nazwa ?? kod
}

const adresyDostawcy = (d: DostawcaZapytania) => d.kontakty.map((k) => (k.email ?? '').trim()).filter(poprawnyEmail)

/** Lista pozycji źródła pogrupowana według kategorii, z zaznaczaniem i poprawką opisu / ilości. */
export function WyborPozycji({ pozycje, zmien, zaznaczone, zaznacz, przygotuj, aktywna }: {
  pozycje: PozycjaZapytania[]
  zmien: (klucz: string, z: Partial<PozycjaZapytania>) => void
  zaznaczone: Set<string>
  zaznacz: (klucze: string[], tak: boolean) => void
  przygotuj: (g: GrupaZapytania) => void
  aktywna: string | null
}) {
  const nazwa = useNazwaKategorii()
  const grupy = grupujWgKategorii(pozycje)
  if (!pozycje.length) return <p className="text-sm text-slate-500">{t('Brak materiałów i usług w wybranym źródle.')}</p>
  return (
    <div className="space-y-3">
      {grupy.map((g) => {
        const klucz = `${g.rodzaj}:${g.kategoria}`
        const ile = g.pozycje.filter((p) => zaznaczone.has(p.klucz)).length
        const wszystkie = ile === g.pozycje.length
        return (
          <div key={klucz} className={cn('rounded-lg border bg-white', aktywna === klucz ? 'border-blekit-ciemny ring-1 ring-blekit' : 'border-slate-200')}>
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2">
              <input type="checkbox" checked={wszystkie} ref={(el) => { if (el) el.indeterminate = ile > 0 && !wszystkie }}
                onChange={(e) => zaznacz(g.pozycje.map((p) => p.klucz), e.target.checked)} aria-label={t('Zaznacz kategorię {0}', nazwa(g.kategoria))} />
              <span className="font-medium">{nazwa(g.kategoria)}</span>
              <span className="text-xs text-slate-500">{g.rodzaj === 'usluga' ? t('usługa') : t('materiał')} {t('· zaznaczono')}{' '}{ile} z {g.pozycje.length}</span>
              <Button rozmiar="maly" wariant={aktywna === klucz ? 'akcent' : 'zwykly'} className="ml-auto" disabled={!ile}
                onClick={() => przygotuj({ ...g, pozycje: g.pozycje.filter((p) => zaznaczone.has(p.klucz)) })}>
                <Mail className="h-3 w-3" /> {t('Przygotuj zapytanie')}
              </Button>
            </div>
            <table className="w-full border-collapse">
              <tbody>
                {g.pozycje.map((p) => (
                  <tr key={p.klucz} className={cn(!zaznaczone.has(p.klucz) && 'text-slate-400')}>
                    <td className="komorka w-8"><input type="checkbox" checked={zaznaczone.has(p.klucz)} onChange={(e) => zaznacz([p.klucz], e.target.checked)} aria-label={t('Zaznacz pozycję')} /></td>
                    <td className="komorka"><input className="pole-komorki w-full text-sm" value={p.opis} onChange={(e) => zmien(p.klucz, { opis: e.target.value })} /></td>
                    <td className="komorka w-24"><PoleLiczby className="pole-komorki w-20 text-right text-sm" wartosc={p.ilosc} puste zmien={(v) => zmien(p.klucz, { ilosc: v })} /></td>
                    <td className="komorka w-16"><input className="pole-komorki w-14 text-sm" value={p.jm} onChange={(e) => zmien(p.klucz, { jm: e.target.value })} /></td>
                    <td className="komorka w-28 text-right text-xs text-slate-500">{p.masa_kg ? `${liczba(p.masa_kg, p.masa_kg < 10 ? 1 : 0)} kg` : ''}</td>
                    <td className="komorka w-40 text-xs text-slate-500">
                      {p.zrodlo}
                      {p.ma_cene && <span className="ml-1 rounded bg-emerald-50 px-1 text-emerald-700" title={t('Cena pochodzi już z oferty lub zakupu')}>{t('ma cenę')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

interface OdbiorcaEdycja extends Odbiorca { zaznaczony: boolean }

/** Edytor jednego zapytania (kategoria): temat, wymagania, termin, odbiorcy, podgląd treści. */
export function EdytorZapytania({ grupa, numerZO, ust, dostawcy, zapisz, anuluj }: {
  grupa: GrupaZapytania
  numerZO: string
  ust: UstawieniaZapytan
  dostawcy: DostawcaZapytania[]
  zapisz: (z: { temat: string; tresc: string; wymagania: string[]; termin: string | null }, odbiorcy: Odbiorca[]) => Promise<void>
  anuluj: () => void
}) {
  const nazwa = useNazwaKategorii()
  const [temat, setTemat] = useState(() => tematZapytania(numerZO, nazwa(grupa.kategoria)))
  const [wymagania, setWymagania] = useState(() => wymaganiaDomyslne(grupa.kategoria, grupa.rodzaj, ust.wymagania))
  const [termin, setTermin] = useState<string>(() => (ust.dni_na_odpowiedz > 0 ? terminRoboczy(ust.dni_na_odpowiedz) : ''))
  const [uwagi, setUwagi] = useState('')
  const [odbiorcy, setOdbiorcy] = useState<OdbiorcaEdycja[]>(() => dostawcy
    .filter((d) => d.kategorie.includes(grupa.kategoria))
    .map((d) => ({ dostawca_id: d.id, nazwa: d.nazwa, email: adresyDostawcy(d).join(', '), zaznaczony: adresyDostawcy(d).length > 0 })))
  const [nowyEmail, setNowyEmail] = useState('')
  const [trescReczna, setTrescReczna] = useState<string | null>(null)
  const [zajety, setZajety] = useState(false)
  const [blad, setBlad] = useState<string | null>(null)
  const [skopiowano, setSkopiowano] = useState(false)

  const zSzablonu = useMemo(() => trescZapytania({ numerZO, rodzaj: grupa.rodzaj, pozycje: grupa.pozycje, wymagania, terminOdpowiedzi: termin || null, uwagi }, ust),
    [numerZO, grupa, wymagania, termin, uwagi, ust])
  const tresc = trescReczna ?? zSzablonu
  const wybrani = odbiorcy.filter((o) => o.zaznaczony)
  const pozostali = dostawcy.filter((d) => !odbiorcy.some((o) => o.dostawca_id === d.id))

  function dodajEmail() {
    const e = nowyEmail.trim()
    if (!poprawnyEmail(e)) { setBlad(t('Nieprawidłowy adres e-mail.')); return }
    setOdbiorcy([...odbiorcy, { dostawca_id: null, nazwa: e, email: e, zaznaczony: true }]); setNowyEmail(''); setBlad(null)
  }
  async function kopiuj() {
    await navigator.clipboard.writeText(`${temat}\n\n${tresc}`)
    setSkopiowano(true); setTimeout(() => setSkopiowano(false), 2000)
  }
  async function zatwierdz() {
    if (!wybrani.length) { setBlad(t('Zaznacz co najmniej jednego odbiorcę (albo dopisz adres).')); return }
    const bezAdresu = wybrani.filter((o) => !o.email.split(',').map((x) => x.trim()).some(poprawnyEmail))
    if (bezAdresu.length) { setBlad(t('Brak adresu e-mail: {0} - uzupełnij kontakt w bazie dostawców.', bezAdresu.map((o) => o.nazwa).join(', '))); return }
    setZajety(true); setBlad(null)
    try {
      await zapisz({ temat: temat.trim(), tresc, wymagania, termin: termin || null }, wybrani.map(({ zaznaczony: _z, ...o }) => { void _z; return o }))
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
    setZajety(false)
  }

  return (
    <section className="sekcja space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">{t('Zapytanie:')}{' '}{nazwa(grupa.kategoria)} ({grupa.pozycje.length} {t('poz.)')}</h4>
        <button className="text-slate-400 hover:text-slate-700" title={t('Zamknij')} onClick={anuluj}><X className="h-4 w-4" /></button>
      </div>
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <label className="block"><span className="etykieta">{t('Temat')}</span><input className="pole" value={temat} onChange={(e) => setTemat(e.target.value)} /></label>
          <div>
            <span className="etykieta">{t('Wymagania (z biblioteki w ustawieniach)')}</span>
            <ul className="space-y-1 text-sm">
              {ust.wymagania.map((w) => (
                <li key={w.kod}>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1" checked={wymagania.includes(w.kod)}
                      onChange={(e) => { setWymagania(e.target.checked ? [...wymagania, w.kod] : wymagania.filter((x) => x !== w.kod)); setTrescReczna(null) }} />
                    <span>{w.tekst}{w.w_naglowku && <span className="ml-1 text-xs text-slate-400">{t('(we wstępie)')}</span>}</span>
                  </label>
                </li>
              ))}
              {!ust.wymagania.length && <li className="text-slate-500">{t('Biblioteka wymagań jest pusta (Ustawienia → Zapytania do dostawców).')}</li>}
            </ul>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="w-44"><span className="etykieta">{t('Oferta do dnia')}</span>
              <input type="date" className="pole" value={termin} onChange={(e) => { setTermin(e.target.value); setTrescReczna(null) }} /></label>
          </div>
          <label className="block"><span className="etykieta">{t('Dodatkowe uwagi (każda w nowej linii)')}</span>
            <textarea className="pole h-16 text-sm" value={uwagi} placeholder={t('np. Rysunek w załączniku.')} onChange={(e) => { setUwagi(e.target.value); setTrescReczna(null) }} /></label>
          <div>
            <span className="etykieta">{t('Odbiorcy (')}{wybrani.length})</span>
            <ul className="space-y-1 text-sm">
              {odbiorcy.map((o, i) => (
                <li key={`${o.dostawca_id ?? o.email}-${i}`} className="flex items-center gap-2">
                  <input type="checkbox" checked={o.zaznaczony} onChange={(e) => setOdbiorcy(odbiorcy.map((x, j) => (j === i ? { ...x, zaznaczony: e.target.checked } : x)))} aria-label={t('Odbiorca {0}', o.nazwa)} />
                  <span className="font-medium">{o.nazwa}</span>
                  <span className={cn('text-xs', o.email ? 'text-slate-500' : 'text-red-600')}>{o.email || t('brak adresu e-mail')}</span>
                  {!o.dostawca_id && <button className="ml-auto text-slate-400 hover:text-red-600" title={t('Usuń')} onClick={() => setOdbiorcy(odbiorcy.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>}
                </li>
              ))}
              {!odbiorcy.length && <li className="text-slate-500">{t('W bazie nie ma dostawców przypisanych do tej kategorii - dodaj z listy albo wpisz adres.')}</li>}
            </ul>
            <div className="mt-2 flex flex-wrap gap-2">
              {pozostali.length > 0 && (
                <select className="pole w-56 text-sm" value="" onChange={(e) => {
                  const d = dostawcy.find((x) => x.id === e.target.value)
                  if (d) setOdbiorcy([...odbiorcy, { dostawca_id: d.id, nazwa: d.nazwa, email: adresyDostawcy(d).join(', '), zaznaczony: true }])
                }}>
                  <option value="">{t('+ dostawca z bazy...')}</option>
                  {pozostali.map((d) => <option key={d.id} value={d.id}>{d.nazwa}</option>)}
                </select>
              )}
              <input className="pole w-56 text-sm" placeholder={t('adres e-mail')} value={nowyEmail} onChange={(e) => setNowyEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') dodajEmail() }} />
              <Button rozmiar="maly" onClick={dodajEmail}><Plus className="h-3 w-3" /> adres</Button>
            </div>
            {ust.dw && <p className="mt-1 text-xs text-slate-500">{t('W DW:')}{' '}{ust.dw}</p>}
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="etykieta mb-0">{t('Treść')}{' '}{trescReczna !== null && <span className="text-amber-700">{t('(zmieniona ręcznie)')}</span>}</span>
            {trescReczna !== null && <Button rozmiar="maly" wariant="cichy" onClick={() => setTrescReczna(null)}><RotateCcw className="h-3 w-3" /> {t('z szablonu')}</Button>}
          </div>
          <textarea className="pole h-96 font-mono text-xs leading-relaxed" value={tresc} onChange={(e) => setTrescReczna(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={() => void kopiuj()}><Copy className="h-4 w-4" /> {skopiowano ? t('Skopiowano') : t('Kopiuj temat i treść')}</Button>
        <Button wariant="glowny" disabled={zajety} onClick={() => void zatwierdz()}><Save className="h-4 w-4" /> {t('Zapisz zapytanie (')}{wybrani.length} {t('odb.)')}</Button>
      </div>
      <p className="text-right text-xs text-slate-500">{t('Po zapisie wyślij je do każdego odbiorcy przyciskiem „Wyślij” na liście - otworzy się Outlook z gotowym mailem.')}</p>
    </section>
  )
}

/** Generator: źródło pozycji (wycena, odczyt rysunku, usługi z karty analizy) → kategorie → zapytanie dla kategorii. */
export function GeneratorZapytan({ zapytanieId, numer, gotowe, zrodloStartowe }: {
  zapytanieId: string; numer: string; gotowe: (ile: number) => void
  /** 'analiza' - otwarcie z karty analizy (usługi do zapytań). */
  zrodloStartowe?: 'analiza'
}) {
  const s = useSlowniki()
  const [zrodla, setZrodla] = useState<Zrodlo[]>([])
  const [zrodlo, setZrodlo] = useState('')
  const [pozycje, setPozycje] = useState<PozycjaZapytania[]>([])
  const [zaznaczone, setZaznaczone] = useState<Set<string>>(new Set())
  const [dostawcy, setDostawcy] = useState<DostawcaZapytania[]>([])
  const [aktywna, setAktywna] = useState<string | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  // Grupa liczona na bieżąco - poprawka opisu / ilości po "Przygotuj" od razu trafia do treści.
  const grupa = useMemo<GrupaZapytania | null>(() => {
    const g = grupujWgKategorii(pozycje).find((x) => `${x.rodzaj}:${x.kategoria}` === aktywna)
    const wybrane = g?.pozycje.filter((p) => zaznaczone.has(p.klucz)) ?? []
    return g && wybrane.length ? { ...g, pozycje: wybrane } : null
  }, [pozycje, zaznaczone, aktywna])

  useEffect(() => {
    void Promise.all([
      supabase.from('wyceny').select('id, wersja, nazwa, status').eq('zapytanie_id', zapytanieId).order('wersja', { ascending: false }),
      supabase.from('odczyty_rysunkow').select('id, nazwa_pliku, strona, wynik').eq('zapytanie_id', zapytanieId).order('utworzono', { ascending: false }),
      supabase.from('dostawcy').select('id, nazwa, kategorie, kontakty').eq('aktywny', true).order('nazwa'),
      supabase.from('analizy_zapytan').select('dane').eq('zapytanie_id', zapytanieId).maybeSingle(),
    ]).then(([w, r, d, a]) => {
      const uslugi = uslugiDoZapytan(uzupelnijKarte(a.data?.dane as Partial<KartaAnalizy> | undefined)).length
      const l: Zrodlo[] = [
        ...(uslugi ? [{ klucz: `a:${zapytanieId}`, etykieta: t('Karta analizy - usługi do zapytań ({0})', uslugi) }] : []),
        ...(w.data ?? []).map((x) => ({ klucz: `w:${x.id}`, etykieta: t('Wycena v{0}{1}', x.wersja, x.nazwa ? ` - ${x.nazwa}` : '') })),
        ...(r.data ?? []).filter((x) => (x.wynik as WynikRysunku).pozycje.length).map((x) => ({ klucz: `r:${x.id}`, etykieta: t('Rysunek {0}, str. {1} ({2} poz.)', x.nazwa_pliku, x.strona, (x.wynik as WynikRysunku).pozycje.length) })),
      ]
      setZrodla(l)
      // Z karty analizy - jej usługi; inaczej najnowsza wycena (karta analizy na końcu kolejki domyślnej).
      setZrodlo(zrodloStartowe === 'analiza' && uslugi ? `a:${zapytanieId}` : (l.find((x) => !x.klucz.startsWith('a:')) ?? l[0])?.klucz ?? '')
      setDostawcy((d.data ?? []) as DostawcaZapytania[])
      const e = [w, r, d, a].find((x) => x.error)?.error
      if (e) setBlad(komunikatPL(e.message))
    })
  }, [zapytanieId, zrodloStartowe])

  useEffect(() => {
    setAktywna(null); setPozycje([]); setZaznaczone(new Set())
    if (!zrodlo) return
    const [typ, id] = zrodlo.split(':')
    const ustaw = (p: PozycjaZapytania[]) => { setPozycje(p); setZaznaczone(new Set(p.filter((x) => !x.ma_cene).map((x) => x.klucz))) }
    if (typ === 'w') wczytajWycene(id).then((st) => ustaw(pozycjeZWyceny(st))).catch((e) => setBlad(String(e.message ?? e)))
    else if (typ === 'a') void supabase.from('analizy_zapytan').select('dane').eq('zapytanie_id', id).single().then(({ data }) => ustaw(uslugiDoZapytan(uzupelnijKarte(data?.dane as Partial<KartaAnalizy>))))
    else void supabase.from('odczyty_rysunkow').select('wynik').eq('id', id).single().then(({ data }) => ustaw(pozycjeZOdczytu(data!.wynik as WynikRysunku)))
  }, [zrodlo])

  async function zapisz(z: { temat: string; tresc: string; wymagania: string[]; termin: string | null }, odbiorcy: Odbiorca[]) {
    if (!grupa) return
    const [typ, id] = zrodlo.split(':')
    await zapiszZapytanieDostawcy({
      zapytanie_id: zapytanieId, wycena_id: typ === 'w' ? id : null, odczyt_id: typ === 'r' ? id : null, analiza: typ === 'a', rodzaj: grupa.rodzaj, kategoria: grupa.kategoria,
      temat: z.temat, tresc: z.tresc, pozycje: grupa.pozycje.map(({ opis, ilosc, jm, masa_kg }) => ({ opis, ilosc, jm, masa_kg })),
      wymagania: z.wymagania, termin_odpowiedzi: z.termin,
    }, odbiorcy)
    // Zapytana kategoria schodzi z zaznaczenia - można od razu przygotować następną.
    setZaznaczone((x) => new Set([...x].filter((k) => !grupa.pozycje.some((p) => p.klucz === k))))
    setAktywna(null)
    gotowe(odbiorcy.length)
  }

  return (
    <div className="space-y-3">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      <label className="block max-w-xl"><span className="etykieta">{t('Pozycje z')}</span>
        <select className="pole" value={zrodlo} onChange={(e) => setZrodlo(e.target.value)}>
          {!zrodla.length && <option value="">{t('brak wycen i odczytów rysunków w tym zapytaniu')}</option>}
          {zrodla.map((z) => <option key={z.klucz} value={z.klucz}>{z.etykieta}</option>)}
        </select>
      </label>
      <WyborPozycji
        pozycje={pozycje} zaznaczone={zaznaczone} aktywna={grupa ? aktywna : null}
        zmien={(k, z) => setPozycje((l) => l.map((p) => (p.klucz === k ? { ...p, ...z } : p)))}
        zaznacz={(klucze, tak) => setZaznaczone((x) => { const n = new Set(x); klucze.forEach((k) => (tak ? n.add(k) : n.delete(k))); return n })}
        przygotuj={(g) => setAktywna(`${g.rodzaj}:${g.kategoria}`)}
      />
      {grupa && (
        <EdytorZapytania key={aktywna} grupa={grupa} numerZO={numer}
          ust={s.ustawienia.zapytania_dostawcow} dostawcy={dostawcy} zapisz={zapisz} anuluj={() => setAktywna(null)} />
      )}
    </div>
  )
}
