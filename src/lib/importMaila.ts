// Nowe zapytanie z maila (.msg / .eml przeciągnięty z Outlooka): propozycja pól karty zapytania bez AI -
// temat, klient (po domenie nadawcy albo nazwie w treści), termin składania ofert, numer zapytania klienta.
// Dokładniej dane wyciąga analiza AI (karta analizy). Część czysta - testy na danych fikcyjnych.

/** Długie dokumenty (standardy, obliczenia) domyślnie nie idą do analizy AI (koszt, mało wymagań kosztotwórczych). */
export const STRON_DLUGI_DOKUMENT = 30
export function domyslnieIstotny(z: { typSugerowany: string; metadane?: Record<string, unknown> }) {
  if (z.typSugerowany === 'inne') return false
  return !(z.typSugerowany === 'wymagania' && Number(z.metadane?.stron ?? 0) > STRON_DLUGI_DOKUMENT)
}

export interface KlientImportu { id: string; nazwa: string; skrot: string | null; domeny: string[] }

export interface MailImportu { temat: string; od: string; od_email: string; data: string | null; tekst: string }

export interface PropozycjaZapytania {
  przedmiot: string
  klient_id: string | null
  /** Jak rozpoznano klienta - do pokazania przy polu. */
  klient_powod: string | null
  /** Domena zewnętrznego nadawcy - dopisywana do klienta po potwierdzeniu. */
  domena: string | null
  nr_zapytania_klienta: string
  termin_oferty: string | null
}

const PRZEDROSTKI = /^\s*(re|fw|fwd|pd|odp|wg|aw|tr|rv|vs)\s*(\[\d+\])?\s*:\s*/i

/** "RE: FW: PD: Zapytanie ofertowe - zbiornik V-1" -> "Zapytanie ofertowe - zbiornik V-1". */
export function oczyscTemat(temat: string): string {
  let t = (temat ?? '').trim()
  for (let i = 0; i < 10 && PRZEDROSTKI.test(t); i++) t = t.replace(PRZEDROSTKI, '')
  return t.replace(/\s+/g, ' ').trim()
}

/** Przedmiot zapytania z tematu: bez "Zapytanie ofertowe nr ...:" na początku, jeśli zostaje coś konkretnego. */
export function przedmiotZTematu(temat: string): string {
  const t = oczyscTemat(temat)
  const bez = t.replace(/^(zapytanie\s+ofertowe|zapytanie|rfq|request\s+for\s+quotation)\b[\s:\-–]*((nr|no\.?)\s*[\w/.-]+)?[\s:\-–]*/i, '').trim()
  return bez.length >= 4 ? bez : t
}

export const domenaAdresu = (email: string) => (/@([\w.-]+\.[a-z]{2,})\s*$/i.exec(email.trim())?.[1] ?? '').toLowerCase()

/** Adresy e-mail w treści (np. nagłówki "Od:" / "From:" cytowanego maila klienta). */
export function adresyWTresci(tekst: string): string[] {
  return [...new Set([...(tekst ?? '').matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].map((m) => m[0].toLowerCase()))]
}

/** Poczta publiczna - domena nie wskazuje firmy (nie zapamiętujemy jej jako domeny klienta). */
export const DOMENY_PUBLICZNE = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'wp.pl', 'o2.pl', 'onet.pl', 'onet.eu', 'interia.pl', 'interia.eu', 'op.pl', 'poczta.fm', 'tlen.pl', 'gazeta.pl', 'icloud.com']

const wDomenie = (domena: string, lista: string[]) => lista.some((d) => domena === d || domena.endsWith(`.${d}`))

