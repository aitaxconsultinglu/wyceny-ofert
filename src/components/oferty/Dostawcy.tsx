import { useCallback, useEffect, useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { komunikatPL } from '@/lib/config'
import { useSlowniki } from '@/lib/slowniki'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { Tabela, type KolumnaTabeli } from '../ui/Tabela'

interface Kontakt { osoba: string; email: string; telefon: string }
interface Dostawca {
  id?: string
  nazwa: string
  skrot: string | null
  nip: string | null
  kontakty: Kontakt[]
  kategorie: string[]
  aliasy: string[]
  uwagi: string | null
  aktywny: boolean
}

const PUSTY: Dostawca = { nazwa: '', skrot: null, nip: null, kontakty: [], kategorie: [], aliasy: [], uwagi: null, aktywny: true }

/** Dostawcy i kooperanci: kategorie (do generatora zapytań), aliasy (dopasowanie nazw z Optimy i maili). */
export function Dostawcy({ mozeEdytowac }: { mozeEdytowac: boolean }) {
  const s = useSlowniki()
  const [lista, setLista] = useState<Dostawca[]>([])
  const [edytowany, setEdytowany] = useState<Dostawca | null>(null)
  const [szukaj, setSzukaj] = useState('')
  const [blad, setBlad] = useState<string | null>(null)

  const wczytaj = useCallback(async () => {
    const { data, error } = await supabase.from('dostawcy').select('*').order('nazwa')
    if (error) setBlad(komunikatPL(error.message)); else setLista((data ?? []) as Dostawca[])
  }, [])
  useEffect(() => { void wczytaj() }, [wczytaj])

  const nazwaKategorii = (kod: string) => s.kategorieMaterialow.find((k) => k.kod === kod)?.nazwa ?? s.kategorieUslug.find((k) => k.kod === kod)?.nazwa ?? kod

  async function zapisz() {
    if (!edytowany?.nazwa.trim()) { setBlad('Podaj nazwę.'); return }
    const { id, ...dane } = edytowany
    const { error } = id
      ? await supabase.from('dostawcy').update(dane).eq('id', id)
      : await supabase.from('dostawcy').insert(dane)
    if (error) { setBlad(komunikatPL(error.message)); return }
    setEdytowany(null); setBlad(null); await wczytaj()
  }

  async function usun(d: Dostawca) {
    if (!window.confirm(`Usunąć dostawcę ${d.nazwa}? Nie da się, jeśli ma oferty w bazie.`)) return
    const { error } = await supabase.from('dostawcy').delete().eq('id', d.id!)
    if (error) setBlad(komunikatPL(error.message)); else await wczytaj()
  }

  const widoczni = lista.filter((d) => !szukaj || `${d.nazwa} ${d.aliasy.join(' ')} ${d.kategorie.map(nazwaKategorii).join(' ')}`.toLowerCase().includes(szukaj.toLowerCase()))

  const kolumny: KolumnaTabeli<Dostawca>[] = [
    { id: 'nazwa', naglowek: 'Nazwa', typ: 'tekst', wartosc: (d) => d.nazwa, className: 'font-medium', komorka: (d) => <>{d.nazwa}{d.skrot && <span className="ml-1 text-xs text-slate-500">({d.skrot})</span>}</> },
    { id: 'nip', naglowek: 'NIP', typ: 'tekst', wartosc: (d) => d.nip, className: 'text-sm' },
    { id: 'kategorie', naglowek: 'Kategorie', typ: 'tekst', wartosc: (d) => d.kategorie.map(nazwaKategorii).join(', ') || null, className: 'text-xs' },
    { id: 'kontakty', naglowek: 'Kontakty', typ: 'tekst', wartosc: (d) => d.kontakty.map((k) => [k.osoba, k.email].filter(Boolean).join(' ')).join('; ') || null, className: 'text-xs' },
    { id: 'aliasy', naglowek: 'Aliasy', typ: 'tekst', wartosc: (d) => d.aliasy.join('; ') || null, className: 'text-xs text-slate-500' },
    { id: 'aktywny', naglowek: 'Aktywny', typ: 'tak_nie', wartosc: (d) => d.aktywny },
    {
      id: 'akcje', naglowek: '', typ: 'tekst', wartosc: () => '', bezFiltra: true, bezSortu: true,
      komorka: (d) => mozeEdytowac && (
        <div className="flex justify-end gap-1">
          <Button rozmiar="maly" onClick={() => setEdytowany({ ...d })}>Edytuj</Button>
          <Button rozmiar="maly" wariant="ostrzezenie" onClick={() => void usun(d)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-3">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      <div className="flex items-end gap-2">
        <label><span className="etykieta">Szukaj</span><input className="pole w-64" value={szukaj} onChange={(e) => setSzukaj(e.target.value)} /></label>
        {mozeEdytowac && <Button wariant="glowny" onClick={() => setEdytowany({ ...PUSTY })}><Plus className="h-4 w-4" /> Dodaj dostawcę</Button>}
      </div>
      <Tabela id="dostawcy" kolumny={kolumny} wiersze={widoczni} klucz={(d) => d.id ?? d.nazwa} klasaWiersza={(d) => (d.aktywny ? undefined : 'text-slate-400')} pusto="Brak dostawców." />


      <Dialog open={!!edytowany} onOpenChange={(o) => !o && setEdytowany(null)}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>{edytowany?.id ? 'Dostawca' : 'Nowy dostawca'}</DialogTitle>
          {edytowany && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-3">
                <label className="flex-1"><span className="etykieta">Nazwa</span><input className="pole" value={edytowany.nazwa} onChange={(e) => setEdytowany({ ...edytowany, nazwa: e.target.value })} /></label>
                <label className="w-32"><span className="etykieta">Skrót</span><input className="pole" value={edytowany.skrot ?? ''} onChange={(e) => setEdytowany({ ...edytowany, skrot: e.target.value || null })} /></label>
                <label className="w-36"><span className="etykieta">NIP</span><input className="pole" value={edytowany.nip ?? ''} onChange={(e) => setEdytowany({ ...edytowany, nip: e.target.value || null })} /></label>
              </div>
              <div>
                <span className="etykieta">Kategorie, w których składa oferty</span>
                <div className="grid grid-cols-2 gap-1 text-sm md:grid-cols-3">
                  {[...s.kategorieMaterialow, ...s.kategorieUslug].map((k) => (
                    <label key={k.kod} className="flex items-center gap-1">
                      <input type="checkbox" checked={edytowany.kategorie.includes(k.kod)}
                        onChange={(e) => setEdytowany({ ...edytowany, kategorie: e.target.checked ? [...edytowany.kategorie, k.kod] : edytowany.kategorie.filter((x) => x !== k.kod) })} />
                      {k.nazwa}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <span className="etykieta">Kontakty (do zapytań ofertowych)</span>
                {edytowany.kontakty.map((k, i) => (
                  <div key={i} className="mb-1 flex gap-2">
                    {(['osoba', 'email', 'telefon'] as const).map((pole) => (
                      <input key={pole} className="pole" placeholder={pole} value={k[pole]}
                        onChange={(e) => setEdytowany({ ...edytowany, kontakty: edytowany.kontakty.map((x, j) => (j === i ? { ...x, [pole]: e.target.value } : x)) })} />
                    ))}
                    <button className="text-slate-400 hover:text-red-600" onClick={() => setEdytowany({ ...edytowany, kontakty: edytowany.kontakty.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <Button rozmiar="maly" wariant="cichy" onClick={() => setEdytowany({ ...edytowany, kontakty: [...edytowany.kontakty, { osoba: '', email: '', telefon: '' }] })}><Plus className="h-3 w-3" /> kontakt</Button>
              </div>
              <label className="block"><span className="etykieta">Aliasy nazwy (np. obcięta nazwa z Optimy) - jeden w wierszu</span>
                <textarea className="pole h-16" value={edytowany.aliasy.join('\n')} onChange={(e) => setEdytowany({ ...edytowany, aliasy: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} /></label>
              <label className="block"><span className="etykieta">Uwagi</span>
                <textarea className="pole h-14" value={edytowany.uwagi ?? ''} onChange={(e) => setEdytowany({ ...edytowany, uwagi: e.target.value || null })} /></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edytowany.aktywny} onChange={(e) => setEdytowany({ ...edytowany, aktywny: e.target.checked })} /> aktywny</label>
              <div className="flex justify-end gap-2">
                <Button onClick={() => setEdytowany(null)}>Anuluj</Button>
                <Button wariant="glowny" onClick={() => void zapisz()}><Save className="h-4 w-4" /> Zapisz</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
