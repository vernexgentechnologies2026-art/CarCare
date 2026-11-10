import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../renderApp';

describe('production hygiene: VITE_ENABLE_DEV_TOOLS=false', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('hides the Dev Role Switcher on every kind of screen', async () => {
    vi.stubEnv('VITE_ENABLE_DEV_TOOLS', 'false');
    for (const [path, as] of [['/login', undefined], ['/customer/dashboard', 'CUSTOMER_APPROVED'], ['/admin/dashboard', 'ADMIN']] as const) {
      const { unmount } = await renderApp(path, as ? { as } : {});
      await screen.findAllByRole('heading');
      expect(screen.queryByRole('region', { name: /developer tools/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /reset mock database/i })).toBeNull();
      unmount();
    }
  });

  it('shows it when the flag is true (review builds)', async () => {
    vi.stubEnv('VITE_ENABLE_DEV_TOOLS', 'true');
    await renderApp('/login');
    expect(await screen.findByRole('region', { name: /developer tools/i })).toBeInTheDocument();
  });
});
