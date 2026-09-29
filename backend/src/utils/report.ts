export type ColumnType = 'text' | 'number' | 'money' | 'date' | 'datetime';

export interface ReportColumn {
  key: string;
  header: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
  type?: ColumnType;
  /** include this column in the totals row (numeric columns only) */
  total?: boolean;
}

export interface ReportSummaryItem {
  label: string;
  value: string;
}

export interface ReportTable {
  title: string;
  pumpName: string;
  pumpAddress?: string;
  rangeLabel: string;
  generatedAt: Date;
  columns: ReportColumn[];
  rows: Array<Record<string, unknown>>;
  summary?: ReportSummaryItem[];
  totalsLabel?: string;
  /** Extra note rendered under the table (e.g. "Profit figures are estimates") */
  note?: string;
}

export function formatCell(value: unknown, type: ColumnType = 'text'): string {
  if (value === null || value === undefined || value === '') return '';
  switch (type) {
    case 'money':
    case 'number': {
      const n = Number(value);
      if (!Number.isFinite(n)) return String(value);
      return n.toLocaleString('en-US', { minimumFractionDigits: type === 'money' ? 2 : 0, maximumFractionDigits: type === 'money' ? 2 : 3 });
    }
    case 'date': {
      const d = new Date(value as string);
      if (Number.isNaN(d.getTime())) return String(value);
      return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`;
    }
    case 'datetime': {
      const d = new Date(value as string);
      if (Number.isNaN(d.getTime())) return String(value);
      return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-US', {
        month: 'short',
      })} ${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    default:
      return String(value);
  }
}

/** Build a totals object for columns flagged with `total: true`. */
export function computeTotals(table: Pick<ReportTable, 'columns' | 'rows'>, totalsLabel = 'TOTAL'): Record<string, unknown> | null {
  const totalCols = table.columns.filter((c) => c.total);
  if (!totalCols.length || !table.rows.length) return null;
  const out: Record<string, unknown> = {};
  const firstCol = table.columns[0];
  out[firstCol.key] = totalsLabel;
  for (const col of totalCols) {
    out[col.key] = table.rows.reduce((sum, row) => {
      const n = Number(row[col.key]);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);
  }
  return out;
}
