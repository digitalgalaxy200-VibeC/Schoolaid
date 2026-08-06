import { Card } from "@/components/ui";

export default function SystemHealthPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold">System Health</h1>
        <p className="text-small text-text-muted mt-1">Platform monitoring and diagnostics</p>
      </div>
      <Card variant="bordered" className="shadow-sm">
        <div className="text-center py-12 text-text-muted">
          <p className="text-body">System health monitoring coming soon.</p>
          <p className="text-caption mt-2">Check your Vercel deployment logs for real-time diagnostics.</p>
        </div>
      </Card>
    </div>
  );
}
