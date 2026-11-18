"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui";
import type { SetupItem, SetupItemStatus, SetupReport } from "@/lib/school-setup/status";

/**
 * The setup checklist for the school currently being impersonated.
 *
 * WHY THE OPEN CATEGORY LIVES IN THE URL
 * --------------------------------------
 * Every action here navigates away to the page that fixes it. When the operator
 * presses Back, the browser restores this URL — so the open category is read
 * from the query string rather than kept in component state. That is what makes
 * "back" return to the same place instead of a reset checklist, and it means
 * there is no state to get out of step with the address bar.
 */

const OPEN_PARAM = "cat";

const ITEM_BADGE: Record<
  SetupItemStatus,
  { variant: "success" | "warning" | "error" | "info" | "default"; label: string }
> = {
  complete: { variant: "success", label: "Complete" },
  warning: { variant: "info", label: "Check" },
  incomplete: { variant: "warning", label: "Pending" },
  blocked: { variant: "error", label: "Blocked" },
  not_applicable: { variant: "default", label: "N/A" },
};

const CATEGORY_BADGE = {
  complete: { variant: "success" as const, label: "Complete" },
  in_progress: { variant: "info" as const, label: "In progress" },
  not_started: { variant: "warning" as const, label: "Not started" },
  not_applicable: { variant: "default" as const, label: "Not applicable" },
};

const OVERALL_LABEL: Record<SetupReport["state"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  almost_complete: "Almost complete",
  ready: "Ready for operation",
  attention: "Needs attention",
};

export function SetupWizard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openCategory = searchParams.get(OPEN_PARAM);

  const [report, setReport] = useState<SetupReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // No `loading` flag: nothing is shown until there is a report or an error,
  // and a refresh keeps the current numbers on screen instead of blanking it.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/school-setup/status", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(body?.error || `Could not load setup status (HTTP ${res.status}).`);
          return;
        }
        setReport(body as SetupReport);
        setError(null);
      } catch {
        if (!cancelled) setError("Network error. Check your connection and try again.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const toggle = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (openCategory === id) params.delete(OPEN_PARAM);
    else params.set(OPEN_PARAM, id);
    const query = params.toString();
    // `replace`, not `push`: opening and closing a card is not a navigation.
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const blockedItems = useMemo(
    () => (report ? report.items.filter((i) => i.status === "blocked") : []),
    [report],
  );

  if (error) {
    return (
      <Card variant="default" className="shadow-sm">
        <p className="text-body font-semibold text-text-primary">Setup status unavailable</p>
        <p className="text-small text-text-secondary mt-1">{error}</p>
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={() => setReloadToken((t) => t + 1)}>
            Try again
          </Button>
        </div>
      </Card>
    );
  }

  if (!report) {
    return (
      <Card variant="default" className="shadow-sm">
        <div className="flex items-center gap-3">
          <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          <p className="text-small text-text-secondary">
            Reading this school&apos;s configuration…
          </p>
        </div>
      </Card>
    );
  }

  const { school, counts, state, categories, items } = report;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <Card variant="default" className="shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {school.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={school.logo_url}
                alt=""
                className="w-11 h-11 rounded-lg object-cover border border-border shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-lg bg-primary-light flex items-center justify-center shrink-0 text-primary font-bold">
                {school.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-h2 font-bold text-text-primary truncate">{school.name}</h1>
              <p className="text-caption text-text-muted">School setup manager</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-h1 font-bold text-text-primary leading-none">{counts.percent}%</p>
              <p className="text-caption text-text-muted mt-1">
                {counts.requiredComplete} of {counts.requiredTotal} required
              </p>
            </div>
            <Badge
              variant={state === "ready" ? "success" : state === "attention" ? "error" : "info"}
            >
              {OVERALL_LABEL[state]}
            </Badge>
          </div>
        </div>

        <div className="mt-4 h-2 w-full rounded-full bg-border overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              state === "ready" ? "bg-success" : state === "attention" ? "bg-error" : "bg-primary"
            }`}
            style={{ width: `${counts.percent}%` }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-caption text-text-muted">
            Counts required items only. Optional items and switched-off features do not affect this
            figure.
          </p>
          <Button variant="ghost" size="sm" onClick={() => setReloadToken((t) => t + 1)}>
            Refresh
          </Button>
        </div>
      </Card>

      {/* ── Categories ── */}
      <div className="grid grid-cols-1 tablet:grid-cols-2 gap-3">
        {categories.map((category) => {
          const badge = CATEGORY_BADGE[category.state];
          const isOpen = openCategory === category.id;
          return (
            <Card key={category.id} variant="default" className="shadow-sm">
              <button
                type="button"
                onClick={() => toggle(category.id)}
                aria-expanded={isOpen}
                className="w-full text-left cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body font-semibold text-text-primary truncate">
                      {category.label}
                    </p>
                    <p className="text-caption text-text-muted mt-0.5">
                      {category.state === "not_applicable"
                        ? "Not applicable to this school"
                        : `${category.complete}/${category.total} completed`}
                    </p>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>

                {category.state !== "not_applicable" && (
                  <div className="mt-3 h-1.5 w-full rounded-full bg-border overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        category.state === "complete" ? "bg-success" : "bg-primary"
                      }`}
                      style={{ width: `${category.percent}%` }}
                    />
                  </div>
                )}
              </button>

              {isOpen && (
                <ul className="mt-4 divide-y divide-border border-t border-border">
                  {items
                    .filter((i) => i.category === category.id)
                    .map((item) => (
                      <ItemRow key={item.id} item={item} />
                    ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      {/* ── Blocked ── */}
      {blockedItems.length > 0 && (
        <Card variant="default" className="shadow-sm border-error">
          <p className="text-body font-semibold text-error">
            {blockedItems.length} blocked requirement{blockedItems.length === 1 ? "" : "s"}
          </p>
          <ul className="mt-3 space-y-3">
            {blockedItems.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-small font-medium text-text-primary">{item.label}</p>
                  <p className="text-caption text-text-secondary">{item.detail}</p>
                </div>
                <Link href={item.href} prefetch={false}>
                  <Button variant="secondary" size="sm">
                    {item.action}
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-caption text-text-muted">
        Everything on this page is read from the school&apos;s existing records. Nothing is ticked by
        hand and no setup state is stored.
      </p>
    </div>
  );
}

function ItemRow({ item }: { item: SetupItem }) {
  const badge = ITEM_BADGE[item.status];
  const isActionable = item.status !== "not_applicable";

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-small font-medium text-text-primary">{item.label}</p>
            <Badge variant={badge.variant}>{badge.label}</Badge>
            {item.requirement === "optional" && (
              <span className="text-caption text-text-muted">optional</span>
            )}
          </div>
          <p className="text-caption text-text-secondary mt-1">{item.detail}</p>
        </div>

        {isActionable && (
          <Link href={item.href} prefetch={false} className="shrink-0">
            <Button variant="ghost" size="sm">
              {item.action}
            </Button>
          </Link>
        )}
      </div>
    </li>
  );
}
