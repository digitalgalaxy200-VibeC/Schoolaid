import { Card } from "@/components/ui";

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h2 font-bold">Users</h1>
        <p className="text-small text-text-muted mt-1">Platform user management</p>
      </div>
      <Card variant="default" className="shadow-sm">
        <div className="text-center py-12 text-text-muted">
          <p className="text-body">User management coming soon.</p>
          <p className="text-caption mt-2">Use the Schools section to manage admins, teachers, and students.</p>
        </div>
      </Card>
    </div>
  );
}
