import { Button, Card, Badge } from "@/components/ui";

export default function Home() {
  return (
    <main className="max-w-[1040px] mx-auto px-4 py-6">
      {/* Hero */}
      <div className="bg-gradient-to-br from-primary-dark to-primary rounded-lg px-5 py-12 mb-8 text-text-inverse relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-56 h-56 bg-accent opacity-20 rounded-full" />
        <span className="font-mono text-caption uppercase tracking-widest opacity-75 block mb-3">
          SchoolAid · Global Design System
        </span>
        <h1 className="text-display font-extrabold leading-tight text-white max-w-[620px]">
          One set of tokens. Every screen, every role, every device.
        </h1>
        <p className="mt-3 max-w-[560px] opacity-88 text-h3">
          Colors, type, spacing, and components — defined once and reused
          everywhere from Super Admin to Student.
        </p>
      </div>

      {/* School Cards */}
      <div className="grid grid-cols-1 tablet:grid-cols-2 desktop:grid-cols-3 gap-4 mb-8">
        <Card variant="bordered" className="shadow-sm">
          <div className="space-y-3">
            <h3 className="text-h3 font-bold">Green Valley Academy</h3>
            <div className="flex items-center gap-2">
              <Badge variant="success">Active</Badge>
              <span className="text-small text-text-muted">10 students</span>
            </div>
            <Button size="sm" variant="primary">
              View School
            </Button>
          </div>
        </Card>

        <Card variant="bordered" className="shadow-sm">
          <div className="space-y-3">
            <h3 className="text-h3 font-bold">Bright Future College</h3>
            <div className="flex items-center gap-2">
              <Badge variant="success">Active</Badge>
              <span className="text-small text-text-muted">4 students</span>
            </div>
            <Button variant="primary">View School</Button>
          </div>
        </Card>

        <Card variant="bordered" className="shadow-sm">
          <div className="space-y-3">
            <h3 className="text-h3 font-bold">System Status</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-small text-text-secondary">Schema</span>
                <Badge variant="success">Migrated</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-small text-text-secondary">RLS</span>
                <Badge variant="success">Enabled</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-small text-text-secondary">
                  Design Tokens
                </span>
                <Badge variant="success">Active</Badge>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Footer note */}
      <Card variant="bordered" className="shadow-sm">
        <p className="text-small text-text-muted">
          Platform ready. Change{" "}
          <code className="font-mono text-primary">--color-primary</code> in the
          token file to update every button across every role — verify it live.
        </p>
      </Card>
    </main>
  );
}
