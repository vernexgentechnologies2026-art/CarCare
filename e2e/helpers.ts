import { expect, type Page } from '@playwright/test';

/** Fictional demo accounts from the mock layer (README). */
export const PHONE = { admin: '9000000001', cleaner: '9000000101', resident: '9000001001', pending: '9000002181' } as const;

export async function signIn(page: Page, phone: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/mobile number/i).fill(phone);
  await page.getByLabel(/^password/i).fill('demo1234');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

/** Collects console errors and uncaught exceptions for the whole test. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

/** Waits until the page has content and no loading indicators remain. */
export async function settled(page: Page): Promise<void> {
  await expect(page.locator('main:visible, [role="dialog"]:visible, h1:visible, h2:visible').first()).toBeVisible();
  // generous: the mock layer seeds ~1,500 vehicles in the browser on a cold start
  await expect(page.getByRole('status', { name: /loading/i })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('.animate-pulse')).toHaveCount(0, { timeout: 15_000 }).catch(() => undefined);
}

/** No horizontal page scroll at this breakpoint (1 px tolerance for sub-pixel rounding). */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

/**
 * Draws a camera-sized (4000×3000) test photo in the browser and returns it as
 * JPEG bytes. `detail` controls fine texture: 0 = smooth, 1 = busy scene.
 */
export async function cameraPhoto(page: Page, detail: number): Promise<Buffer> {
  const base64 = await page.evaluate(async (d) => {
    const canvas = document.createElement('canvas');
    canvas.width = 4000;
    canvas.height = 3000;
    const g = canvas.getContext('2d')!;
    const sky = g.createLinearGradient(0, 0, 0, 3000);
    sky.addColorStop(0, '#9cc4e4');
    sky.addColorStop(1, '#3a3f44');
    g.fillStyle = sky;
    g.fillRect(0, 0, 4000, 3000);
    // a "car": large shapes with highlights
    g.fillStyle = '#b91c1c';
    g.fillRect(700, 1300, 2600, 900);
    g.fillStyle = '#111827';
    g.beginPath();
    g.arc(1200, 2250, 320, 0, Math.PI * 2);
    g.arc(2800, 2250, 320, 0, Math.PI * 2);
    g.fill();
    // fine texture (gravel, reflections, water droplets)
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const dots = Math.round(250_000 * d);
    for (let i = 0; i < dots; i++) {
      const v = Math.floor(rand() * 255);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(rand() * 4000, rand() * 3000, 2 + rand() * 4, 2 + rand() * 4);
    }
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    // Release the 48 MB canvas before the app decodes the photo into its own.
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) throw new Error('Test photo could not be generated: the browser ran out of canvas memory.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }, detail);
  return Buffer.from(base64, 'base64');
}
