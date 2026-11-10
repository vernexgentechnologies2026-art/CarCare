import { expect, test, type Page } from '@playwright/test';
import { PHONE, settled, signIn } from './helpers';

/*
 * Runs against BUILT apps served with the deployed headers (public/_headers):
 *  - "headers-mock": every screen under the CSP, with zero violations.
 *  - "headers-production": the real production profile (Supabase, dev tools
 *    off) — no dev tools or mock banners render, and the shell loads under CSP.
 */

const REQUIRED = {
  'strict-transport-security': /max-age=\d{7,}/,
  'x-content-type-options': /^nosniff$/,
  'x-frame-options': /^DENY$/,
  'referrer-policy': /strict-origin/,
  'content-security-policy': /default-src 'self'.*object-src 'none'.*frame-ancestors 'none'/,
};

async function trackViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const console: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) console.push(m.text());
  });
  return async () => [...(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)), ...console];
}

test.describe('csp tour (mock build)', () => {
  test('the document is served with every security header', async ({ page }) => {
    const res = await page.goto('/cleaner/today');
    const headers = res!.headers();
    for (const [name, pattern] of Object.entries(REQUIRED)) expect(headers[name], name).toMatch(pattern);
  });

  test('every role’s screens run under the CSP with zero violations', async ({ page }) => {
    test.setTimeout(180_000); // 17 screens across three sign-ins
    const violations = await trackViolations(page);
    const tour: Array<[string, string[]]> = [
      [PHONE.resident, ['/customer/dashboard', '/customer/packages', '/customer/photos', '/customer/reschedule', '/customer/invoices']],
      [PHONE.cleaner, ['/cleaner/today', '/cleaner/schedule', '/cleaner/customers', '/cleaner/targets']],
      [PHONE.admin, ['/admin/dashboard', '/admin/customers', '/admin/cleaners', '/admin/packages', '/admin/schedules', '/admin/payments', '/admin/photos', '/admin/audit-log']],
    ];
    for (const [phone, paths] of tour) {
      await page.context().clearCookies();
      await page.goto('/login');
      await page.evaluate(() => localStorage.clear());
      await signIn(page, phone);
      for (const path of paths) {
        await page.goto(path);
        try {
          await settled(page);
        } catch (error) {
          throw new Error(`${path} did not finish loading under the CSP. Violations so far: ${JSON.stringify(await violations())}`, { cause: error });
        }
      }
    }
    expect(await violations()).toEqual([]);
  });
});

test.describe('production profile', () => {
  test('production build: no dev tools or mock banners, and the shell loads under CSP', async ({ page }) => {
    const violations = await trackViolations(page);
    const res = await page.goto('/login');
    expect(res!.headers()['content-security-policy']).toBeTruthy();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
    await expect(page.getByRole('region', { name: /developer tools/i })).toHaveCount(0);
    await expect(page.getByText(/review build|simulated payments|reset mock database|review accounts/i)).toHaveCount(0);
    expect(await violations()).toEqual([]);
  });
});
