import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CreditCard, Landmark, Smartphone, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { FormField } from '@/components/forms';
import { MockPaymentNotice } from '@/components/shared';
import { Alert, Button, Input, Modal } from '@/components/ui';
import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS } from '@/constants';
import { qk } from '@/hooks/queryKeys';
import { paymentSchema, type PaymentValues } from '@/schemas';
import { useServices } from '@/services';
import type { Invoice, Payment, PaymentMethod } from '@/types';
import { cn } from '@/utils/cn';
import { getErrorMessage } from '@/utils/errors';
import { formatCycle, formatINR } from '@/utils/formatters';
import { amountDue } from '@/utils/invoiceCalculator';

const METHOD_ICON: Partial<Record<PaymentMethod, typeof Smartphone>> = { UPI: Smartphone, CARD: CreditCard, NET_BANKING: Landmark };

/**
 * "Pay now" — Phase 1 simulated checkout (rule 9). Reviewers choose the outcome
 * with "Simulate success" / "Simulate failure". In Phase 5 Razorpay's checkout
 * replaces the method step; the result screens stay as they are.
 */
export function PaymentModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const services = useServices();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<Payment | null>(null);
  const amount = amountDue(invoice);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<PaymentValues>({ resolver: zodResolver(paymentSchema), defaultValues: { method: 'UPI', upiId: '' } });
  const method = useWatch({ control, name: 'method' });

  const mutation = useMutation({
    mutationFn: (v: PaymentValues & { outcome: 'SUCCESS' | 'FAILURE' }) =>
      services.payments.payInvoice({ invoiceId: invoice.id, method: v.method, upiId: v.upiId, mockOutcome: v.outcome }),
    onSuccess: async (payment) => {
      setResult(payment);
      await queryClient.invalidateQueries({ queryKey: qk.payments.all });
    },
  });
  const pay = (outcome: 'SUCCESS' | 'FAILURE') => handleSubmit((v) => mutation.mutate({ ...v, outcome }));

  if (result) {
    const ok = result.status === 'SUCCESS';
    return (
      <Modal
        open
        onClose={onClose}
        title={ok ? 'Payment successful (simulated)' : 'Payment failed (simulated)'}
        size="sm"
        footer={
          ok ? (
            <Button block size="lg" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="lg" onClick={onClose}>
                Close
              </Button>
              <Button
                size="lg"
                onClick={() => {
                  setResult(null);
                  mutation.reset();
                }}
              >
                Try again
              </Button>
            </>
          )
        }
      >
        <div className="flex flex-col items-center py-2 text-center">
          <div className={cn('mb-3 flex h-14 w-14 items-center justify-center rounded-full', ok ? 'bg-success-50 text-success' : 'bg-danger-50 text-danger')}>
            {ok ? <CheckCircle2 className="h-8 w-8" aria-hidden /> : <XCircle className="h-8 w-8" aria-hidden />}
          </div>
          <p className="text-2xl font-semibold tabular-nums text-navy-900">{formatINR(result.amount)}</p>
          <p className="mt-1 text-sm text-navy-500">
            {formatCycle(invoice.cycle)} · {invoice.number}
          </p>
          {!ok && result.failureReason && <p className="mt-3 text-sm text-danger-700">{result.failureReason}</p>}
          <p className="mt-3 font-mono text-xs text-navy-400">Ref {result.reference}</p>
          <div className="mt-4 w-full text-left">
            <MockPaymentNotice />
          </div>
        </div>
      </Modal>
    );
  }

  const isMock = services.dataSource === 'mock';
  return (
    <Modal
      open
      onClose={onClose}
      busy={mutation.isPending}
      title={`Pay ${formatINR(amount)}`}
      description={`${formatCycle(invoice.cycle)} · ${invoice.number}`}
      footer={
        isMock ? (
          <>
            <Button variant="secondary" size="lg" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button variant="danger" size="lg" disabled={mutation.isPending} loading={mutation.isPending && mutation.variables.outcome === 'FAILURE'} onClick={() => void pay('FAILURE')()}>
              Simulate failure
            </Button>
            <Button variant="success" size="lg" disabled={mutation.isPending} loading={mutation.isPending && mutation.variables.outcome === 'SUCCESS'} onClick={() => void pay('SUCCESS')()}>
              Simulate success
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" size="lg" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button size="lg" loading={mutation.isPending} onClick={() => void pay('SUCCESS')()}>
              Pay {formatINR(amount)}
            </Button>
          </>
        )
      }
    >
      <form noValidate onSubmit={(e) => e.preventDefault()} className="space-y-4">
        <MockPaymentNotice />
        {mutation.isError && <Alert tone="danger">{getErrorMessage(mutation.error)}</Alert>}
        <fieldset disabled={mutation.isPending}>
          <legend className="mb-2 text-sm font-medium text-navy-800">Payment method</legend>
          <div className="space-y-2">
            {PAYMENT_METHODS.map((m) => {
              const Icon = METHOD_ICON[m] ?? Smartphone;
              return (
                <label key={m} className={cn('flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg p-3 ring-1 ring-inset', method === m ? 'bg-brand-50 ring-brand' : 'ring-navy-200 hover:bg-navy-50')}>
                  <input type="radio" value={m} className="h-4 w-4 accent-brand" {...register('method')} />
                  <Icon className="h-4 w-4 text-navy-500" aria-hidden />
                  <span className="text-sm font-medium text-navy-900">{PAYMENT_METHOD_LABEL[m]}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {method === 'UPI' ? (
          <FormField label="UPI ID" error={errors.upiId?.message} required>
            {(p) => <Input id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} placeholder="name@okbank" autoComplete="off" disabled={mutation.isPending} {...register('upiId')} />}
          </FormField>
        ) : (
          <p className="text-xs text-navy-500">In the live app you’ll finish this in the secure Razorpay window. CarCare never stores card details.</p>
        )}
      </form>
    </Modal>
  );
}
