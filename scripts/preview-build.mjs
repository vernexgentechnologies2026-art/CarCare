#!/usr/bin/env node
/**
 * Builds the app in a given profile and serves it with `vite preview`, which
 * sends the deployed security headers (see vite.config.ts → preview.headers).
 * Used by the Playwright "headers-*" projects.
 *
 *   node scripts/preview-build.mjs <review|mock|production> <port>
 *
 * "review" = mock data source with the Dev Role Switcher (end-to-end flows).
 * "production" = VITE_DATA_SOURCE=supabase + VITE_ENABLE_DEV_TOOLS=false with
 * placeholder public config; the checks never contact a real backend.
 */
import { execFileSync, spawn } from 'node:child_process';

const [profile = 'mock', port = '5176'] = process.argv.slice(2);
const outDir = `dist-preview-${profile}`;
const env = { ...process.env };
if (profile === 'production') {
  Object.assign(env, {
    VITE_DATA_SOURCE: 'supabase',
    VITE_ENABLE_DEV_TOOLS: 'false',
    VITE_SUPABASE_URL: 'https://placeholder.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'placeholder-anon-key',
    VITE_PHOTO_GATEWAY_URL: 'https://photos.placeholder.workers.dev',
  });
} else if (profile === 'review') {
  Object.assign(env, { VITE_DATA_SOURCE: 'mock', VITE_ENABLE_DEV_TOOLS: 'true' });
} else {
  Object.assign(env, { VITE_DATA_SOURCE: 'mock' });
}

const vite = 'node_modules/vite/bin/vite.js';
execFileSync(process.execPath, [vite, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], { env, stdio: 'inherit' });
const server = spawn(process.execPath, [vite, 'preview', '--outDir', outDir, '--port', port, '--strictPort'], { env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
server.on('exit', (code) => process.exit(code ?? 0));
