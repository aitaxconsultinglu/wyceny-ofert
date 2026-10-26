import type { ReactNode } from 'react'
import { jezyk, t } from '@/i18n'
import { ETYKIETY_ROLI, uprawnienia, type Profil } from '@/lib/types'
import { TRESC_INSTRUKCJI, wstepInstrukcji, type Pozycja, type Warunek } from './instrukcjaTresc'

/** Tekst ze znacznikami **pogrubienie** i *kursywa*. */
function Tekst({ s }: { s: string }) {
  return (
    <>
      {s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).map((c, i) =>
        c.startsWith('**') ? <strong key={i}>{c.slice(2, -2)}</strong>
          : c.startsWith('*') && c.length > 2 ? <em key={i}>{c.slice(1, -1)}</em>
            : c)}
    </>
  )
}

function Rozdzial({ tytul, children }: { tytul: string; children: ReactNode }) {
  return (
    <section className="sekcja space-y-2 text-sm leading-relaxed text-slate-700">
      <h3 className="text-base font-semibold text-slate-900">{tytul}</h3>
      {children}
    </section>
  )
}

/** Instrukcja dla użytkowników w języku interfejsu (treść: `instrukcjaTresc.ts`). */
export function Instrukcja({ profil }: { profil: Profil }) {
  const up = uprawnienia(profil)
  const spelnia = (w?: Warunek) => !w || (w.startsWith('!') ? !up[w.slice(1) as keyof typeof up] : up[w as keyof typeof up])
  const widoczne = (p: Pozycja[] = []) => p.filter((x) => typeof x === 'string' || spelnia(x.gdy)).map((x) => (typeof x === 'string' ? x : x.t))
  const j = jezyk()
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h2 className="text-lg font-semibold">{t('Instrukcja')}</h2>
      <p className="text-sm text-slate-600"><Tekst s={wstepInstrukcji(j, ETYKIETY_ROLI[profil.rola], up.widziMarze)} /></p>
      {TRESC_INSTRUKCJI[j].filter((r) => spelnia(r.gdy)).map((r) => (
        <Rozdzial key={r.tytul} tytul={r.tytul}>
          {widoczne(r.tekst).map((s, i) => <p key={i}><Tekst s={s} /></p>)}
          {r.lista && <ul className="list-disc space-y-1 pl-5">{widoczne(r.lista).map((s, i) => <li key={i}><Tekst s={s} /></li>)}</ul>}
          {r.kroki && <ol className="list-decimal space-y-1 pl-5">{widoczne(r.kroki).map((s, i) => <li key={i}><Tekst s={s} /></li>)}</ol>}
          {widoczne(r.po).map((s, i) => <p key={i}><Tekst s={s} /></p>)}
        </Rozdzial>
      ))}
    </div>
  )
}
