import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

// Helper to get all HTML files in the project to register as entry points for the multi-page build
function getHtmlEntries() {
  const entries: Record<string, string> = {
    main: path.resolve(__dirname, 'index.html'),
  };
  
  // Root level htmls
  if (fs.existsSync(__dirname)) {
    const rootFiles = fs.readdirSync(__dirname);
    rootFiles.forEach(file => {
      if (file.endsWith('.html') && file !== 'index.html') {
        const name = file.replace('.html', '');
        entries[name] = path.resolve(__dirname, file);
      }
    });
  }

  // Seller folder
  const sellerDir = path.resolve(__dirname, 'seller');
  if (fs.existsSync(sellerDir)) {
    fs.readdirSync(sellerDir).forEach(file => {
      if (file.endsWith('.html')) {
        const name = `seller-${file.replace('.html', '')}`;
        entries[name] = path.resolve(sellerDir, file);
      }
    });
  }

  // Admin folder
  const adminDir = path.resolve(__dirname, 'admin');
  if (fs.existsSync(adminDir)) {
    fs.readdirSync(adminDir).forEach(file => {
      if (file.endsWith('.html')) {
        const name = `admin-${file.replace('.html', '')}`;
        entries[name] = path.resolve(adminDir, file);
      }
    });
  }

  return entries;
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: getHtmlEntries(),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
