import React from 'react';

type Tone = 'brand' | 'gold' | 'red' | 'green' | 'blue' | 'slate';

const TONE_MAP: Record<Tone, { chip: string; value: string }> = {
  brand: { chip: 'chip-teal', value: 'text-[#07564e]' },
  gold: { chip: 'chip-gold', value: 'text-[#8a6826]' },
  red: { chip: 'chip-red', value: 'text-red-700' },
  green: { chip: 'chip-green', value: 'text-emerald-700' },
  blue: { chip: 'chip-blue', value: 'text-blue-700' },
  slate: { chip: 'chip-slate', value: 'text-slate-700' },
};

export const PremiumCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  lift?: boolean;
  padded?: boolean;
}> = ({ children, className = '', lift = true, padded = true }) => (
  <section
    className={`glass-card ${lift ? 'glass-card-lift' : ''} ${padded ? 'p-5 sm:p-6' : ''} ${className}`}
  >
    {children}
  </section>
);

export const SectionHeading: React.FC<{
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ eyebrow, title, description, action, className = '' }) => (
  <div className={`flex flex-wrap items-start justify-between gap-3 ${className}`}>
    <div className="min-w-0">
      {eyebrow && <div className="section-eyebrow mb-1">{eyebrow}</div>}
      <h3 className="text-[15px] font-semibold leading-snug text-slate-900 sm:text-base">{title}</h3>
      {description && <p className="hint-text mt-1">{description}</p>}
    </div>
    {action}
  </div>
);

export const KpiCard: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ReactNode;
  tone?: Tone;
}> = ({ label, value, hint, icon, tone = 'brand' }) => {
  const t = TONE_MAP[tone];
  return (
    <div className="glass-card glass-card-lift relative overflow-hidden p-4 sm:p-5">
      <div className="pointer-events-none absolute -left-10 -top-12 h-28 w-28 rounded-full bg-[#c8a45d]/8 blur-2xl" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-medium text-slate-500">{label}</div>
          <div className={`kpi-value mt-2 text-2xl font-bold sm:text-[28px] ${t.value}`}>{value}</div>
          {hint && <div className="hint-text mt-1.5 truncate">{hint}</div>}
        </div>
        <span className={`kpi-icon ${t.chip}`}>{icon}</span>
      </div>
    </div>
  );
};

export const Pill: React.FC<{
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}> = ({ children, tone = 'slate', className = '' }) => (
  <span className={`chip ${TONE_MAP[tone].chip} ${className}`}>{children}</span>
);

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 px-6 py-14 text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0b6e63]/8 text-[#0b6e63]">
      {icon}
    </div>
    <div className="mt-4 text-sm font-extrabold text-slate-800">{title}</div>
    {description && <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ProgressRing: React.FC<{
  value: number;
  size?: number;
  label?: string;
}> = ({ value, size = 54, label }) => {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth="5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#0b6e63"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
        />
      </svg>
      <span className="absolute font-mono-num text-[10px] font-bold text-slate-800">
        {label ?? `${Math.round(clamped)}%`}
      </span>
    </div>
  );
};
