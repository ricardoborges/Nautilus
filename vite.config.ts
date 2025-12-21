import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
    base: './',

    plugins: [
        react(),
        {
            name: 'remove-crossorigin',
            transformIndexHtml(html) {
                return html.replace(/ crossorigin/g, '');
            }
        }
    ],

    resolve: {
        alias: {
            '@': resolve(__dirname, 'src'),
        },
    },

    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },

    server: {
        port: 5173,
        strictPort: true,
    },

    // Monaco Editor - using dynamic import
    optimizeDeps: {
        include: [
            'monaco-editor', 
            'react', 
            'react-dom', 
            'antd', 
            '@ant-design/icons', 
            '@ant-design/pro-components',
            '@ant-design/cssinjs'
        ],
    },

    // CSS uses postcss config automatically

    // Clear screen disabled for Tauri
    clearScreen: false,
});
