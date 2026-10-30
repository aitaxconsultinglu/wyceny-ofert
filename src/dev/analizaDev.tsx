// Podgląd deweloperski karty analizy (tylko npm run dev, analiza-dev.html). Dane FIKCYJNE, bez bazy:
// przycisk "Wypełnij jak AI" symuluje odpowiedź modelu, żeby sprawdzić łączenie z ręcznymi wpisami.
import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import '../index.css'
import { DostawcaSlownikow } from '@/lib/slowniki'
import { postepKarty, pustaKarta, zWynikuAnalizyAi, type AnalizaAi } from '@/lib/analiza'
import { KartaAnalizyWidok, type DokumentKarty } from '@/components/zapytania/KartaAnalizyWidok'
import { Button } from '@/components/ui/button'

const AI: AnalizaAi = {
  podsumowanie: {
    przedmiot: 'Zbiornik buforowy V-1 (przykład)', klient: 'Zakłady Przykładowe S.A.', nr_zapytania_klienta: 'ZAP/1/2026', ilosc_szt: 1, masa_kg: 4500, wymiary: 'Ø2000 x 4000 mm',
    miejsce_dostawy: 'Zakład klienta', termin_oferty: '30.10.2026 godz. 12:00', termin_oferty_data: '2026-10-30', termin_realizacji: 'montaż w postoju',
    postoj: 'IV 2027', warunki_dostawy: 'DDP', waznosc_oferty: '90 dni', gwarancja: '36 miesięcy', platnosc: '60 dni', dokumenty_oferty: 'formularz cenowy, harmonogram',
  },
  aparaty: [{ nazwa: 'Zbiornik V-1', typ: 'zbiornik pionowy', ilosc: 1, masa_kg: 4500, srednica_mm: 2000, dlugosc_mm: null, wysokosc_mm: 4000, material: 'P265GH' }],
  wymagania: [
    { kod: 'wizja', nazwa: 'Wizja lokalna', stan: 'wymagane', wplyw: 'sredni', opis: 'obowiązkowa przed złożeniem oferty', cytat: 'Wizja lokalna jest obowiązkowa.', dokument: 'Specyfikacja.docx', strona: 2 },
    { kod: 'antykorozja', nazwa: 'Antykorozja', stan: 'wymagane', wplyw: 'wysoki', opis: 'dwa systemy malarskie: zewnątrz 240 µm, wewnątrz 300 µm', cytat: '', dokument: 'Antykorozja.pdf', strona: 1 },
    { kod: 'udt', nazwa: 'UDT', stan: 'do_wyjasnienia', wplyw: 'wysoki', opis: '„nie podlega UDT”, a wymagana JN i CE', cytat: 'Zbiornik nie podlega UDT', dokument: 'Specyfikacja.docx', strona: 5 },
  ],
  uslugi: [{ kategoria: null, opis: 'Śrutowanie i malowanie - dwa systemy', ilosc: 1, jm: 'kpl', uwagi: null }, { kategoria: null, opis: 'Izolacja zbiornika', ilosc: null, jm: null, uwagi: 'wełna 100 mm' }],
  pytania: [{ tresc: 'Czy zbiornik podlega UDT?', dokument: 'Specyfikacja.docx', strona: 5 }],
  niespojnosci: [{ opis: '„Nie podlega UDT”, a jednocześnie dokumentacja zatwierdzona przez Jednostkę Notyfikowaną i znak CE', dokumenty: 'Specyfikacja.docx str. 5 / 7' }],
  dokumenty: [{ nazwa: 'Standard.pdf', istotny: false, uzasadnienie: 'ogólny standard bez wymagań dla tego aparatu' }],
  uwagi_analizy: 'Ryzyko terminu: montaż tylko w postoju IV 2027.',
}

function Podglad() {
  const [karta, setKarta] = useState(pustaKarta())
  const [dokumenty, setDokumenty] = useState<DokumentKarty[]>([
    { id: '1', nazwa: 'Specyfikacja.docx', typ: 'wymagania', istotny: true },
    { id: '2', nazwa: 'Standard.pdf', typ: 'wymagania', istotny: true },
  ])
  const p = postepKarty(karta)
  return (
    <div className="mx-auto max-w-7xl space-y-3 p-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Karta analizy - podgląd (dane fikcyjne)</h2>
        <span id="postep" className="text-xs text-slate-500">checklista {p.sprawdzone}/{p.razem} · wymagane {p.wymagane} · do wyjaśnienia {p.doWyjasnienia} · niespójności {p.niespojnosci}</span>
        <Button className="ml-auto" wariant="akcent" onClick={() => setKarta((k) => zWynikuAnalizyAi(AI, k))}>Wypełnij jak AI</Button>
      </div>
      <KartaAnalizyWidok karta={karta} zmien={setKarta} dokumenty={dokumenty} liczbaOdczytow={0}
        ustawIstotny={(z) => setDokumenty((l) => l.map((d) => ({ ...d, istotny: z.find((x) => x.id === d.id)?.istotny ?? d.istotny })))} />
    </div>
  )
}

if (import.meta.env.DEV) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode><DostawcaSlownikow><Podglad /></DostawcaSlownikow></React.StrictMode>,
  )
}
