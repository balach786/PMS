import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Runs `action` once when the URL carries `?<param>=…`, then removes the
 * parameter. This is what makes sidebar links such as `/app/sales?new=1`
 * actually open the create modal instead of dead-ending on the page.
 */
export function useQueryAction(param: string, action: () => void): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const actionRef = useRef(action);
  actionRef.current = action;
  const value = searchParams.get(param);

  useEffect(() => {
    if (!value) return;
    actionRef.current();
    const next = new URLSearchParams(searchParams);
    next.delete(param);
    setSearchParams(next, { replace: true });
    // only re-run when the parameter itself changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, param]);
}

/**
 * Reads a persistent query parameter (e.g. `?type=profit` on the reports page).
 * The value stays in the URL so the view is shareable and bookmarkable.
 */
export function useQueryValue(param: string): string | null {
  const [searchParams] = useSearchParams();
  return searchParams.get(param);
}

/**
 * Scrolls to the section named by `?tab=<id>` (used by the Stock and Shifts
 * sidebar entries) and then clears the parameter.
 */
export function useQueryScroll(param: string, fallbackId?: string): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(param);

  useEffect(() => {
    if (!value) return;
    const el = document.getElementById(value) ?? (fallbackId ? document.getElementById(fallbackId) : null);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const next = new URLSearchParams(searchParams);
    next.delete(param);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, param]);
}
