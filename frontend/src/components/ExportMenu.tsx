import { useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, FileDown, Loader2, Printer } from 'lucide-react';
import { downloadReport, exportErrorMessage, type ExportFormat, type ExportParams } from '../lib/export';
import { useToast } from '../lib/toast';
import { Button } from './ui';

/**
 * Real export control: every option calls the backend and downloads a file
 * generated from live database records.
 */
export function ExportMenu({
  reportType,
  params,
  onPrint,
  label = 'Export',
  variant = 'secondary',
  align = 'right',
}: {
  reportType: string;
  params: ExportParams;
  onPrint?: () => void;
  label?: string;
  variant?: 'primary' | 'secondary' | 'gold';
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const run = async (format: ExportFormat, newTab = false) => {
    setBusy(format);
    try {
      await downloadReport(reportType, format, params, newTab);
      toast.success(`${format.toUpperCase()} report downloaded.`);
      setOpen(false);
    } catch (err) {
      toast.error(exportErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const items = [
    { key: 'csv' as const, label: 'CSV', desc: 'Comma separated values', icon: FileText },
    { key: 'xlsx' as const, label: 'Excel (XLSX)', desc: 'Formatted workbook', icon: FileSpreadsheet },
    { key: 'pdf' as const, label: 'PDF', desc: 'Branded printable report', icon: FileDown },
  ];

  return (
    <div ref={ref} className="relative inline-block">
      <Button variant={variant} onClick={() => setOpen((v) => !v)}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {label}
      </Button>

      {open && (
        <div
          className={`absolute z-40 mt-2 w-60 rounded-xl border border-ink-200 bg-white p-2 shadow-pop animate-fade-in ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            Download report
          </p>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                disabled={busy !== null}
                onClick={() => void run(item.key)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-ink-50 disabled:opacity-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
                  {busy === item.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink-800">{item.label}</span>
                  <span className="block text-xs text-ink-500">{item.desc}</span>
                </span>
              </button>
            );
          })}
          {item_separator()}
          <button
            type="button"
            onClick={() => {
              void run('pdf', true);
            }}
            disabled={busy !== null}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-ink-50 disabled:opacity-50"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-100 text-gold-700">
              <FileDown className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-ink-800">Preview PDF</span>
              <span className="block text-xs text-ink-500">Open in a new tab</span>
            </span>
          </button>
          {onPrint && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onPrint();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-ink-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
                <Printer className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink-800">Print</span>
                <span className="block text-xs text-ink-500">Print this report</span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function item_separator() {
  return <div className="my-1 border-t border-ink-200/70" />;
}
