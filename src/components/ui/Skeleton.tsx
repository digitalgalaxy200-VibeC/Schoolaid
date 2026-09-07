/**
 * Skeleton — Phase 8 Polish
 * Reusable shimmer placeholder for loading states.
 * Use instead of spinners on data-heavy pages to reduce perceived load time.
 */

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`skeleton rounded-md ${className}`} />;
}

/** Pre-built skeleton for a standard list row (avatar + two lines of text) */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-4 border-b border-border last:border-b-0">
      <Skeleton className="w-9 h-9 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/** Pre-built skeleton for a stat card */
export function SkeletonCard() {
  return (
    <div className="bg-surface rounded-lg border border-border p-5 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
    </div>
  );
}

/** Full-page loading state: grid of skeleton cards + skeleton rows */
export function SkeletonPage({ cards = 3, rows = 5 }: { cards?: number; rows?: number }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <Skeleton className="h-7 w-48" />
      <div className={`grid grid-cols-1 tablet:grid-cols-${cards} gap-4`}>
        {Array.from({ length: cards }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
      <div className="bg-surface rounded-lg border border-border overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} />)}
      </div>
    </div>
  );
}
