#!/usr/bin/env node
/**
 * UI freeze lock (Phase 3).
 *
 * Records a SHA-256 fingerprint of every file under src/features and
 * src/components in docs/ui-freeze.lock.json. `--check` (run by `npm test`)
 * fails if any frozen file was added, removed or changed.
 *
 *   node scripts/ui-freeze.mjs --check    verify (default)
 *   node scripts/ui-freeze.mjs --update   re-lock after an APPROVED change
 *
 * Only re-lock for an approved bug fix or a client-approved change request,
 * and record it in docs/CHANGELOG.md. Redesigns are not permitted.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FROZEN_DIRS = ['src/features', 'src/components'];
const LOCK_FILE = join(ROOT, 'docs', 'ui-freeze.lock.json');

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function fingerprints() {
  const files = {};
  for (const dir of FROZEN_DIRS) {
    for (const path of walk(join(ROOT, dir))) {
      // Normalise line endings so a Windows/Unix checkout produces the same hash.
      const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
      files[relative(ROOT, path).split(sep).join('/')] = createHash('sha256').update(text).digest('hex');
    }
  }
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}

const mode = process.argv.includes('--update') ? 'update' : 'check';
const current = fingerprints();

if (mode === 'update') {
  const lock = { frozenOn: '2026-11-10', phase: 'Phase 3 — UI freeze', dirs: FROZEN_DIRS, files: current };
  writeFileSync(LOCK_FILE, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`UI freeze lock written: ${Object.keys(current).length} files.`);
  process.exit(0);
}

if (!existsSync(LOCK_FILE)) {
  console.error('UI freeze lock missing: docs/ui-freeze.lock.json');
  process.exit(1);
}
const locked = JSON.parse(readFileSync(LOCK_FILE, 'utf8')).files;
const added = Object.keys(current).filter((f) => !(f in locked));
const removed = Object.keys(locked).filter((f) => !(f in current));
const changed = Object.keys(current).filter((f) => f in locked && locked[f] !== current[f]);

if (added.length + removed.length + changed.length === 0) {
  console.log(`UI freeze intact: ${Object.keys(current).length} files unchanged.`);
  process.exit(0);
}
console.error('UI FREEZE VIOLATION — frozen UI files differ from docs/ui-freeze.lock.json:');
for (const f of changed) console.error(`  changed  ${f}`);
for (const f of added) console.error(`  added    ${f}`);
for (const f of removed) console.error(`  removed  ${f}`);
console.error('\nIf this is an approved fix, run `npm run freeze:update` and log it in docs/CHANGELOG.md.');
process.exit(1);
