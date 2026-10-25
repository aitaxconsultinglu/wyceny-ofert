import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { X } from 'lucide-react'
import type { Prostokat } from '@/lib/rysunki'

export interface ObszarNaPodgladzie extends Prostokat { id: string; kolor: string; etykieta: string }

interface Props {
  dataUrl: string
  obszary: ObszarNaPodgladzie[]
  kolorNowego: string
  zoom: number
  wybrany: string | null
  podswietlony: Prostokat | null
  tylkoOdczyt: boolean
  wybierz: (id: string | null) => void
  dodaj: (p: Prostokat) => void
  usun: (id: string) => void
  alt?: string
}

const proc = (v: number) => `${(v * 100).toFixed(3)}%`
/** Pas przy krawędzi (px), w którym przeciąganie przewija podgląd, i maksymalna prędkość (px na klatkę). */
const PAS_PRZEWIJANIA = 48
const MAKS_KROK = 28

/** Najbliższy przodek, który przewija się w pionie lub poziomie (kontener podglądu). */
function przewijanyPrzodek(el: HTMLElement | null): HTMLElement | null {
  for (let e = el?.parentElement ?? null; e; e = e.parentElement) {
    const s = getComputedStyle(e)
    if (/(auto|scroll)/.test(`${s.overflowY} ${s.overflowX}`) && (e.scrollHeight > e.clientHeight || e.scrollWidth > e.clientWidth)) return e
  }
  return null
}

/** Krok przewijania: im bliżej krawędzi (albo dalej za nią), tym szybciej; 0 poza pasem. */
export function krokPrzewijania(pozycja: number, poczatek: number, koniec: number, pas = PAS_PRZEWIJANIA, maks = MAKS_KROK): number {
  if (pozycja < poczatek + pas) return -Math.min(maks, Math.ceil(((poczatek + pas - pozycja) / pas) * maks / 2))
  if (pozycja > koniec - pas) return Math.min(maks, Math.ceil(((pozycja - (koniec - pas)) / pas) * maks / 2))
  return 0
}

/**
 * Podgląd strony z zaznaczaniem prostokątów myszą. Przy przeciąganiu do krawędzi kontenera (albo okna) podgląd sam się
 * przewija, więc da się zaznaczyć tabelę dłuższą niż ekran; kółko myszy też przewija w trakcie zaznaczania.
 * Współrzędne są względne (0..1), więc nie zależą od powiększenia ani rozdzielczości podglądu.
 */
export function ZaznaczanieObszarow({ dataUrl, obszary, kolorNowego, zoom, wybrany, podswietlony, tylkoOdczyt, wybierz, dodaj, usun, alt = 'Strona dokumentu' }: Props) {
  const warstwa = useRef<HTMLDivElement>(null)
  const swiatlo = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const ostatni = useRef<{ x: number; y: number } | null>(null)
  const klatka = useRef<number | null>(null)
  const [biezacy, setBiezacy] = useState<Prostokat | null>(null)

  useEffect(() => {
    if (podswietlony) swiatlo.current?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  }, [podswietlony])
  useEffect(() => () => { if (klatka.current !== null) window.clearInterval(klatka.current) }, [])

  function punkt(c: { x: number; y: number }) {
    const r = warstwa.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (c.x - r.left) / r.width)), y: Math.min(1, Math.max(0, (c.y - r.top) / r.height)) }
  }
  const prostokat = (a: { x: number; y: number }, b: { x: number; y: number }): Prostokat =>
    ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) })

  /** Krok przewijania w trakcie przeciągania (co ~16 ms) - działa także wtedy, gdy mysz stoi przy krawędzi. */
  function petla() {
    const c = ostatni.current
    if (!start.current || !c) return
    const kontener = przewijanyPrzodek(warstwa.current)
    if (kontener) {
      const r = kontener.getBoundingClientRect()
      kontener.scrollBy(krokPrzewijania(c.x, r.left, r.right), krokPrzewijania(c.y, r.top, r.bottom))
    }
    // Kontener przewinięty do końca (albo jest wyższy niż okno) - przewijamy stronę.
    window.scrollBy(0, krokPrzewijania(c.y, 0, window.innerHeight))
    setBiezacy(prostokat(start.current, punkt(c)))
  }
  const zatrzymaj = () => { if (klatka.current !== null) { window.clearInterval(klatka.current); klatka.current = null } }

  function wcisniety(e: PointerEvent<HTMLDivElement>) {
    if (tylkoOdczyt || e.button !== 0) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* pióro / zdarzenie syntetyczne - bez przechwycenia */ }
    const c = { x: e.clientX, y: e.clientY }
    const p = punkt(c)
    start.current = p
    ostatni.current = c
    setBiezacy({ ...p, w: 0, h: 0 })
    wybierz(null)
    zatrzymaj()
    klatka.current = window.setInterval(petla, 16)
  }
  function ruch(e: PointerEvent<HTMLDivElement>) {
    if (!start.current) return
    ostatni.current = { x: e.clientX, y: e.clientY }
    setBiezacy(prostokat(start.current, punkt(ostatni.current)))
  }
  function puszczony(e: PointerEvent<HTMLDivElement>) {
    if (!start.current) return
    const p = prostokat(start.current, punkt({ x: e.clientX, y: e.clientY }))
    start.current = null; ostatni.current = null; setBiezacy(null)
    zatrzymaj()
    if (p.w > 0.008 && p.h > 0.008) dodaj(p)
  }

  return (
    <div className="relative select-none" style={{ width: `${zoom * 100}%` }}>
      <img src={dataUrl} alt={alt} className="block w-full" draggable={false} />
      <div
        ref={warstwa}
        className={tylkoOdczyt ? 'absolute inset-0' : 'absolute inset-0 cursor-crosshair touch-none'}
        onPointerDown={wcisniety} onPointerMove={ruch} onPointerUp={puszczony} onPointerCancel={puszczony}
      >
        {obszary.map((o) => (
          <div
            key={o.id}
            className="absolute border-2"
            style={{ left: proc(o.x), top: proc(o.y), width: proc(o.w), height: proc(o.h), borderColor: o.kolor, background: o.id === wybrany ? `${o.kolor}22` : 'transparent' }}
            onPointerDown={(e) => { e.stopPropagation(); wybierz(o.id) }}
          >
            <span className="absolute -top-5 left-0 flex items-center gap-1 whitespace-nowrap rounded px-1 text-[11px] font-medium text-white" style={{ background: o.kolor }}>
              {o.etykieta}
              {!tylkoOdczyt && o.id === wybrany && (
                <button title="Usuń obszar" className="hover:text-red-200" onPointerDown={(e) => e.stopPropagation()} onClick={() => usun(o.id)}><X className="h-3 w-3" /></button>
              )}
            </span>
          </div>
        ))}
        {biezacy && (
          <div className="pointer-events-none absolute border-2 border-dashed" style={{ left: proc(biezacy.x), top: proc(biezacy.y), width: proc(biezacy.w), height: proc(biezacy.h), borderColor: kolorNowego }} />
        )}
        {podswietlony && (
          <div ref={swiatlo} className="pointer-events-none absolute animate-pulse border-2 border-red-500 bg-red-500/10"
            style={{ left: proc(podswietlony.x), top: proc(podswietlony.y), width: proc(podswietlony.w), height: proc(podswietlony.h) }} />
        )}
      </div>
    </div>
  )
}
