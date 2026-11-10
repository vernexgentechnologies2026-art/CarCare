/// <reference types="vitest" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/**
 * Production build profile (Master Task Document §26.4): code that a build can
 * never run is replaced with empty stand-ins, so it is absent from the bundle,
 * not merely hidden at runtime.
 *  - VITE_DATA_SOURCE=supabase → no mock services, seed data or demo accounts,
 *    and no mock/review banners.
 *  - VITE_DATA_SOURCE=mock (default) → no Supabase client code.
 *  - VITE_ENABLE_DEV_TOOLS=false → no Dev Role Switcher.
 * Applies to `vite build` only; dev server and tests use the real modules.
 * `npm run verify:prod-build` proves the result.
 */
function buildProfile(env: Record<string, string>): Plugin {
  const supabase = env.VITE_DATA_SOURCE === 'supabase';
  const stubs: Array<[suffix: string, active: boolean, code: string]> = [
    [
      '/src/services/mock/index.ts',
      supabase,
      `export function createMockServices() { throw new Error('The mock data source is not included in this build.'); }
       export const MOCK_FAILURE_UPI = '';`,
    ],
    [
      '/src/services/supabase/index.ts',
      !supabase,
      `export function createSupabaseServices() { throw new Error('The Supabase data source is not included in this build. Set VITE_DATA_SOURCE=supabase.'); }
       export function createSupabaseRegistry() { throw new Error('Not included in this build.'); }`,
    ],
    [
      '/src/components/shared/DevRoleSwitcher.tsx',
      supabase || env.VITE_ENABLE_DEV_TOOLS === 'false',
      `export const devToolsEnabled = () => false;
       export function DevRoleSwitcher() { return null; }`,
    ],
    [
      '/src/components/shared/ReviewBanner.tsx',
      supabase,
      `export function ReviewBanner() { return null; }
       export function MockPaymentNotice() { return null; }`,
    ],
  ];
  return {
    name: 'carcare-build-profile',
    apply: 'build',
    enforce: 'pre',
    load(id) {
      const path = id.split('?')[0]!.replace(/\\/g, '/');
      const stub = stubs.find(([suffix, active]) => active && path.endsWith(suffix));
      return stub ? stub[2] : null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...pickViteEnv(process.env) };
  return {
    plugins: [react(), buildProfile(env)],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { port: 5174, strictPort: true },
    // `vite preview` serves the same security headers as the deployed site, so
    // CSP and header behaviour can be tested locally (e2e/security-headers.spec.ts).
    preview: { headers: deployedHeaders() },
    build: {
      rollupOptions: {
        output: {
          // Long-lived library chunks: an app release does not force users to
          // re-download React, the router or the Supabase client.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
            if (/[\\/]node_modules[\\/](react-router|react-router-dom|@remix-run)[\\/]/.test(id)) return 'vendor-router';
            if (id.includes('@tanstack')) return 'vendor-query';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (/[\\/]node_modules[\\/](zod|react-hook-form|@hookform)[\\/]/.test(id)) return 'vendor-forms';
            if (id.includes('lucide-react')) return 'vendor-icons';
            return 'vendor';
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.test.{ts,tsx}'],
      css: false,
      // The default `forks` pool exits unexpectedly on newer Node releases.
      pool: 'threads',
      // Each worker seeds the full 1,500-vehicle dataset; cap parallelism to stay memory-friendly.
      poolOptions: { threads: { minThreads: 1, maxThreads: 1 } },
    },
  };
});

function pickViteEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter((e): e is [string, string] => e[0].startsWith('VITE_') && typeof e[1] === 'string'));
}

/**
 * Headers for "/*" from public/_headers (Cloudflare Pages format). Over plain
 * http://localhost, `upgrade-insecure-requests` is dropped: it only applies to
 * the HTTPS deployment and would break local asset loading.
 */
function deployedHeaders(): Record<string, string> {
  const text = readFileSync(new URL('./public/_headers', import.meta.url), 'utf8');
  const headers: Record<string, string> = {};
  let inBlock = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) inBlock = line.trim() === '/*';
    else if (inBlock && line.includes(':')) {
      const at = line.indexOf(':');
      headers[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
  }
  const csp = headers['Content-Security-Policy'];
  if (csp) headers['Content-Security-Policy'] = csp.replace(/;\s*upgrade-insecure-requests/, '');
  return headers;
}
