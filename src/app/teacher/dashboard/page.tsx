import { Card } from "@/components/ui";

export default function TeacherDashboard() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <Card variant="bordered" className="max-w-md text-center shadow-md">
        <h2 className="text-h2 font-bold mb-2">Teacher Dashboard</h2>
        <p className="text-small text-text-muted">
          This feature will be available in Phase 4.
        </p>
      </Card>
    </div>
  );
}
