import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests in a real Chromium, against BUILT apps served by
 * `vite preview` with the deployed security headers (public/_headers):
 *  - "mobile" / "desktop": user flows on the review build (mock data + Dev
 *    Role Switcher) at a phone and a desktop breakpoint.
 *  - "headers-mock": security headers, and every screen under the CSP.
 *  - "headers-production": the real production profile (Supabase, dev tools
 *    off) — no dev tools or mock banners, loads under the CSP.
 *
 *   npm run test:e2e
 * Set CARCARE_E2E=app or CARCARE_E2E=headers to run one half (less memory).
 */
const suite = process.env.CARCARE_E2E ?? 'all';
const app = suite !== 'headers';
const headers = suite !== 'app';
const REVIEW = 'http://localhost:5176';
const PRODUCTION = 'http://localhost:5177';

export default defineConfig({
  testDir: 'e2e',
  // One worker: this machine has little free memory.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    ...(app
      ? [
          { name: 'mobile', testIgnore: /security-headers/, use: { ...devices['Pixel 5'], baseURL: REVIEW } },
          { name: 'desktop', testIgnore: /security-headers/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: REVIEW } },
        ]
      : []),
    ...(headers
      ? [
          { name: 'headers-mock', testMatch: /security-headers/, grep: /csp tour \(mock build\)/, use: { ...devices['Desktop Chrome'], baseURL: REVIEW } },
          { name: 'headers-production', testMatch: /security-headers/, grep: /production profile/, use: { ...devices['Pixel 5'], baseURL: PRODUCTION } },
        ]
      : []),
  ],
  webServer: [
    { command: 'node scripts/preview-build.mjs review 5176', url: REVIEW, reuseExistingServer: false, timeout: 180_000 },
    ...(headers ? [{ command: 'node scripts/preview-build.mjs production 5177', url: PRODUCTION, reuseExistingServer: false, timeout: 180_000 }] : []),
  ],
});
