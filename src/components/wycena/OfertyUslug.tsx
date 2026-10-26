import { useCallback, useEffect, useState } from 'react'
import { Mail, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { uzupelnijKarte, type KartaAnalizy } from '@/lib/analiza'
import { ETYKIETY_STANU_OFERTY, prosbaPozycji, stanOfertyPozycji, type ProsbaOOferte, type StanOfertyPozycji } from '@/lib/prosby'
import type { PozycjaWyceny } from '@/lib/wyceny'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { ProsbaDialog, type NowaProsba } from '../prosby/ProsbaDialog'
import { DodajOferte } from '../oferty/DodajOferte'
import { t } from '@/i18n'

/** Kontekst zapytania i wyceny dla zakładek usług (prośby o oferty, oferty z maila). */
export interface KontekstUslug { zapytanieId: string; numer: string; wycenaId: string }

interface OfertaUslugi { id: string; prosba_id: string | null; kategorie: string[] }

/** Prośby i oferty usług zapytania + karta analizy (propozycje pozycji) - wczytywane raz na zakładkę. */
export function useOfertyUslug(k: KontekstUslug | undefined) {
  const [prosby, setProsby] = useState<ProsbaOOferte[]>([])
  const [oferty, setOferty] = useState<OfertaUslugi[]>([])
  const [karta, setKarta] = useState<KartaAnalizy | null>(null)
  const zapytanieId = k?.zapytanieId
  const odswiez = useCallback(async () => {
    if (!zapytanieId) return
    const [{ data: p }, { data: o }, { data: a }] = await Promise.all([
      supabase.from('prosby_o_oferte').select('*').eq('zapytanie_id', zapytanieId),
      supabase.from('oferty_dostawcow').select('id, prosba_id, pozycje_ofert(kategoria_uslugi)').eq('zapytanie_id', zapytanieId),
      supabase.from('analizy_zapytan').select('dane').eq('zapytanie_id', zapytanieId).maybeSingle(),
    ])
    setProsby((p ?? []) as ProsbaOOferte[])
    setOferty(((o ?? []) as { id: string; prosba_id: string | null; pozycje_ofert: { kategoria_uslugi: string | null }[] }[])
      .map((x) => ({ id: x.id, prosba_id: x.prosba_id, kategorie: x.pozycje_ofert.map((y) => y.kategoria_uslugi).filter((y): y is string => !!y) })))
    setKarta(a ? uzupelnijKarte(a.dane as Partial<KartaAnalizy>) : null)
  }, [zapytanieId])
  useEffect(() => { void odswiez() }, [odswiez])

  /** Stan pozycji: oferty do jej prośby, a bez prośby - oferty do zapytania w tej kategorii usługi. */
  const stan = (p: PozycjaWyceny): { stan: StanOfertyPozycji; prosba: ProsbaOOferte | null; ofert: number } => {
    const prosba = prosby.find((x) => x.id === prosbaPozycji(p)) ?? null
    const ids = oferty.filter((o) => (prosba ? o.prosba_id === prosba.id : !!p.sekcja && o.kategorie.includes(p.sekcja))).map((o) => o.id)
    return { stan: stanOfertyPozycji(p, prosba, ids), prosba, ofert: ids.length }
  }
  return { prosby, oferty, karta, odswiez, stan }
}

const KOLOR: Record<StanOfertyPozycji, string> = {
  brak_oferty: 'bg-slate-50 text-slate-600 ring-slate-200', prosba_wyslana: 'bg-amber-50 text-amber-800 ring-amber-300',
  oferta_otrzymana: 'bg-blekit-jasny text-blekit-ciemny ring-blekit', wybrana: 'bg-limonka-jasna text-slate-800 ring-limonka-ciemna',
}

/** Komórka „Oferta” pozycji usługi: stan, prośba do działu handlowego, mail z ofertą. */
export function KomorkaOferty({ s, tylkoOdczyt, prosba, mail }: {
  s: { stan: StanOfertyPozycji; ofert: number }; tylkoOdczyt: boolean; prosba: () => void; mail: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <span className={cn('znacznik whitespace-nowrap', KOLOR[s.stan])}>{ETYKIETY_STANU_OFERTY[s.stan]}{s.ofert > 0 && ` (${s.ofert})`}</span>
      {!tylkoOdczyt && s.stan === 'brak_oferty' && <button className="text-slate-400 hover:text-blekit-ciemny" title={t('Poproś dział handlowy o ofertę')} onClick={prosba}><Send className="h-3.5 w-3.5" /></button>}
      {!tylkoOdczyt && <button className="text-slate-400 hover:text-blekit-ciemny" title={t('Dodaj mail z ofertą')} onClick={mail}><Mail className="h-3.5 w-3.5" /></button>}
    </div>
  )
}

/** Okna: nowa prośba (z pozycji) i mail z ofertą (powiązany z prośbą pozycji, jeśli jest). */
export function DialogiOfert({ k, prosbaDla, mailDla, zamknij, poProsbie, poOfercie }: {
  k: KontekstUslug
  prosbaDla: PozycjaWyceny | null
  mailDla: { p: PozycjaWyceny; prosba: ProsbaOOferte | null } | null
  zamknij: () => void
  poProsbie: (p: PozycjaWyceny, prosba: ProsbaOOferte) => void
  poOfercie: () => void
}) {
  const nowa: NowaProsba | null = prosbaDla ? {
    zapytanie_id: k.zapytanieId, wycena_id: k.wycenaId, zakladka: prosbaDla.zakladka === 'kooperacja' || prosbaDla.zakladka === 'badania' || prosbaDla.zakladka === 'transport' || prosbaDla.zakladka === 'projekt' ? prosbaDla.zakladka : 'inne',
    kategoria_uslugi: prosbaDla.sekcja, opis: prosbaDla.nazwa, parametry: { ilosc: `${prosbaDla.ilosc} ${prosbaDla.jm}` },
  } : null
  return (
    <>
      <ProsbaDialog nowa={nowa} zamknij={zamknij} utworzona={(pr) => { if (prosbaDla) poProsbie(prosbaDla, pr) }} />
      <Dialog open={!!mailDla} onOpenChange={(o) => !o && zamknij()}>
        <DialogContent className="max-w-6xl">
          <DialogTitle>{t('Dodaj mail z ofertą')}: {mailDla?.p.nazwa}</DialogTitle>
          <DialogDescription>{t('Oferta zapisze się przy zapytaniu{0}. Cenę wybierzesz przyciskiem lupy przy pozycji (porównanie ofert).', mailDla?.prosba ? t(' i prośbie') : '')}</DialogDescription>
          {mailDla && (
            <div className="mt-3 max-h-[75vh] overflow-auto">
              <DodajOferte kontekst={{ zapytanie_id: k.zapytanieId, nr_zo: k.numer, prosba_id: mailDla.prosba?.id ?? null, kategoria_uslugi: mailDla.p.sekcja, opis: mailDla.p.nazwa }}
                gotowe={() => { zamknij(); poOfercie() }} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
