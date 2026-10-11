import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pagesBase } from './pages-base.ts';
export default defineConfig({
    plugins: [react()],
    base: pagesBase(process.env.GITHUB_REPOSITORY),
    server: { host: '127.0.0.1', port: 5173 },
});
