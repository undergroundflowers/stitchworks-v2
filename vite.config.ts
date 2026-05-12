import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_PAGES_BASE ?? '/',
  server: {
    // Allow any tunnel/proxy host to reach the dev server (dev only — Vite
    // otherwise blocks unrecognized Host headers per CVE-2025-30208).
    allowedHosts: true,
  },
})
