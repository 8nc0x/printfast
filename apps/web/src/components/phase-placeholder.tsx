import { Wrench } from 'lucide-react';

/**
 * Honest placeholder for flows scheduled in a later build phase. Keeps the app
 * navigable and shippable without pretending a feature exists.
 */
export function PhasePlaceholder({
  title,
  phase,
  children,
}: {
  title: string;
  phase: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center">
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-muted-foreground">
        <Wrench className="h-5 w-5" />
      </span>
      <h2 className="mt-3 font-medium">{title}</h2>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
        Arriving in {phase}. The foundation for this screen is in place.
      </p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
