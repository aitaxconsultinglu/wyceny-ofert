import { KOLORY_OBSZARU, etykietaObszaru, type Obszar, type Prostokat } from '@/lib/rysunki'
import { ZaznaczanieObszarow } from '../ui/ZaznaczanieObszarow'
import { t } from '@/i18n'

interface Props {
  dataUrl: string
  obszary: Obszar[]
  /** Szablon nowego obszaru (rodzaj tabeli, nazwa, element szablonu) - z paska nad podglądem. */
  nowy: Omit<Obszar, 'id' | 'x' | 'y' | 'w' | 'h'>
  zoom: number
  wybrany: string | null
  podswietlony: Prostokat | null
  tylkoOdczyt: boolean
  wybierz: (id: string | null) => void
  dodaj: (o: Obszar) => void
  usun: (id: string) => void
  zmien: (id: string, p: Prostokat) => void
}

/**
 * Podgląd strony rysunku z zaznaczaniem obszarów: przeciągnij myszą, żeby zaznaczyć tabelę (przy krawędzi podgląd
 * sam się przewija). Wybrany obszar można przesunąć (przeciągnij środek) i zmienić jego rozmiar (narożniki).
 * Współrzędne obszarów są względne (0..1), więc nie zależą od powiększenia ani rozdzielczości podglądu.
 */
export function PodgladRysunku({ dataUrl, obszary, nowy, zoom, wybrany, podswietlony, tylkoOdczyt, wybierz, dodaj, usun, zmien }: Props) {
  return (
    <ZaznaczanieObszarow
      dataUrl={dataUrl} alt={t('Strona rysunku')} zoom={zoom} wybrany={wybrany} podswietlony={podswietlony} tylkoOdczyt={tylkoOdczyt}
      obszary={obszary.map((o) => ({ ...o, kolor: KOLORY_OBSZARU[o.rodzaj], etykieta: etykietaObszaru(o) }))}
      kolorNowego={KOLORY_OBSZARU[nowy.rodzaj]} wybierz={wybierz} usun={usun} zmien={zmien}
      dodaj={(p) => {
        const id = crypto.randomUUID()
        dodaj({ id, ...nowy, kolumny: nowy.kolumny ? [...nowy.kolumny] : undefined, ...p })
        wybierz(id)
      }}
    />
  )
}
