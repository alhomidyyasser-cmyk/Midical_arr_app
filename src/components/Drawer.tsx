import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const Drawer: React.FC<DrawerProps> = ({
  open,
  onClose,
  title,
  subtitle,
  children,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-[1px]">
      <div className="flex-1" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="glass-card flex h-full w-full max-w-xl flex-col !rounded-none !border-r-0 border-slate-200/70 !shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200/70 px-6 py-5">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold leading-snug text-slate-900">
              {title}
            </h3>
            {subtitle && (
              <p className="mt-1 text-[11px] font-normal leading-relaxed text-slate-400">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
};
