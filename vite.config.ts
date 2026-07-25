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
        rollupOptions: {
            output: {
                /**
                 * Only split off dependency *leaves* (packages that import nothing
                 * from other chunks). Splitting antd / codemirror / the catch-all
                 * "vendor" apart creates circular chunk imports, and the chunk that
                 * gets evaluated first then touches bindings that don't exist yet
                 * ("Cannot access X before initialization"), which kills the app
                 * before React can mount.
                 */
                manualChunks(id) {
                    const parts = id.split('node_modules/');
                    if (parts.length < 2) return;
                    const pkgPath = parts[parts.length - 1];

                    // react + react-dom + scheduler have no external deps -> safe leaf
                    if (/^(react|react-dom|scheduler)\//.test(pkgPath)) {
                        return 'vendor-react';
                    }
                    // chart.js only depends on @kurkle/color -> safe leaf
                    if (/^(chart\.js|@kurkle)\//.test(pkgPath)) {
                        return 'vendor-charts';
                    }
                }
            }
        }
    },

    server: {
        port: 5174,
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
