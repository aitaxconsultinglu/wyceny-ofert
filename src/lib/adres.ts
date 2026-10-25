import { useCallback, useEffect, useState } from 'react'

// Zakładka w adresie: #/<widok>/<id>/<zakładka>. Zmiana zakładki dopisuje wpis w historii przeglądarki,
// więc przycisk Wstecz wraca do poprzedniej zakładki, a odświeżenie strony zostaje na tej samej.

const czesciAdresu = () => window.location.hash.replace(/^#\/?/, '').split('/')

/** Adres widoku z zakładką - do linków (ścieżka, powrót z wyceny do zapytania). */
export const adresWidoku = (widok: string, id?: string | null, zakladka?: string | null) =>
  `#/${[widok, id, id ? zakladka : null].filter(Boolean).join('/')}`

export function useZakladkaWAdresie<T extends string>(dozwolone: readonly T[], domyslna: T): [T, (z: T) => void] {
  const odczytaj = useCallback(() => {
    const z = czesciAdresu()[2] as T | undefined
    return z && dozwolone.includes(z) ? z : domyslna
  }, [dozwolone, domyslna])
  const [zakladka, setZakladka] = useState<T>(odczytaj)
  useEffect(() => {
    const przy = () => setZakladka(odczytaj())
    window.addEventListener('hashchange', przy)
    return () => window.removeEventListener('hashchange', przy)
  }, [odczytaj])
  const ustaw = useCallback((z: T) => {
    const [w, id] = czesciAdresu()
    setZakladka(z)
    if (w && id && czesciAdresu()[2] !== z) window.location.hash = `/${w}/${id}/${z}`
  }, [])
  return [zakladka, ustaw]
}
