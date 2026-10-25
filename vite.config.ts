/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { createReadStream, existsSync, statSync } from 'node:fs'

/**
 * Tylko serwer deweloperski (npm run dev): rysunki PDF i maile z lokalnego folderu materiałów (FOLDER_MATERIALOW
 * w .env) dla stron *-dev.html - podgląd modułów bez logowania. Nie trafia do buildu; serwuje wyłącznie
 * pliki dokumentów (.pdf, .msg, .eml, .docx, .xlsx, .csv, .txt, .dxf, .jpg, .png) z wnętrza tego folderu.
 */
function materialyDev(folder: string | undefined, base: string): Plugin {
  const prefiks = `${base}__materialy/`
  return {
    name: 'materialy-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(prefiks)) return next()
        const wzgledna = decodeURIComponent(req.url.slice(prefiks.length).split('?')[0])
        const korzen = folder ? path.resolve(folder) : ''
        const plik = korzen ? path.resolve(korzen, wzgledna) : ''
        const wSrodku = korzen && plik.startsWith(korzen + path.sep)
        if (!wSrodku || !/\.(pdf|msg|eml|docx|xlsx|xls|csv|txt|dxf|jpe?g|png|webp)$/i.test(plik) || !existsSync(plik) || !statSync(plik).isFile()) {
          res.statusCode = 404
          res.end('Brak pliku (tylko dokumenty: pdf, msg, eml, docx, xlsx, csv, txt, dxf, jpg, png z folderu materiałów).')
          return
        }
        res.setHeader('Content-Type', /\.pdf$/i.test(plik) ? 'application/pdf' : 'application/octet-stream')
        createReadStream(plik).pipe(res)
      })
    },
  }
}

// GitHub Pages: aplikacja stoi pod /<repozytorium>/ - workflow podaje BASE_PATH z nazwy repozytorium,
// więc kod nie zawiera nazwy repozytorium. Lokalnie: korzeń serwera deweloperskiego.
const BASE = process.env.BASE_PATH || '/'

export default defineConfig(({ mode }) => ({
  base: BASE,
  plugins: [react(), materialyDev(loadEnv(mode, process.cwd(), 'FOLDER_').FOLDER_MATERIALOW, BASE)],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Czytnik .msg (iconv-lite) używa Buffera z Node - w przeglądarce zamiennik z pakietu "buffer".
      buffer: 'buffer/',
    },
  },
  server: { port: 5190, strictPort: true },
  build: {
    // pdf.js i generatory dokumentów są duże - ładowane osobno, dopiero gdy potrzebne.
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Z .env działają testy na prawdziwym projekcie: każdy plik zakłada i loguje konta tymczasowe -
    // równolegle bywały odrzucane przez limity Supabase Auth. W CI (bez .env) pliki idą równolegle.
    fileParallelism: !existsSync(path.join(__dirname, '.env')),
  },
}))
