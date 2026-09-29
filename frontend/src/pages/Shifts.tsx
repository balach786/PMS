import { useMemo, useState } from 'react';
import { Play, Square, Clock, Eye, ArrowRight } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Pagination,
  StatusBadge,
  TableSkeleton,
} from '../components/ui';
import { ExportMenu } from '../components/ExportMenu';
import { useApi } from '../lib/useApi';
import { useQueryAction, useQueryScroll, useQueryValue } from '../lib/useQueryParams';
import { http, toErrorMessage } from '../lib/api';
import { currency, dateTime, liters, number } from '../lib/format';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import type { Shift } from '../lib/types';

interface ShiftResponse {
  items: Shift[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface ShiftDetail extends Shift {
  byFuel: Array<{ fuelName: string; liters: number; revenue: number }>;
  sales: Array<{ _id: string; invoiceNumber: string; fuelName: string; quantity: number; total: number; paymentMethod: string }>;
  expenseLines: Array<{ _id: string; category: string; amount: number; description?: string }>;
  expectedCash?: number;
  totalSales?: number;
  totalLiters?: number;
  cashSales?: number;
}

export default function Shifts() {
  const { user, can } = useAuth();
  const toast = useToast();
  const [page, setPage] = useState(1);

  const { data: current, loading: currentLoading, reload: reloadCurrent } = useApi<Shift | null>(
    () => http.get<Shift | null>('/shifts/current'),
    [],
  );

  const { data: shifts, loading, error, reload } = useApi<ShiftResponse>(
    () => http.get<ShiftResponse>('/shifts', { page, limit: 20 }),
    [page],
  );

  useQueryScroll('tab');

  const [openModal, setOpenModal] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openingCash, setOpeningCash] = useState('');
  const [openingMeter, setOpeningMeter] = useState('');

  const [closeShift, setCloseShift] = useState<Shift | null>(null);
  const [closing, setClosing] = useState(false);
  const [actualCash, setActualCash] = useState('');
  const [closingMeter, setClosingMeter] = useState('');
  const [closeNotes, setCloseNotes] = useState('');

  const [detailId, setDetailId] = useState<string | null>(null);
  const { data: detail, loading: detailLoading } = useApi<ShiftDetail>(
    () => http.get<ShiftDetail>(`/shifts/${detailId}`),
    [detailId],
    { enabled: Boolean(detailId) },
  );

  const reloadAll = () => {
    reload();
    reloadCurrent();
  };

  const isCashier = user?.role === 'cashier';
  const canClose = (shift: Shift) =>
    isCashier ? String(shift.userId) === String(user?.id) : can('manageAllShifts');

  async function submitOpen() {
    const cash = Number(openingCash);
    if (!Number.isFinite(cash) || cash < 0) {
      toast.error('Enter a valid opening cash amount.');
      return;
    }
    setOpening(true);
    try {
      const shift = await http.post<Shift>('/shifts/open', {
        openingCash: cash,
        openingMeter: Number(openingMeter) || 0,
      });
      toast.success(`Shift ${shift.shiftNumber} opened.`);
      setOpenModal(false);
      setOpeningCash('');
      setOpeningMeter('');
      reloadAll();
    } catch (err) {
      toast.error(toErrorMessage(err, 'Could not open the shift.'));
    } finally {
      setOpening(false);
    }
  }

  async function submitClose() {
    if (!closeShift) return;
    const cash = Number(actualCash);
    if (!Number.isFinite(cash) || cash < 0) {
      toast.error('Enter the actual cash counted.');
      return;
    }
    setClosing(true);
    try {
      const closed = await http.post<Shift>(`/shifts/${closeShift._id}/close`, {
        actualCash: cash,
        closingMeter: closingMeter ? Number(closingMeter) : undefined,
        notes: closeNotes || undefined,
      });
      const diff = closed.difference ?? 0;
      toast.success(
        `Shift closed. Expected ${currency(closed.expectedCash ?? 0)}, actual ${currency(closed.actualCash ?? 0)} → difference ${currency(diff)}`,
      );
      setCloseShift(null);
      setActualCash('');
      setClosingMeter('');
      setCloseNotes('');
      reloadAll();
    } catch (err) {
      toast.error(toErrorMessage(err, 'Could not close the shift.'));
    } finally {
      setClosing(false);
    }
  }

  const expectedNow = useMemo(() => {
    if (!current) return 0;
    return (current.openingCash ?? 0) + (current.cashSales ?? 0) - (current.expenses ?? 0);
  }, [current]);

  return (
    <>
      {/* Current shift */}
      <Card className="mb-4 overflow-hidden">
        <CardHeader
          title="Current shift"
          subtitle={current ? `${current.userName ?? user?.name} · opened ${dateTime(current.openedAt)}` : 'No shift is open right now'}
          action={
            current ? (
              <StatusBadge status="open" />
            ) : (
              <Button size="sm" onClick={() => setOpenModal(true)}>
                <Play className="h-4 w-4" /> Open shift
              </Button>
            )
          }
        />

        {currentLoading ? (
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-16 w-full" />
            ))}
          </div>
        ) : current ? (
          <div>
            <div className="grid grid-cols-2 gap-4 border-b border-ink-200/70 p-5 sm:grid-cols-4">
              <MiniStat label="Opening cash" value={currency(current.openingCash)} />
              <MiniStat label="Total sales" value={currency(current.totalSales ?? 0)} />
              <MiniStat label="Liters sold" value={liters(current.totalLiters ?? 0)} />
              <MiniStat label="Cash sales" value={currency(current.cashSales ?? 0)} />
              <MiniStat label="Credit sales" value={currency(current.creditSales ?? 0)} />
              <MiniStat label="Expenses" value={currency(current.expenses ?? 0)} />
              <MiniStat label="Expected cash" value={currency(expectedNow)} strong />
              <MiniStat label="Transactions" value={number(current.saleCount ?? 0)} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <p className="text-xs text-ink-500">
                Expected cash = opening cash + cash sales − cash expenses. Close the shift by counting the
                cash drawer and entering the actual amount.
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setDetailId(current._id)}>
                  <Eye className="h-4 w-4" /> View
                </Button>
                {canClose(current) && (
                  <Button size="sm" onClick={() => setCloseShift(current)}>
                    <Square className="h-4 w-4" /> Close shift
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState
            title="No open shift"
            message="Open a shift with the starting cash in the drawer to start recording sales."
            icon={<Clock className="h-7 w-7" />}
            action={
              <Button onClick={() => setOpenModal(true)}>
                <Play className="h-4 w-4" /> Open shift
              </Button>
            }
          />
        )}
      </Card>

