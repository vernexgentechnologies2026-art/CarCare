/**
 * What may never ship in a production bundle (Master Task Document §26.4).
 * Shared by scripts/verify-prod-build.mjs (local build) and
 * scripts/check-deployment.mjs (what a live site actually serves).
 */

/** Strings that must never appear in a production bundle. */
export const FORBIDDEN = [
  ['Dev Role Switcher', /Reset Mock Database|Developer tools/],
  ['demo password', /demo1234/],
  ['mock seed data', /Arjun Raghavan|Murugan S|Meera Subramanian/],
  ['mock payment notice', /Simulated payments \(Phase 1 mock\)|MOCK-\d/],
  ['review banner', /Phase 1 review build/],
  // an actual secret key value (supabase-js itself contains the bare prefix in a format check)
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{16,}/],
  ['server-only variable names', /SUPABASE_SERVICE_ROLE_KEY|RAZORPAY_KEY_SECRET|RAZORPAY_WEBHOOK_SECRET|URL_SIGNING_SECRET/],
];

/**
 * Mock-only wording inside FROZEN UI files (src/features, src/components).
 * It never renders against Supabase (gated on dataSource), but the text ships
 * until the client approves a copy change. Reported, not failed.
 */
export const FROZEN_UI_COPY = [
  ['"Simulate success/failure" buttons (PaymentModal, rendered only in mock mode)', /Simulate success|Simulate failure/],
  ['"(simulated)" payment result titles (PaymentModal)', /Payment (successful|failed) \(simulated\)/],
  ['"All Phase 1 transactions are simulated." (InvoicesPage)', /All Phase 1 transactions are simulated/],
  ['"Collections are simulated (Phase 1 mock)." (AdminDashboardPage)', /Collections are simulated/],
];

/** Any embedded JWT whose payload grants the service role (a legacy service_role key). */
export function serviceRoleJwts(text) {
  const found = [];
  for (const [jwt] of text.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    try {
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
      if (payload && payload.role === 'service_role') found.push(`${jwt.slice(0, 12)}…`);
    } catch {
      /* not a JWT */
    }
  }
  return found;
}

/** Scans one file's text; returns { problems: string[], frozenCopy: string[] }. */
export function scanBundleText(text, where) {
  const problems = [];
  for (const [label, pattern] of FORBIDDEN) if (pattern.test(text)) problems.push(`${label} in ${where}`);
  if (serviceRoleJwts(text).length) problems.push(`service_role JWT in ${where}`);
  const frozenCopy = FROZEN_UI_COPY.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  return { problems, frozenCopy };
}
