import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { wymiaryWorda, type BlokDokumentu, type WymiaryStrony } from '@/lib/wersjeEdytowalne'
import { t } from '@/i18n'

const WYR = { lewo: 'text-left', srodek: 'text-center', prawo: 'text-right', wyjustowane: 'text-justify' } as const
const NAGL = ['text-xl', 'text-lg', 'text-base'] as const

/** Wersja edytowalna w przeglądarce jako tekst (nagłówki, akapity, listy, tabele). */
export function PodgladBlokow({ bloki }: { bloki: BlokDokumentu[] }) {
  if (!bloki.length) return <p className="text-sm text-slate-500">{t('Brak treści.')}</p>
  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-800">
      {bloki.map((b, i) => {
        const styl = cn(WYR[b.wyrownanie], b.pogrubiony && 'font-semibold', b.kursywa && 'italic')
        if (b.typ === 'obraz') return <p key={i} className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500">{t('[obraz]')} {b.tekst}</p>
        if (b.typ === 'naglowek') return <p key={i} className={cn(styl, 'font-semibold text-slate-900', NAGL[Math.min(3, Math.max(1, b.poziom)) - 1])}>{b.tekst}</p>
        if (b.typ === 'lista') return <ul key={i} className="list-disc space-y-0.5 pl-5">{b.elementy.map((e, j) => <li key={j} className="whitespace-pre-wrap">{e}</li>)}</ul>
        if (b.typ === 'tabela') {
          return (
            <div key={i} className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {b.wiersze.map((w, r) => (
                    <tr key={r} className={cn(b.naglowek_tabeli && r === 0 && 'bg-slate-100 font-semibold')}>
                      {w.map((k, c) => <td key={c} className="komorka whitespace-pre-wrap align-top">{k}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        return <p key={i} className={cn(styl, 'whitespace-pre-wrap', b.typ === 'podpis' && 'text-xs italic text-slate-600')}>{b.tekst}</p>
      })}
    </div>
  )
}

/**
 * Strona w układzie oryginału (jak w Wordzie): bloki w swoich miejscach, czcionka i rozmiar oryginału (1 pt = 1 px,
 * skalowane do szerokości panelu). tlo - render tej strony; z niego wycinane są obrazy (logo, rysunki).
 */
export function PodgladUkladu({ bloki, wymiary, tlo }: { bloki: BlokDokumentu[]; wymiary?: WymiaryStrony | null; tlo?: string | null }) {
  const ref = useRef<HTMLDivElement>(null)
  const [szer, setSzer] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const o = new ResizeObserver(([e]) => setSzer(e.contentRect.width))
    o.observe(ref.current)
    return () => o.disconnect()
  }, [])
  const { W, H } = wymiaryWorda(wymiary)
  const skala = szer / W
  const zRamka = bloki.filter((b) => b.ramka)
  return (
    <div ref={ref} className="w-full">
      <div className="relative overflow-hidden border border-slate-200 bg-white shadow-sm" style={{ height: H * skala }}>
        <div className="absolute left-0 top-0 origin-top-left text-black" style={{ width: W, height: H, transform: `scale(${skala})` }}>
          {zRamka.map((b, i) => {
            const r = b.ramka!
            // Jak w Wordzie: pojedynczy wiersz się nie łamie, akapit ma 8% zapasu (inna miara czcionki niż w PDF).
            const jedenWiersz = !b.interlinia && !b.tekst.includes('\n') && b.typ !== 'tabela' && b.typ !== 'lista'
            const styl: CSSProperties = {
              position: 'absolute', left: (r.x - (b.typ === 'tabela' || b.typ === 'obraz' ? 0 : b.wyrownanie === 'prawo' ? 0.08 * r.w : b.wyrownanie === 'srodek' ? 0.04 * r.w : 0)) * W, top: r.y * H, width: r.w * W * (b.typ === 'tabela' || b.typ === 'obraz' ? 1 : 1.08), minHeight: r.h * H,
              whiteSpace: jedenWiersz ? 'pre' : undefined,
              ...(b.wciecie ? { textIndent: b.wciecie, paddingLeft: b.wciecie < 0 ? -b.wciecie : 0 } : {}), fontSize: (b.rozmiar || 10) * (b.skala_czcionki ?? 1), fontFamily: b.czcionka ?? undefined, lineHeight: b.interlinia ? `${b.interlinia}px` : 1.15,
              fontWeight: b.pogrubiony ? 700 : 400, fontStyle: b.kursywa ? 'italic' : undefined, textDecoration: b.podkreslony ? 'underline' : undefined,
            }
            if (b.typ === 'obraz') {
              return (
                <div key={i} style={{
                  ...styl, height: r.h * H,
                  ...(tlo ? { backgroundImage: `url(${tlo})`, backgroundSize: `${W}px ${H}px`, backgroundPosition: `${-r.x * W}px ${-r.y * H}px` } : {}),
                }} className={cn(!tlo && 'border border-dashed border-slate-300 text-[8px] text-slate-400')}>{!tlo && t('[obraz]')}</div>
              )
            }
            if (b.typ === 'tabela') {
              const kolumn = Math.max(1, ...b.wiersze.map((w) => w.length))
              return (
                <table key={i} style={{ ...styl, tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                  <colgroup>{Array.from({ length: kolumn }, (_, k) => <col key={k} style={{ width: `${(b.kolumny?.[k] ?? 1 / kolumn) * 100}%` }} />)}</colgroup>
                  <tbody>
                    {b.wiersze.map((w, r2) => (
                      <tr key={r2} style={{ fontWeight: !b.style_komorek && b.naglowek_tabeli && r2 === 0 ? 700 : undefined }}>
                        {Array.from({ length: kolumn }, (_, k) => (
                          <td key={k} style={{
                            fontWeight: b.style_komorek?.[r2]?.[k]?.includes('b') ? 700 : undefined, fontStyle: b.style_komorek?.[r2]?.[k]?.includes('i') ? 'italic' : undefined,
                            textAlign: b.style_komorek?.[r2]?.[k]?.includes('c') ? 'center' : b.style_komorek?.[r2]?.[k]?.includes('r') ? 'right' : undefined,
                            border: b.obramowanie ? '0.5px solid #000' : undefined, padding: '0 3px', verticalAlign: 'top', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                          }}>{w[k] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
            if (b.typ === 'lista') return <ul key={i} style={{ ...styl, paddingLeft: 14, listStyle: 'disc' }}>{b.elementy.map((e, j) => <li key={j} className="whitespace-pre-wrap">{e}</li>)}</ul>
            const fragmenty = b.fragmenty?.length && b.fragmenty.map((f) => f.tekst).join('') === b.tekst ? b.fragmenty : null
            return (
              <div key={i} style={styl} className={cn(WYR[b.wyrownanie], 'whitespace-pre-wrap')}>
                {fragmenty ? fragmenty.map((f, j) => <span key={j} style={{ fontWeight: f.b ? 700 : 400, fontStyle: f.i ? 'italic' : undefined }}>{f.tekst}</span>) : b.tekst}
              </div>
            )
          })}
        </div>
      </div>
      {bloki.length > zRamka.length && <div className="mt-2"><PodgladBlokow bloki={bloki.filter((b) => !b.ramka)} /></div>}
    </div>
  )
}
