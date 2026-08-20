import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const APP_VERSION = new Date()
  .toISOString()
  .replace('T', '-')
  .replace(/:/g, '')
  .slice(0, 16)

console.log('App version', APP_VERSION)

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  plugins: [react()],
})