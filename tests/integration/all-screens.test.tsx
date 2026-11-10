import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DemoPersona } from '@/types';
import { renderApp, TEST_TODAY } from '../renderApp';

const JOB = `veh_1_${TEST_TODAY}`;

/** Every screen in the app, opened as the role that uses it. */
const SCREENS: Array<[string, DemoPersona | undefined]> = [
  ['/login', undefined],
  ['/customer/register', undefined],
  ['/customer/approval-status', 'CUSTOMER_PENDING'],
  ['/customer/dashboard', 'CUSTOMER_APPROVED'],
  ['/customer/packages', 'CUSTOMER_APPROVED'],
  ['/customer/photos', 'CUSTOMER_APPROVED'],
  ['/customer/reschedule', 'CUSTOMER_APPROVED'],
  ['/customer/invoices', 'CUSTOMER_APPROVED'],
  ['/customer/account', 'CUSTOMER_APPROVED'],
  ['/cleaner/today', 'CLEANER'],
  [`/cleaner/jobs/${JOB}`, 'CLEANER'],
  [`/cleaner/jobs/${JOB}/complete`, 'CLEANER'],
  [`/cleaner/jobs/${JOB}/vnp`, 'CLEANER'],
  ['/cleaner/schedule', 'CLEANER'],
  ['/cleaner/customers', 'CLEANER'],
  ['/cleaner/targets', 'CLEANER'],
  ['/admin/dashboard', 'ADMIN'],
  ['/admin/customers', 'ADMIN'],
  ['/admin/cleaners', 'ADMIN'],
  ['/admin/packages', 'ADMIN'],
  ['/admin/schedules', 'ADMIN'],
  ['/admin/payments', 'ADMIN'],
  ['/admin/photos', 'ADMIN'],
  ['/admin/audit-log', 'ADMIN'],
  ['/forbidden', 'CUSTOMER_APPROVED'],
  ['/no-such-page', 'CUSTOMER_APPROVED'],
];

describe('every screen renders without errors', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error');
  });
  afterEach(() => consoleError.mockRestore());

  it.each(SCREENS)('%s', async (path, as) => {
    const { router } = await renderApp(path, as ? { as } : {});
    // Wait for the lazy page and its data to settle (no loading spinners left).
    await waitFor(() => expect(document.querySelector('main, [role="dialog"], form, h1')).not.toBeNull(), { timeout: 5000 });
    await waitFor(() => expect(screen.queryAllByRole('status', { name: /loading/i })).toHaveLength(0), { timeout: 5000 });
    expect(screen.queryByText('Something went wrong')).toBeNull();
    // Signed-in users must land on the screen itself, not be bounced elsewhere.
    if (as) expect(router.state.location.pathname).toBe(path);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
