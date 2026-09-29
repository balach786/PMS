const PKR = new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PKR0 = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });
const NUM3 = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 3 });

export function currency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'Rs. 0.00';
  return `Rs. ${PKR.format(value)}`;
}

export function currencyShort(value: number | null | undefined): string {
  if (!value) return 'Rs. 0';
  if (Math.abs(value) >= 10_000_000) return `Rs. ${(value / 10_000_000).toFixed(2)}Cr`;
  if (Math.abs(value) >= 100_000) return `Rs. ${(value / 100_000).toFixed(2)}L`;
  if (Math.abs(value) >= 1000) return `Rs. ${(value / 1000).toFixed(1)}k`;
  return `Rs. ${PKR0.format(value)}`;
}

export function liters(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0 L';
  return `${NUM3.format(value)} L`;
}

export function number(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '0';
  return value.toLocaleString('en-PK', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function dateShort(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '-';
  return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}`;
}

export function dateTime(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '-';
  return `${dateShort(d)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function timeOnly(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '-';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** yyyy-mm-dd in local time (avoids the UTC shift of toISOString) */
export function toDateInput(value: string | Date | null | undefined): string {
  const d = value ? (typeof value === 'string' ? new Date(value) : value) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function paymentLabel(method: string): string {
  switch (method) {
    case 'cash':
      return 'Cash';
    case 'card':
      return 'Card';
    case 'bank':
      return 'Bank Transfer';
    case 'credit':
      return 'Credit';
    default:
      return method || '-';
  }
}

export function signedCurrency(value: number | null | undefined): { text: string; className: string } {
  const v = value ?? 0;
  if (v > 0) return { text: `+${currency(v)}`, className: 'text-lime-600' };
  if (v < 0) return { text: currency(v), className: 'text-red-600' };
  return { text: currency(0), className: 'text-ink-500' };
}
