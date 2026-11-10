import { Receipt } from 'lucide-react';
import { EmptyState } from '@/components/feedback';
import { InvoiceStatusBadge } from '@/components/shared';
import { Button } from '@/components/ui';
import type { Invoice } from '@/types';
import { formatCycle, formatDate, formatINR } from '@/utils/formatters';
import { amountDue } from '@/utils/invoiceCalculator';

/** Invoice history: ID, billing period, amount, status, and Pay Now for unpaid rows. */
export function InvoiceTable({ invoices, onPay }: { invoices: Invoice[]; onPay: (invoice: Invoice) => void }) {
  if (invoices.length === 0) return <EmptyState title="No invoices yet" icon={<Receipt className="h-6 w-6" />} />;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <caption className="sr-only">Invoice history</caption>
        <thead>
          <tr className="border-b border-navy-100 bg-navy-50/70 text-left text-xs font-medium uppercase tracking-wide text-navy-500">
            <th scope="col" className="px-4 py-2">Invoice</th>
            <th scope="col" className="px-2 py-2">Period</th>
            <th scope="col" className="px-2 py-2 text-right">Amount</th>
            <th scope="col" className="px-4 py-2 text-right">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-navy-100">
          {invoices.map((inv) => (
            <tr key={inv.id} className="align-top">
              <td className="px-4 py-3">
                <span className="block font-mono text-xs text-navy-800">{inv.number}</span>
                <span className="block text-xs text-navy-500">{inv.status === 'PAID' ? 'Paid' : `Due ${formatDate(inv.dueOn)}`}</span>
              </td>
              <td className="whitespace-nowrap px-2 py-3 text-navy-800">{formatCycle(inv.cycle)}</td>
              <td className="px-2 py-3 text-right font-semibold tabular-nums text-navy-900">{formatINR(inv.amount)}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex flex-col items-end gap-2">
                  <InvoiceStatusBadge status={inv.status} />
                  {inv.status !== 'PAID' && (
                    <Button size="sm" className="min-h-[36px]" onClick={() => onPay(inv)} aria-label={`Pay now ${formatINR(amountDue(inv))} for ${formatCycle(inv.cycle)}`}>
                      Pay now
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
