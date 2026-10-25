import { ETYKIETY_OBSZARU, KOLORY_OBSZARU, type Obszar, type Prostokat, type RodzajObszaru } from '@/lib/rysunki'
import { ZaznaczanieObszarow } from '../ui/ZaznaczanieObszarow'

interface Props {
  dataUrl: string
  obszary: Obszar[]
  rodzajNowego: RodzajObszaru
  zoom: number
  wybrany: string | null
  podswietlony: Prostokat | null
  tylkoOdczyt: boolean
  wybierz: (id: string | null) => void
  dodaj: (o: Obszar) => void
  usun: (id: string) => void
}

/**
 * Podgląd strony rysunku z zaznaczaniem obszarów: przeciągnij myszą, żeby zaznaczyć tabelę (przy krawędzi podgląd
 * sam się przewija). Współrzędne obszarów są względne (0..1), więc nie zależą od powiększenia ani rozdzielczości podglądu.
 */
export function PodgladRysunku({ dataUrl, obszary, rodzajNowego, zoom, wybrany, podswietlony, tylkoOdczyt, wybierz, dodaj, usun }: Props) {
  return (
    <ZaznaczanieObszarow
      dataUrl={dataUrl} alt="Strona rysunku" zoom={zoom} wybrany={wybrany} podswietlony={podswietlony} tylkoOdczyt={tylkoOdczyt}
      obszary={obszary.map((o) => ({ ...o, kolor: KOLORY_OBSZARU[o.rodzaj], etykieta: ETYKIETY_OBSZARU[o.rodzaj] }))}
      kolorNowego={KOLORY_OBSZARU[rodzajNowego]} wybierz={wybierz} usun={usun}
      dodaj={(p) => {
        const id = crypto.randomUUID()
        dodaj({ id, rodzaj: rodzajNowego, ...p })
        wybierz(id)
      }}
    />
  )
}
