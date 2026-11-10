export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden>
        <rect width="64" height="64" rx="14" fill={inverted ? '#1E293B' : '#0F172A'} />
        <path d="M14 38l4-10a6 6 0 0 1 5.6-4h16.8a6 6 0 0 1 5.6 4l4 10v8a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-2H21v2a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2z" fill="#2563EB" />
        <circle cx="22" cy="38" r="3" fill="#fff" />
        <circle cx="42" cy="38" r="3" fill="#fff" />
        <path d="M32 8c3 4 5 7 5 9.5a5 5 0 0 1-10 0C27 15 29 12 32 8z" fill="#10B981" />
      </svg>
      <span className={inverted ? 'text-lg font-semibold tracking-tight text-white' : 'text-lg font-semibold tracking-tight text-navy-900'}>CarCare</span>
    </span>
  );
}
