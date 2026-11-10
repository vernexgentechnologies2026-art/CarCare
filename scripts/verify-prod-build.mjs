#!/usr/bin/env node
/**
 * Proves the production build contains no dev tools, mock data, demo
 * credentials, mock banners or privileged keys (Master Task Document §26.4).
 * Builds with VITE_DATA_SOURCE=supabase and VITE_ENABLE_DEV_TOOLS=false into a
 * temporary folder (placeholder public config only), then scans every file.
 *
 *   npm run verify:prod-build
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanBundleText } from './bundle-rules.mjs';

const outDir = mkdtempSync(join(tmpdir(), 'carcare-prod-'));
const env = {
  ...process.env,
  VITE_DATA_SOURCE: 'supabase',
  VITE_ENABLE_DEV_TOOLS: 'false',
  // Placeholders: the build needs values, the check needs nothing real.
  VITE_SUPABASE_URL: 'https://placeholder.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'placeholder-anon-key',
  VITE_PHOTO_GATEWAY_URL: 'https://photos.placeholder.dev',
};

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

try {
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], { env, stdio: 'inherit' });
  const problems = [];
  const frozenCopy = new Set();
  for (const file of files(outDir)) {
    const result = scanBundleText(readFileSync(file, 'utf8'), file.slice(outDir.length + 1));
    problems.push(...result.problems);
    for (const label of result.frozenCopy) frozenCopy.add(label);
  }
  if (frozenCopy.size) {
    console.warn('Frozen UI copy still mentions simulated payments (needs a client-approved copy change):');
    for (const label of frozenCopy) console.warn(`  - ${label}`);
  }
  if (problems.length) {
    console.error('PRODUCTION BUILD CHECK FAILED:');
    for (const p of problems) console.error(`  ${p}`);
    process.exitCode = 1;
  } else {
    console.log(`Production build check passed: no dev tools, mock data, demo credentials, mock banners or secret keys (${files(outDir).length} files scanned).`);
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
