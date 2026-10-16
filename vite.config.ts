import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Strict CSP for the production build only: dev needs inline scripts for hot reload.
const csp: Plugin = {
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace(
      '<head>',
      `<head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'" />`,
    ),
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const api = env.EASYRELAY_API ?? 'http://127.0.0.1:8120'
  // The browser only ever talks to its own origin; Vite forwards API paths.
  // No CORS needed, and the relay never gets CORS headers it didn't ask for.
  const proxy = { '/admin': api, '/calls': api }
  return {
    plugins: [react(), csp],
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
    build: { sourcemap: false },
  }
})
