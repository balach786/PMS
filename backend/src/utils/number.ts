/** Money is rounded to 2 decimals, volume to 3 - keeps ledgers exact. */
export function money(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function volume(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

export function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

export function pct(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 10000) / 100;
}
