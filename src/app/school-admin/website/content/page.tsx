"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { SiteRenderer } from "@/components/site/SiteRenderer";
import { LIMITS } from "@/lib/site/templates/contracts";
import { resolvePalette, type ThemeSlot } from "@/lib/site/theme";
import type { SiteSection, SiteViewModel } from "@/lib/site/types";

type WireSection = { kind: string; is_visible: boolean } & Record<string, unknown>;

type MediaItem = { id: string; path: string; url: string; alt_text: string | null };

type ContentPayload = {
  enabled?: boolean;
  draft_version: number;
  template: { key: string; version: string; label: string };
  page: { id: string | null; title: string; sections: WireSection[] };
  preview_path: string | null;
};

type ConfigPayload = {
  school?: {
    name: string;
    slug: string;
    motto: string | null;
    logo_url: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  config?: {
    theme: { palette: string; logo_path: string | null };
    contact: Record<string, string | null>;
    seo: { title: string | null; description: string | null };
  };
};

const KIND_META: Record<string, { label: string; hint: string }> = {
  hero: { label: "Welcome Banner & Hero", hint: "The main introduction visitors see at the top." },
  about: { label: "About Our School", hint: "Your school's mission, values, and history." },
  programs: { label: "Academic Programmes", hint: "Curriculum levels, classes, and tiers offered." },
  principal_message: { label: "Principal's Welcome", hint: "A greeting message from the Head of School." },
  contact: { label: "Contact & Admissions", hint: "Phone, email, address and admission inquiry details." },
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
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);

  // Config data for live preview
  const [schoolInfo, setSchoolInfo] = useState<ConfigPayload["school"] | null>(null);
  const [siteConfig, setSiteConfig] = useState<ConfigPayload["config"] | null>(null);

  // Live preview modal state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: "ok" | "error"; text: string; reload?: boolean } | null>(null);

  const load = useCallback(async () => {
    setBanner(null);
    const [contentRes, configRes, mediaRes] = await Promise.all([
      fetch("/api/school-admin/website/content"),
      fetch("/api/school-admin/website/config"),
      fetch("/api/school-admin/website/media"),
    ]);

    const data = await contentRes.json().catch(() => ({}));

    if (!contentRes.ok) {
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

    if (configRes.ok) {
      const cData = await configRes.json().catch(() => ({}));
      setSchoolInfo(cData.school ?? null);
      setSiteConfig(cData.config ?? null);
    }

    if (mediaRes.ok) {
      const mData = await mediaRes.json().catch(() => ({}));
      setMediaList(mData.media ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
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

    const res = await fetch("/api/school-admin/website/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft_version: draftVersion, page_id: pageId, sections }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      if (typeof data?.draft_version === "number") setDraftVersion(data.draft_version);
      if (data?.page_id) setPageId(data.page_id);
      setBanner({ type: "ok", text: "Saved successfully. Your website shows these changes immediately." });
    } else if (res.status === 409) {
      setBanner({
        type: "error",
        text: data?.error || "Someone else changed this page. Reload and try again.",
        reload: true,
      });
    } else {
      setBanner({ type: "error", text: data?.error || "Could not save the page." });
    }
    setSaving(false);
  };

  // Build temporary view-model for the live preview modal
  const previewModel: SiteViewModel = {
    school: {
      name: schoolInfo?.name || "Your School Name",
      slug: schoolInfo?.slug || "school",
      motto: schoolInfo?.motto || "Excellence & Virtue",
      logoUrl: schoolInfo?.logo_url || null,
      address: schoolInfo?.address || "123 Education Lane, Campus City",
      phone: schoolInfo?.phone || "+234 800 000 0000",
      email: schoolInfo?.email || "info@school.edu.ng",
    },
    templateKey: template?.label ? "classic" : "classic",
    templateVersion: template?.version || "1",
    sections: sections.filter((s) => s.is_visible) as unknown as SiteSection[],
    theme: {
      paletteId: siteConfig?.theme?.palette || "cobalt",
      colors: resolvePalette(siteConfig?.theme?.palette).colors as Record<ThemeSlot, string>,
    },
    contact: {
      whatsapp: siteConfig?.contact?.whatsapp ?? null,
      facebook: siteConfig?.contact?.facebook ?? null,
      instagram: siteConfig?.contact?.instagram ?? null,
      x: siteConfig?.contact?.x ?? null,
      youtube: siteConfig?.contact?.youtube ?? null,
    },
    seo: {
      title: siteConfig?.seo?.title ?? null,
      description: siteConfig?.seo?.description ?? null,
    },
  };

  if (loading) return <p className="text-small text-text-muted">Loading website editor…</p>;

  if (!enabled) {
    return (
      <Card variant="clay">
        <h1 className="text-h2 font-bold text-text-primary">Website not enabled</h1>
        <p className="mt-2 text-small text-text-secondary">
          The website engine is not enabled for this school. Contact SchoolAid support to turn it on.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-h1 font-extrabold text-text-primary">Website Content Editor</h1>
          <p className="mt-1 text-small text-text-muted">
            {template ? `Active Template: ${template.label} v${template.version}` : "Template: Classic"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-1.5"
          >
            <span>👁️</span>
            <span>Live Preview</span>
          </Button>
          {previewPath ? (
            <a
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3.5 py-2 text-small font-medium text-text-primary hover:bg-gray-50 transition-colors"
              href={previewPath}
              target="_blank"
              rel="noreferrer"
            >
              <span>Public URL ↗</span>
            </a>
          ) : null}
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save Changes
          </Button>
        </div>
      </div>

      {banner ? (
        <div
          className={`rounded-lg border px-4 py-3 ${
            banner.type === "ok" ? "border-success bg-success-bg" : "border-error bg-error-bg"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={`text-small font-medium ${banner.type === "ok" ? "text-success" : "text-error"}`}>
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

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs text-primary-dark">
        💡 <strong>Pro-Tip:</strong> Toggle sections ON or OFF, reorder them using ↑ and ↓, and click <strong>&quot;Live Preview&quot;</strong> anytime to test how your school website looks on Mobile and Desktop devices before publishing.
      </div>

      {/* Sections List */}
      <div className="space-y-6">
        {sections.map((section, index) => {
          const meta = KIND_META[section.kind] ?? { label: section.kind, hint: "" };
          return (
            <Card key={section.kind} variant="default" className="transition-all hover:border-gray-300">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
                <div>
                  <h2 className="text-h3 font-bold text-text-primary flex items-center gap-2">
                    <span>{meta.label}</span>
                    {!section.is_visible && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                        Hidden
                      </span>
                    )}
                  </h2>
                  {meta.hint ? <p className="mt-0.5 text-caption text-text-muted">{meta.hint}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Move ${meta.label} up`}
                    disabled={index === 0}
                    onClick={() => moveSection(index, -1)}
                    className="rounded border border-border px-2.5 py-1 text-xs font-bold hover:bg-gray-100 disabled:opacity-30"
                  >
                    ↑ Up
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${meta.label} down`}
                    disabled={index === sections.length - 1}
                    onClick={() => moveSection(index, 1)}
                    className="rounded border border-border px-2.5 py-1 text-xs font-bold hover:bg-gray-100 disabled:opacity-30"
                  >
                    ↓ Down
                  </button>
                  <label className="ml-3 flex cursor-pointer items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-xs font-bold text-text-primary ring-1 ring-gray-200">
                    <input
                      type="checkbox"
                      checked={section.is_visible}
                      onChange={(event) => patchSection(index, { is_visible: event.target.checked })}
                    />
                    <span>Show on Website</span>
                  </label>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <SectionFields
                  section={section}
                  index={index}
                  mediaList={mediaList}
                  onChange={(patch) => patchSection(index, patch)}
                />
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 pt-6">
        <p className="text-caption text-text-muted">
          Need school logos or colors? Manage them in{" "}
          <Link className="text-primary underline font-medium" href="/school-admin/website">
            Branding & Settings
          </Link>
          .
        </p>
        <Button variant="primary" loading={saving} onClick={() => void save()}>
          Save Changes
        </Button>
      </div>

      {/* Live Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/75 backdrop-blur-sm p-2 sm:p-6 animate-in fade-in">
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-6 py-3.5">
              <div className="flex items-center gap-3">
                <span className="font-extrabold text-sm text-gray-900">Website Live Preview</span>
                <span className="rounded-full bg-success-bg px-2.5 py-0.5 text-[10px] font-bold text-success uppercase">
                  Realtime Draft
                </span>
              </div>

              {/* Viewport switcher */}
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setPreviewDevice("desktop")}
                  className={`rounded px-3 py-1 text-xs font-bold transition-colors ${
                    previewDevice === "desktop"
                      ? "bg-[var(--site-primary,#1E3A8A)] text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  💻 Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice("mobile")}
                  className={`rounded px-3 py-1 text-xs font-bold transition-colors ${
                    previewDevice === "mobile"
                      ? "bg-[var(--site-primary,#1E3A8A)] text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  📱 Mobile
                </button>
              </div>

              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"
                aria-label="Close preview"
              >
                ✕
              </button>
            </div>

            {/* Modal Preview Body */}
            <div className="flex-1 overflow-y-auto bg-gray-100 p-4">
              <div
                className={`mx-auto transition-all duration-300 ${
                  previewDevice === "mobile"
                    ? "w-[375px] overflow-hidden rounded-[36px] border-8 border-gray-900 bg-white shadow-2xl min-h-[667px]"
                    : "w-full rounded-xl bg-white shadow-md overflow-hidden"
                }`}
              >
                <SiteRenderer site={previewModel} />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-3">
              <p className="text-xs text-gray-500">
                This preview renders your current edits in real time. Click &quot;Save Changes&quot; to make them public.
              </p>
              <div className="flex items-center gap-3">
                <Button variant="secondary" onClick={() => setPreviewOpen(false)}>
                  Back to Editor
                </Button>
                <Button
                  variant="primary"
                  loading={saving}
                  onClick={async () => {
                    await save();
                    setPreviewOpen(false);
                  }}
                >
                  Save & Publish
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionFields({
  section,
  index,
  mediaList,
  onChange,
}: {
  section: WireSection;
  index: number;
  mediaList: MediaItem[];
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const id = (field: string) => `s${index}-${section.kind}-${field}`;

  switch (section.kind) {
    case "hero":
      return (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={id("headline")}
              label="Main Headline"
              max={LIMITS.headline}
              value={str(section.headline)}
              placeholder="e.g. Nurturing Future Leaders with Academic Excellence"
              onChange={(value) => onChange({ headline: value })}
            />
            <TextField
              id={id("badgeText")}
              label="Announcement Badge (Optional)"
              max={LIMITS.badge}
              value={str(section.badgeText)}
              placeholder="e.g. Admissions Open 2026/2027"
              onChange={(value) => onChange({ badgeText: value })}
            />
          </div>

          <TextArea
            id={id("subheadline")}
            label="Sub-headline / Supporting Message"
            max={LIMITS.subheadline}
            value={str(section.subheadline)}
            placeholder="A brief 1-2 sentence introduction to prospective parents and students."
            onChange={(value) => onChange({ subheadline: value })}
          />

          <ImagePickerField
            id={id("imageUrl")}
            label="Featured Hero Image / Campus Photo"
            value={str(section.imageUrl)}
            mediaList={mediaList}
            onChange={(value) => onChange({ imageUrl: value })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={id("ctaText")}
              label="Primary Button Label"
              max={LIMITS.badge}
              value={str(section.ctaText)}
              placeholder="Defaults to 'Apply Now'"
              onChange={(value) => onChange({ ctaText: value })}
            />
            <TextField
              id={id("ctaLink")}
              label="Primary Button Link"
              max={LIMITS.url}
              value={str(section.ctaLink)}
              placeholder="#contact or https://..."
              onChange={(value) => onChange({ ctaLink: value })}
            />
          </div>

          {/* Stats Editor */}
          <StatsEditor section={section} onChange={onChange} />
        </div>
      );

    case "about":
      return (
        <div className="space-y-4">
          <TextField
            id={id("heading")}
            label="Section Heading"
            max={LIMITS.heading}
            value={str(section.heading)}
            placeholder="e.g. About St. Augustine Academy"
            onChange={(value) => onChange({ heading: value })}
          />
          <TextArea
            id={id("body")}
            label="School Description & Mission"
            max={LIMITS.body}
            value={str(section.body)}
            onChange={(value) => onChange({ body: value })}
          />
          <ImagePickerField
            id={id("imageUrl")}
            label="Campus / Student Photo"
            value={str(section.imageUrl)}
            mediaList={mediaList}
            onChange={(value) => onChange({ imageUrl: value })}
          />
        </div>
      );

    case "programs":
      return (
        <div className="space-y-4">
          <TextField
            id={id("heading")}
            label="Section Heading"
            max={LIMITS.heading}
            value={str(section.heading)}
            placeholder="e.g. Academic Programmes"
            onChange={(value) => onChange({ heading: value })}
          />
          <TextField
            id={id("intro")}
            label="Introductory Subtitle (Optional)"
            max={LIMITS.subheadline}
            value={str(section.intro)}
            placeholder="e.g. Comprehensive curriculum from Early Years to High School."
            onChange={(value) => onChange({ intro: value })}
          />
          <ProgramsEditor section={section} mediaList={mediaList} onChange={onChange} />
        </div>
      );

    case "principal_message":
      return (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={id("authorName")}
              label="Principal's Full Name"
              max={LIMITS.author}
              value={str(section.authorName)}
              placeholder="e.g. Dr. Evelyn Reed"
              onChange={(value) => onChange({ authorName: value })}
            />
            <TextField
              id={id("authorTitle")}
              label="Title / Role"
              max={LIMITS.author}
              value={str(section.authorTitle)}
              placeholder="e.g. Principal & Head of School"
              onChange={(value) => onChange({ authorTitle: value })}
            />
          </div>

          <TextField
            id={id("heading")}
            label="Welcome Heading"
            max={LIMITS.heading}
            value={str(section.heading)}
            placeholder="e.g. Welcome to Our School"
            onChange={(value) => onChange({ heading: value })}
          />

          <TextArea
            id={id("message")}
            label="Message Body"
            max={LIMITS.body}
            value={str(section.message)}
            placeholder="A heartfelt welcome message for families."
            onChange={(value) => onChange({ message: value })}
          />

          <ImagePickerField
            id={id("imageUrl")}
            label="Principal's Portrait Photograph"
            value={str(section.imageUrl)}
            mediaList={mediaList}
            onChange={(value) => onChange({ imageUrl: value })}
          />
        </div>
      );

    case "contact":
      return (
        <div className="space-y-4">
          <TextField
            id={id("heading")}
            label="Section Heading"
            max={LIMITS.heading}
            value={str(section.heading)}
            placeholder="e.g. Contact Admissions"
            onChange={(value) => onChange({ heading: value })}
          />
          <TextArea
            id={id("intro")}
            label="Introductory Text"
            max={LIMITS.body}
            value={str(section.intro)}
            placeholder="e.g. We are delighted to welcome prospective families. Reach out today."
            onChange={(value) => onChange({ intro: value })}
          />
        </div>
      );

    default:
      return <p className="text-small text-text-muted">Section details cannot be edited directly.</p>;
  }
}

function ImagePickerField({
  id,
  label,
  value,
  mediaList,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  mediaList: MediaItem[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-gray-300 p-3 bg-gray-50/50">
      <label className="block text-xs font-bold text-gray-700" htmlFor={id}>
        📷 {label}
      </label>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        {mediaList.length > 0 ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-md border border-border bg-white px-3 py-1.5 text-xs text-gray-800"
          >
            <option value="">-- Select from Media Library (or type URL below) --</option>
            {mediaList.map((m) => (
              <option key={m.id} value={m.url}>
                {m.alt_text || m.path}
              </option>
            ))}
          </select>
        ) : null}
        <input
          id={id}
          type="url"
          value={value}
          placeholder="https://... or select from library"
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-gray-800"
        />
      </div>
      {value ? (
        <div className="flex items-center gap-2 pt-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Preview" className="h-10 w-10 rounded object-cover border" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[11px] font-semibold text-error hover:underline"
          >
            Clear image
          </button>
        </div>
      ) : null}
    </div>
  );
}

function StatsEditor({
  section,
  onChange,
}: {
  section: WireSection;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const stats: { value: string; label: string }[] = Array.isArray(section.stats)
    ? (section.stats as { value: string; label: string }[])
    : [];

  const setStats = (next: { value: string; label: string }[]) => onChange({ stats: next });

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/70 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-800">📊 Quick Achievement Stats (Max 4)</span>
        {stats.length < 4 && (
          <button
            type="button"
            onClick={() => setStats([...stats, { value: "100%", label: "Pass Rate" }])}
            className="text-xs font-bold text-primary hover:underline"
          >
            + Add Stat
          </button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {stats.map((stat, i) => (
          <div key={i} className="flex items-center gap-2 rounded bg-white p-2 border border-gray-200 shadow-sm">
            <input
              type="text"
              placeholder="Value (e.g. 99%)"
              maxLength={LIMITS.statValue}
              value={stat.value}
              onChange={(e) =>
                setStats(stats.map((s, idx) => (idx === i ? { ...s, value: e.target.value } : s)))
              }
              className="w-24 rounded border border-border px-2 py-1 text-xs font-bold text-primary"
            />
            <input
              type="text"
              placeholder="Label (e.g. Pass Rate)"
              maxLength={LIMITS.statLabel}
              value={stat.label}
              onChange={(e) =>
                setStats(stats.map((s, idx) => (idx === i ? { ...s, label: e.target.value } : s)))
              }
              className="flex-1 rounded border border-border px-2 py-1 text-xs text-gray-700"
            />
            <button
              type="button"
              onClick={() => setStats(stats.filter((_, idx) => idx !== i))}
              className="text-gray-400 hover:text-error text-xs px-1"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

type ProgramRow = { name: string; description: string; badge?: string; imageUrl?: string };

function ProgramsEditor({
  section,
  mediaList,
  onChange,
}: {
  section: WireSection;
  mediaList: MediaItem[];
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const items: ProgramRow[] = Array.isArray(section.items)
    ? (section.items as unknown[]).map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return {
          name: str(row.name),
          description: str(row.description),
          badge: str(row.badge),
          imageUrl: str(row.imageUrl),
        };
      })
    : [];

  const setItems = (next: ProgramRow[]) => onChange({ items: next });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-800">Programmes List (Max 12)</p>
        {items.length < LIMITS.listMax && (
          <button
            type="button"
            onClick={() =>
              setItems([
                ...items,
                { name: "New Programme", description: "Programme details", badge: "All Grades" },
              ])
            }
            className="text-xs font-bold text-primary hover:underline"
          >
            + Add Programme
          </button>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item, itemIndex) => (
          <div key={itemIndex} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                maxLength={LIMITS.itemName}
                value={item.name}
                placeholder="Programme Name (e.g. Primary School)"
                onChange={(e) =>
                  setItems(
                    items.map((row, i) => (i === itemIndex ? { ...row, name: e.target.value } : row)),
                  )
                }
                className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold"
              />
              <input
                type="text"
                maxLength={LIMITS.badge}
                value={item.badge || ""}
                placeholder="Tag/Badge (e.g. Grades 1-6)"
                onChange={(e) =>
                  setItems(
                    items.map((row, i) => (i === itemIndex ? { ...row, badge: e.target.value } : row)),
                  )
                }
                className="rounded-md border border-border px-3 py-1.5 text-xs"
              />
            </div>

            <textarea
              rows={2}
              maxLength={LIMITS.itemDescription}
              value={item.description}
              placeholder="Programme summary and objectives"
              onChange={(e) =>
                setItems(
                  items.map((row, i) =>
                    i === itemIndex ? { ...row, description: e.target.value } : row,
                  ),
                )
              }
              className="w-full rounded-md border border-border px-3 py-1.5 text-xs"
            />

            <div className="flex items-center justify-between pt-1">
              <input
                type="url"
                value={item.imageUrl || ""}
                placeholder="Thumbnail Image URL (Optional)"
                onChange={(e) =>
                  setItems(
                    items.map((row, i) =>
                      i === itemIndex ? { ...row, imageUrl: e.target.value } : row,
                    ),
                  )
                }
                className="w-2/3 rounded-md border border-border px-3 py-1 text-xs"
              />
              <button
                type="button"
                disabled={items.length <= LIMITS.listMin}
                onClick={() => setItems(items.filter((_, i) => i !== itemIndex))}
                className="rounded px-2.5 py-1 text-xs font-semibold text-error hover:bg-error-bg disabled:opacity-30"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  max,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  max: number;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-bold text-gray-800" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        maxLength={max}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-xs text-gray-900 shadow-sm focus:border-primary focus:outline-none"
      />
    </div>
  );
}

function TextArea({
  id,
  label,
  value,
  max,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  max: number;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="text-xs font-bold text-gray-800" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        rows={4}
        maxLength={max}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 block w-full rounded-md border border-border px-3 py-2 text-xs text-gray-900 shadow-sm focus:border-primary focus:outline-none"
      />
    </div>
  );
}
