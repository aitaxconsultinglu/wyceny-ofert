import { useState } from 'react'
import type { Profil } from '@/lib/types'
import { uprawnienia } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Komunikat } from '../ui/komunikat'
import { Porownywarka } from './Porownywarka'
import { ListaOfert } from './ListaOfert'
import { DodajOferte } from './DodajOferte'
import { OfertyDoZapytania } from './OfertyDoZapytania'
import { Dostawcy } from './Dostawcy'
import { ListaZapytanDostawcow } from '../zapytaniaDostawcow/ListaZapytanDostawcow'
import { t } from '@/i18n'

type Zakladka = 'porownywarka' | 'zapytanie' | 'lista' | 'dodaj' | 'wyslane' | 'dostawcy'

export function OfertyDostawcow({ profil }: { profil: Profil }) {
  const up = uprawnienia(profil)
  const [zakladka, setZakladka] = useState<Zakladka>('porownywarka')
  const [komunikat, setKomunikat] = useState<string | null>(null)
  const zakladki: { id: Zakladka; etykieta: string }[] = [
    { id: 'porownywarka', etykieta: t('Porównywarka cen') },
    { id: 'zapytanie', etykieta: t('Oferty do zapytania ZO') },
    { id: 'lista', etykieta: t('Lista ofert') },
    ...(up.bazaOfert ? [{ id: 'dodaj' as Zakladka, etykieta: t('+ Dodaj ofertę') }] : []),
    { id: 'wyslane', etykieta: t('Wysłane zapytania') },
    { id: 'dostawcy', etykieta: t('Dostawcy i kooperanci') },
  ]
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t('Oferty dostawców i kooperantów')}</h2>
      <div className="pasek-zakladek">
        {zakladki.map((z) => (
          <button key={z.id} onClick={() => { setZakladka(z.id); setKomunikat(null) }}
            className={cn('zakladka', (zakladka === z.id) && 'zakladka-aktywna')}>
            {z.etykieta}
          </button>
        ))}
      </div>
      {komunikat && <Komunikat rodzaj="sukces">{komunikat}</Komunikat>}
      {zakladka === 'porownywarka' && <Porownywarka />}
      {zakladka === 'zapytanie' && <OfertyDoZapytania />}
      {zakladka === 'lista' && <ListaOfert mozeEdytowac={up.bazaOfert} />}
      {zakladka === 'dodaj' && <DodajOferte gotowe={() => { setZakladka('lista'); setKomunikat(t('Oferta zapisana w bazie.')) }} />}
      {zakladka === 'wyslane' && <ListaZapytanDostawcow zapytanieId={null} mozeEdytowac={up.bazaOfert} />}
      {zakladka === 'dostawcy' && <Dostawcy mozeEdytowac={up.bazaOfert} />}
    </div>
  )
}
