import clsx from 'clsx';

/** BK brand mark - inline SVG so it renders identically everywhere. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={clsx('h-9 w-9', className)} role="img" aria-label="BK logo">
      <rect width="64" height="64" rx="14" fill="#0B1A2B" />
      <rect x="13" y="13" width="38" height="38" rx="7" fill="none" stroke="#B69952" strokeWidth="3.5" />
      <path d="M23 22h7.5c3.6 0 6 2 6 5.2 0 2.3-1.3 3.9-3.4 4.7l4 7.1h-4.6l-3.5-6.4h-2.4V39H23V22zm4 3.4v5.2h3.2c1.6 0 2.6-.9 2.6-2.6s-1-2.6-2.6-2.6H27z" fill="#F4EAD2" />
      <path d="M44 22h4v9.4L53 22h4.6l-5.4 7 5.8 10h-4.9l-3.9-7-1.2 1.3V39H44V22z" fill="#639C14" />
      <rect x="13" y="49" width="38" height="3" rx="1.5" fill="#B69952" />
    </svg>
  );
}

export function LogoWordmark({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <div className={clsx('flex items-center gap-2.5', className)}>
      <Logo />
      <div className="leading-tight">
        <p className={clsx('text-sm font-bold tracking-tight', light ? 'text-white' : 'text-navy-900')}>BK</p>
        <p className={clsx('text-[10px] font-medium uppercase tracking-wider', light ? 'text-gold-300' : 'text-gold-600')}>
          Petrol Pump Manager
        </p>
      </div>
    </div>
  );
}
