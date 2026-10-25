import { useMemo, useState } from 'react'
import { dataPL, liczba } from '@/lib/format'
import type { WierszCeny } from '@/lib/bazaCen'
import type { Miara } from './Porownywarka'
import { t } from '@/i18n'

const SZER = 900
const WYS = 220
const M = { l: 56, p: 16, g: 12, d: 28 }

/** Ceny w czasie (punkty: oferty i zakupy) dla przefiltrowanych pozycji. Prosty SVG bez bibliotek. */
export function WykresCen({ wiersze, miara }: { wiersze: WierszCeny[]; miara: Miara }) {
  const [najechany, setNajechany] = useState<WierszCeny | null>(null)
  const punkty = useMemo(() => wiersze.filter((w) => w.data && w[miara] !== null), [wiersze, miara])
  if (punkty.length < 2) return null

  const czasy = punkty.map((p) => new Date(p.data!).getTime())
  const ceny = punkty.map((p) => p[miara] as number)
  const [t0, t1] = [Math.min(...czasy), Math.max(...czasy)]
  const [c0, c1] = [0, Math.max(...ceny) * 1.1]
  const x = (t: number) => M.l + ((t - t0) / Math.max(1, t1 - t0)) * (SZER - M.l - M.p)
  const y = (c: number) => WYS - M.d - ((c - c0) / Math.max(1e-9, c1 - c0)) * (WYS - M.g - M.d)
  const podzialki = [0, 0.25, 0.5, 0.75, 1].map((f) => c0 + f * (c1 - c0))

  return (
    <figure className="sekcja">
      <figcaption className="mb-1 flex justify-between text-xs text-slate-500">
        <span>{t('Cena w czasie (')}{punkty.length} {t('pkt).')}{' '}<span className="text-blekit-ciemny">●</span> oferty <span className="ml-2 text-slate-500">◆</span> zakupy</span>
        {najechany && <span className="font-medium text-slate-700">{dataPL(najechany.data)} · {najechany.dostawca} · {liczba(najechany[miara] as number, 2)} {t('PLN ·')}{' '}{najechany.opis.slice(0, 60)}</span>}
      </figcaption>
      <svg viewBox={`0 0 ${SZER} ${WYS}`} className="h-56 w-full" role="img" aria-label={t('Wykres cen w czasie')}>
        {podzialki.map((c) => (
          <g key={c}>
            <line x1={M.l} x2={SZER - M.p} y1={y(c)} y2={y(c)} stroke="#e2e8f0" />
            <text x={M.l - 6} y={y(c) + 4} textAnchor="end" fontSize="10" fill="#64748b">{liczba(c, c1 > 100 ? 0 : 2)}</text>
          </g>
        ))}
        <text x={M.l} y={WYS - 8} fontSize="10" fill="#64748b">{dataPL(new Date(t0).toISOString())}</text>
        <text x={SZER - M.p} y={WYS - 8} fontSize="10" fill="#64748b" textAnchor="end">{dataPL(new Date(t1).toISOString())}</text>
        {punkty.map((p, i) => {
          const px = x(czasy[i]); const py = y(ceny[i])
          return p.zrodlo === 'oferta' ? (
            <circle key={p.klucz} cx={px} cy={py} r={najechany === p ? 6 : 4} fill="#1B86B4" fillOpacity={0.75}
              onMouseEnter={() => setNajechany(p)} onMouseLeave={() => setNajechany(null)} />
          ) : (
            <rect key={p.klucz} x={px - 4} y={py - 4} width={8} height={8} transform={`rotate(45 ${px} ${py})`} fill="#64748b" fillOpacity={0.7}
              onMouseEnter={() => setNajechany(p)} onMouseLeave={() => setNajechany(null)} />
          )
        })}
      </svg>
    </figure>
  )
}
