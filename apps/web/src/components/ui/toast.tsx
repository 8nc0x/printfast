'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type ToastVariant = 'default' | 'success' | 'destructive';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (input: { title: string; description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback(
    (input: { title: string; description?: string; variant?: ToastVariant }) => {
      const id = nextId++;
      setItems((prev) => [...prev, { id, variant: 'default', ...input }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    [],
  );

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end sm:px-0">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto w-full max-w-sm rounded-lg border p-4 shadow-lg animate-in slide-in-from-bottom-2 fade-in-0 sm:max-w-[360px]',
              t.variant === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-900',
              t.variant === 'destructive' && 'border-red-200 bg-red-50 text-red-900',
              t.variant === 'default' && 'bg-background text-foreground',
            )}
          >
            <p className="text-sm font-semibold">{t.title}</p>
            {t.description ? <p className="mt-1 text-sm opacity-80">{t.description}</p> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
