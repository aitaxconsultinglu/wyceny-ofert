import { useEffect, useId, useState } from 'react'

/**
 * Pole tekstowe z listą podpowiedzi: można wybrać z listy albo wpisać dowolną wartość. Zatwierdzenie (wyjście z pola
 * albo Enter) wywołuje `zatwierdz` z wpisanym tekstem - wywołujący zapisuje nową wartość na liście na przyszłość.
 */
export function PoleZPodpowiedziami({ wartosc, podpowiedzi, zatwierdz, className, placeholder, disabled }: {
  wartosc: string
  podpowiedzi: string[]
  zatwierdz: (tekst: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
}) {
  const id = useId()
  const [tekst, setTekst] = useState(wartosc)
  useEffect(() => setTekst(wartosc), [wartosc])
  const gotowe = () => { if (tekst.trim() !== wartosc.trim()) zatwierdz(tekst.trim()) }
  return (
    <>
      <input className={className} list={id} value={tekst} placeholder={placeholder} disabled={disabled}
        onChange={(e) => setTekst(e.target.value)} onBlur={gotowe} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); gotowe() } }} />
      <datalist id={id}>{podpowiedzi.map((p) => <option key={p} value={p} />)}</datalist>
    </>
  )
}
