import { useState } from 'react'
import { ListPlus, Plus, Trash2 } from 'lucide-react'
import { useSlowniki } from '@/lib/slowniki'
import { zl } from '@/lib/format'
import { cn } from '@/lib/utils'
import { policzAparat, policzPozycje, type ParametryKalk, type Zakladka } from '@/lib/kalkulacja'
import { klucz, type Aparat, type PozycjaWyceny } from '@/lib/wyceny'
import { PoleLiczby } from '../PoleLiczby'
import { Button } from '../ui/button'
import { ZrodloCeny } from './ZrodloCeny'
import { wymaganePozycje, type ProsbaOOferte } from '@/lib/prosby'
import { DialogiOfert, KomorkaOferty, useOfertyUslug, type KontekstUslug } from './OfertyUslug'
import { t } from '@/i18n'

interface Props {
  aparat: Aparat
  par: ParametryKalk
  tylkoOdczyt: boolean
  zmien: (f: (a: Aparat) => Aparat) => void
  znajdz: (p: PozycjaWyceny) => void
  /** Zapytanie i wycena - prośby o oferty i oferty z maila (bez kontekstu kolumna Oferta jest ukryta). */
  kontekst?: KontekstUslug
}

type StanOfert = ReturnType<typeof useOfertyUslug>
interface Okna { prosba: (p: PozycjaWyceny) => void; mail: (p: PozycjaWyceny, pr: ProsbaOOferte | null) => void }

const SEKCJE_BADAN: { zakladka: Zakladka; tytul: string; podpowiedz: string; domyslne: string[] }[] = [
  { zakladka: 'projekt', tytul: t('Projekt'), podpowiedz: t('projekt, technologia, uzgodnienie i sprawdzenie dokumentacji, dokumentacja powykonawcza'), domyslne: ['Projekt', 'Technologia', 'Uzgodnienie i sprawdzenie dokumentacji', 'Dokumentacja powykonawcza'] },
  { zakladka: 'badania', tytul: t('Badania i odbiory'), podpowiedz: t('RT [mb], PT, UT, NFT, próba ciśnieniowa, odbiory UDT/JN, dokumentacja KJ'), domyslne: ['RT', 'PT', 'UT', 'Próba ciśnieniowa', 'Odbiory UDT / JN', 'Dokumentacja KJ'] },
  { zakladka: 'transport', tytul: t('Transport i sprzęt ciężki'), podpowiedz: t('trasa, km, liczba kursów, stawka zł/km, ponadgabaryt'), domyslne: ['Dostawa do klienta'] },
  { zakladka: 'inne', tytul: t('Inne'), podpowiedz: t('pakowanie/skrzynia, zaślepki do prób, części zapasowe, próbki, montaż'), domyslne: ['Pakowanie / skrzynia'] },
]

function nowa(zakladka: Zakladka, nazwa = '', sekcja: string | null = null): PozycjaWyceny {
  return { klucz: klucz(), lp: 0, zakladka, sekcja, nazwa, ilosc: 1, jm: zakladka === 'transport' ? 'kurs' : 'kpl', cena_jedn: 0, jednostka_ceny: 'jm', zrodlo_ceny: 'recznie', dodatkowe: {} }
}

