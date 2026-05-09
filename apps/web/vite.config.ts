import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  envPrefix: 'PUBLIC_',
  server: {
    port: Number(process.env.PORT ?? 5173),
  },
});
