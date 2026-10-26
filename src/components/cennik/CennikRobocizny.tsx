import { Fragment, useCallback, useEffect, useState } from 'react'
import { ClipboardPaste, History, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { dataPL, zl } from '@/lib/format'
import { cn } from '@/lib/utils'
import { dodajRekord, useOdswiezPoHistorii, useZakresHistorii, zmienRekordy } from '@/lib/historia'
import { parsujWklejke, stawkaWDniu, type PrzedzialCennika, type StanowiskoCennika, type StawkaCennika } from '@/lib/cennikRobocizny'
import { uprawnienia, type Profil } from '@/lib/types'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { t } from '@/i18n'

const dzis = () => new Date().toISOString().slice(0, 10)

/**
 * Cennik roboczogodzin (moduł Historyczny cennik): stanowiska × przedziały czasu (7-15, 15-19, 19-7, dni wolne) albo
 * stawka stała. Zmiana stawki tworzy wersję obowiązującą od dziś (historia wersji przy stanowisku, zmiany w audycie).
 * Stawki widzą prezes, administrator i osoby z flagą „widzi narzuty i marże”; zmieniają prezes i administrator.
 * Nowa wycena dostaje migawkę cennika - zmiana tutaj nie zmienia istniejących wycen.
 */
export function CennikRobocizny({ profil }: { profil: Profil }) {
  const s = useSlowniki()
  const up = uprawnienia(profil)
  const edycja = profil.rola === 'prezes' || profil.rola === 'administrator'
  const [przedzialy, setPrzedzialy] = useState<PrzedzialCennika[]>([])
  const [stanowiska, setStanowiska] = useState<StanowiskoCennika[]>([])
  const [stawki, setStawki] = useState<StawkaCennika[]>([])
  const [historia, setHistoria] = useState<number | null>(null)
  const [wklej, setWklej] = useState<string | null>(null)
  const [blad, setBlad] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  useZakresHistorii('cennik')

  const wczytaj = useCallback(async () => {
    const [p, st, sk] = await Promise.all([
      supabase.from('przedzialy_czasu').select('*').eq('aktywny', true).order('kolejnosc'),
      supabase.from('cennik_robocizny').select('*').eq('aktywne', true).order('kolejnosc').order('nazwa'),
      supabase.from('cennik_robocizny_stawki').select('*').order('wazna_od', { ascending: false }),
    ])
    const e = p.error ?? st.error ?? sk.error
    if (e) setBlad(komunikatPL(e.message))
    setPrzedzialy((p.data ?? []) as PrzedzialCennika[])
    setStanowiska((st.data ?? []) as StanowiskoCennika[])
    setStawki(((sk.data ?? []) as StawkaCennika[]).map((x) => ({ ...x, stawka: Number(x.stawka) })))
  }, [])
  useEffect(() => { void wczytaj() }, [wczytaj])
  useOdswiezPoHistorii(() => void wczytaj())

  const wykonaj = async (f: () => Promise<unknown>) => {
    setBlad(null)
    try { await f(); await wczytaj() } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }

  /** Nowa wartość stawki: wersja od dziś (dzisiejsza wersja - poprawka w miejscu). */
  const zmienStawke = (st: StanowiskoCennika, przedzial: string | null, wartosc: number | null) => wykonaj(async () => {
    if (wartosc === null) return
    const obecna = stawkaWDniu(stawki, st.id, przedzial, dzis())
    if (obecna && Number(obecna.stawka) === wartosc) return
    if (obecna?.wazna_od === dzis()) await zmienRekordy('cennik', t('stawka: {0}', st.nazwa), 'cennik_robocizny_stawki', [obecna.id], { stawka: wartosc })
    else await dodajRekord('cennik', t('stawka: {0}', st.nazwa), 'cennik_robocizny_stawki', { stanowisko_id: st.id, przedzial_kod: przedzial, stawka: wartosc, wazna_od: dzis() })
  })
  const zmienStanowisko = (st: StanowiskoCennika, zm: Partial<StanowiskoCennika>, opis: string) =>
    wykonaj(() => zmienRekordy('cennik', opis, 'cennik_robocizny', [st.id], zm))

  async function zWklejki() {
    if (!wklej) return
    const wiersze = parsujWklejke(wklej, przedzialy)
    if (!wiersze.length) { setBlad(t('Nie rozpoznano wierszy - kolumny: nazwa stanowiska, potem stawki w kolejności przedziałów (albo jedna stawka stała).')); return }
    await wykonaj(async () => {
      for (const w of wiersze) {
        let st = stanowiska.find((x) => x.nazwa.toLowerCase() === w.nazwa.toLowerCase())
        const tryb = w.stala !== undefined ? 'stala' : 'przedzialy'
        if (!st) st = await dodajRekord<StanowiskoCennika & Record<string, unknown>>('cennik', t('stanowisko: {0}', w.nazwa), 'cennik_robocizny', { nazwa: w.nazwa, tryb, kolejnosc: stanowiska.length + 1 })
        else if (st.tryb !== tryb) await zmienRekordy('cennik', t('tryb: {0}', w.nazwa), 'cennik_robocizny', [st.id], { tryb })
        const wpisy: [string | null, number][] = w.stala !== undefined ? [[null, w.stala]] : Object.entries(w.stawki ?? {})
        for (const [kod, v] of wpisy) {
          const obecna = stawkaWDniu(stawki, st.id, kod, dzis())
          if (obecna && Number(obecna.stawka) === v) continue
          if (obecna?.wazna_od === dzis()) await zmienRekordy('cennik', t('stawka: {0}', w.nazwa), 'cennik_robocizny_stawki', [obecna.id], { stawka: v })
          else await dodajRekord('cennik', t('stawka: {0}', w.nazwa), 'cennik_robocizny_stawki', { stanowisko_id: st.id, przedzial_kod: kod, stawka: v, wazna_od: dzis() })
        }
      }
    })
    setInfo(t('Wklejono {0} stanowisk.', wiersze.length)); setWklej(null)
  }

  const komorkaStawki = (st: StanowiskoCennika, przedzial: string | null) => {
    const sk = stawkaWDniu(stawki, st.id, przedzial, dzis())
    return edycja
      ? <PoleLiczby className="pole-komorki w-20 text-right" wartosc={sk ? Number(sk.stawka) : null} puste zmien={(n) => void zmienStawke(st, przedzial, n)} />
      : <span>{sk ? zl(sk.stawka) : '-'}</span>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">{t('Cennik roboczogodzin')}</h2>
        {edycja && <Button rozmiar="maly" onClick={() => setWklej('')}><ClipboardPaste className="h-3 w-3" /> {t('Wklej wiersze ze schowka')}</Button>}
      </div>
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {info && <Komunikat rodzaj="sukces">{info}</Komunikat>}
      {!up.widziMarze && <Komunikat rodzaj="info">{t('Stawki są poufne - widzą je prezes, administrator i osoby z uprawnieniem „widzi narzuty i marże”. Poniżej tylko lista stanowisk.')}</Komunikat>}
      <p className="text-xs text-slate-500">{t('Nowa wycena dostaje migawkę cennika w chwili utworzenia - zmiana stawek nie zmienia istniejących wycen (w wycenie jest przycisk „odśwież stawki z cennika”). Zmiana stawki tworzy wersję obowiązującą od dziś.')}</p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="komorka-naglowek">{t('Stanowisko')}</th>
              <th className="komorka-naglowek">{t('Tryb')}</th>
              {przedzialy.map((p) => <th key={p.kod} className="komorka-naglowek text-right">{p.nazwa}</th>)}
              <th className="komorka-naglowek text-right">{t('Stawka stała')}</th>
              <th className="komorka-naglowek">MPK</th>
              <th className="komorka-naglowek" title={t('Stawka średnia warsztatu w metodzie wskaźnikowej')}>{t('Średnia')}</th>
              <th className="komorka-naglowek">{t('Do weryfikacji')}</th>
              <th className="komorka-naglowek" />
            </tr>
          </thead>
          <tbody>
            {stanowiska.map((st) => (
              <Fragment key={st.id}>
                <tr className={cn(st.do_weryfikacji && 'bg-amber-50/50')}>
                  <td className="komorka min-w-[14rem]">
                    {edycja ? <input className="pole-komorki" defaultValue={st.nazwa} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== st.nazwa) void zmienStanowisko(st, { nazwa: e.target.value.trim() }, t('nazwa stanowiska')) }} /> : st.nazwa}
                  </td>
                  <td className="komorka w-36">
                    <select className="pole-komorki text-xs" disabled={!edycja} value={st.tryb} onChange={(e) => void zmienStanowisko(st, { tryb: e.target.value as StanowiskoCennika['tryb'] }, t('tryb: {0}', st.nazwa))}>
                      <option value="przedzialy">{t('przedziały czasu')}</option><option value="stala">{t('stawka stała')}</option>
                    </select>
                  </td>
                  {przedzialy.map((p) => <td key={p.kod} className="komorka text-right">{up.widziMarze && st.tryb === 'przedzialy' ? komorkaStawki(st, p.kod) : ''}</td>)}
                  <td className="komorka text-right">{up.widziMarze && st.tryb === 'stala' ? komorkaStawki(st, null) : ''}</td>
                  <td className="komorka w-24">
                    <select className="pole-komorki text-xs" disabled={!edycja} value={st.mpk_kod ?? ''} onChange={(e) => void zmienStanowisko(st, { mpk_kod: e.target.value || null }, t('MPK: {0}', st.nazwa))}>
                      <option value="">-</option>{s.mpk.map((m) => <option key={m.kod} value={m.kod}>{m.kod}</option>)}
                    </select>
                  </td>
                  <td className="komorka text-center"><input type="radio" name="srednia" disabled={!edycja} checked={st.srednia}
                    onChange={() => void wykonaj(async () => {
                      const poprzednie = stanowiska.filter((x) => x.srednia && x.id !== st.id).map((x) => x.id)
                      if (poprzednie.length) await zmienRekordy('cennik', t('stawka średnia'), 'cennik_robocizny', poprzednie, { srednia: false })
                      await zmienRekordy('cennik', t('stawka średnia: {0}', st.nazwa), 'cennik_robocizny', [st.id], { srednia: true })
                    })} /></td>
                  <td className="komorka text-center"><input type="checkbox" disabled={!edycja} checked={st.do_weryfikacji} onChange={(e) => void zmienStanowisko(st, { do_weryfikacji: e.target.checked }, t('weryfikacja: {0}', st.nazwa))} /></td>
                  <td className="komorka w-16 whitespace-nowrap text-right">
                    {up.widziMarze && <button className="mr-2 text-slate-400 hover:text-slate-700" title={t('Historia wersji stawek')} onClick={() => setHistoria(historia === st.id ? null : st.id)}><History className="h-4 w-4" /></button>}
                    {edycja && <button className="text-slate-400 hover:text-red-600" title={t('Usuń stanowisko z cennika (historia zostaje)')}
                      onClick={() => { if (window.confirm(t('Usunąć stanowisko {0} z cennika? Istniejące wyceny zachowują swoje stawki.', st.nazwa))) void zmienStanowisko(st, { aktywne: false }, t('usunięcie: {0}', st.nazwa)) }}><Trash2 className="h-4 w-4" /></button>}
                  </td>
                </tr>
                {historia === st.id && (
                  <tr>
                    <td colSpan={przedzialy.length + 7} className="komorka bg-slate-50 text-xs">
                      {stawki.filter((x) => x.stanowisko_id === st.id).map((x) => (
                        <span key={x.id} className="mr-4 inline-block">{dataPL(x.wazna_od)}: {x.przedzial_kod ? przedzialy.find((p) => p.kod === x.przedzial_kod)?.nazwa ?? x.przedzial_kod : t('stała')} {zl(x.stawka)}</span>
                      ))}
                      {!stawki.some((x) => x.stanowisko_id === st.id) && t('Brak stawek.')}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!stanowiska.length && <tr><td colSpan={przedzialy.length + 7} className="komorka text-center text-sm text-slate-500">{t('Brak stanowisk - dodaj je albo wklej ze schowka.')}</td></tr>}
          </tbody>
        </table>
      </div>
      {edycja && (
        <div className="flex flex-wrap gap-2">
          <Button rozmiar="maly" onClick={() => void wykonaj(() => dodajRekord('cennik', t('nowe stanowisko'), 'cennik_robocizny', { nazwa: t('Nowe stanowisko {0}', stanowiska.length + 1), tryb: 'przedzialy', kolejnosc: stanowiska.length + 1 }))}>
            <Plus className="h-3 w-3" /> {t('stanowisko')}
          </Button>
          {profil.rola === 'administrator' && (
            <Button rozmiar="maly" onClick={() => {
              const nazwa = window.prompt(t('Nowy przedział czasu (np. „6:00-14:00”):'))?.trim()
              if (nazwa) void wykonaj(() => dodajRekord('cennik', t('przedział: {0}', nazwa), 'przedzialy_czasu', { kod: nazwa.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `p${przedzialy.length + 1}`, nazwa, kolejnosc: przedzialy.length + 1 }, 'kod'))
            }}><Plus className="h-3 w-3" /> {t('przedział czasu')}</Button>
          )}
        </div>
      )}

      <Dialog open={wklej !== null} onOpenChange={(o) => !o && setWklej(null)}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>{t('Wklej wiersze cennika')}</DialogTitle>
          <DialogDescription>{t('Kolumny z Excela: nazwa stanowiska, potem stawki w kolejności: {0}. Stanowisko ze stawką stałą: nazwa i jedna stawka (albo słowo „stała” i stawka). Nagłówek jest pomijany.', przedzialy.map((p) => p.nazwa).join(', '))}</DialogDescription>
          <textarea className="pole mt-3 h-48 font-mono text-xs" autoFocus value={wklej ?? ''} onChange={(e) => setWklej(e.target.value)} />
          <div className="mt-3 flex justify-end gap-2">
            <Button onClick={() => setWklej(null)}>{t('Anuluj')}</Button>
            <Button wariant="glowny" disabled={!wklej?.trim()} onClick={() => void zWklejki()}>{t('Wklej')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