function Tabela({ aparat, par, tylkoOdczyt, zmien, znajdz, zakladka, kooperacja, oferty, okna }: Props & { zakladka: Zakladka; kooperacja?: boolean; oferty?: StanOfert; okna?: Okna }) {
  const s = useSlowniki()
  const wiersze = aparat.pozycje.filter((p) => p.zakladka === zakladka)
  const ustPoz = (kl: string, zm: Partial<PozycjaWyceny>) => zmien((a) => ({ ...a, pozycje: a.pozycje.map((p) => (p.klucz === kl ? { ...p, ...zm } : p)) }))
  const transport = zakladka === 'transport'
  const kategorie = s.kategorieUslug.filter((k) => (kooperacja ? k.zakladka === 'kooperacja' : true))
  const kolumny = [
    t('Lp'), ...(kooperacja ? [t('Kategoria usługi')] : []), transport ? t('Trasa') : kooperacja ? t('Nazwa elementu, robót') : t('Nazwa'),
    ...(kooperacja ? [t('śr. 1'), t('śr. 2'), t('grubość'), t('wys.')] : []), ...(transport ? ['km', t('Kursów'), 'zł/km', t('Ponadgab.')] : [t('Ilość'), t('J.m.'), t('Cena jedn.')]),
    t('Wartość PLN'), t('Źródło ceny'), ...(oferty ? [t('Oferta')] : []), t('Opcj.'), t('Uwagi'), '',
  ]
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] border-collapse">
        <thead><tr>{kolumny.map((n) => <th key={n} className="komorka-naglowek whitespace-nowrap">{n}</th>)}</tr></thead>
        <tbody>
          {wiersze.map((p, i) => {
            const w = policzPozycje(p, par)
            return (
              <tr key={p.klucz} className={cn(p.opcjonalna && 'text-slate-500')}>
                <td className="komorka w-8 text-center text-xs">{i + 1}</td>
                {kooperacja && (
                  <td className="komorka w-48">
                    <select className="pole-komorki text-sm" disabled={tylkoOdczyt} value={p.sekcja ?? ''} onChange={(e) => ustPoz(p.klucz, { sekcja: e.target.value || null })}>
                      <option value="">-</option>{kategorie.map((k) => <option key={k.kod} value={k.kod}>{k.nazwa}</option>)}
                    </select>
                  </td>
                )}
                <td className="komorka min-w-[14rem]"><input className="pole-komorki" disabled={tylkoOdczyt} value={p.nazwa} onChange={(e) => ustPoz(p.klucz, { nazwa: e.target.value })} /></td>
                {kooperacja && (['d_zew', 'd_wew', 'grubosc', 'dlugosc'] as const).map((pole) => (
                  <td key={pole} className="komorka w-16"><PoleLiczby wartosc={p[pole] ?? null} puste disabled={tylkoOdczyt} zmien={(n) => ustPoz(p.klucz, { [pole]: n })} /></td>
                ))}
                {transport ? (
                  <>
                    <td className="komorka w-20"><PoleLiczby wartosc={Number(p.dodatkowe?.km ?? 0) || null} puste disabled={tylkoOdczyt} zmien={(n) => ustPoz(p.klucz, { dodatkowe: { ...p.dodatkowe, km: n } })} /></td>
                    <td className="komorka w-16"><PoleLiczby wartosc={p.ilosc} disabled={tylkoOdczyt} zmien={(n) => ustPoz(p.klucz, { ilosc: n ?? 0 })} /></td>
                    <td className="komorka w-20" title={t('Stawka zł/km (albo zł/kurs, gdy km puste)')}><PoleLiczby wartosc={p.cena_jedn} disabled={tylkoOdczyt} zmien={(n) => ustPoz(p.klucz, { cena_jedn: n ?? 0 })} /></td>
                    <td className="komorka w-16 text-center"><input type="checkbox" disabled={tylkoOdczyt} checked={!!p.dodatkowe?.ponadgabaryt} onChange={(e) => ustPoz(p.klucz, { dodatkowe: { ...p.dodatkowe, ponadgabaryt: e.target.checked } })} /></td>
                  </>
                ) : (
                  <>
                    <td className="komorka w-16"><PoleLiczby wartosc={p.ilosc} disabled={tylkoOdczyt} zmien={(n) => ustPoz(p.klucz, { ilosc: n ?? 0 })} /></td>
                    <td className="komorka w-16"><input className="pole-komorki" disabled={tylkoOdczyt} value={p.jm} onChange={(e) => ustPoz(p.klucz, { jm: e.target.value })} /></td>
                    <td className="komorka w-24"><PoleLiczby wartosc={p.cena_jedn} disabled={tylkoOdczyt} zmien={(n) => ustPoz(p.klucz, { cena_jedn: n ?? 0, zrodlo_ceny: 'recznie', zrodlo_data: null, zrodlo_waznosc_do: null, zrodlo_dostawca: null, zrodlo_opis: null, zrodlo_id: null })} /></td>
                  </>
                )}
                <td className={cn('komorka w-28', (p.wartosc_reczna === null || p.wartosc_reczna === undefined) && 'italic')}>
                  <PoleLiczby wartosc={p.wartosc_reczna ?? Math.round(w.koszt * 100) / 100} puste disabled={tylkoOdczyt} zmien={(n) => ustPoz(p.klucz, { wartosc_reczna: n })} />
                </td>
                <td className="komorka w-40"><ZrodloCeny p={p} wiekMies={s.ustawienia.wiek_ceny_ostrzezenie_mies} tylkoOdczyt={tylkoOdczyt} onZnajdz={() => znajdz(p)} /></td>
                {oferty && okna && (() => { const st = oferty.stan(p); return <td className="komorka w-44"><KomorkaOferty s={st} tylkoOdczyt={tylkoOdczyt} prosba={() => okna.prosba(p)} mail={() => okna.mail(p, st.prosba)} /></td> })()}
                <td className="komorka w-12 text-center"><input type="checkbox" title={t('Pozycja opcjonalna - wariant oferty bez niej')} disabled={tylkoOdczyt} checked={!!p.opcjonalna} onChange={(e) => ustPoz(p.klucz, { opcjonalna: e.target.checked, wariant: e.target.checked ? p.wariant ?? 'wariant' : null })} /></td>
                <td className="komorka min-w-[8rem]"><input className="pole-komorki" disabled={tylkoOdczyt} value={p.uwagi ?? ''} onChange={(e) => ustPoz(p.klucz, { uwagi: e.target.value || null })} /></td>
                <td className="komorka w-8 text-center">{!tylkoOdczyt && <button className="text-slate-400 hover:text-red-600" onClick={() => zmien((a) => ({ ...a, pozycje: a.pozycje.filter((x) => x.klucz !== p.klucz) }))}><Trash2 className="h-4 w-4" /></button>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!tylkoOdczyt && (
        <Button rozmiar="maly" wariant="cichy" className="mt-1" onClick={() => zmien((a) => ({ ...a, pozycje: [...a.pozycje, nowa(zakladka, '', transport ? 'transport' : null)] }))}>
          <Plus className="h-3 w-3" /> {t('wiersz')}
        </Button>
      )}
    </div>
  )
}

/** Okna prośby i maila z ofertą + przycisk pozycji wymaganych z karty analizy - wspólne dla Kooperacji i Badań. */
function useOknaOfert(props: Props) {
  const oferty = useOfertyUslug(props.kontekst)
  const [prosbaDla, setProsbaDla] = useState<PozycjaWyceny | null>(null)
  const [mailDla, setMailDla] = useState<{ p: PozycjaWyceny; prosba: ProsbaOOferte | null } | null>(null)
  const okna: Okna = { prosba: setProsbaDla, mail: (p, prosba) => setMailDla({ p, prosba }) }
  const dialogi = props.kontekst && (
    <DialogiOfert k={props.kontekst} prosbaDla={prosbaDla} mailDla={mailDla} zamknij={() => { setProsbaDla(null); setMailDla(null) }}
      poProsbie={(p, pr) => {
        // Pozycja pamięta prośbę (zapis z wyceną) - stan „prośba wysłana”, potem oferty do niej.
        props.zmien((a) => ({ ...a, pozycje: a.pozycje.map((x) => (x.klucz === p.klucz ? { ...x, dodatkowe: { ...x.dodatkowe, prosba_id: pr.id } } : x)) }))
        setProsbaDla(null); void oferty.odswiez()
      }}
      poOfercie={() => void oferty.odswiez()} />
  )
  return { oferty: props.kontekst ? oferty : undefined, okna, dialogi, karta: oferty.karta }
}

/** Pozycje wymagane z karty analizy (usługi i wymagania kosztotwórcze) dla zakładek tej grupy. */
function WymaganeZKarty({ props, karta, zakladki }: { props: Props; karta: ReturnType<typeof useOfertyUslug>['karta']; zakladki: Zakladka[] }) {
  const s = useSlowniki()
  const propozycje = wymaganePozycje(karta, props.aparat.pozycje, s.kategorieUslug).filter((x) => zakladki.includes(x.zakladka))
  if (props.tylkoOdczyt || !propozycje.length) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-blekit/40 bg-blekit-jasny/40 px-3 py-2 text-sm">
      <span>{t('Karta analizy wymaga: {0}.', propozycje.map((x) => x.nazwa).join('; '))}</span>
      <Button rozmiar="maly" onClick={() => props.zmien((a) => ({ ...a, pozycje: [...a.pozycje, ...propozycje.map((x) => ({ ...nowa(x.zakladka, x.nazwa, x.sekcja), ilosc: x.ilosc, jm: x.jm, uwagi: x.uwagi }))] }))}>
        <ListPlus className="h-3 w-3" /> {t('Dodaj wymagane pozycje ({0})', propozycje.length)}
      </Button>
    </div>
  )
}

export function Kooperacja(props: Props) {
  const k = policzAparat(props.aparat, props.par)
  const { oferty, okna, dialogi, karta } = useOknaOfert(props)
  return (
    <section className="sekcja space-y-2">
      {dialogi}
      <WymaganeZKarty props={props} karta={karta} zakladki={['kooperacja']} />
      <p className="text-xs text-slate-500">
        {t('Usługi kooperacyjne (zwijanie, obróbka, PWHT, malowanie, sekafenowanie, izolacja...). Ceny tylko z ofert kooperantów zebranych do tego zapytania - przycisk lupy; zapytania do kooperantów w karcie zapytania.')}
      </p>
      <Tabela {...props} zakladka="kooperacja" kooperacja oferty={oferty} okna={okna} />
      <div className="flex justify-end gap-6 text-sm">
        <span>{t('Suma:')}{' '}<strong>{zl(k.kooperacja.koszt)}</strong></span>
        <span>{t('Narzut na kooperację')}{' '}{props.par.narzut_kooperacja_proc}%: <strong>{zl(k.kooperacja.narzut)}</strong></span>
        <span>{t('Razem:')}{' '}<strong>{zl(k.kooperacja.razem)} PLN</strong></span>
      </div>
    </section>
  )
}

export function BadaniaOdbioryTransport(props: Props) {
  const k = policzAparat(props.aparat, props.par)
  const sumy: Record<string, number> = { projekt: k.badania.projekt, badania: k.badania.badania, transport: k.badania.transport, inne: k.badania.inne }
  const { oferty, okna, dialogi, karta } = useOknaOfert(props)
  return (
    <div className="space-y-4">
      {dialogi}
      <WymaganeZKarty props={props} karta={karta} zakladki={['projekt', 'badania', 'transport', 'inne']} />
      {SEKCJE_BADAN.map((sek) => (
        <section key={sek.zakladka} className="sekcja space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="text-sm font-semibold">{sek.tytul} <span className="font-normal text-slate-500">- {sek.podpowiedz}</span></h4>
            <span className="text-sm">{t('Razem:')}{' '}<strong>{zl(sumy[sek.zakladka])} PLN</strong></span>
          </div>
          <Tabela {...props} zakladka={sek.zakladka} oferty={oferty} okna={okna} />
          {!props.tylkoOdczyt && props.aparat.pozycje.every((p) => p.zakladka !== sek.zakladka) && (
            <Button rozmiar="maly" onClick={() => props.zmien((a) => ({ ...a, pozycje: [...a.pozycje, ...sek.domyslne.map((n) => nowa(sek.zakladka, n, sek.zakladka === 'transport' ? 'transport' : null))] }))}>
              {t('Wstaw typowe pozycje')}
            </Button>
          )}
        </section>
      ))}
      <p className="text-right text-sm">{t('Badania, odbiory, projekt, transport i inne razem:')}{' '}<strong>{zl(k.badania.razem)} PLN</strong> {t('(1 szt.)')}</p>
    </div>
  )
}
