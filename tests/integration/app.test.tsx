import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp, TEST_TODAY } from '../renderApp';

describe('routing & guards', () => {
  it('sends anonymous users to sign in', async () => {
    await renderApp('/admin/dashboard');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('blocks a resident from the admin area and a cleaner from resident screens', async () => {
    await renderApp('/admin/customers', { as: 'CUSTOMER_APPROVED' });
    expect(await screen.findByRole('heading', { name: /don’t have access/i })).toBeInTheDocument();
  });

  it('holds a pending resident on the approval-status screen', async () => {
    const { router } = await renderApp('/customer/dashboard', { as: 'CUSTOMER_PENDING' });
    expect(await screen.findByRole('heading', { name: /registration under review/i })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/customer/approval-status');
  });
});

describe('sign in', () => {
  it('shows an error for wrong credentials, then lands the resident on the dashboard', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/login');
    await user.type(await screen.findByLabelText(/mobile number/i), '9000001001');
    await user.type(screen.getByLabelText(/^password/i), 'nope');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByText(/incorrect/i)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/^password/i));
    await user.type(screen.getByLabelText(/^password/i), 'demo1234');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/customer/dashboard'));
    expect(await screen.findByRole('img', { name: /completed washes this month/i })).toBeInTheDocument();
  });
});

describe('cleaner flow', () => {
  it('keeps "Confirm Wash Completed" disabled until a compressed photo is attached', async () => {
    const user = userEvent.setup();
    const jobId = `veh_1_${TEST_TODAY}`;
    const { services, router } = await renderApp(`/cleaner/jobs/${jobId}/complete`, { as: 'CLEANER' });
    const confirm = await screen.findByRole('button', { name: /confirm wash completed/i });
    expect(confirm).toBeDisabled();
    await user.upload(screen.getByTestId('photo-input'), new File([new Uint8Array(114 * 1024)], 'after.jpg', { type: 'image/jpeg' }));
    expect(await screen.findByTestId('compressed-size')).toHaveTextContent('Compressed: 114 KB');
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    await waitFor(() => expect(router.state.location.pathname).toBe('/cleaner/today'));
    expect((await services.washes.getJob(jobId)).status).toBe('COMPLETED');
  });

  it('records Vehicle Not Present from the /vnp dialog without counting a wash', async () => {
    const user = userEvent.setup();
    const jobId = `veh_1_${TEST_TODAY}`;
    const { services } = await renderApp(`/cleaner/jobs/${jobId}/vnp`, { as: 'CLEANER' });
    const dialog = await screen.findByRole('dialog', { name: /mark vehicle not present/i });
    expect(within(dialog).getByText(/does not count as a wash/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /confirm not present/i }));
    await waitFor(async () => expect((await services.washes.getJob(jobId)).status).toBe('VEHICLE_NOT_PRESENT'));
  });

  it('shows the sticky "X / Y Completed" counter and filter chips', async () => {
    await renderApp('/cleaner/today', { as: 'CLEANER' });
    expect(await screen.findByText(/^0 \/ \d+ Completed$/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /vehicle not present/i })).toBeInTheDocument();
    expect((await screen.findAllByRole('link', { name: /call /i })).length).toBeGreaterThan(0);
  });
});

describe('resident flows', () => {
  it('gallery cards show the date only', async () => {
    await renderApp('/customer/photos', { as: 'CUSTOMER_APPROVED' });
    const cards = await screen.findAllByRole('button', { name: /open photo from/i });
    for (const card of cards) {
      expect(card.textContent).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/);
      expect(card.textContent).not.toMatch(/AM|PM|:\d\d/);
    }
    expect(screen.getByText(/earlier months/i)).toBeInTheDocument();
  });

  it('pays with explicit simulated outcomes, clearly labelled as mock', async () => {
    const user = userEvent.setup();
    await renderApp('/customer/invoices', { as: 'CUSTOMER_APPROVED' });
    const [payNow] = await screen.findAllByRole('button', { name: /^pay now/i });
    if (!payNow) throw new Error('expected a Pay now button');
    await user.click(payNow);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/simulated payments \(phase 1 mock\)/i)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/upi id/i), 'arjun@okbank');
    await user.click(within(dialog).getByRole('button', { name: /simulate failure/i }));
    expect(await screen.findByRole('heading', { name: /payment failed \(simulated\)/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    await user.click(await screen.findByRole('button', { name: /simulate success/i }));
    expect(await screen.findByRole('heading', { name: /payment successful \(simulated\)/i })).toBeInTheDocument();
  });
});

describe('dev role switcher', () => {
  it('switches personas, including the pending resident', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp('/customer/dashboard', { as: 'CUSTOMER_APPROVED' });
    const dock = await screen.findByRole('region', { name: /developer tools/i });
    await user.click(within(dock).getByRole('radio', { name: /^cleaner$/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/cleaner/today'));
    await user.click(within(dock).getByRole('radio', { name: /pending approval/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/customer/approval-status'), { timeout: 5000 });
    expect(within(dock).getByRole('button', { name: /reset mock database/i })).toBeInTheDocument();
  });
});

describe('admin', () => {
  it('reviews pending approvals in a tab with a count badge', async () => {
    await renderApp('/admin/customers?tab=pending', { as: 'ADMIN' });
    expect(await screen.findByRole('radio', { name: /pending approvals/i })).toHaveAttribute('aria-checked', 'true');
    expect((await screen.findAllByRole('button', { name: /^approve$/i })).length).toBeGreaterThan(0);
  });

  it('shows the master calendar on the schedules page', async () => {
    const user = userEvent.setup();
    await renderApp('/admin/schedules', { as: 'ADMIN' });
    await user.click(await screen.findByRole('radio', { name: /master calendar/i }));
    expect(await screen.findByRole('grid', { name: /washes in november 2026/i })).toBeInTheDocument();
  });
});
