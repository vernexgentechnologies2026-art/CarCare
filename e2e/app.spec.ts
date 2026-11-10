import { expect, test } from '@playwright/test';
import { cameraPhoto, expectNoHorizontalOverflow, PHONE, settled, signIn, watchErrors } from './helpers';

/*
 * Runs in the "mobile" (Pixel 5) and "desktop" (1440×900) projects. Each test
 * gets a fresh browser context, so the mock database starts from its seed.
 */

const SCREENS = {
  resident: ['/customer/dashboard', '/customer/packages', '/customer/photos', '/customer/reschedule', '/customer/invoices', '/customer/account'],
  cleaner: ['/cleaner/today', '/cleaner/schedule', '/cleaner/customers', '/cleaner/targets'],
  admin: ['/admin/dashboard', '/admin/customers', '/admin/cleaners', '/admin/packages', '/admin/schedules', '/admin/payments', '/admin/photos', '/admin/audit-log'],
} as const;

for (const role of Object.keys(SCREENS) as Array<keyof typeof SCREENS>) {
  test(`${role}: every screen renders with no errors and no horizontal scroll`, async ({ page }) => {
    const errors = watchErrors(page);
    await signIn(page, PHONE[role]);
    for (const path of SCREENS[role]) {
      await page.goto(path);
      await settled(page);
      await expect(page.getByText('Something went wrong'), path).toHaveCount(0);
      await expect(page, path).toHaveURL(new RegExp(`${path}(\\?.*)?$`));
      await expectNoHorizontalOverflow(page, path);
    }
    expect(errors).toEqual([]);
  });
}

test('sign-in and registration screens fit the viewport', async ({ page }) => {
  const errors = watchErrors(page);
  for (const path of ['/login', '/customer/register']) {
    await page.goto(path);
    await settled(page);
    await expectNoHorizontalOverflow(page, path);
  }
  expect(errors).toEqual([]);
});

test('a pending resident is held on the approval-status screen', async ({ page }) => {
  await signIn(page, PHONE.pending);
  await page.goto('/customer/dashboard');
  await expect(page).toHaveURL(/\/customer\/approval-status$/);
  await expect(page.getByRole('heading', { name: /registration under review/i })).toBeVisible();
});

test('cleaner: real-browser compression keeps photos ≤ 150 KB and ≤ 1280 px; completion survives a reload', async ({ page }) => {
  const errors = watchErrors(page);
  await signIn(page, PHONE.cleaner);
  await page.goto('/cleaner/today');
  await settled(page);
  const href = await page.locator('a[href^="/cleaner/jobs/"]').first().getAttribute('href');
  expect(href).toBeTruthy();
  await page.goto(`${href}/complete`);
  const confirm = page.getByRole('button', { name: /confirm wash completed/i });
  await expect(confirm).toBeDisabled();

  const results: Array<{ detail: number; inputKB: number; outputKB: number }> = [];
  for (const detail of [0, 0.5, 1]) {
    const photo = await cameraPhoto(page, detail);
    const preview = page.locator('img[src^="blob:"]').first();
    const before = (await preview.count()) ? await preview.getAttribute('src') : null;
    await page.getByTestId('photo-input').setInputFiles({ name: `after-${detail}.jpg`, mimeType: 'image/jpeg', buffer: photo });
    // wait for THIS photo's compressed preview (a new blob URL), then read its size
    await expect.poll(async () => ((await preview.count()) ? await preview.getAttribute('src') : null), { timeout: 30_000 }).not.toBe(before);
    const label = page.getByTestId('compressed-size');
    await expect(label).toBeVisible();
    const kb = Number(/(\d+)\s*KB/.exec((await label.textContent()) ?? '')?.[1]);
    results.push({ detail, inputKB: Math.round(photo.length / 1024), outputKB: kb });
    expect(kb, `detail ${detail}`).toBeLessThanOrEqual(150);
  }
  // the preview image is the compressed upload; its longest side is ≤ 1280 px
  const longest = await page.locator('img[alt*="review" i], img[alt*="preview" i], img[src^="blob:"]').first()
    .evaluate((img) => Math.max((img as HTMLImageElement).naturalWidth, (img as HTMLImageElement).naturalHeight));
  expect(longest).toBeLessThanOrEqual(1280);
  test.info().annotations.push({ type: 'compression', description: JSON.stringify(results) });
  console.log(`[${test.info().project.name}] compression results: ${JSON.stringify(results)}`);

  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page).toHaveURL(/\/cleaner\/today/);
  await page.reload();
  await page.goto(href!);
  await expect(page.getByText(/completed/i).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /complete wash/i })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('cleaner: Vehicle Not Present is confirmed, does not count, and persists', async ({ page }) => {
  await signIn(page, PHONE.cleaner);
  await page.goto('/cleaner/today');
  await settled(page);
  const href = await page.locator('a[href^="/cleaner/jobs/"]').first().getAttribute('href');
  await page.goto(`${href}/vnp`);
  const dialog = page.getByRole('dialog', { name: /mark vehicle not present/i });
  await expect(dialog.getByText(/does not count as a wash/i)).toBeVisible();
  await dialog.getByRole('button', { name: /confirm not present/i }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.goto(href!);
  await expect(page.getByText(/not present/i).first()).toBeVisible();
});

test('resident gallery shows dates only — no times or cleaner names', async ({ page }) => {
  await signIn(page, PHONE.resident);
  await page.goto('/customer/photos');
  await settled(page);
  const cards = page.getByRole('button', { name: /open photo from/i });
  await expect(cards.first()).toBeVisible();
  for (const text of await cards.allTextContents()) {
    expect(text.trim()).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/);
    expect(text).not.toMatch(/AM|PM|:\d\d|Murugan|cleaner/i);
  }
  await cards.first().click();
  const lightbox = page.getByRole('dialog');
  await expect(lightbox).toBeVisible();
  expect(await lightbox.textContent()).not.toMatch(/\d{1,2}:\d\d|AM|PM|Murugan/);
});

test('resident: simulated payment succeeds and is clearly labelled', async ({ page }) => {
  await signIn(page, PHONE.resident);
  await page.goto('/customer/invoices');
  await settled(page);
  await page.getByRole('button', { name: /^pay now/i }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/simulated payments \(phase 1 mock\)/i)).toBeVisible();
  await dialog.getByLabel(/upi id/i).fill('resident@okbank');
  await dialog.getByRole('button', { name: /simulate success/i }).click();
  await expect(page.getByRole('heading', { name: /payment successful \(simulated\)/i })).toBeVisible();
});

test('dev role switcher switches personas', async ({ page }) => {
  await page.goto('/login');
  const dock = page.getByRole('region', { name: /developer tools/i });
  await expect(dock).toBeVisible();
  await dock.getByRole('radio', { name: /^admin$/i }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/);
});
