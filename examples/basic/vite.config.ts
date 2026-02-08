import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Don't pre-bundle our workspace packages so we always get fresh builds
    exclude: ['@react-three-dom/core', '@react-three-dom/inspector'],
  },
});
