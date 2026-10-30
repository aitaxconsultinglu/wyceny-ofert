import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Plus, Quote, Send, Trash2 } from 'lucide-react'
import { useSlowniki } from '@/lib/slowniki'
import { cn } from '@/lib/utils'
import {
  CHECKLISTA, ETYKIETY_STANU, type KartaAnalizy, type StanWymagania,
  type UslugaAnalizy, type WymaganieAnalizy, type Wplyw,
} from '@/lib/analiza'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { t } from '@/i18n'

const KOLOR_STANU: Record<StanWymagania, string> = {
  wymagane: 'bg-sky-50 text-sky-900 border-sky-200', nie: 'bg-slate-50 text-slate-500 border-slate-200',
  do_wyjasnienia: 'bg-amber-50 text-amber-900 border-amber-300', brak_informacji: 'bg-white text-slate-400 border-slate-200',
}
const WPLYW: Record<Wplyw, string> = { wysoki: t('wysoki'), sredni: t('średni'), niski: t('niski') }

export interface DokumentKarty { id: string; nazwa: string; typ: string; istotny: boolean }

function Sekcja({ tytul, liczba, children, akcje }: { tytul: string; liczba?: string; children: ReactNode; akcje?: ReactNode }) {
  return (
    <section className="sekcja space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-semibold">{tytul}</h4>
        {liczba && <span className="text-xs text-slate-500">{liczba}</span>}
        <span className="ml-auto flex flex-wrap gap-2">{akcje}</span>
      </div>
      {children}
    </section>
  )
}

const usun = (f: () => void) => (
  <button className="text-slate-400 hover:text-red-600" title={t('Usuń')} onClick={f}><Trash2 className="h-3.5 w-3.5" /></button>
)

/** Widok i edycja karty analizy (bez pobierania danych). */
/**
 * Karta „Kooperacja” (dawna karta analizy): wymagania kosztotwórcze, usługi kooperacja (prośby o oferty do kooperantów),
 * pytania do klienta i niespójności. Pozostałe dane analizy (podsumowanie, aparaty, ocena działów) zostają w danych karty,
 * ale nie są tu pokazywane - ocena działów jest w wycenie.
 */