/** Data "dd.mm.rrrr" (+ "godz. hh:mm") po słowach o terminie składania ofert -> ISO (czas lokalny). */
export function terminOfertZTresci(tekst: string): string | null {
  const t = (tekst ?? '').replace(/\s+/g, ' ')
  const m = /termin\w*\s+(?:składania|złożenia|przesłania|nadsyłania|na złożenie)\s+ofert\w*[^0-9]{0,60}?(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:[^0-9]{0,15}?(\d{1,2})[:.](\d{2}))?/i.exec(t)
    ?? /ofert\w*\s+(?:prosimy\s+)?(?:składać|złożyć|przesłać)\s+(?:do|w terminie do)\s+(?:dnia\s+)?(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:[^0-9]{0,15}?(\d{1,2})[:.](\d{2}))?/i.exec(t)
    // Po angielsku: "Deadline for submission of quotations: 05.11.2026 12:00", "offers due by 05/11/2026", "closing date".
    ?? /(?:deadline|due date|closing date|submission date|bid due)\b[^0-9]{0,60}?(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:[^0-9]{0,15}?(\d{1,2})[:.](\d{2}))?/i.exec(t)
    ?? /(?:offers?|quotations?|quotes?|bids?|tenders?)\s+(?:shall\s+|should\s+|must\s+)?(?:be\s+)?(?:submitted|sent|received|due)\s+(?:by|before|until|no later than)\s+(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:[^0-9]{0,15}?(\d{1,2})[:.](\d{2}))?/i.exec(t)
  if (!m) {
    // Data ISO po słowach o terminie: "termin składania ofert: 2026-11-05", "deadline: 2026-11-05 12:00".
    const iso = /(?:termin\w*\s+(?:składania|złożenia)\s+ofert\w*|deadline|due date|closing date)[^0-9]{0,40}?(\d{4})-(\d{2})-(\d{2})(?:[^0-9]{0,15}?(\d{1,2})[:.](\d{2}))?/i.exec(t)
    if (!iso) return null
    const [, r, mi, d, g, min] = iso
    const data = new Date(Number(r), Number(mi) - 1, Number(d), g ? Number(g) : 12, min ? Number(min) : 0)
    return Number.isNaN(data.getTime()) || data.getDate() !== Number(d) ? null : data.toISOString()
  }
  const [, d, mi, r, g, min] = m
  const data = new Date(Number(r), Number(mi) - 1, Number(d), g ? Number(g) : 12, min ? Number(min) : 0)
  return Number.isNaN(data.getTime()) || data.getDate() !== Number(d) ? null : data.toISOString()
}

/** "Zapytanie ofertowe nr ZO-123/2026", "numer postępowania: 4500123" -> numer klienta. */
export function nrZapytaniaZTresci(temat: string, tekst: string): string {
  for (const zrodlo of [temat, tekst]) {
    const m = /(?:zapytani\w*(?:\s+ofertow\w*)?|postępowani\w*|rfq|request for (?:quotation|proposal)|inquiry|enquiry|tender)\s*(?:nr|no\.?|numer|number)\.?\s*:?\s*([A-Z0-9][\w/.\-]{2,40})/i.exec(zrodlo ?? '')
      ?? /(?:nr|numer)\s+(?:zapytania|postępowania|zapotrzebowania)\s*:?\s*([A-Z0-9][\w/.\-]{2,40})/i.exec(zrodlo ?? '')
    if (m) return m[1].replace(/[.,;:]+$/, '')
  }
  return ''
}

/**
 * Klient: domena zewnętrznego nadawcy (albo adresów w cytowanej treści) w słowniku, potem nazwa / skrót w temacie i treści.
 * `domenyWlasne` - domeny poczty firmy z ustawień (mail przekazany dalej przez pracownika).
 */
export function rozpoznajKlienta(mail: MailImportu, klienci: KlientImportu[], domenyWlasne: string[] = []): { klient_id: string | null; powod: string | null; domena: string | null } {
  const domeny = [domenaAdresu(mail.od_email), ...adresyWTresci(mail.tekst).map(domenaAdresu)]
    .filter((d) => d && !wDomenie(d, domenyWlasne) && !wDomenie(d, DOMENY_PUBLICZNE))
  for (const d of domeny) {
    const k = klienci.find((x) => x.domeny.some((y) => d === y || d.endsWith(`.${y}`)))
    if (k) return { klient_id: k.id, powod: `domena ${d}`, domena: d }
  }
  const tresc = `${mail.temat}\n${mail.od}\n${mail.tekst}`.toLowerCase()
  const nazwy = klienci.flatMap((k) => [k.skrot, k.nazwa].filter((x): x is string => !!x && x.trim().length >= 3).map((n) => ({ k, n: n.toLowerCase() })))
    .sort((a, b) => b.n.length - a.n.length)
  for (const { k, n } of nazwy) {
    const wzor = new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u')
    if (wzor.test(tresc)) return { klient_id: k.id, powod: `nazwa „${n}” w treści`, domena: domeny[0] ?? null }
  }
  return { klient_id: null, powod: null, domena: domeny[0] ?? null }
}

export function propozycjaZapytania(mail: MailImportu, klienci: KlientImportu[], domenyWlasne: string[] = []): PropozycjaZapytania {
  const k = rozpoznajKlienta(mail, klienci, domenyWlasne)
  return {
    przedmiot: przedmiotZTematu(mail.temat) || 'Zapytanie z maila',
    klient_id: k.klient_id, klient_powod: k.powod, domena: k.domena,
    nr_zapytania_klienta: nrZapytaniaZTresci(mail.temat, mail.tekst),
    termin_oferty: terminOfertZTresci(mail.tekst),
  }
}
