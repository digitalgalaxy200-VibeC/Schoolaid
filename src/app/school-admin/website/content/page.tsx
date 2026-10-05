"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { LIMITS } from "@/lib/site/templates/contracts";

/**
 * Website content — the structured editor for the home page.
 *
 * This is a CMS, not a page builder: the template's sections are fixed (one per
 * kind), and a school edits the content of each, its visibility and its order.
 * Every field limit shown here comes from `LIMITS`, the same numbers the server
 * enforces, so the browser never invites text the save will refuse.
 *
 * The whole page is saved in one call with the draft version that was loaded.
 * A 409 means somebody else saved in between — the fix is to reload, which is
 * why the error offers exactly that rather than pretending the save landed.
 */

type WireSection = { kind: string; is_visible: boolean } & Record<string, unknown>;

type ContentPayload = {
  enabled?: boolean;
  draft_version: number;
  template: { key: string; version: string; label: string };
  page: { id: string | null; title: string; sections: WireSection[] };
  preview_path: string | null;
};

const KIND_META: Record<string, { label: string; hint: string }> = {
  hero: { label: "Welcome banner", hint: "The first thing a visitor sees." },
  about: { label: "About your school", hint: "A short introduction to who you are." },
  programs: { label: "Programmes", hint: "The classes or programmes you offer." },
  principal_message: { label: "Principal's message", hint: "A welcome from the head of the school." },
  contact: { label: "Contact", hint: "Your phone, email and address appear here automatically." },
};

const str = (value: unknown): string => (typeof value === "string" ? value : "");

