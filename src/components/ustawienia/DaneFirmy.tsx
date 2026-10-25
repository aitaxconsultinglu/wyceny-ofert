import { useState } from 'react'
import { Save } from 'lucide-react'
import { useSlowniki } from '@/lib/slowniki'
import type { DaneFirmy } from '@/lib/types'
import { Button } from '../ui/button'
import { Komunikat } from '../ui/komunikat'
import { zapiszUstawienia } from './zapiszUstawienie'
import { t } from '@/i18n'

const POLA: { klucz: keyof DaneFirmy; etykieta: string; szer?: string }[] = [
  { klucz: 'nazwa', etykieta: t('Nazwa'), szer: 'w-72' },
  { klucz: 'adres', etykieta: t('Adres siedziby'), szer: 'w-80' },
  { klucz: 'krs', etykieta: t('KRS'), szer: 'w-36' },
  { klucz: 'nip', etykieta: t('NIP'), szer: 'w-36' },
  { klucz: 'regon', etykieta: t('REGON'), szer: 'w-36' },
  { klucz: 'email', etykieta: t('E-mail działu ofert'), szer: 'w-64' },
  { klucz: 'telefon', etykieta: t('Telefon'), szer: 'w-44' },
  { klucz: 'www', etykieta: t('WWW'), szer: 'w-56' },
]

/** Dane do nagłówka i stopki oferty. Skład zarządu - jedna osoba / funkcja w wierszu. */
export function DaneFirmyPanel() {
  const { ustawienia, odswiez } = useSlowniki()
  const [firma, setFirma] = useState<DaneFirmy>(ustawienia.firma)
  const [blad, setBlad] = useState<string | null>(null)
  const [komunikat, setKomunikat] = useState<string | null>(null)
  const [zajety, setZajety] = useState(false)

  // W trakcie pisania puste wiersze zostają (inaczej Enter nic by nie robił) - czyszczenie przy zapisie.
  const lista = (tekst: string) => tekst.split('\n')
  const czysta = (l: string[] | undefined) => (l ?? []).map((x) => x.trim()).filter(Boolean)

  async function wgrajLogo(plik: File | undefined) {
    if (!plik) return
    if (plik.type !== 'image/png') { setBlad(t('Logo musi być plikiem PNG.')); return }
    if (plik.size > 300_000) { setBlad(t('Logo do 300 kB (trafia do nagłówka aplikacji, ofert i kalkulacji).')); return }
    const url = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.readAsDataURL(plik) })
    setFirma({ ...firma, logo: url }); setKomunikat(null); setBlad(null)
  }

  async function zapisz() {
    setBlad(null); setZajety(true)
    const czyste = { ...firma, oddzialy: czysta(firma.oddzialy), zarzad: czysta(firma.zarzad), domeny: czysta(firma.domeny).map((d) => d.toLowerCase().replace(/^@/, '')) }
    setFirma(czyste)
    const b = await zapiszUstawienia({ firma: czyste })
    setZajety(false)
    if (b) { setBlad(b); return }
    setKomunikat(t('Zapisano dane firmy.'))
    await odswiez()
  }

  return (
    <div className="space-y-4">
      {blad && <Komunikat rodzaj="blad">{blad}</Komunikat>}
      {komunikat && <Komunikat rodzaj="sukces">{komunikat}</Komunikat>}
      <section className="sekcja">
        <div className="flex flex-wrap gap-4">
          {POLA.map((p) => (
            <label key={p.klucz}>
              <span className="etykieta">{p.etykieta}</span>
              <input className={`pole ${p.szer ?? ''}`} value={String(firma[p.klucz] ?? '')}
                onChange={(e) => { setFirma({ ...firma, [p.klucz]: e.target.value }); setKomunikat(null) }} />
            </label>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label>
            <span className="etykieta">{t('Domeny poczty firmy (jedna w wierszu, np. firma.pl) - przy imporcie maila przekazanego dalej klienta szukamy w cytowanej treści')}</span>
            <textarea className="pole h-16" value={(firma.domeny ?? []).join('\n')}
              onChange={(e) => setFirma({ ...firma, domeny: lista(e.target.value) })} />
          </label>
          <label>
            <span className="etykieta">{t('Czym zajmuje się firma (1-3 zdania, kontekst dla AI - bez nazw klientów)')}</span>
            <textarea className="pole h-16" value={firma.opis_dzialalnosci ?? ''}
              onChange={(e) => setFirma({ ...firma, opis_dzialalnosci: e.target.value })} />
          </label>
          <div>
            <span className="etykieta">{t('Logo (PNG, do 300 kB) - nagłówek aplikacji, oferty i kalkulacji')}</span>
            <div className="flex items-center gap-3">
              {firma.logo ? <img src={firma.logo} alt="" className="h-10 w-auto rounded border border-slate-200 bg-white p-1" /> : <span className="text-sm text-slate-500">brak</span>}
              <input type="file" accept="image/png" className="text-sm" onChange={(e) => void wgrajLogo(e.target.files?.[0])} />
              {firma.logo && <Button rozmiar="maly" wariant="cichy" onClick={() => setFirma({ ...firma, logo: '' })}>{t('Usuń')}</Button>}
            </div>
          </div>
          <label>
            <span className="etykieta">{t('Miejscowość w dacie oferty')}</span>
            <input className="pole w-56" value={firma.miejscowosc ?? ''} onChange={(e) => setFirma({ ...firma, miejscowosc: e.target.value })} />
          </label>
          <label>
            <span className="etykieta">{t('Oddziały (jeden w wierszu)')}</span>
            <textarea className="pole h-28" value={firma.oddzialy.join('\n')}
              onChange={(e) => setFirma({ ...firma, oddzialy: lista(e.target.value) })} />
          </label>
          <label>
            <span className="etykieta">{t('Skład zarządu do stopki oferty (jedna pozycja w wierszu, np. „Prezes Zarządu - …”)')}</span>
            <textarea className="pole h-28" value={firma.zarzad.join('\n')}
              onChange={(e) => setFirma({ ...firma, zarzad: lista(e.target.value) })} />
          </label>
        </div>
      </section>
      <Button wariant="glowny" disabled={zajety} onClick={() => void zapisz()}><Save className="h-4 w-4" /> {t('Zapisz dane firmy')}</Button>
    </div>
  )
}
