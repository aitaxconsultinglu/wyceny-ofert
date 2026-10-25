import { useCallback, useEffect, useState } from 'react'
import { Ban, Copy, Mail, Undo2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { dataGodzinaPL, dataPL } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  ETYKIETY_STATUSU_ODBIORCY, KOLORY_STATUSU_ODBIORCY, linkMailto, oznaczOdbiorce, poprawnyEmail, statusOdbiorcy, wczytajOdbiorcow,
  type OdbiorcaStan, type StatusOdbiorcy,
} from '@/lib/zapytaniaDostawcow'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { t } from '@/i18n'

export interface ZapytanieDostawcy { id: string; temat: string; tresc: string; kategoria: string; utworzono: string; termin_odpowiedzi: string | null; numer: string | null }

const FILTRY: [StatusOdbiorcy | '', string][] = [['', 'wszystkie'], ['brak_odpowiedzi', t('brak odpowiedzi')], ['wyslane', t('wysłane')], ['oferta', t('jest oferta')], ['przygotowane', t('nie wysłane')], ['odmowa', 'odmowa']]

/** Tabela zapytań z odbiorcami i statusem (bez pobierania danych). */
export function TabelaZapytan({ zapytania, odbiorcy, dniBezOdpowiedzi, mozeEdytowac, pokazZO, wyslij, oznacz, kopiuj }: {
  zapytania: ZapytanieDostawcy[]
  odbiorcy: OdbiorcaStan[]
  dniBezOdpowiedzi: number
  mozeEdytowac: boolean
  pokazZO: boolean
  wyslij: (z: ZapytanieDostawcy, o: OdbiorcaStan) => void
  oznacz: (o: OdbiorcaStan, zmiana: { wyslano?: boolean; odmowa?: boolean }) => void
  kopiuj: (z: ZapytanieDostawcy) => void
}) {
  if (!zapytania.length) return <p className="text-sm text-slate-500">{t('Brak zapytań do dostawców.')}</p>
  return (
    <div className="space-y-3">
      {zapytania.map((z) => {
        const lista = odbiorcy.filter((o) => o.zapytanie_dostawcy_id === z.id)
        const statusy = lista.map((o) => statusOdbiorcy(o, dniBezOdpowiedzi))
        return (
          <div key={z.id} className="rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm">
              <span className="font-medium">{z.temat}</span>
              {pokazZO && z.numer && <span className="znacznik bg-slate-100 text-slate-600">{z.numer}</span>}
              <span className="text-xs text-slate-500">przygotowano {dataGodzinaPL(z.utworzono)}{z.termin_odpowiedzi ? t(' · oferta do {0}', dataPL(z.termin_odpowiedzi)) : ''}</span>
              <span className="ml-auto text-xs text-slate-500">{t('ofert:')}{' '}{statusy.filter((x) => x === 'oferta').length} / {lista.length}</span>
              <Button rozmiar="maly" wariant="cichy" onClick={() => kopiuj(z)} title={t('Kopiuj temat i treść')}><Copy className="h-3 w-3" /> {t('treść')}</Button>
            </div>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {lista.map((o, i) => {
                  const st = statusy[i]
                  return (
                    <tr key={o.id}>
                      <td className="komorka">{o.nazwa}<div className="text-xs text-slate-500">{o.email}</div></td>
                      <td className="komorka w-32"><span className={cn('znacznik', KOLORY_STATUSU_ODBIORCY[st])}>{ETYKIETY_STATUSU_ODBIORCY[st]}</span></td>
                      <td className="komorka w-40 text-xs text-slate-500">
                        {o.wyslano ? t('wysłano {0}', dataGodzinaPL(o.wyslano)) : ''}
                        {st === 'brak_odpowiedzi' && <div className="text-amber-700">ponad {dniBezOdpowiedzi} {t('dni bez odpowiedzi')}</div>}
                        {o.uwagi && <div>{o.uwagi}</div>}
                      </td>
                      <td className="komorka w-64 text-right">
                        {mozeEdytowac && (
                          <div className="flex justify-end gap-1">
                            {st !== 'oferta' && (
                              <Button rozmiar="maly" wariant={o.wyslano ? 'zwykly' : 'akcent'} onClick={() => wyslij(z, o)} title={t('Otwórz gotowy mail w Outlooku')}>
                                <Mail className="h-3 w-3" /> {o.wyslano ? t('Wyślij ponownie') : t('Wyślij')}
                              </Button>
                            )}
                            {o.wyslano && st !== 'oferta' && (
                              <Button rozmiar="maly" wariant="cichy" title={t('Nie wysłano - cofnij oznaczenie')} onClick={() => oznacz(o, { wyslano: false })}><Undo2 className="h-3 w-3" /></Button>
                            )}
                            {st !== 'oferta' && (
                              <Button rozmiar="maly" wariant="cichy" title={o.odmowa ? t('Cofnij odmowę') : t('Dostawca odmówił złożenia oferty')} onClick={() => oznacz(o, { odmowa: !o.odmowa })}>
                                <Ban className={cn('h-3 w-3', o.odmowa && 'text-red-600')} />
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

/** Zapytania do dostawców: jednego zapytania klienta (zapytanieId) albo wszystkie (filtr statusu). */
export function ListaZapytanDostawcow({ zapytanieId, mozeEdytowac, odswiez = 0 }: { zapytanieId: string | null; mozeEdytowac: boolean; odswiez?: number }) {
  const s = useSlowniki()
  const ust = s.ustawienia.zapytania_dostawcow
  const [zapytania, setZapytania] = useState<ZapytanieDostawcy[]>([])
  const [odbiorcy, setOdbiorcy] = useState<OdbiorcaStan[]>([])
  const [filtr, setFiltr] = useState<StatusOdbiorcy | ''>('')
  const [blad, setBlad] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const wczytaj = useCallback(async () => {
    try {
      let q = supabase.from('zapytania_dostawcow').select('id, temat, tresc, kategoria, utworzono, termin_odpowiedzi, zapytania(numer)').order('utworzono', { ascending: false })
      if (zapytanieId) q = q.eq('zapytanie_id', zapytanieId)
      const [{ data, error }, o] = await Promise.all([q.limit(300), wczytajOdbiorcow(zapytanieId)])
      if (error) throw new Error(komunikatPL(error.message))
      setZapytania(((data ?? []) as unknown as (Omit<ZapytanieDostawcy, 'numer'> & { zapytania: { numer: string } | null })[])
        .map(({ zapytania: zap, ...z }) => ({ ...z, numer: zap?.numer ?? null })))
      setOdbiorcy(o)
    } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }, [zapytanieId])
  useEffect(() => { void wczytaj() }, [wczytaj, odswiez])

  async function oznacz(o: OdbiorcaStan, zmiana: { wyslano?: boolean; odmowa?: boolean }) {
    try { await oznaczOdbiorce(o.id, zmiana); await wczytaj() } catch (e) { setBlad(e instanceof Error ? e.message : String(e)) }
  }

  async function wyslij(z: ZapytanieDostawcy, o: OdbiorcaStan) {
    setBlad(null); setInfo(null)
    const adresy = (o.email ?? '').split(/[,;]/).map((x) => x.trim()).filter(poprawnyEmail)
    if (!adresy.length) { setBlad(t('Brak adresu e-mail dla: {0}. Uzupełnij kontakt w bazie dostawców.', o.nazwa)); return }
    const { url, pelny } = linkMailto({ do: adresy, dw: ust.dw, temat: z.temat, tresc: z.tresc })
    if (!pelny) {
      try { await navigator.clipboard.writeText(z.tresc) } catch { /* bez schowka - zostaje przycisk "treść" */ }
      setInfo(t('Treść jest za długa na link mailto - skopiowano ją do schowka, wklej w Outlooku (Ctrl+V).'))
    }
    window.location.href = url
    await oznacz(o, { wyslano: true })
  }

  async function kopiuj(z: ZapytanieDostawcy) {
    try { await navigator.clipboard.writeText(`${z.temat}\n\n${z.tresc}`); setInfo(t('Skopiowano temat i treść zapytania.')) } catch { setBlad(t('Przeglądarka nie pozwoliła na zapis do schowka.')) }
  }

  const widoczne = filtr
    ? zapytania.filter((z) => odbiorcy.some((o) => o.zapytanie_dostawcy_id === z.id && statusOdbiorcy(o, ust.dni_bez_odpowiedzi) === filtr))
    : zapytania
  return (
    <div className="space-y-3">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {info && <Komunikat rodzaj="info">{info}</Komunikat>}
      {!zapytanieId && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="etykieta mb-0">{t('Pokaż:')}</span>
          {FILTRY.map(([k, et]) => (
            <button key={k} onClick={() => setFiltr(k)} className={cn('rounded-md border px-2 py-1 text-xs', filtr === k ? 'border-blekit-ciemny bg-blekit-jasny font-medium' : 'border-slate-200 bg-white')}>{et}</button>
          ))}
        </div>
      )}
      <TabelaZapytan zapytania={widoczne} odbiorcy={odbiorcy} dniBezOdpowiedzi={ust.dni_bez_odpowiedzi} mozeEdytowac={mozeEdytowac}
        pokazZO={!zapytanieId} wyslij={(z, o) => void wyslij(z, o)} oznacz={(o, z) => void oznacz(o, z)} kopiuj={(z) => void kopiuj(z)} />
      <p className="text-xs text-slate-500">
        {t('„Jest oferta” pojawia się sama, gdy w bazie ofert jest oferta tego dostawcy do tego samego zapytania ZO. „Brak odpowiedzi” - po')}{' '}{ust.dni_bez_odpowiedzi} {t('dniach od wysłania (do zmiany w ustawieniach).')}
      </p>
    </div>
  )
}
