// Wspólne dla testów lokalnych: .env z kluczami, folder z materiałami (FOLDER_MATERIALOW) i lokalna konfiguracja
// testów na prawdziwych plikach (prywatne/testy.json). Bez nich testy są pomijane - w repo (i w CI) nie ma
// ani kluczy, ani danych firmowych, ani nawet nazw plików klientów.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const KORZEN = join(__dirname, '..', '..')
const PLIK_ENV = join(KORZEN, '.env')

export const env: Record<string, string> = existsSync(PLIK_ENV)
  ? Object.fromEntries(
      readFileSync(PLIK_ENV, 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
    )
  : {}

export const maSupabase = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_PUBLISHABLE_KEY)

export const MATERIALY = process.env.FOLDER_MATERIALOW || env.FOLDER_MATERIALOW || ''
export const maMaterialy = Boolean(MATERIALY && existsSync(MATERIALY))
export const plikMaterialow = (...czesci: string[]) => join(MATERIALY, ...czesci)

/**
 * Konfiguracja testów na prawdziwych plikach - poza repozytorium (format: tests/lokalne/testy.przyklad.json).
 * Ścieżki plików względem FOLDER_MATERIALOW.
 */
export interface KonfiguracjaTestow {
  /** Skan rysunku z wykazem części (bez warstwy tekstowej). */
  skan_wykaz?: { plik: string; obszar: { x: number; y: number; w: number; h: number }; gatunki: string[]; min_pozycji: number }
  /** Rysunek wektorowy z tabelą danych projektowych (str. 1) i tabelą króćców (str. 3). */
  rysunek_wektorowy?: { plik: string; krocce: string[] }
  karty_dostawy?: string[]
  registo?: string
  arkusze_wycen?: string[]
  kalkulacje?: { kalk: string; notatka: string }[]
  notatki?: string[]
  /** Zapytanie z seeda do testu analizy AI (fragment przedmiotu dla ILIKE). */
  analiza_ai?: { przedmiot: string }
  /** Foldery z przykładowymi zapytaniami do raportu kompresji plików. */
  foldery_kompresji?: string[]
  /** Folder z kartami dostawy Optimy w PDF. */
  karty_dostawy_pdf?: string
}

const PLIK_TESTOW = process.env.TESTY_KONFIGURACJA || join(KORZEN, 'prywatne', 'testy.json')
export const TESTY: KonfiguracjaTestow = existsSync(PLIK_TESTOW) ? JSON.parse(readFileSync(PLIK_TESTOW, 'utf8')) : {}

/** Ścieżka pliku z konfiguracji testów, gdy plik istnieje - inaczej null (test pominięty). */
export function plikTestu(wzgledna: string | undefined | null): string | null {
  if (!wzgledna || !maMaterialy) return null
  const p = plikMaterialow(...wzgledna.split('/'))
  return existsSync(p) ? p : null
}
