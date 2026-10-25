// Dwujęzyczność PL / EN. Kluczem jest tekst polski: t('Zapisz') zwraca "Zapisz" po polsku i "Save" po angielsku.
// Typ klucza to klucze słownika angielskiego, więc tekst bez tłumaczenia nie przejdzie kompilacji (test spójności:
// src/i18n/i18n.test.ts). Parametry: t('Usunąć {0}?', nazwa). Język zapamiętany w profilu (i w localStorage), a jego zmiana
// przeładowuje aplikację - także stałe modułów (etykiety statusów, nazwy kolumn) liczą się wtedy w nowym języku.
import { EN } from './en'
import { EN_BAZA } from './en-baza'

export type Jezyk = 'pl' | 'en'
export type KluczTlumaczenia = keyof typeof EN
export const JEZYKI: { id: Jezyk; etykieta: string }[] = [{ id: 'pl', etykieta: 'PL' }, { id: 'en', etykieta: 'EN' }]

const KLUCZ_LS = 'wyceny:jezyk'
function zapisany(): Jezyk {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(KLUCZ_LS) === 'en' ? 'en' : 'pl' } catch { return 'pl' }
}

let biezacy: Jezyk = zapisany()
export const jezyk = () => biezacy

const podstaw = (wzor: string, arg: unknown[]) => (arg.length ? wzor.replace(/\{(\d+)\}/g, (_, i: string) => String(arg[Number(i)] ?? '')) : wzor)

/** Tekst interfejsu w bieżącym języku. */
export function t(k: KluczTlumaczenia, ...arg: unknown[]): string {
  return podstaw(biezacy === 'en' ? EN[k] || k : k, arg)
}

/** Tekst w podanym języku (eksport Excel / Word w języku wybranym przy eksporcie). */
export function tj(j: Jezyk, k: KluczTlumaczenia, ...arg: unknown[]): string {
  return podstaw(j === 'en' ? EN[k] || k : k, arg)
}

/** Tekst spoza kodu (np. komunikat bazy) - tłumaczony, jeśli jest w słowniku, inaczej bez zmian. */
export function tDowolny(s: string): string {
  if (biezacy !== 'en') return s
  return (s in EN ? EN[s as KluczTlumaczenia] : EN_BAZA[s.trim()]) || s
}

/** Nazwa ze słownika bazy w bieżącym języku (nazwa_en, gdy jest; inaczej polska). */
export const nazwaWJezyku = (o: { nazwa: string; nazwa_en?: string | null }, j: Jezyk = biezacy) => (j === 'en' && o.nazwa_en?.trim() ? o.nazwa_en : o.nazwa)

/** Zmiana języka: zapis w przeglądarce i przeładowanie (profil zapisuje wołający). */
export function ustawJezyk(j: Jezyk, przeladuj = true) {
  try { localStorage.setItem(KLUCZ_LS, j) } catch { /* bez zapamiętania w przeglądarce - zostaje profil */ }
  biezacy = j
  if (przeladuj && typeof window !== 'undefined') window.location.reload()
}

export const lokalizacja = (j: Jezyk = biezacy) => (j === 'en' ? 'en-GB' : 'pl-PL')