export function KartaAnalizyWidok({ karta, zmien, akcjeUslug, poprosOOferte }: {
  /** Prośba do działu handlowego o ofertę na usługę (kolejka „Prośby o oferty”). */
  poprosOOferte?: (u: UslugaAnalizy) => void
  /** Zalogowana osoba - do zatwierdzeń bloków oceny działów. */
  kto?: string
  karta: KartaAnalizy
  zmien: (k: KartaAnalizy) => void
  dokumenty: DokumentKarty[]
  ustawIstotny: (ids: { id: string; istotny: boolean }[]) => void
  liczbaOdczytow: number
  akcjePodsumowania?: ReactNode
  akcjeUslug?: ReactNode
  otworzRysunki?: () => void
}) {
  const s = useSlowniki()
  const [cytaty, setCytaty] = useState<Set<number>>(new Set())
  const ustW = (i: number, z: Partial<WymaganieAnalizy>) => zmien({ ...karta, wymagania: karta.wymagania.map((w, j) => (j === i ? { ...w, ...z } : w)) })
  const lista = <K extends 'uslugi' | 'pytania' | 'niespojnosci'>(k: K, i: number, z: Partial<KartaAnalizy[K][number]>) =>
    zmien({ ...karta, [k]: (karta[k] as KartaAnalizy[K][number][]).map((x, j) => (j === i ? { ...x, ...z } : x)) })

  return (
    <div className="space-y-4">
      <Sekcja tytul={t('1. Wymagania kosztotwórcze')} liczba={`${karta.wymagania.filter((w) => w.stan !== 'brak_informacji').length} z ${karta.wymagania.length} ocenionych`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead><tr>{[t('Wymaganie'), t('Stan'), t('Wpływ na cenę'), t('Opis (konkret)'), t('Źródło'), ''].map((n) => <th key={n} className="komorka-naglowek text-xs">{n}</th>)}</tr></thead>
            <tbody>
              {karta.wymagania.flatMap((w, i) => {
                const zListy = CHECKLISTA.find((c) => c.kod === w.kod)
                const otwarty = cytaty.has(i)
                return [
                  <tr key={w.kod} className={cn(w.stan === 'do_wyjasnienia' && 'bg-amber-50/60')}>
                    <td className="komorka w-64">
                      {zListy ? <span title={zListy.podpowiedz}>{w.nazwa}</span>
                        : <input className="pole-komorki w-full" value={w.nazwa} onChange={(e) => ustW(i, { nazwa: e.target.value })} />}
                    </td>
                    <td className="komorka w-36">
                      <select className={cn('w-full rounded border px-1 py-0.5 text-xs', KOLOR_STANU[w.stan])} value={w.stan} onChange={(e) => ustW(i, { stan: e.target.value as StanWymagania })}>
                        {Object.entries(ETYKIETY_STANU).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="komorka w-24">
                      <select className="pole-komorki text-xs" value={w.wplyw ?? ''} onChange={(e) => ustW(i, { wplyw: (e.target.value || null) as Wplyw | null })}>
                        <option value="">-</option>{Object.entries(WPLYW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="komorka"><input className="pole-komorki w-full" placeholder={zListy?.podpowiedz} value={w.opis} onChange={(e) => ustW(i, { opis: e.target.value })} /></td>
                    <td className="komorka w-48"><input className="pole-komorki w-full text-xs" value={w.zrodlo} placeholder={t('plik, str.')} onChange={(e) => ustW(i, { zrodlo: e.target.value })} /></td>
                    <td className="komorka w-16 whitespace-nowrap">
                      <button title={w.cytat ? t('Cytat z dokumentu') : t('Dodaj cytat')} className={cn('mr-1', w.cytat ? 'text-blekit-ciemny' : 'text-slate-300 hover:text-slate-600')}
                        onClick={() => setCytaty((x) => { const n = new Set(x); if (n.has(i)) n.delete(i); else n.add(i); return n })}>
                        <Quote className="inline h-3.5 w-3.5" />{otwarty ? <ChevronDown className="inline h-3 w-3" /> : <ChevronRight className="inline h-3 w-3" />}
                      </button>
                      {!zListy && usun(() => zmien({ ...karta, wymagania: karta.wymagania.filter((_, j) => j !== i) }))}
                    </td>
                  </tr>,
                  ...(otwarty ? [
                    <tr key={`${w.kod}-c`}><td colSpan={6} className="komorka bg-slate-50">
                      <textarea className="pole h-16 text-xs italic" placeholder={t('Dosłowny fragment dokumentu')} value={w.cytat} onChange={(e) => ustW(i, { cytat: e.target.value })} />
                    </td></tr>,
                  ] : []),
                ]
              })}
            </tbody>
          </table>
        </div>
        <Button rozmiar="maly" wariant="cichy" onClick={() => zmien({ ...karta, wymagania: [...karta.wymagania, { kod: `wlasne-${Date.now().toString(36)}`, nazwa: '', stan: 'wymagane', wplyw: null, opis: '', cytat: '', zrodlo: '' }] })}>
          <Plus className="h-3 w-3" /> {t('wymaganie spoza listy')}
        </Button>
      </Sekcja>

      <Sekcja tytul={t('2. Usługi kooperacja')} liczba={`${karta.uslugi.length}`} akcje={akcjeUslug}>
        <table className="w-full border-collapse text-sm">
          <thead><tr>{[t('Kategoria'), t('Usługa (zakres)'), t('Ilość'), t('J.m.'), t('Uwagi'), ''].map((n) => <th key={n} className="komorka-naglowek text-xs">{n}</th>)}</tr></thead>
          <tbody>
            {karta.uslugi.map((u, i) => (
              <tr key={i}>
                <td className="komorka w-48"><select className="pole-komorki w-full text-xs" value={u.kategoria ?? ''} onChange={(e) => lista('uslugi', i, { kategoria: e.target.value || null })}>
                  <option value="">{t('- inne -')}</option>{s.kategorieUslug.map((k) => <option key={k.kod} value={k.kod}>{k.nazwa}</option>)}
                  {u.kategoria && !s.kategorieUslug.some((k) => k.kod === u.kategoria) && <option value={u.kategoria}>{u.kategoria}</option>}</select></td>
                <td className="komorka"><input className="pole-komorki w-full" value={u.opis} onChange={(e) => lista('uslugi', i, { opis: e.target.value })} /></td>
                <td className="komorka w-20"><PoleLiczby className="pole-komorki w-16 text-right" puste wartosc={u.ilosc} zmien={(v) => lista('uslugi', i, { ilosc: v })} /></td>
                <td className="komorka w-16"><input className="pole-komorki w-14" value={u.jm} onChange={(e) => lista('uslugi', i, { jm: e.target.value })} /></td>
                <td className="komorka"><input className="pole-komorki w-full" value={u.uwagi} onChange={(e) => lista('uslugi', i, { uwagi: e.target.value })} /></td>
                <td className="komorka w-16 whitespace-nowrap">
                  {poprosOOferte && u.opis.trim() && (
                    <button className="mr-2 text-blekit-ciemny hover:text-slate-900" title={t('Poproś dział handlowy o ofertę na tę usługę (kolejka „Prośby o oferty”)')} onClick={() => poprosOOferte(u)}>
                      <Send className="inline h-3.5 w-3.5" />
                    </button>
                  )}
                  {usun(() => zmien({ ...karta, uslugi: karta.uslugi.filter((_, j) => j !== i) }))}
                </td>
              </tr>
            ))}
            {!karta.uslugi.length && <tr><td colSpan={6} className="komorka text-center text-slate-500">{t('Brak - dodaj usługi, o które trzeba zapytać kooperantów (malowanie, izolacja, PWHT, NDT, transport...).')}</td></tr>}
          </tbody>
        </table>
        <Button rozmiar="maly" wariant="cichy" onClick={() => zmien({ ...karta, uslugi: [...karta.uslugi, { kategoria: null, opis: '', ilosc: null, jm: '', uwagi: '' }] })}><Plus className="h-3 w-3" /> {t('usługa')}</Button>
      </Sekcja>

      <Sekcja tytul={t('3. Pytania do klienta i niespójności')} liczba={`${karta.pytania.length} pytań, ${karta.niespojnosci.length} niespójności`}>
        <table className="w-full border-collapse text-sm">
          <thead><tr>{[t('Pytanie do klienta'), t('Źródło'), t('Odpowiedź'), ''].map((n) => <th key={n} className="komorka-naglowek text-xs">{n}</th>)}</tr></thead>
          <tbody>
            {karta.pytania.map((q, i) => (
              <tr key={i} className={cn(!q.odpowiedz.trim() && 'bg-amber-50/60')}>
                <td className="komorka"><input className="pole-komorki w-full" value={q.tresc} onChange={(e) => lista('pytania', i, { tresc: e.target.value })} /></td>
                <td className="komorka w-48"><input className="pole-komorki w-full text-xs" value={q.zrodlo} onChange={(e) => lista('pytania', i, { zrodlo: e.target.value })} /></td>
                <td className="komorka"><input className="pole-komorki w-full" placeholder={t('odpowiedź klienta')} value={q.odpowiedz} onChange={(e) => lista('pytania', i, { odpowiedz: e.target.value })} /></td>
                <td className="komorka w-8">{usun(() => zmien({ ...karta, pytania: karta.pytania.filter((_, j) => j !== i) }))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button rozmiar="maly" wariant="cichy" onClick={() => zmien({ ...karta, pytania: [...karta.pytania, { tresc: '', zrodlo: '', odpowiedz: '' }] })}><Plus className="h-3 w-3" /> pytanie</Button>
        <table className="w-full border-collapse text-sm">
          <thead><tr>{[t('Niespójność między dokumentami'), t('Gdzie'), ''].map((n) => <th key={n} className="komorka-naglowek text-xs">{n}</th>)}</tr></thead>
          <tbody>
            {karta.niespojnosci.map((n, i) => (
              <tr key={i} className="bg-red-50/40">
                <td className="komorka"><input className="pole-komorki w-full" value={n.opis} onChange={(e) => lista('niespojnosci', i, { opis: e.target.value })} /></td>
                <td className="komorka w-64"><input className="pole-komorki w-full text-xs" value={n.zrodla} onChange={(e) => lista('niespojnosci', i, { zrodla: e.target.value })} /></td>
                <td className="komorka w-8">{usun(() => zmien({ ...karta, niespojnosci: karta.niespojnosci.filter((_, j) => j !== i) }))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button rozmiar="maly" wariant="cichy" onClick={() => zmien({ ...karta, niespojnosci: [...karta.niespojnosci, { opis: '', zrodla: '' }] })}><Plus className="h-3 w-3" /> {t('niespójność')}</Button>
      </Sekcja>

    </div>
  )
}
