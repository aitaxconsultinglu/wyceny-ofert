// Treść oferty do odczytu AI (tryb wyciagnij_oferte): tekst maila / PDF i teksty załączników z warstwą tekstową,
// skany i zdjęcia jako obrazy stron. Wspólne dla okna „Dodaj ofertę” i katalogu ofert.
import { base64ZBajtow, przeskalujObraz, renderujStrone, type WczytanyPlik } from './dokumenty'

export const MAKS_STRON_SKANU = 4

/** Treść do AI: tekst maila / PDF i teksty załączników PDF z warstwą tekstową; skany jako obrazy. */
export async function przygotujTresc(plik: WczytanyPlik, wybrane: Set<string>) {
  const czesci: string[] = []
  const obrazy: { media_type: 'image/jpeg'; dane: string }[] = []
  const dodaj = async (p: WczytanyPlik, naglowek: string) => {
    if (p.rodzaj === 'pdf' && p.metadane.skan) {
      const stron = Math.min(Number(p.metadane.stron ?? 1), MAKS_STRON_SKANU)
      for (let i = 1; i <= stron; i++) {
        const r = await renderujStrone(p.dane, i, 150)
        const m = await przeskalujObraz(r.dataUrl, 1568)
        obrazy.push({ media_type: 'image/jpeg', dane: m.base64 })
      }
      czesci.push(`${naglowek}: skan (${stron} str.) - treść na obrazach.`)
    } else if (p.rodzaj === 'obraz') {
      const url = `data:${p.mime};base64,${base64ZBajtow(p.dane)}`
      const m = await przeskalujObraz(url, 1568)
      obrazy.push({ media_type: 'image/jpeg', dane: m.base64 })
    } else if (p.tekst) {
      czesci.push(`${naglowek}:\n${p.tekst}`)
    }
  }
  if (plik.rodzaj === 'mail') {
    const m = plik.metadane
    czesci.push(`MAIL - temat: ${m.temat}\nod: ${m.od} ${m.od_email ? `<${m.od_email}>` : ''}\ndata: ${m.data ?? ''}\n\n${plik.tekst}`)
    for (const z of plik.zalaczniki) if (wybrane.has(z.nazwa)) await dodaj(z, `ZAŁĄCZNIK ${z.nazwa}`)
  } else {
    await dodaj(plik, `PLIK ${plik.nazwa}`)
  }
  return { tekst: czesci.join('\n\n==========\n\n'), obrazy }
}
