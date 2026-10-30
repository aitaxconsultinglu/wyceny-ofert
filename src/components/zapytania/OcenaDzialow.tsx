import { CheckCircle2 } from 'lucide-react'
import { dataGodzinaPL } from '@/lib/format'
import type { BlokOceny, OcenaAnalizy } from '@/lib/analiza'
import { t, tDowolny } from '@/i18n'

/**
 * Ocena działów (opinia o zapytaniu) - jedno źródło danych: karta analizy (analizy_zapytan.dane.ocena).
 * Ten sam formularz w karcie analizy i w zakładce „Wycena” wyceny. `kto` - nazwa zalogowanej osoby do zatwierdzeń
 * bloków („data i podpis” jako zapis kto / kiedy); bez niej przyciski zatwierdzania są ukryte.
 */
export function OcenaDzialow({ ocena, zmien, kto, tylkoOdczyt = false, zOfert = {} }: {
  ocena: OcenaAnalizy
  zmien: (z: Partial<OcenaAnalizy>) => void
  kto?: string
  tylkoOdczyt?: boolean
  /** Najdłuższy termin dostawy z ofert dostawców wg grupy materiałów - podpowiedź do wstawienia. */
  zOfert?: Record<string, string>
}) {
  const podpis = (blok: BlokOceny) => {
    const p = ocena.podpisy?.[blok]
    if (p) {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-limonka-ciemna">
          <CheckCircle2 className="h-3 w-3" /> {t('zatwierdził(a): {0}, {1}', p.kto, dataGodzinaPL(p.kiedy))}
          {!tylkoOdczyt && kto && <button className="ml-1 text-slate-500 underline" onClick={() => zmien({ podpisy: { ...ocena.podpisy, [blok]: undefined } })}>{t('cofnij')}</button>}
        </span>
      )
    }
    return !tylkoOdczyt && kto
      ? <button className="text-xs text-blekit-ciemny underline" onClick={() => zmien({ podpisy: { ...ocena.podpisy, [blok]: { kto, kiedy: new Date().toISOString() } } })}>{t('Zatwierdzam (data i podpis)')}</button>
      : <span className="text-xs text-slate-400">{t('niezatwierdzone')}</span>
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 text-sm">
        <div>
          <span className="etykieta">{t('Kompletność dokumentacji do zakupu materiałów')}</span>
          {([['arkusz_danych', t('arkusz danych')], ['dokumentacja_wykonawcza', t('dokumentacja wykonawcza')], ['dokumentacja_koncesyjna', t('dokumentacja koncesyjna')], ['szkic', t('szkic / rysunek założeniowy')]] as const).map(([k, et]) => (
            <label key={k} className="mr-4 inline-flex items-center gap-1"><input type="checkbox" disabled={tylkoOdczyt} checked={ocena.kompletnosc[k]} onChange={(e) => zmien({ kompletnosc: { ...ocena.kompletnosc, [k]: e.target.checked } })} /> {et}</label>
          ))}
          <div>{podpis('kompletnosc')}</div>
        </div>
        <div>
          <span className="etykieta">{t('Ocena technologiczna')}</span>
          {(['pozytywna', 'negatywna'] as const).map((o) => (
            <label key={o} className="mr-4 inline-flex items-center gap-1"><input type="radio" disabled={tylkoOdczyt} name="ocena-techn" checked={ocena.technologiczna === o} onChange={() => zmien({ technologiczna: o })} /> {o === 'pozytywna' ? t('pozytywna') : t('negatywna')}</label>
          ))}
          <input className="pole mt-1 text-sm" disabled={tylkoOdczyt} placeholder={t('uwagi technologiczne')} value={ocena.uwagi_technologiczne} onChange={(e) => zmien({ uwagi_technologiczne: e.target.value })} />
          <div>{podpis('technologiczna')}</div>
        </div>
        <label className="block"><span className="etykieta">{t('Ocena spawalnicza (WPS, dodatkowe uprawnienia)')}</span>
          <input className="pole text-sm" disabled={tylkoOdczyt} value={ocena.spawalnicza} onChange={(e) => zmien({ spawalnicza: e.target.value })} /></label>
        <div>{podpis('spawalnicza')}</div>
        <label className="block"><span className="etykieta">{t('Istotne problemy i wpływ na termin (wyżarzanie, transport ponadgabarytowy...)')}</span>
          <textarea className="pole h-14 text-sm" disabled={tylkoOdczyt} value={ocena.problemy ?? ''} onChange={(e) => zmien({ problemy: e.target.value })} /></label>
      </div>
      <div className="space-y-2 text-sm">
        <span className="etykieta">{t('Terminy zakupu materiałów')}</span>
        <table className="w-full border-collapse">
          <tbody>
            {ocena.terminy_materialow.map((tm, i) => (
              <tr key={tm.grupa}>
                <td className="komorka w-48 text-xs">{tDowolny(tm.grupa)}</td>
                <td className="komorka"><input className="pole-komorki w-full" disabled={tylkoOdczyt} placeholder={zOfert[tm.grupa] ?? t('np. 8-10 tyg.')} value={tm.termin}
                  onChange={(e) => zmien({ terminy_materialow: ocena.terminy_materialow.map((x, j) => (j === i ? { ...x, termin: e.target.value } : x)) })} /></td>
                <td className="komorka w-52 text-xs text-slate-500">
                  {zOfert[tm.grupa] && (
                    <button className="text-left text-blekit-ciemny hover:underline disabled:text-slate-400" disabled={tylkoOdczyt} title={t('Wstaw termin z oferty dostawcy')}
                      onClick={() => zmien({ terminy_materialow: ocena.terminy_materialow.map((x, j) => (j === i ? { ...x, termin: zOfert[tm.grupa] } : x)) })}>
                      {t('z ofert: {0}', zOfert[tm.grupa])}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>{podpis('terminy')}</div>
        <div className="flex gap-4">
          <label className="inline-flex items-center gap-1"><input type="checkbox" disabled={tylkoOdczyt} checked={ocena.plan_jakosci} onChange={(e) => zmien({ plan_jakosci: e.target.checked })} /> {t('plan jakości')}</label>
          <label className="inline-flex items-center gap-1"><input type="checkbox" disabled={tylkoOdczyt} checked={ocena.zmiana_terminu} onChange={(e) => zmien({ zmiana_terminu: e.target.checked })} /> {t('proponujemy zmianę terminu')}</label>
        </div>
        <label className="block"><span className="etykieta">{t('Uwagi do przygotowania oferty')}</span>
          <textarea className="pole h-16 text-sm" disabled={tylkoOdczyt} value={ocena.uwagi} onChange={(e) => zmien({ uwagi: e.target.value })} /></label>
      </div>
    </div>
  )
}
