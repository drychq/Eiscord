import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  envPrefix: 'PUBLIC_',
  server: {
    port: 5173,
  },
});
