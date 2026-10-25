import { useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { useSlowniki } from '@/lib/slowniki'
import { poprawnyEmail } from '@/lib/zapytaniaDostawcow'
import type { UstawieniaZapytan as Ust, WymaganieZapytania } from '@/lib/types'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { zapiszUstawienia } from './zapiszUstawienie'
import { t } from '@/i18n'

/** Ustawienia → Zapytania do dostawców: DW, czas na odpowiedź, szablon treści, biblioteka wymagań. */
export function UstawieniaZapytan() {
  const s = useSlowniki()
  const [u, setU] = useState<Ust>(s.ustawienia.zapytania_dostawcow)
  const [zmieniony, setZmieniony] = useState(false)
  const [blad, setBlad] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const ust = (z: Partial<Ust>) => { setU({ ...u, ...z }); setZmieniony(true); setInfo(null) }
  const ustW = (i: number, z: Partial<WymaganieZapytania>) => ust({ wymagania: u.wymagania.map((w, j) => (j === i ? { ...w, ...z } : w)) })
  const kategorie = [
    { kod: '*material', nazwa: 'wszystkie materiały' }, { kod: '*usluga', nazwa: 'wszystkie usługi' },
    ...s.kategorieMaterialow.map((k) => ({ kod: k.kod, nazwa: k.nazwa })), ...s.kategorieUslug.map((k) => ({ kod: k.kod, nazwa: `${k.nazwa} (usługa)` })),
  ]
  const nazwa = (kod: string) => kategorie.find((k) => k.kod === kod)?.nazwa ?? kod

  async function zapisz() {
    if (u.dw.trim() && !poprawnyEmail(u.dw)) { setBlad(t('Adres do DW jest nieprawidłowy.')); return }
    if (u.wymagania.some((w) => !w.tekst.trim())) { setBlad(t('Uzupełnij treść wszystkich wymagań albo usuń puste.')); return }
    const b = await zapiszUstawienia({ zapytania_dostawcow: { ...u, dw: u.dw.trim() } })
    if (b) { setBlad(b); return }
    setBlad(null); setInfo(t('Zapisano.')); setZmieniony(false)
    await s.odswiez()
  }

  const tekst = (k: keyof Ust, et: string, wiersze = 1) => (
    <label className="block"><span className="etykieta">{et}</span>
      {wiersze > 1
        ? <textarea className="pole text-sm" rows={wiersze} value={u[k] as string} onChange={(e) => ust({ [k]: e.target.value } as Partial<Ust>)} />
        : <input className="pole text-sm" value={u[k] as string} onChange={(e) => ust({ [k]: e.target.value } as Partial<Ust>)} />}
    </label>
  )

  return (
    <div className="max-w-4xl space-y-4">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {info && <Komunikat rodzaj="sukces">{info}</Komunikat>}
      <section className="sekcja space-y-3">
        <h3 className="font-semibold">{t('Wysyłka i odpowiedzi')}</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="sm:col-span-1"><span className="etykieta">{t('Adres w DW (dedykowana skrzynka)')}</span>
            <input className="pole text-sm" placeholder={t('np. oferty@...')} value={u.dw} onChange={(e) => ust({ dw: e.target.value })} /></label>
          <label><span className="etykieta">{t('„Brak odpowiedzi” po [dniach]')}</span>
            <PoleLiczby className="pole" wartosc={u.dni_bez_odpowiedzi} zmien={(v) => ust({ dni_bez_odpowiedzi: v ?? 0 })} /></label>
          <label><span className="etykieta">{t('Domyślny termin oferty [dni robocze]')}</span>
            <PoleLiczby className="pole" wartosc={u.dni_na_odpowiedz} zmien={(v) => ust({ dni_na_odpowiedz: v ?? 0 })} /></label>
        </div>
        <p className="text-xs text-slate-500">{t('Skrzynka w DW dostaje kopię zapytania - przyda się do automatycznego pobierania ofert (etap 5).')}</p>
      </section>

      <section className="sekcja space-y-3">
        <h3 className="font-semibold">{t('Szablon treści')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {tekst('powitanie', 'Powitanie')}
          <span />
          {tekst('wstep_material', 'Wstęp - materiał')}
          {tekst('wstep_usluga', 'Wstęp - usługa')}
          {tekst('zakonczenie', 'Zakończenie', 3)}
          {tekst('podpis', 'Podpis', 3)}
        </div>
        <p className="text-xs text-slate-500">{t('Treść: powitanie, wstęp z wymaganiami „we wstępie” i dwukropkiem, lista pozycji, „Uwagi:” z pozostałymi wymaganiami, termin oferty, numer ZO, zakończenie, podpis.')}</p>
      </section>

      <section className="sekcja space-y-3">
        <h3 className="font-semibold">{t('Biblioteka wymagań')}</h3>
        <p className="text-xs text-slate-500">{t('Wymaganie jest domyślnie zaznaczone w zapytaniu dla wybranych kategorii; w zapytaniu można je zaznaczyć ręcznie dla każdej kategorii.')}</p>
        <div className="space-y-2">
          {u.wymagania.map((w, i) => (
            <div key={w.kod} className="rounded border border-slate-200 p-2">
              <div className="flex items-start gap-2">
                <textarea className="pole text-sm" rows={2} value={w.tekst} onChange={(e) => ustW(i, { tekst: e.target.value })} aria-label={t('Treść wymagania')} />
                <button className="mt-1 text-slate-400 hover:text-red-600" title={t('Usuń wymaganie')} onClick={() => ust({ wymagania: u.wymagania.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <label className="flex items-center gap-1"><input type="checkbox" checked={w.w_naglowku} onChange={(e) => ustW(i, { w_naglowku: e.target.checked })} /> {t('we wstępie')}</label>
                <span className="text-slate-400">|</span>
                {w.kategorie.map((k) => (
                  <span key={k} className="znacznik bg-slate-100 text-slate-700">
                    {nazwa(k)} <button className="ml-1 hover:text-red-600" title={t('Usuń kategorię')} onClick={() => ustW(i, { kategorie: w.kategorie.filter((x) => x !== k) })}>×</button>
                  </span>
                ))}
                <select className="pole-komorki text-xs" value="" onChange={(e) => e.target.value && ustW(i, { kategorie: [...w.kategorie, e.target.value] })}>
                  <option value="">{t('+ kategoria...')}</option>
                  {kategorie.filter((k) => !w.kategorie.includes(k.kod)).map((k) => <option key={k.kod} value={k.kod}>{k.nazwa}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
        <Button rozmiar="maly" onClick={() => ust({ wymagania: [...u.wymagania, { kod: `w${Date.now().toString(36)}`, tekst: '', kategorie: [], w_naglowku: false }] })}>
          <Plus className="h-3 w-3" /> wymaganie
        </Button>
      </section>
      <Button wariant="glowny" disabled={!zmieniony} onClick={() => void zapisz()}><Save className="h-4 w-4" /> {t('Zapisz')}</Button>
    </div>
  )
}
