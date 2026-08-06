import { Card } from "@/components/ui";

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold">Reports</h1>
        <p className="text-small text-text-muted mt-1">Platform analytics and reports</p>
      </div>
      <Card variant="default" className="shadow-sm">
        <div className="text-center py-12 text-text-muted">
          <p className="text-body">Reporting dashboard coming soon.</p>
          <p className="text-caption mt-2">View school statistics on each school detail page.</p>
        </div>
      </Card>
    </div>
  );
}
