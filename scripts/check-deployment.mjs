#!/usr/bin/env node
/**
 * Checks a DEPLOYED CarCare site (staging or production) from the outside.
 *
 *   npm run check:deployment -- <site-url> [--gateway <photo-gateway-url>] [--functions <supabase-functions-url>]
 *   e.g. npm run check:deployment -- https://staging.example.com \
 *          --gateway https://carcare-photo-gateway-staging.<acct>.workers.dev \
 *          --functions https://<ref>.supabase.co/functions/v1
 *
 * Verifies: HTTP→HTTPS redirect, security headers + CSP, SPA deep links,
 * the served JavaScript contains no dev tools / mock data / secrets, and
 * strict CORS on the photo gateway and payment functions. Read-only: it never
 * signs in, uploads or pays. Exit code 1 on any failure.
 */
import { scanBundleText } from './bundle-rules.mjs';

const args = process.argv.slice(2);
const site = args.find((a) => !a.startsWith('--'));
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (!site) {
  console.error('Usage: npm run check:deployment -- <site-url> [--gateway <url>] [--functions <url>]');
  process.exit(2);
}
const origin = new URL(site).origin;
const results = [];
const check = (ok, label, detail = '') => results.push({ ok, label, detail });
const warn = (label, detail = '') => results.push({ ok: 'warn', label, detail });

async function get(url, init) {
  return fetch(url, { redirect: 'manual', ...init });
}

// 1. HTTPS
if (origin.startsWith('https://')) {
  const http = await get(origin.replace('https://', 'http://')).catch(() => null);
  const loc = http?.headers.get('location') ?? '';
  check(http !== null && [301, 302, 307, 308].includes(http.status) && loc.startsWith('https://'), 'HTTP redirects to HTTPS', http ? `${http.status} → ${loc}` : 'no response');
} else {
  warn('Site is not HTTPS', 'only acceptable for a local preview');
}

// 2. Headers on the shell and a deep link (SPA fallback)
const required = {
  'strict-transport-security': /max-age=(\d+)/,
  'x-content-type-options': /^nosniff$/i,
  'x-frame-options': /^DENY$/i,
  'referrer-policy': /strict-origin/,
  'content-security-policy': /default-src 'self'/,
};
for (const path of ['/', '/cleaner/today', '/admin/dashboard']) {
  const res = await get(`${origin}${path}`);
  check(res.status === 200 && (res.headers.get('content-type') ?? '').includes('text/html'), `${path} serves the app (SPA fallback)`, String(res.status));
  if (path !== '/') continue;
  for (const [name, pattern] of Object.entries(required)) {
    const value = res.headers.get(name);
    check(Boolean(value && pattern.test(value)), `header ${name}`, value ?? 'missing');
  }
  const csp = res.headers.get('content-security-policy') ?? '';
  check(!/unsafe-eval/.test(csp), "CSP has no 'unsafe-eval'");
  check(/script-src 'self'( https:\/\/checkout\.razorpay\.com)?;/.test(csp), 'CSP script-src limited to self (+ Razorpay Checkout)', csp.match(/script-src[^;]*/)?.[0]);
  check(/frame-ancestors 'none'/.test(csp) && /object-src 'none'/.test(csp), "CSP blocks framing and plugins");
}

// 3. Served bundle
const html = await (await get(`${origin}/`)).text();
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
const queue = [...new Set(assets)];
const seen = new Set();
const problems = [];
const frozen = new Set();
while (queue.length) {
  const path = queue.shift();
  if (seen.has(path)) continue;
  seen.add(path);
  const text = await (await get(`${origin}${path}`)).text();
  const r = scanBundleText(text, path);
  problems.push(...r.problems);
  r.frozenCopy.forEach((l) => frozen.add(l));
  // follow lazily-loaded route chunks
  for (const m of text.matchAll(/["'`](?:\.\/|\/assets\/)([A-Za-z0-9_.-]+\.js)["'`]/g)) queue.push(`/assets/${m[1]}`);
}
check(seen.size > 0, `served bundle scanned`, `${seen.size} files`);
check(problems.length === 0, 'no dev tools, mock data, demo credentials or secrets in the served bundle', problems.join('; '));
if (frozen.size) warn('frozen UI copy mentions simulated payments (needs client-approved change)', [...frozen].join('; '));

// 4. CORS
async function corsCheck(label, url) {
  const evil = await get(url, { method: 'OPTIONS', headers: { Origin: 'https://not-carcare.example', 'Access-Control-Request-Method': 'POST' } });
  const evilAllowed = evil.headers.get('access-control-allow-origin');
  check(!evilAllowed || (evilAllowed !== '*' && evilAllowed !== 'https://not-carcare.example'), `${label}: foreign origin refused`, evilAllowed ?? 'no allow-origin header');
  const own = await get(url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } });
  check(own.headers.get('access-control-allow-origin') === origin, `${label}: site origin allowed`, own.headers.get('access-control-allow-origin') ?? 'missing');
}
const gateway = opt('gateway');
if (gateway) await corsCheck('photo gateway', `${gateway.replace(/\/$/, '')}/v1/uploads`);
else warn('photo gateway CORS not checked', 'pass --gateway <url>');
const functions = opt('functions');
if (functions) await corsCheck('payment function', `${functions.replace(/\/$/, '')}/razorpay-create-order`);
else warn('payment function CORS not checked', 'pass --functions <url>');

// Report
let failed = 0;
for (const r of results) {
  const mark = r.ok === 'warn' ? 'WARN' : r.ok ? 'PASS' : 'FAIL';
  if (r.ok === false) failed += 1;
  console.log(`${mark}  ${r.label}${r.detail ? `  (${r.detail})` : ''}`);
}
console.log(failed ? `\n${failed} check(s) failed for ${origin}` : `\nAll checks passed for ${origin}`);
process.exitCode = failed ? 1 : 0;
