import { SkeletonCard } from "@/components/super-admin/SkeletonCard";

export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <div className="animate-pulse bg-surface-hover rounded-lg w-48 h-8 mb-2" />
          <div className="animate-pulse bg-surface-hover rounded-lg w-64 h-4" />
        </div>
        <div className="animate-pulse bg-surface-hover rounded-lg w-24 h-9" />
      </div>

      <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-4 gap-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>

      <div className="grid grid-cols-1 desktop:grid-cols-2 gap-6">
        <div className="animate-pulse bg-surface rounded-2xl border border-border h-[400px]" />
        <div className="animate-pulse bg-surface rounded-2xl border border-border h-[400px]" />
      </div>

      <div>
        <div className="animate-pulse bg-surface-hover rounded-lg w-32 h-6 mb-4" />
        <div className="bg-surface rounded-2xl border border-border overflow-hidden">
          <div className="animate-pulse bg-surface-hover w-full h-12 border-b border-border" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse bg-surface w-full h-16 border-b border-border" />
          ))}
        </div>
      </div>
    </div>
  );
}
