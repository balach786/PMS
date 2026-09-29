import { useParams, Link } from 'react-router-dom';
import { Printer, ArrowLeft } from 'lucide-react';
import { Button, Card, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { Logo } from '../components/Logo';
import { useApi } from '../lib/useApi';
import { http } from '../lib/api';
import { currency, dateTime, number, paymentLabel } from '../lib/format';

interface ReceiptData {
  pump: { name: string; address: string; phone: string; ownerName: string };
  sale: {
    invoiceNumber: string;
    date: string;
    fuelName: string;
    quantity: number;
    rate: number;
    total: number;
    paymentMethod: string;
    customerName: string | null;
    cashier: string;
    notes: string;
    status: string;
  };
  printedAt: string;
}

export default function Receipt() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useApi<ReceiptData>(() => http.get<ReceiptData>(`/sales/${id}/receipt`), [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card><ErrorState message={error} onRetry={reload} /></Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card><EmptyState title="Receipt not found" /></Card>
      </div>
    );
  }

  const { pump, sale } = data;

  return (
    <div className="min-h-screen bg-ink-100 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-md flex-wrap items-center justify-between gap-3 px-4">
        <Link to="/app/sales" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-navy-700">
          <ArrowLeft className="h-4 w-4" /> Back to sales
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print receipt
        </Button>
      </div>

      <div className="print-area mx-auto max-w-md bg-white p-7 font-mono text-[13px] shadow-card print:max-w-none print:shadow-none">
        <div className="flex items-start justify-between border-b border-dashed border-ink-300 pb-4">
          <div className="flex items-center gap-3">
            <Logo className="h-11 w-11" />
            <div className="font-sans">
              <p className="text-base font-bold leading-tight text-navy-900">{pump.name}</p>
              <p className="text-[11px] uppercase tracking-wider text-gold-600">BK Petrol Pump Manager</p>
            </div>
          </div>
        </div>

        <div className="py-4 text-center">
          <p className="font-sans text-sm font-bold uppercase tracking-widest text-navy-900">
            {sale.status === 'voided' ? 'Voided Sale Receipt' : 'Sale Receipt'}
          </p>
          <p className="mt-1 text-xs text-ink-500">{sale.invoiceNumber}</p>
        </div>

        <dl className="space-y-1.5 border-t border-dashed border-ink-300 pt-4 text-xs">
          <Line label="Date" value={dateTime(sale.date)} />
          <Line label="Cashier" value={sale.cashier} />
          <Line label="Payment" value={paymentLabel(sale.paymentMethod)} />
          {sale.customerName && <Line label="Customer" value={sale.customerName} />}
        </dl>

        <div className="mt-4 border-t border-dashed border-ink-300 pt-4">
          <div className="flex items-center justify-between py-1 text-[11px] font-bold uppercase tracking-wide text-ink-500">
            <span className="w-1/3">Item</span>
            <span className="w-1/4 text-right">Qty</span>
            <span className="w-1/4 text-right">Rate</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="w-1/3 font-semibold text-navy-900">{sale.fuelName}</span>
            <span className="w-1/4 text-right">{number(sale.quantity, 3)} L</span>
            <span className="w-1/4 text-right">{currency(sale.rate)}</span>
          </div>
        </div>

        <div className="mt-3 border-t border-dashed border-ink-300 pt-3">
          <div className="flex items-center justify-between py-1">
            <span className="text-ink-500">Subtotal</span>
            <span className="font-semibold">{currency(sale.total)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-ink-300 pt-2">
            <span className="font-bold uppercase">Total</span>
            <span className="text-lg font-bold text-navy-900">{currency(sale.total)}</span>
          </div>
        </div>

        {sale.notes && (
          <p className="mt-4 border-t border-dashed border-ink-300 pt-3 text-xs text-ink-500">Note: {sale.notes}</p>
        )}

        <div className="mt-6 space-y-1 border-t border-dashed border-ink-300 pt-4 text-center text-[11px] text-ink-400">
          {pump.address && <p>{pump.address}</p>}
          {pump.phone && <p>Tel: {pump.phone}</p>}
          <p className="pt-2">Thank you for your visit — drive safely.</p>
          <p className="pt-1">Printed {dateTime(data.printedAt)}</p>
        </div>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-500">{label}</dt>
      <dd className="font-semibold text-navy-900">{value}</dd>
    </div>
  );
}
