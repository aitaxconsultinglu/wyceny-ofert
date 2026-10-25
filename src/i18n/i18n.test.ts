import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { EN } from './en'
import { EN_BAZA } from './en-baza'
import { t, tj } from './index'

/** Klucze t('…') i tj(j, '…') użyte w kodzie aplikacji (bez testów i podglądów deweloperskich). */
function kluczeZKodu(): Set<string> {
  const pliki: string[] = []
  const chodz = (d: string) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name)
      if (f.isDirectory()) { if (!['i18n', 'dev'].includes(f.name)) chodz(p) } else if (/\.tsx?$/.test(f.name) && !/\.test\.tsx?$/.test(f.name)) pliki.push(p)
    }
  }
  chodz('src')
  const klucze = new Set<string>()
  for (const p of pliki) {
    const sf = ts.createSourceFile(p, readFileSync(p, 'utf8'), ts.ScriptTarget.Latest, true, p.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const odw = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const a = n.expression.text === 't' ? n.arguments[0] : n.expression.text === 'tj' ? n.arguments[1] : undefined
        if (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))) klucze.add(a.text)
      }
      ts.forEachChild(n, odw)
    }
    odw(sf)
  }
  return klucze
}

const parametry = (s: string) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',')

describe('słownik PL / EN', () => {
  const zKodu = kluczeZKodu()
  const wSlowniku = Object.keys(EN)

  it('każdy tekst interfejsu z kodu ma tłumaczenie angielskie', () => {
    expect([...zKodu].filter((k) => !(k in EN))).toEqual([])
  })
  it('w słowniku nie ma tłumaczeń nieużywanych w kodzie (każdy klucz PL ma użycie i odwrotnie)', () => {
    expect(wSlowniku.filter((k) => !zKodu.has(k))).toEqual([])
  })
  it('tłumaczenia są niepuste i mają te same parametry {n} co tekst polski', () => {
    expect(Object.entries(EN).filter(([pl, en]) => !en.trim() && pl.trim())).toEqual([])
    expect(Object.entries(EN).filter(([pl, en]) => parametry(pl) !== parametry(en)).map(([pl]) => pl)).toEqual([])
    expect(Object.entries(EN_BAZA).filter(([, en]) => !en.trim())).toEqual([])
  })
  it('t() domyślnie po polsku z parametrami, tj() w wybranym języku', () => {
    expect(t('Zapisz')).toBe('Zapisz')
    expect(tj('en', 'Zapisz')).toBe('Save')
    expect(tj('en', 'Strona {0}: {1}', 2, 'x')).toBe('Page 2: x')
    expect(t('Strona {0}: {1}', 2, 'x')).toBe('Strona 2: x')
  })
})
