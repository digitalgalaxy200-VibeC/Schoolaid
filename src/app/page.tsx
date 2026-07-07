import { Button, Card, Badge, Container, Grid } from "@/components/ui";

export default function Home() {
  return (
    <Container as="main" className="py-spacing-3xl">
      <h1 className="text-heading1 font-bold text-text-primary mb-spacing-lg">
        SchoolAid
      </h1>
      <p className="text-body text-text-secondary mb-spacing-xl">
        Multi-tenant school management platform — Phase 1 foundation complete.
      </p>

      <Grid cols={[1, 2, 3]} className="mb-spacing-xl">
        <Card
          variant="surface"
          header={<span className="font-semibold">Green Valley Academy</span>}
        >
          <div className="flex items-center gap-spacing-sm mb-spacing-md">
            <Badge variant="success">Active</Badge>
            <span className="text-body-sm text-text-muted">10 students</span>
          </div>
          <Button size="sm" variant="primary">
            View School
          </Button>
        </Card>

        <Card
          variant="surface"
          header={<span className="font-semibold">Bright Future College</span>}
        >
          <div className="flex items-center gap-spacing-sm mb-spacing-md">
            <Badge variant="success">Active</Badge>
            <span className="text-body-sm text-text-muted">4 students</span>
          </div>
          <Button size="sm" variant="primary">
            View School
          </Button>
        </Card>

        <Card
          variant="bordered"
          header={<span className="font-semibold">System Status</span>}
        >
          <div className="space-y-spacing-sm">
            <div className="flex justify-between">
              <span className="text-body-sm text-text-secondary">Schema</span>
              <Badge variant="success">Migrated</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-body-sm text-text-secondary">RLS</span>
              <Badge variant="success">Enabled</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-body-sm text-text-secondary">
                Design Tokens
              </span>
              <Badge variant="success">Active</Badge>
            </div>
          </div>
        </Card>
      </Grid>

      <Card padding="md" variant="bordered">
        <p className="text-body-sm text-text-muted">
          Platform ready. Change{" "}
          <code className="font-mono text-brand-primary">color.primary</code> in
          the token file to update every button across every role — verify it
          live.
        </p>
      </Card>
    </Container>
  );
}
