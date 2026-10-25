import { useState } from 'react'
import { useSlowniki } from '@/lib/slowniki'
import { liczba } from '@/lib/format'
import { wierszeZPliku } from '@/lib/arkuszLeniwie'
import { pozycjeZListy, rozpoznajListe, type WierszListy } from '@/lib/importListy'
import type { PozycjaWyceny } from '@/lib/wyceny'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'
import { t } from '@/i18n'

/** Import listy materiałowej z Excela: podgląd z klasyfikacją, niepewne wiersze wyróżnione. */
export function ImportListy({ otwarty, zamknij, dodaj }: { otwarty: boolean; zamknij: () => void; dodaj: (p: PozycjaWyceny[]) => void }) {
  const s = useSlowniki()
  const [wiersze, setWiersze] = useState<WierszListy[]>([])
  const [blad, setBlad] = useState<string | null>(null)

  async function wczytaj(pliki: FileList | null) {
    const p = pliki?.[0]
    if (!p) return
    setBlad(null)
    try {
      const { pozycje, blad: b } = rozpoznajListe(await wierszeZPliku(new Uint8Array(await p.arrayBuffer())))
      setWiersze(pozycje); setBlad(b)
    } catch (e) { setBlad(String(e)) }
  }

  function zatwierdz() {
    dodaj(pozycjeZListy(wiersze))
    setWiersze([]); zamknij()
  }

  type W = (typeof wiersze)[number]
  const kolumny: KolumnaTabeli<W>[] = [
    { id: 'lp', naglowek: t('Lp'), typ: 'liczba', wartosc: (w) => w.lp, className: 'text-xs' },
    { id: 'nazwa', naglowek: t('Nazwa'), typ: 'tekst', wartosc: (w) => w.nazwa, className: 'text-sm' },
    {
      id: 'kategoria', naglowek: t('Kategoria'), typ: 'lista', wartosc: (w) => s.kategorieMaterialow.find((k) => k.kod === w.sekcja)?.nazwa ?? w.sekcja,
      komorka: (w) => (
        <select className="pole-komorki text-sm" value={w.sekcja} onChange={(e) => setWiersze(wiersze.map((x) => (x === w ? { ...x, sekcja: e.target.value, pewnosc: 1 } : x)))}>
          {s.kategorieMaterialow.map((k) => <option key={k.kod} value={k.kod}>{k.nazwa}</option>)}
        </select>
      ),
    },
    { id: 'gatunek', naglowek: t('Gatunek'), typ: 'lista', wartosc: (w) => w.gatunek, className: 'text-xs' },
    { id: 'wymiary', naglowek: t('Wymiary'), typ: 'tekst', wartosc: (w) => [w.d_zew && `Ø${w.d_zew}`, w.d_wew && `/${w.d_wew}`, w.grubosc && `g${w.grubosc}`, w.szerokosc, w.dlugosc && `L${w.dlugosc}`, w.dn && `DN${w.dn}`].filter(Boolean).join(' ') || null, className: 'text-xs' },
    { id: 'ilosc', naglowek: t('Ilość'), typ: 'liczba', wartosc: (w) => w.ilosc, komorka: (w) => `${liczba(w.ilosc)} ${w.jm}`, className: 'text-sm' },
    { id: 'masa', naglowek: t('Masa jedn.'), typ: 'liczba', wartosc: (w) => w.masa_jedn, komorka: (w) => (w.masa_jedn !== null ? liczba(w.masa_jedn, 2) : ''), className: 'text-sm' },
  ]

  return (
    <Dialog open={otwarty} onOpenChange={(o) => !o && zamknij()}>
      <DialogContent className="max-w-5xl">
        <DialogTitle>{t('Import listy materiałowej')}</DialogTitle>
        <DialogDescription>
          {t('Arkusz z kolumnami nazwa / opis, ilość, j.m., materiał, wymiary, masa. Wiersze trafią do sekcji wg kategorii -')}
          <span className="ml-1 rounded bg-amber-100 px-1">{t('żółte')}</span> {t('mają niepewną klasyfikację, sprawdź je. Listę z rysunku PDF odczyta AI (etap 4).')}
        </DialogDescription>
        <input type="file" accept=".xlsx,.xls,.csv" className="mt-3 text-sm" onChange={(e) => void wczytaj(e.target.files)} />
        {blad && <Komunikat rodzaj="blad" className="mt-2">{blad}</Komunikat>}
        {wiersze.length > 0 && (
          <>
            <div className="mt-3 max-h-[55vh] overflow-auto rounded border border-slate-200">
              <Tabela id="import-listy" kolumny={kolumny} wiersze={wiersze} klucz={(_w, i) => i} klasaWiersza={(w) => (w.pewnosc < 0.8 ? 'bg-amber-50' : undefined)} />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button onClick={zamknij}>{t('Anuluj')}</Button>
              <Button wariant="glowny" onClick={zatwierdz}>{t('Dodaj')}{' '}{wiersze.length} {t('pozycji do aparatu')}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
