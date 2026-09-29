import type { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError, ok } from '../../utils/http.js';
import { connectMaster } from '../../db/master.js';
import { resolveRange } from '../../utils/dates.js';
import { computeTotals } from '../../utils/report.js';
import { buildCsv } from '../../utils/exporters/csv.js';
import { buildXlsx } from '../../utils/exporters/xlsx.js';
import { buildPdf } from '../../utils/exporters/pdf.js';
import { buildReport, defaultGroupBy, type ReportType } from './reports.service.js';

const VALID_TYPES: ReportType[] = ['sales', 'expenses', 'fuel', 'stock', 'customers', 'shifts', 'profit'];

export function parseType(value: string): ReportType {
  const type = value as ReportType;
  if (!VALID_TYPES.includes(type)) throw ApiError.badRequest(`Unknown report type "${value}".`);
  return type;
}

interface PrepareInput {
  tenant: NonNullable<Express.Request['tenant']>;
  auth: NonNullable<Express.Request['auth']>;
  query: Record<string, unknown>;
  params: Record<string, string>;
}

async function prepare(req: PrepareInput) {
  const type = parseType(String(req.params.type ?? ''));
  const range = resolveRange(
    req.query.range as string | undefined,
    req.query.from as string | undefined,
    req.query.to as string | undefined,
  );
  const groupBy = (req.query.groupBy as string) || defaultGroupBy(range.key);

  const { Pump } = await connectMaster();
  const pump = await Pump.findById(req.auth.pumpId).lean();

  const built = await buildReport(type, req.tenant, {
    pumpName: pump?.name ?? req.auth.pumpName,
    pumpAddress: pump?.address || undefined,
    range,
  }, groupBy);

  const totals = computeTotals(built.table, type === 'profit' ? '' : 'TOTAL');
  return { type, range, groupBy, built, totals };
}

export const getReport = asyncHandler(async (req, res) => {
  const { type, range, groupBy, built, totals } = await prepare(req as never);
  res.json(
    ok({
      type,
      title: built.table.title,
      range: { key: range.key, label: range.label, from: range.from, to: range.to },
      groupBy,
      columns: built.table.columns,
      rows: built.table.rows,
      summary: built.summary,
      totals,
      note: built.table.note ?? null,
      pumpName: built.table.pumpName,
      generatedAt: built.table.generatedAt,
    }),
  );
});

function safeFilename(part: string): string {
  return part.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Real file generation - CSV / XLSX / PDF - from live database data.
 */
export const exportReport = asyncHandler(async (req, res: Response) => {
  const format = String(req.query.format || 'csv').toLowerCase() as 'csv' | 'xlsx' | 'pdf';
  if (!['csv', 'xlsx', 'pdf'].includes(format)) {
    throw ApiError.badRequest('Unsupported export format. Use csv, xlsx or pdf.');
  }

  const { type, built, totals } = await prepare(req as never);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = safeFilename(`BK-${type}-report-${stamp}`);

  if (format === 'csv') {
    const csv = buildCsv(built.table, totals);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
    return res.send(csv);
  }

  if (format === 'xlsx') {
    const buffer = await buildXlsx(built.table, totals);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.xlsx"`);
    res.setHeader('Content-Length', String(buffer.length));
    return res.end(buffer);
  }

  const buffer = await buildPdf(built.table, totals);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${base}.pdf"`);
  res.setHeader('Content-Length', String(buffer.length));
  return res.end(buffer);
});

export const reportTypes = asyncHandler(async (_req, res) => {
  res.json(
    ok([
      { key: 'sales', label: 'Sales Report', description: 'Revenue, liters, payment methods and estimated profit' },
      { key: 'expenses', label: 'Expense Report', description: 'Expenses by category, date and payment method' },
      { key: 'fuel', label: 'Fuel Report', description: 'Fuel-wise sales, purchases and current stock' },
      { key: 'stock', label: 'Stock Report', description: 'Opening, purchases, sales, adjustments and closing' },
      { key: 'customers', label: 'Customer Credit Report', description: 'Credit sales, payments and outstanding balances' },
      { key: 'shifts', label: 'Shift Report', description: 'Cashier shifts with expected vs actual cash' },
      { key: 'profit', label: 'Profit & Loss Summary', description: 'Revenue, fuel cost, expenses and estimated net profit' },
    ]),
  );
});
