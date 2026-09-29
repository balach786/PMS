import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, AlertTriangle, Info, X, CheckCheck, Loader2 } from 'lucide-react';
import { http, toErrorMessage } from '../lib/api';
import { timeOnly, dateShort } from '../lib/format';
import type { NotificationItem, NotificationList } from '../lib/types';

/**
 * Dashboard notification bell (build spec section 9).
 *
 * The alerts come from GET /notifications, which derives them from live data -
 * low stock, stock/ledger mismatch, missing or long-running shift, credit
 * outstanding and price changes in the last 24 hours. Dismissing one records it
 * server-side so the unread count is honest across devices and reloads.
 */

const LEVEL_STYLES: Record<NotificationItem['level'], { wrap: string; icon: string; bar: string }> = {
  danger: { wrap: 'bg-red-50 text-red-600', icon: 'text-red-500', bar: 'bg-red-500' },
  warning: { wrap: 'bg-gold-100 text-gold-700', icon: 'text-gold-600', bar: 'bg-gold-500' },
  info: { wrap: 'bg-navy-50 text-navy-700', icon: 'text-navy-600', bar: 'bg-navy-700' },
};

const POLL_MS = 60_000;

function LevelIcon({ level }: { level: NotificationItem['level'] }) {
  const style = LEVEL_STYLES[level];
  if (level === 'info') return <Info className={`h-4 w-4 ${style.icon}`} />;
  return <AlertTriangle className={`h-4 w-4 ${style.icon}`} />;
}

export function NotificationBell() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  async function load() {
    try {
      const res = await http.get<NotificationList>('/notifications');
      const list = res.items ?? [];
      setItems(list);
      // the server's unreadCount uses exactly this definition
      setUnread(list.filter((i) => !i.dismissed).length);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err, 'Could not load notifications.'));
    } finally {
      setLoading(false);
    }
  }

  // initial load, then keep it fresh while the app is open
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-check after navigating (an alert may have been resolved by that visit)
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function dismiss(keys: string[]) {
    if (!keys.length) return;
    // optimistic: reflect the dismissal immediately
    setItems((prev) => prev.map((i) => (keys.includes(i.key) ? { ...i, dismissed: true } : i)));
    setUnread((prev) => Math.max(0, prev - keys.length));
    try {
      await http.post('/notifications/dismiss', { keys });
      await load();
    } catch {
      await load();
    }
  }

  const visible = items.filter((i) => !i.dismissed);
  const dismissedItems = items.filter((i) => i.dismissed);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-ink-500 transition hover:bg-ink-100 hover:text-ink-700"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        aria-expanded={open}
        title={unread ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'Notifications'}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-ink-200/70 px-4 py-2.5">
            <p className="text-sm font-semibold text-navy-900">
              Notifications
              {unread > 0 && <span className="ml-1.5 text-xs font-normal text-ink-500">{unread} unread</span>}
            </p>
            {unread > 0 && (
              <button
                onClick={() => dismiss(visible.map((i) => i.key))}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-500 transition hover:bg-ink-100 hover:text-navy-700"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[min(24rem,60vh)] overflow-y-auto">
            {loading && !items.length ? (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-ink-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : error ? (
              <p className="px-4 py-6 text-sm text-red-600">{error}</p>
            ) : visible.length ? (
              <ul className="divide-y divide-ink-100">
                {visible.map((item) => {
                  const style = LEVEL_STYLES[item.level];
                  return (
                    <li key={item.key} className="relative">
                      <span className={`absolute inset-y-0 left-0 w-1 ${style.bar}`} />
                      <div className="flex gap-3 py-3 pl-4 pr-2">
                        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${style.wrap}`}>
                          <LevelIcon level={item.level} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link
                            to={item.link}
                            onClick={() => setOpen(false)}
                            className="block text-sm font-medium text-navy-800 transition hover:text-navy-600"
                          >
                            {item.title}
                          </Link>
                          <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{item.message}</p>
                          <p className="mt-1 text-[11px] text-ink-400">
                            {dateShort(item.at)} · {timeOnly(item.at)}
                          </p>
                        </div>
                        <button
                          onClick={() => dismiss([item.key])}
                          className="h-6 w-6 shrink-0 rounded-md text-ink-300 transition hover:bg-ink-100 hover:text-ink-600"
                          aria-label={`Dismiss: ${item.title}`}
                          title="Dismiss"
                        >
                          <X className="mx-auto h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-4 py-8 text-center">
                <Bell className="mx-auto h-6 w-6 text-ink-300" />
                <p className="mt-2 text-sm font-medium text-navy-800">Nothing needs attention</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  Alerts for low stock, missing shifts, credit and price changes appear here.
                </p>
              </div>
            )}

            {dismissedItems.length > 0 && (
              <div className="border-t border-ink-200/70 px-4 py-2">
                <p className="text-[11px] text-ink-400">
                  {dismissedItems.length} dismissed ·{' '}
                  <button
                    onClick={async () => {
                      await http.del('/notifications/dismissed');
                      await load();
                    }}
                    className="font-medium text-navy-600 underline-offset-2 hover:underline"
                  >
                    restore
                  </button>
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-ink-200/70 bg-ink-50 px-4 py-2">
            <p className="text-[11px] text-ink-400">
              Alerts are generated from live data — they clear themselves once the underlying issue is fixed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
