import type { ReportTable } from '../report.js';
import { formatCell } from '../report.js';

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Builds a CSV with a small header block (pump / report title / date range)
 * followed by the tabular data and a totals row.
 */
export function buildCsv(table: ReportTable, totals?: Record<string, unknown> | null): string {
  const lines: string[] = [];

  lines.push([escapeCsv(table.pumpName)].join(','));
  if (table.pumpAddress) lines.push(escapeCsv(table.pumpAddress));
  lines.push(escapeCsv(table.title));
  lines.push(escapeCsv(`Date range: ${table.rangeLabel}`));
  lines.push(escapeCsv(`Generated: ${formatCell(table.generatedAt, 'datetime')}`));
  lines.push('');

  if (table.summary?.length) {
    for (const item of table.summary) {
      lines.push(`${escapeCsv(item.label)},${escapeCsv(item.value)}`);
    }
    lines.push('');
  }

  lines.push(table.columns.map((c) => escapeCsv(c.header)).join(','));

  for (const row of table.rows) {
    lines.push(
      table.columns.map((c) => escapeCsv(formatCell(row[c.key], c.type ?? 'text'))).join(','),
    );
  }

  if (totals) {
    lines.push(
      table.columns
        .map((c) => escapeCsv(totals[c.key] === undefined ? '' : formatCell(totals[c.key], c.type ?? 'text')))
        .join(','),
    );
  }

  if (table.note) {
    lines.push('');
    lines.push(escapeCsv(table.note));
  }

  // BOM so Excel opens UTF-8 correctly
  return `﻿${lines.join('\r\n')}`;
}
