import { describe, expect, it } from 'vitest';
import { registrationSchema } from '@/schemas';
import { invoiceStatusFor, outstandingBalance } from '@/utils/invoiceCalculator';
import { normalisePhone, normaliseRegistration } from '@/utils/normalisers';
import { assertRecordable, canRecord } from '@/utils/washCompletionRules';

describe('invoices', () => {
  it('derives status from payment and due date', () => {
    const inv = { amount: 999, amountPaid: 0, dueOn: '2026-11-10' };
    expect(invoiceStatusFor(inv, '2026-11-10')).toBe('DUE');
    expect(invoiceStatusFor(inv, '2026-11-11')).toBe('OVERDUE');
    expect(invoiceStatusFor({ ...inv, amountPaid: 999 }, '2026-12-01')).toBe('PAID');
  });

  it('sums outstanding balance', () => {
    expect(outstandingBalance([{ amount: 999, amountPaid: 0 }, { amount: 1499, amountPaid: 1499 }, { amount: 500, amountPaid: 200 }])).toBe(1299);
  });
});

describe('recording window', () => {
  it('allows recording a pending job only on its own day', () => {
    expect(canRecord({ status: 'PENDING', date: '2026-11-10' }, '2026-11-10')).toBe(true);
    expect(canRecord({ status: 'COMPLETED', date: '2026-11-10' }, '2026-11-10')).toBe(false);
    expect(canRecord({ status: 'PENDING', date: '2026-11-11' }, '2026-11-10')).toBe(false);
    expect(() => assertRecordable({ status: 'PENDING', date: '2026-11-09' }, '2026-11-10')).toThrow(/scheduled day/);
  });
});

describe('input normalisation', () => {
  it('normalises Indian registration formats', () => {
    expect(normaliseRegistration('tn09ab1234')).toBe('TN-09-AB-1234');
    expect(normaliseRegistration('TN 9 AB 34')).toBe('TN-09-AB-0034');
    expect(normaliseRegistration('22BH1234AA')).toBe('22-BH-1234-AA');
    expect(normaliseRegistration('hello')).toBeNull();
  });

  it('normalises phone numbers', () => {
    expect(normalisePhone('+91 98765 43210')).toBe('9876543210');
    expect(normalisePhone('098765 43210')).toBe('9876543210');
  });

  it('validates a registration with all four car-size classes', () => {
    for (const carSize of ['HATCHBACK', 'SEDAN', 'COMPACT_SUV', 'LARGE_SUV']) {
      const r = registrationSchema.safeParse({
        name: 'Test Owner',
        phone: '98765 43210',
        registration: 'tn10cd5678',
        makeModel: 'Honda City',
        carSize,
        block: 'B',
        flat: '1204',
        parkingSlot: 'b1-b-045',
        password: 'secret123',
      });
      expect(r.success, carSize).toBe(true);
    }
    expect(registrationSchema.safeParse({ carSize: 'SUV' }).success).toBe(false);
  });
});
