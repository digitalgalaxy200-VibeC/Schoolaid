export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-border rounded-sm" />
      <div className="grid grid-cols-1 tablet:grid-cols-3 gap-4">
        {[1,2,3].map(i => <div key={i} className="h-32 bg-surface border border-border rounded-md" />)}
      </div>
      <div className="h-64 bg-surface border border-border rounded-md" />
    </div>
  );
}