      {/* History */}
      <Card id="history" className="overflow-hidden">
        <CardHeader
          title="Shift history"
          subtitle="Closed shifts with expected vs actual cash"
          action={<ExportMenu reportType="shifts" params={{ range: 'this_month' }} label="Export shifts" />}
        />

        {error ? (
          <ErrorState message={error} onRetry={reloadAll} />
        ) : loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : (shifts?.items ?? []).length ? (
          <>
            <div className="table-wrap">
              <table className="w-full min-w-[820px]">
                <thead className="bg-ink-50">
                  <tr>
                    <th className="th">Shift</th>
                    <th className="th">Cashier</th>
                    <th className="th">Opened</th>
                    <th className="th">Closed</th>
                    <th className="th text-right">Sales</th>
                    <th className="th text-right">Liters</th>
                    <th className="th text-right">Expected</th>
                    <th className="th text-right">Actual</th>
                    <th className="th text-right">Difference</th>
                    <th className="th">Status</th>
                    <th className="th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {shifts!.items.map((s) => (
                    <tr key={s._id} className="transition hover:bg-ink-50/60">
                      <td className="td font-mono text-xs">{s.shiftNumber}</td>
                      <td className="td">{s.userName}</td>
                      <td className="td text-xs">{dateTime(s.openedAt)}</td>
                      <td className="td text-xs">{s.closedAt ? dateTime(s.closedAt) : '—'}</td>
                      <td className="td text-right">{currency(s.totalSales ?? 0)}</td>
                      <td className="td text-right">{number(s.totalLiters ?? 0, 2)}</td>
                      <td className="td text-right">{currency(s.expectedCash ?? 0)}</td>
                      <td className="td text-right">{currency(s.actualCash ?? 0)}</td>
                      <td className="td text-right">
                        {s.difference === null || s.difference === undefined ? (
                          '—'
                        ) : (
                          <span className={s.difference === 0 ? 'text-ink-500' : s.difference > 0 ? 'text-lime-600' : 'text-red-600'}>
                            {currency(s.difference)}
                          </span>
                        )}
                      </td>
                      <td className="td"><StatusBadge status={s.status} /></td>
                      <td className="td text-right">
                        <button
                          onClick={() => setDetailId(s._id)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-navy-700 transition hover:bg-navy-50"
                        >
                          Details <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={shifts?.meta.page ?? 1}
              totalPages={shifts?.meta.totalPages ?? 1}
              total={shifts?.meta.total ?? 0}
              limit={20}
              onPage={setPage}
            />
          </>
        ) : (
          <EmptyState title="No shifts yet" message="Closed shifts will be listed here." />
        )}
      </Card>

      {/* Open shift modal */}
      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        title="Open a new shift"
        description="Enter the cash you are starting with in the drawer."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpenModal(false)} disabled={opening}>
              Cancel
            </Button>
            <Button onClick={submitOpen} loading={opening}>
              Open shift
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Opening cash (Rs.)" required>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Opening meter reading" hint="Optional — totalizer reading at the start of the shift">
            <Input
              type="number"
              min="0"
              step="0.001"
              value={openingMeter}
              onChange={(e) => setOpeningMeter(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
      </Modal>

      {/* Close shift modal */}
      <Modal
        open={Boolean(closeShift)}
        onClose={() => setCloseShift(null)}
        title={`Close shift ${closeShift?.shiftNumber ?? ''}`}
        description="Count the cash drawer and enter the actual amount."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCloseShift(null)} disabled={closing}>
              Cancel
            </Button>
            <Button onClick={submitClose} loading={closing}>
              Close shift
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-navy-100 bg-navy-50 p-4 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-ink-600">Opening cash</span>
              <span className="font-semibold text-navy-800">{currency(closeShift?.openingCash ?? 0)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-ink-600">Cash sales</span>
              <span className="font-semibold text-navy-800">{currency(closeShift?.cashSales ?? 0)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-ink-600">Cash expenses</span>
              <span className="font-semibold text-navy-800">− {currency(closeShift?.expenses ?? 0)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-navy-200 pt-2">
              <span className="font-semibold text-navy-800">Expected cash</span>
              <span className="font-bold text-navy-900">
                {currency((closeShift?.openingCash ?? 0) + (closeShift?.cashSales ?? 0) - (closeShift?.expenses ?? 0))}
              </span>
            </div>
          </div>

          <Field label="Actual cash counted (Rs.)" required>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={actualCash}
              onChange={(e) => setActualCash(e.target.value)}
              placeholder="0.00"
            />
          </Field>
          <Field label="Closing meter reading">
            <Input
              type="number"
              min="0"
              step="0.001"
              value={closingMeter}
              onChange={(e) => setClosingMeter(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Notes">
            <Input value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
      </Modal>

      {/* Shift detail */}
      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title={`Shift ${detail?.shiftNumber ?? ''}`}
        description={detail ? `${detail.userName} · ${dateTime(detail.openedAt)}` : undefined}
        size="lg"
      >
        {detailLoading || !detail ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Sales" value={currency(detail.totalSales ?? 0)} />
              <MiniStat label="Liters" value={liters(detail.totalLiters ?? 0)} />
              <MiniStat label="Cash" value={currency(detail.cashSales ?? 0)} />
              <MiniStat label="Credit" value={currency(detail.creditSales ?? 0)} />
              <MiniStat label="Expenses" value={currency(detail.expenses ?? 0)} />
              <MiniStat label="Expected" value={currency(detail.expectedCash ?? 0)} strong />
              <MiniStat label="Actual" value={currency(detail.actualCash ?? 0)} strong />
              <MiniStat
                label="Difference"
                value={currency(detail.difference ?? 0)}
                strong
                tone={detail.difference === 0 ? 'neutral' : (detail.difference ?? 0) > 0 ? 'good' : 'bad'}
              />
            </div>

            {detail.byFuel?.length ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Fuel breakup</p>
                <ul className="space-y-1.5">
                  {detail.byFuel.map((f) => (
                    <li key={f.fuelName} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-sm">
                      <span className="font-medium text-navy-800">{f.fuelName}</span>
                      <span className="text-ink-600">
                        {liters(f.liters)} · <strong className="text-navy-800">{currency(f.revenue)}</strong>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {detail.expenseLines?.length ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Expenses this shift</p>
                <ul className="space-y-1.5">
                  {detail.expenseLines.map((e) => (
                    <li key={e._id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-sm">
                      <span className="text-ink-700">
                        {e.category}
                        {e.description ? <span className="text-ink-400"> · {e.description}</span> : null}
                      </span>
                      <span className="font-semibold text-red-600">{currency(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {detail.sales?.length ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                  Sales ({detail.sales.length})
                </p>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-ink-200/70">
                  <table className="w-full">
                    <thead className="sticky top-0 bg-ink-50">
                      <tr>
                        <th className="th">Invoice</th>
                        <th className="th">Fuel</th>
                        <th className="th text-right">Liters</th>
                        <th className="th text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {detail.sales.map((s) => (
                        <tr key={s._id}>
                          <td className="td font-mono text-xs">{s.invoiceNumber}</td>
                          <td className="td">{s.fuelName}</td>
                          <td className="td text-right">{number(s.quantity, 2)}</td>
                          <td className="td text-right font-semibold">{currency(s.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-500">No sales recorded in this shift.</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

function MiniStat({
  label,
  value,
  strong,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'neutral' | 'good' | 'bad';
}) {
  const toneClass = tone === 'good' ? 'text-lime-600' : tone === 'bad' ? 'text-red-600' : 'text-navy-800';
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className={`mt-0.5 ${strong ? 'text-lg font-bold' : 'text-base font-semibold'} ${toneClass}`}>{value}</p>
    </div>
  );
}
