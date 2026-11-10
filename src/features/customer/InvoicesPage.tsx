import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorState } from '@/components/feedback';
import { MockPaymentNotice } from '@/components/shared';
import { Card, CardHeader, PageHeader, Pagination, SkeletonList } from '@/components/ui';
import { BalanceCard } from '@/features/payments/BalanceCard';
import { InvoiceTable } from '@/features/payments/InvoiceTable';
import { PaymentLedger } from '@/features/payments/PaymentLedger';
import { PaymentModal } from '@/features/payments/PaymentModal';
import { qk } from '@/hooks/queryKeys';
import { useServices } from '@/services';
import type { Invoice } from '@/types';
import { getErrorMessage } from '@/utils/errors';
import { useMyAccount } from './useMyAccount';

/** Outstanding balance, invoice history and the simulated "Pay now" flow. */
export function InvoicesPage() {
  const services = useServices();
  const { customerId } = useMyAccount();
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [invPage, setInvPage] = useState(1);
  const [payPage, setPayPage] = useState(1);
  const invQuery = { page: invPage, limit: 6 };
  const payQuery = { page: payPage, limit: 6 };

  const summary = useQuery({ queryKey: qk.payments.summary(customerId), queryFn: () => services.payments.getAccountSummary(customerId) });
  const invoices = useQuery({ queryKey: qk.payments.invoices(customerId, invQuery), queryFn: () => services.payments.listInvoices({ customerId, ...invQuery }), placeholderData: keepPreviousData });
  const history = useQuery({ queryKey: qk.payments.history(customerId, payQuery), queryFn: () => services.payments.listPayments({ customerId, ...payQuery }), placeholderData: keepPreviousData });

  return (
    <div className="space-y-4">
      <PageHeader title="Billing & invoices" />
      <BalanceCard summary={summary.data} loading={summary.isPending} />
      <MockPaymentNotice />

      <Card>
        <CardHeader title="Invoices" />
        {invoices.isPending ? (
          <div className="p-4">
            <SkeletonList rows={3} />
          </div>
        ) : invoices.isError ? (
          <ErrorState message={getErrorMessage(invoices.error)} onRetry={() => void invoices.refetch()} />
        ) : (
          <>
            <InvoiceTable invoices={invoices.data.items} onPay={setPaying} />
            {invoices.data.total > invoices.data.limit && <Pagination page={invoices.data.page} pageSize={invoices.data.limit} total={invoices.data.total} onPageChange={setInvPage} busy={invoices.isFetching} />}
          </>
        )}
      </Card>

      <Card>
        <CardHeader title="Payment history" description="All Phase 1 transactions are simulated." />
        {history.isPending ? (
          <div className="p-4">
            <SkeletonList rows={3} />
          </div>
        ) : history.isError ? (
          <ErrorState message={getErrorMessage(history.error)} onRetry={() => void history.refetch()} />
        ) : (
          <>
            <PaymentLedger payments={history.data.items} />
            {history.data.total > history.data.limit && <Pagination page={history.data.page} pageSize={history.data.limit} total={history.data.total} onPageChange={setPayPage} busy={history.isFetching} />}
          </>
        )}
      </Card>

      {paying && <PaymentModal invoice={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}
