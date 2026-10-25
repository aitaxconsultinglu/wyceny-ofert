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

type Zakladka = 'porownywarka' | 'zapytanie' | 'lista' | 'dodaj' | 'wyslane' | 'dostawcy'

export function OfertyDostawcow({ profil }: { profil: Profil }) {
  const up = uprawnienia(profil)
  const [zakladka, setZakladka] = useState<Zakladka>('porownywarka')
  const [komunikat, setKomunikat] = useState<string | null>(null)
  const zakladki: { id: Zakladka; etykieta: string }[] = [
    { id: 'porownywarka', etykieta: 'Porównywarka cen' },
    { id: 'zapytanie', etykieta: 'Oferty do zapytania ZO' },
    { id: 'lista', etykieta: 'Lista ofert' },
    ...(up.bazaOfert ? [{ id: 'dodaj' as Zakladka, etykieta: '+ Dodaj ofertę' }] : []),
    { id: 'wyslane', etykieta: 'Wysłane zapytania' },
    { id: 'dostawcy', etykieta: 'Dostawcy i kooperanci' },
  ]
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Oferty dostawców i kooperantów</h2>
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {zakladki.map((z) => (
          <button key={z.id} onClick={() => { setZakladka(z.id); setKomunikat(null) }}
            className={cn('-mb-px rounded-t-md border px-3 py-1.5 text-sm',
              zakladka === z.id ? 'border-slate-200 border-b-white bg-white font-medium' : 'border-transparent text-slate-600 hover:bg-slate-100')}>
            {z.etykieta}
          </button>
        ))}
      </div>
      {komunikat && <Komunikat rodzaj="sukces">{komunikat}</Komunikat>}
      {zakladka === 'porownywarka' && <Porownywarka />}
      {zakladka === 'zapytanie' && <OfertyDoZapytania />}
      {zakladka === 'lista' && <ListaOfert mozeEdytowac={up.bazaOfert} />}
      {zakladka === 'dodaj' && <DodajOferte gotowe={() => { setZakladka('lista'); setKomunikat('Oferta zapisana w bazie.') }} />}
      {zakladka === 'wyslane' && <ListaZapytanDostawcow zapytanieId={null} mozeEdytowac={up.bazaOfert} />}
      {zakladka === 'dostawcy' && <Dostawcy mozeEdytowac={up.bazaOfert} />}
    </div>
  )
}