export default function WebsiteContentPage() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [template, setTemplate] = useState<{ label: string; version: string } | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);

  const [draftVersion, setDraftVersion] = useState(0);
  const [pageId, setPageId] = useState<string | null>(null);
  const [sections, setSections] = useState<WireSection[]>([]);

  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: "ok" | "error"; text: string; reload?: boolean } | null>(
    null,
  );

  const load = useCallback(async () => {
    setBanner(null);
    const res = await fetch("/api/school-admin/website/content");
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setBanner({ type: "error", text: data?.error || "Could not load your website content." });
      setLoading(false);
      return;
    }
    if (data.enabled === false) {
      setEnabled(false);
      setLoading(false);
      return;
    }

    const payload = data as ContentPayload;
    setTemplate(payload.template);
    setPreviewPath(payload.preview_path ?? null);
    setDraftVersion(payload.draft_version);
    setPageId(payload.page.id);
    setSections(payload.page.sections);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Deferred to a microtask: `load` sets state as its first act, and calling it
    // synchronously from the effect body trips the cascading-render lint rule.
    void Promise.resolve().then(load);
  }, [load]);

  const patchSection = (index: number, patch: Record<string, unknown>) => {
    setSections((prev) => prev.map((section, i) => (i === index ? { ...section, ...patch } : section)));
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    setSections((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setBanner(null);

    try {
      const res = await fetch("/api/school-admin/website/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_version: draftVersion, page_id: pageId, sections }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        if (typeof data?.draft_version === "number") setDraftVersion(data.draft_version);
        if (data?.page_id) setPageId(data.page_id);
        setBanner({ type: "ok", text: "Saved. Your website shows this immediately." });
      } else if (res.status === 409) {
        setBanner({
          type: "error",
          text: data?.error || "Someone else changed this page. Reload and try again.",
          reload: true,
        });
      } else {
        setBanner({ type: "error", text: data?.error || "Could not save the page." });
      }
    } catch {
      // fetch rejects only when the request never completed. Without this the
      // Save button stayed disabled for ever and the only message was the
      // browser's bare "Failed to fetch".
      setBanner({
        type: "error",
        text: "Could not reach the server — nothing was saved. Check your connection and try again.",
        reload: true,
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-small text-text-muted">Loading…</p>;

  if (!enabled) {
    return (
      <Card variant="clay">
        <h1 className="text-h2 font-bold text-text-primary">Website not enabled</h1>
        <p className="mt-2 text-small text-text-secondary">
          The website is not enabled for this school. Contact SchoolAid and we will turn it on.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 font-extrabold text-text-primary">Website content</h1>
          <p className="mt-1 text-small text-text-muted">
            {template ? `Template: ${template.label} v${template.version}` : "Template: not configured"}
          </p>
        </div>
        {previewPath ? (
          <a
            className="text-small font-medium text-primary underline"
            href={previewPath}
            target="_blank"
            rel="noreferrer"
          >
            View your website ↗
          </a>
        ) : null}
      </div>

      {banner ? (
        <div
          className={`rounded-sm border px-4 py-3 ${
            banner.type === "ok" ? "border-success bg-success-bg" : "border-error bg-error-bg"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              className={`text-small font-medium ${
                banner.type === "ok" ? "text-success" : "text-error"
              }`}
            >
              {banner.text}
            </p>
            {banner.reload ? (
              <Button variant="secondary" onClick={() => void load()}>
                Reload
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {pageId === null ? (
        <p className="text-small text-text-muted">
          Your website has no saved content yet. Switch on the sections you want and save — they
          appear immediately.
        </p>
      ) : (
        <p className="text-small text-text-muted">
          Sections you switch off stay saved but do not appear on your website.
        </p>
      )}

      {sections.map((section, index) => {
        const meta = KIND_META[section.kind] ?? { label: section.kind, hint: "" };
        return (
          <Card key={section.kind} variant="default">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-h3 font-bold text-text-primary">{meta.label}</h2>
                {meta.hint ? <p className="mt-1 text-small text-text-muted">{meta.hint}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Move ${meta.label} up`}
                  disabled={index === 0}
                  onClick={() => moveSection(index, -1)}
                  className="rounded-sm border border-border px-2 py-1 text-small disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Move ${meta.label} down`}
                  disabled={index === sections.length - 1}
                  onClick={() => moveSection(index, 1)}
                  className="rounded-sm border border-border px-2 py-1 text-small disabled:opacity-40"
                >
                  ↓
                </button>
                <label className="ml-2 flex items-center gap-2 text-small font-medium text-text-primary">
                  <input
                    type="checkbox"
                    checked={section.is_visible}
                    onChange={(event) => patchSection(index, { is_visible: event.target.checked })}
                  />
                  Show on website
                </label>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <SectionFields
                section={section}
                index={index}
                onChange={(patch) => patchSection(index, patch)}
              />
            </div>
          </Card>
        );
      })}

      <Button variant="primary" loading={saving} onClick={() => void save()}>
        Save
      </Button>

      <p className="text-caption text-text-muted">
        Need images?{" "}
        <Link className="text-primary underline" href="/school-admin/website/media">
          Open the media library
        </Link>
        . Your colours, logo and contact links live in{" "}
        <Link className="text-primary underline" href="/school-admin/website">
          School Website
        </Link>
        .
      </p>
    </div>
  );
}

function SectionFields({
  section,
  index,
  onChange,
}: {
  section: WireSection;
  index: number;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const id = (field: string) => `s${index}-${section.kind}-${field}`;

  switch (section.kind) {
    case "hero":
      return (
        <>
          <TextField
            id={id("headline")}
            label="Headline"
            max={LIMITS.headline}
            value={str(section.headline)}
            onChange={(value) => onChange({ headline: value })}
          />
          <TextField
            id={id("subheadline")}
            label="Subheadline"
            max={LIMITS.subheadline}
            value={str(section.subheadline)}
            onChange={(value) => onChange({ subheadline: value })}
          />
        </>
      );

    case "about":
      return (
        <>
          <TextField
            id={id("heading")}
            label="Heading"
            max={LIMITS.heading}
            value={str(section.heading)}
            onChange={(value) => onChange({ heading: value })}
          />
          <TextArea
            id={id("body")}
            label="Text"
            max={LIMITS.body}
            value={str(section.body)}
            onChange={(value) => onChange({ body: value })}
          />
        </>
      );

    case "programs":
      return (
        <>
          <TextField
            id={id("heading")}
            label="Heading"
            max={LIMITS.heading}
            value={str(section.heading)}
            onChange={(value) => onChange({ heading: value })}
          />
          <ProgramsEditor section={section} onChange={onChange} />
        </>
      );

    case "principal_message":
      return (
        <>
          <TextField
            id={id("heading")}
            label="Heading"
            max={LIMITS.heading}
            value={str(section.heading)}
            onChange={(value) => onChange({ heading: value })}
          />
          <TextArea
            id={id("message")}
            label="Message"
            max={LIMITS.body}
            value={str(section.message)}
            onChange={(value) => onChange({ message: value })}
          />
        </>
      );

    case "contact":
      return (
        <>
          <TextField
            id={id("heading")}
            label="Heading"
            max={LIMITS.heading}
            value={str(section.heading)}
            onChange={(value) => onChange({ heading: value })}
          />
          <TextArea
            id={id("intro")}
            label="Intro"
            max={LIMITS.body}
            value={str(section.intro)}
            onChange={(value) => onChange({ intro: value })}
          />
        </>
      );

    default:
      return (
        <p className="text-small text-text-muted">
          This section cannot be edited in this version.
        </p>
      );
  }
}

type ProgramRow = { name: string; description: string };

function ProgramsEditor({
  section,
  onChange,
}: {
  section: WireSection;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const items: ProgramRow[] = Array.isArray(section.items)
    ? (section.items as unknown[]).map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return { name: str(row.name), description: str(row.description) };
      })
    : [];

  const setItems = (next: ProgramRow[]) => onChange({ items: next });

  return (
    <div className="space-y-3">
      <p className="text-small font-medium text-text-primary">Programmes</p>
      {items.map((item, itemIndex) => (
        <div key={itemIndex} className="grid grid-cols-1 gap-2 tablet:grid-cols-[1fr_2fr_auto]">
          <input
            type="text"
            aria-label={`Programme ${itemIndex + 1} name`}
            maxLength={LIMITS.itemName}
            value={item.name}
            placeholder="Name"
            onChange={(event) =>
              setItems(items.map((row, i) => (i === itemIndex ? { ...row, name: event.target.value } : row)))
            }
            className="rounded-sm border border-border px-3 py-2 text-small"
          />
          <input
            type="text"
            aria-label={`Programme ${itemIndex + 1} description`}
            maxLength={LIMITS.itemDescription}
            value={item.description}
            placeholder="Description"
            onChange={(event) =>
              setItems(
                items.map((row, i) => (i === itemIndex ? { ...row, description: event.target.value } : row)),
              )
            }
            className="rounded-sm border border-border px-3 py-2 text-small"
          />
          <button
            type="button"
            disabled={items.length <= LIMITS.listMin}
            onClick={() => setItems(items.filter((_, i) => i !== itemIndex))}
            className="rounded-sm border border-border px-3 py-2 text-small disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={items.length >= LIMITS.listMax}
        onClick={() => setItems([...items, { name: "", description: "" }])}
        className="rounded-sm border border-border px-3 py-2 text-small disabled:opacity-40"
      >
        Add programme
      </button>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  max: number;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-small font-medium text-text-primary" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        maxLength={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full rounded-sm border border-border px-3 py-2 text-small"
      />
    </div>
  );
}

function TextArea({
  id,
  label,
  value,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  max: number;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-small font-medium text-text-primary" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        rows={5}
        maxLength={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full rounded-sm border border-border px-3 py-2 text-small"
      />
    </div>
  );
}
