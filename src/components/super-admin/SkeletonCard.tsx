export function SkeletonCard() {
  return (
    <div className="bg-surface rounded-2xl shadow-sm border border-border p-6 flex flex-col justify-between h-40">
      <div className="flex justify-between items-start mb-4">
        <div className="animate-pulse bg-surface-hover rounded-xl w-10 h-10" />
        <div className="animate-pulse bg-surface-hover rounded-full w-16 h-6" />
      </div>
      <div>
        <div className="animate-pulse bg-surface-hover rounded-xl w-24 h-10 mb-2" />
        <div className="animate-pulse bg-surface-hover rounded-xl w-32 h-4" />
      </div>
    </div>
  );
}
