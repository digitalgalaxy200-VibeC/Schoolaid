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
  notice: { label: "Top Announcement Bar", hint: "Urgent notice or admissions alert at the very top of the page." },
  hero: { label: "Welcome Banner & Hero", hint: "The main introduction visitors see at the top." },
  values: { label: "Mission, Vision & Values", hint: "Your school's educational philosophy, mission, and pillars." },
  about: { label: "About Our School", hint: "Your school's history, background, and character." },
  programs: { label: "Academic Programmes", hint: "Curriculum levels, classes, and tiers offered." },
  facilities: { label: "Campus Facilities", hint: "Laboratories, sports complex, hostels, and modern infrastructure." },
  principal_message: { label: "Principal's Welcome", hint: "A greeting message from the Head of School." },
  highlights: { label: "Why Choose Us", hint: "Key strengths, safety, certified educators, and distinctions." },
  testimonials: { label: "Community Testimonials", hint: "Reviews and quotes from parents, students, and alumni." },
  admissions_steps: { label: "Admissions Process", hint: "Step-by-step enrollment guide and prospectus download." },
  events: { label: "School Events & Calendar", hint: "Upcoming dates, open days, and term schedules." },
  faq: { label: "Frequently Asked Questions", hint: "Common parent questions regarding fees, transport, and curriculum." },
  gallery: { label: "Campus Life & Gallery", hint: "Photo album of sports, academics, arts, and graduations." },
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
  const [expandedSectionIndex, setExpandedSectionIndex] = useState<number | null>(0);
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

  const handleUploadMedia = async (file: File): Promise<string | null> => {
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("alt_text", file.name);

      const res = await fetch("/api/school-admin/website/media", {
        method: "POST",
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        setMediaList((prev) => [data as MediaItem, ...prev]);
        return data.url as string;
      }
      setBanner({ type: "error", text: data?.error || "Image upload failed." });
      return null;
    } catch {
      setBanner({ type: "error", text: "Network error while uploading image." });
      return null;
    }
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
    } catch {
      // fetch rejects only when the request never completed. Unhandled, Save sat
      // disabled for ever and the only message was the browser's bare "Failed to
      // fetch" — which does not say whether the page was written. Answer that.
      setBanner({
        type: "error",
        text: "Could not reach the server — nothing was saved. Check your connection and try again.",
        reload: true,
      });
    } finally {
      setSaving(false);
    }
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
          <h1 className="text-h1 font-extrabold text-text-primary">School Website CMS</h1>
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
              <span>Public Website ↗</span>
            </a>
          ) : null}
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            Save All Changes
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
        💡 <strong>Holistic Website Suite:</strong> You have 14 structured school sections available below. Upload images directly from your device, toggle sections ON or OFF, reorder them, and click <strong>&quot;Live Preview&quot;</strong> anytime to test how your school website looks on Mobile and Desktop devices!
      </div>

      {/* Sections List */}
      <div className="space-y-6">
        {sections.map((section, index) => {
          const meta = KIND_META[section.kind] ?? { label: section.kind, hint: "" };
          return (
            <Card key={section.kind} variant="default" className="transition-all hover:border-gray-300 overflow-hidden">
              <div 
                className={`flex flex-wrap items-center justify-between gap-3 cursor-pointer ${expandedSectionIndex === index ? 'border-b border-gray-100 pb-3' : ''}`}
                onClick={() => setExpandedSectionIndex(expandedSectionIndex === index ? null : index)}
              >
                <div className="flex-1">
                  <h2 className="text-h3 font-bold text-text-primary flex items-center gap-2">
                    <span className="flex items-center gap-2">
                      <svg className={`w-4 h-4 transition-transform ${expandedSectionIndex === index ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Section {index + 1}: {meta.label}
                    </span>
                    {!section.is_visible && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                        Hidden
                      </span>
                    )}
                  </h2>
                  {meta.hint && expandedSectionIndex === index ? <p className="mt-1 ml-6 text-caption text-text-muted">{meta.hint}</p> : null}
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
                    <span>Show</span>
                  </label>
                </div>
              </div>

              {expandedSectionIndex === index && (
                <div className="mt-5 space-y-4 animate-in fade-in slide-in-from-top-2">
                  <SectionFields
                    section={section}
                    index={index}
                    mediaList={mediaList}
                    onUploadMedia={handleUploadMedia}
                    onChange={(patch) => patchSection(index, patch)}
                  />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="sticky bottom-0 z-40 bg-white/95 backdrop-blur-md flex items-center justify-between border-t border-gray-200 py-4 px-2 sm:px-0 -mx-4 sm:mx-0">
        <p className="text-caption text-text-muted hidden sm:block">
          Need school logos or colors? Manage them in{" "}
          <Link className="text-primary underline font-medium" href="/school-admin/website">
            Branding & Settings
          </Link>
          .
        </p>
        <Button variant="primary" loading={saving} onClick={() => void save()} className="w-full sm:w-auto">
          Save All Changes
        </Button>
      </div>

      {/* Live Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/75 backdrop-blur-sm p-0 sm:p-6 animate-in fade-in">
          <div className="mx-auto flex h-[100dvh] sm:h-auto w-full max-w-6xl flex-1 flex-col overflow-hidden sm:rounded-2xl bg-white sm:shadow-2xl">
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 sm:px-6 py-3.5">
              <div className="flex items-center gap-3">
                <span className="font-extrabold text-sm text-gray-900">Live Preview</span>
                <span className="hidden sm:inline-flex rounded-full bg-success-bg px-2.5 py-0.5 text-[10px] font-bold text-success uppercase">
                  Realtime
                </span>
              </div>

              {/* Viewport switcher */}
              <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setPreviewDevice("desktop")}
                  className={`rounded px-2 sm:px-3 py-1 text-xs font-bold transition-colors ${
                    previewDevice === "desktop"
                      ? "bg-[var(--site-primary,#1E3A8A)] text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  💻 <span className="hidden sm:inline">Desktop</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice("mobile")}
                  className={`rounded px-2 sm:px-3 py-1 text-xs font-bold transition-colors ${
                    previewDevice === "mobile"
                      ? "bg-[var(--site-primary,#1E3A8A)] text-white shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  📱 <span className="hidden sm:inline">Mobile</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 ml-auto sm:ml-0"
                aria-label="Close preview"
              >
                ✕
              </button>
            </div>

            {/* Modal Preview Body */}
            <div className="flex-1 overflow-y-auto bg-gray-100 p-2 sm:p-4">
              <div
                className={`mx-auto transition-all duration-300 ${
                  previewDevice === "mobile"
                    ? "w-full max-w-[375px] overflow-hidden sm:rounded-[36px] sm:border-8 sm:border-gray-900 bg-white shadow-2xl min-h-[80vh] sm:min-h-[667px]"
                    : "w-full rounded-xl bg-white shadow-md overflow-hidden"
                }`}
              >
                <SiteRenderer site={previewModel} />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-4 sm:px-6 py-3 pb-safe">
              <p className="hidden sm:block text-xs text-gray-500">
                This preview renders your current edits in real time. Click &quot;Save All Changes&quot; to make them public.
              </p>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Button variant="secondary" onClick={() => setPreviewOpen(false)} className="flex-1 sm:flex-none">
                  Back
                </Button>
                <Button
                  variant="primary"
                  loading={saving}
                  className="flex-1 sm:flex-none"
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
  onUploadMedia,
  onChange,
}: {
  section: WireSection;
  index: number;
  mediaList: MediaItem[];
  onUploadMedia: (file: File) => Promise<string | null>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const id = (field: string) => `s${index}-${section.kind}-${field}`;

  switch (section.kind) {
    case "notice":
      return (
        <div className="space-y-4">
          <TextField
            id={id("message")}
            label="Announcement Message"
            max={LIMITS.subheadline}
            value={str(section.message)}
            placeholder="e.g. Admissions for the 2026/2027 Academic Session are now open! Entrance examinations hold on Saturday, 18th July."
            onChange={(value) => onChange({ message: value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={id("linkText")}
              label="Action Link Text (Optional)"
              max={LIMITS.badge}
              value={str(section.linkText)}
              placeholder="e.g. Apply Online"
              onChange={(value) => onChange({ linkText: value })}
            />
            <TextField
              id={id("linkUrl")}
              label="Action Link URL (Optional)"
              max={LIMITS.url}
              value={str(section.linkUrl)}
              placeholder="#admissions or https://..."
              onChange={(value) => onChange({ linkUrl: value })}
            />
          </div>
        </div>
      );

    case "hero":
      return (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={id("headline")}
              label="Main Headline"
              max={LIMITS.headline}
              value={str(section.headline)}
              placeholder="e.g. Nurturing Future Leaders with Academic Distinction"
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
            label="Sub-headline / Value Proposition"
            max={LIMITS.subheadline}
            value={str(section.subheadline)}
            placeholder="A brief 1-2 sentence welcome to prospective parents and students."
            onChange={(value) => onChange({ subheadline: value })}
          />

          <ImagePickerField
            id={id("imageUrl")}
            label="Featured Hero Image / Campus Photography"
            value={str(section.imageUrl)}
            mediaList={mediaList}
            onUploadMedia={onUploadMedia}
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

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={id("secondaryCtaText")}
              label="Secondary Button Label"
              max={LIMITS.badge}
              value={str(section.secondaryCtaText)}
              placeholder="Defaults to 'Explore Academics'"
              onChange={(value) => onChange({ secondaryCtaText: value })}
            />
            <TextField
              id={id("secondaryCtaLink")}
              label="Secondary Button Link"
              max={LIMITS.url}
              value={str(section.secondaryCtaLink)}
              placeholder="#programs or https://..."
              onChange={(value) => onChange({ secondaryCtaLink: value })}
            />
          </div>

          {/* Stats Editor */}
          <StatsEditor section={section} onChange={onChange} />
        </div>
      );

    case "values":
      return (
        <div className="space-y-4">
          <TextField
            id={id("heading")}
            label="Section Heading"
            max={LIMITS.heading}
            value={str(section.heading)}
            placeholder="e.g. Our Mission, Vision & Core Values"
            onChange={(value) => onChange({ heading: value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextArea
              id={id("mission")}
              label="Mission Statement"
              max={LIMITS.body}
              value={str(section.mission)}
              placeholder="To provide holistic, cutting-edge education that inspires character, critical thinking, and leadership."
              onChange={(value) => onChange({ mission: value })}
            />
            <TextArea
              id={id("vision")}
              label="Vision Statement"
              max={LIMITS.body}
              value={str(section.vision)}
              placeholder="To be a premier institution recognized for academic excellence, moral integrity, and global impact."
              onChange={(value) => onChange({ vision: value })}
            />
          </div>
          <ValuesItemsEditor section={section} onChange={onChange} />
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
            placeholder="e.g. About Our Academy"
            onChange={(value) => onChange({ heading: value })}
          />
          <TextArea
            id={id("body")}
            label="School Profile & History"
            max={LIMITS.body}
            value={str(section.body)}
            placeholder="Share your school's founding story, values, and dedication to excellence."
            onChange={(value) => onChange({ body: value })}
          />
          <ImagePickerField
            id={id("imageUrl")}
            label="Campus / Student Photo"
            value={str(section.imageUrl)}
            mediaList={mediaList}
            onUploadMedia={onUploadMedia}
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
            placeholder="e.g. Comprehensive curriculum from Early Years to Senior Secondary College."
            onChange={(value) => onChange({ intro: value })}
          />
          <ProgramsEditor section={section} mediaList={mediaList} onUploadMedia={onUploadMedia} onChange={onChange} />
        </div>
      );

    case "facilities":
      return (
        <div className="space-y-4">
          <TextField
            id={id("heading")}
            label="Section Heading"
            max={LIMITS.heading}
            value={str(section.heading)}
            placeholder="e.g. Campus Facilities & Infrastructure"
            onChange={(value) => onChange({ heading: value })}
          />
          <TextField
            id={id("subheading")}
            label="Subtitle (Optional)"
            max={LIMITS.subheadline}
            value={str(section.subheading)}
            placeholder="e.g. Modern spaces designed for intellectual and physical development."
            onChange={(value) => onChange({ subheading: value })}
          />
          <FacilitiesEditor section={section} mediaList={mediaList} onUploadMedia={onUploadMedia} onChange={onChange} />
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
              label="Title / Designation"
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
            placeholder="e.g. Welcome from the Principal"
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
            onUploadMedia={onUploadMedia}
            onChange={(value) => onChange({ imageUrl: value })}
          />
        </div>
      );

    case "highlights":
      return (
        <div className="space-y-4">
          <TextField
            id={id("heading")}
            label="Section Heading"
            max={LIMITS.heading}
            value={str(section.heading)}
            placeholder="e.g. Why Choose Our School"
            onChange={(value) => onChange({ heading: value })}
          />
          <TextField
            id={id("subheading")}
            label="Subtitle (Optional)"
            max={LIMITS.subheadline}
            value={str(section.subheading)}
            placeholder="e.g. Dedicated to setting new standards in quality education."
            onChange={(value) => onChange({ subheading: value })}
          />
          <HighlightsItemsEditor section={section} onChange={onChange} />
        </div>
      );

    case "testimonials":
      return (
        <div className="space-y-4">
          <TextField
            id={id("heading")}
            label="Section Heading"
            max={LIMITS.heading}
            value={str(section.heading)}
            placeholder="e.g. What Parents & Students Say"
            onChange={(value) => onChange({ heading: value })}
          />
          <TextField
            id={id("subheading")}
            label="Subtitle (Optional)"
            max={LIMITS.subheadline}
            value={str(section.subheading)}
            placeholder="e.g. Hear directly from our thriving school community."
            onChange={(value) => onChange({ subheading: value })}
          />
          <TestimonialsEditor section={section} mediaList={mediaList} onUploadMedia={onUploadMedia} onChange={onChange} />
        </div>
      );

    case "admissions_steps":
      return (
        <div className="space-y-4">
          <TextField
            id={id("heading")}
            label="Section Heading"
            max={LIMITS.heading}
            value={str(section.heading)}
            placeholder="e.g. Step-by-Step Admissions Guide"
            onChange={(value) => onChange({ heading: value })}
          />
          <TextField
            id={id("subheading")}
            label="Subtitle (Optional)"
            max={LIMITS.subheadline}
            value={str(section.subheading)}
            placeholder="e.g. Our simple 4-step enrollment process for prospective parents."
            onChange={(value) => onChange({ subheading: value })}
          />
          <TextField
            id={id("prospectusUrl")}
            label="Downloadable Prospectus Link (PDF / Document URL)"
            max={LIMITS.url}
            value={str(section.prospectusUrl)}
            placeholder="https://.../prospectus.pdf"
            onChange={(value) => onChange({ prospectusUrl: value })}
          />
          <AdmissionsStepsEditor section={section} onChange={onChange} />
        </div>
      );

    case "events":
      return (
        <div className="space-y-4">
          <TextField
            id={id("heading")}
            label="Section Heading"
            max={LIMITS.heading}
            value={str(section.heading)}
            placeholder="e.g. Upcoming Events & School Calendar"
            onChange={(value) => onChange({ heading: value })}
          />
          <TextField
            id={id("subheading")}
            label="Subtitle (Optional)"
            max={LIMITS.subheadline}
            value={str(section.subheading)}
            placeholder="e.g. Stay up to date with activities, exams, and celebrations."
            onChange={(value) => onChange({ subheading: value })}
          />
          <EventsEditor section={section} onChange={onChange} />
        </div>
      );

    case "faq":
      return (
        <div className="space-y-4">
          <TextField
            id={id("heading")}
            label="Section Heading"
            max={LIMITS.heading}
            value={str(section.heading)}
            placeholder="e.g. Frequently Asked Questions"
            onChange={(value) => onChange({ heading: value })}
          />
          <TextField
            id={id("subheading")}
            label="Subtitle (Optional)"
            max={LIMITS.subheadline}
            value={str(section.subheading)}
            placeholder="e.g. Find quick answers to common questions about enrollment, transport, and boarding."
            onChange={(value) => onChange({ subheading: value })}
          />
          <FaqEditor section={section} onChange={onChange} />
        </div>
      );

    case "gallery":
      return (
        <div className="space-y-4">
          <TextField
            id={id("heading")}
            label="Section Heading"
            max={LIMITS.heading}
            value={str(section.heading)}
            placeholder="e.g. Campus Life & Gallery"
            onChange={(value) => onChange({ heading: value })}
          />
          <TextField
            id={id("subheading")}
            label="Subtitle (Optional)"
            max={LIMITS.subheadline}
            value={str(section.subheading)}
            placeholder="e.g. A snapshot of academics, sports, laboratories, and arts."
            onChange={(value) => onChange({ subheading: value })}
          />
          <GalleryEditor section={section} mediaList={mediaList} onUploadMedia={onUploadMedia} onChange={onChange} />
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
            placeholder="e.g. Contact Admissions & Location"
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
  onUploadMedia,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  mediaList: MediaItem[];
  onUploadMedia: (file: File) => Promise<string | null>;
  onChange: (value: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await onUploadMedia(file);
    if (url) onChange(url);
    setUploading(false);
  };

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-gray-300 p-4 bg-gray-50/50">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-gray-800" htmlFor={id}>
          📷 {label}
        </label>
        <label className="cursor-pointer inline-flex items-center gap-1 rounded-lg bg-[var(--site-primary,#1E3A8A)] px-3 py-1 text-xs font-bold text-white shadow-sm hover:opacity-90 active:scale-95">
          <span>{uploading ? "⏳ Uploading..." : "📤 Upload From Computer/Phone"}</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={handleFile}
          />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        {mediaList.length > 0 ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="rounded-md border border-border bg-white px-3 py-1.5 text-xs text-gray-800"
          >
            <option value="">-- Or choose from existing Media Library --</option>
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
          placeholder="https://... or paste external link"
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-gray-800"
        />
      </div>

      {value ? (
        <div className="flex items-center gap-3 pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Preview" className="h-12 w-12 rounded-lg object-cover border shadow-sm" />
          <div className="flex flex-col">
            <span className="text-[11px] font-mono text-gray-500 line-clamp-1">{value}</span>
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-[11px] font-bold text-error hover:underline text-left"
            >
              ✕ Remove Image
            </button>
          </div>
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
    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
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
          <div key={i} className="flex items-center gap-2 rounded-lg bg-white p-2 border border-gray-200 shadow-sm">
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

function ValuesItemsEditor({
  section,
  onChange,
}: {
  section: WireSection;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const items: { title: string; description: string; icon?: string }[] = Array.isArray(section.items)
    ? (section.items as unknown[]).map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return { title: str(row.title), description: str(row.description), icon: str(row.icon) };
      })
    : [];

  const setItems = (next: { title: string; description: string; icon?: string }[]) => onChange({ items: next });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-800">💎 Core Values Pillars (Max 8)</span>
        {items.length < 8 && (
          <button
            type="button"
            onClick={() => setItems([...items, { title: "Integrity", description: "Uncompromising moral character.", icon: "💎" }])}
            className="text-xs font-bold text-primary hover:underline"
          >
            + Add Value Pillar
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2 shadow-sm">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Icon"
                maxLength={10}
                value={item.icon || ""}
                onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, icon: e.target.value } : r)))}
                className="w-12 rounded border border-border px-2 py-1 text-xs text-center font-bold"
              />
              <input
                type="text"
                placeholder="Title (e.g. Integrity)"
                maxLength={LIMITS.itemName}
                value={item.title}
                onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, title: e.target.value } : r)))}
                className="flex-1 rounded border border-border px-2 py-1 text-xs font-bold"
              />
              <button
                type="button"
                onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                className="text-gray-400 hover:text-error text-xs px-1"
              >
                ✕
              </button>
            </div>
            <textarea
              rows={2}
              placeholder="Value description"
              maxLength={LIMITS.itemDescription}
              value={item.description}
              onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, description: e.target.value } : r)))}
              className="w-full rounded border border-border px-2 py-1 text-xs text-gray-600"
            />
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
  onUploadMedia,
  onChange,
}: {
  section: WireSection;
  mediaList: MediaItem[];
  onUploadMedia: (file: File) => Promise<string | null>;
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

            <ImagePickerField
              id={`p-img-${itemIndex}`}
              label="Programme Thumbnail Image"
              value={item.imageUrl || ""}
              mediaList={mediaList}
              onUploadMedia={onUploadMedia}
              onChange={(url) =>
                setItems(
                  items.map((row, i) => (i === itemIndex ? { ...row, imageUrl: url } : row)),
                )
              }
            />

            <div className="flex justify-end pt-1">
              <button
                type="button"
                disabled={items.length <= LIMITS.listMin}
                onClick={() => setItems(items.filter((_, i) => i !== itemIndex))}
                className="rounded px-2.5 py-1 text-xs font-semibold text-error hover:bg-error-bg disabled:opacity-30"
              >
                Remove Programme
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FacilitiesEditor({
  section,
  mediaList,
  onUploadMedia,
  onChange,
}: {
  section: WireSection;
  mediaList: MediaItem[];
  onUploadMedia: (file: File) => Promise<string | null>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const items: { title: string; description: string; imageUrl?: string }[] = Array.isArray(section.items)
    ? (section.items as unknown[]).map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return { title: str(row.title), description: str(row.description), imageUrl: str(row.imageUrl) };
      })
    : [];

  const setItems = (next: { title: string; description: string; imageUrl?: string }[]) => onChange({ items: next });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-800">Facilities List (Max 12)</p>
        {items.length < LIMITS.listMax && (
          <button
            type="button"
            onClick={() =>
              setItems([...items, { title: "Science Laboratories", description: "Fully equipped modern physics, chemistry, and biology labs." }])
            }
            className="text-xs font-bold text-primary hover:underline"
          >
            + Add Facility
          </button>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
            <input
              type="text"
              maxLength={LIMITS.itemName}
              value={item.title}
              placeholder="Facility Title (e.g. Science Laboratories)"
              onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, title: e.target.value } : r)))}
              className="w-full rounded-md border border-border px-3 py-1.5 text-xs font-bold"
            />
            <textarea
              rows={2}
              maxLength={LIMITS.itemDescription}
              value={item.description}
              placeholder="Facility features and details"
              onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, description: e.target.value } : r)))}
              className="w-full rounded-md border border-border px-3 py-1.5 text-xs"
            />
            <ImagePickerField
              id={`f-img-${i}`}
              label="Facility Photo"
              value={item.imageUrl || ""}
              mediaList={mediaList}
              onUploadMedia={onUploadMedia}
              onChange={(url) => setItems(items.map((r, idx) => (idx === i ? { ...r, imageUrl: url } : r)))}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                className="text-xs text-error font-bold hover:underline"
              >
                Remove Facility
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HighlightsItemsEditor({
  section,
  onChange,
}: {
  section: WireSection;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const items: { title: string; description: string; icon?: string }[] = Array.isArray(section.items)
    ? (section.items as unknown[]).map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return { title: str(row.title), description: str(row.description), icon: str(row.icon) };
      })
    : [];

  const setItems = (next: { title: string; description: string; icon?: string }[]) => onChange({ items: next });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-800">Distinction Cards (Max 8)</span>
        {items.length < 8 && (
          <button
            type="button"
            onClick={() => setItems([...items, { title: "Safety & Security", description: "24/7 CCTV surveillance and secure campus environment.", icon: "🛡️" }])}
            className="text-xs font-bold text-primary hover:underline"
          >
            + Add Card
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2 shadow-sm">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Icon"
                maxLength={10}
                value={item.icon || ""}
                onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, icon: e.target.value } : r)))}
                className="w-12 rounded border border-border px-2 py-1 text-xs text-center font-bold"
              />
              <input
                type="text"
                placeholder="Title (e.g. Safety)"
                maxLength={LIMITS.itemName}
                value={item.title}
                onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, title: e.target.value } : r)))}
                className="flex-1 rounded border border-border px-2 py-1 text-xs font-bold"
              />
              <button
                type="button"
                onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                className="text-gray-400 hover:text-error text-xs px-1"
              >
                ✕
              </button>
            </div>
            <textarea
              rows={2}
              placeholder="Highlight description"
              maxLength={LIMITS.itemDescription}
              value={item.description}
              onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, description: e.target.value } : r)))}
              className="w-full rounded border border-border px-2 py-1 text-xs text-gray-600"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function TestimonialsEditor({
  section,
  mediaList,
  onUploadMedia,
  onChange,
}: {
  section: WireSection;
  mediaList: MediaItem[];
  onUploadMedia: (file: File) => Promise<string | null>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const items: { quote: string; authorName: string; role: string; avatarUrl?: string }[] = Array.isArray(section.items)
    ? (section.items as unknown[]).map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return {
          quote: str(row.quote),
          authorName: str(row.authorName),
          role: str(row.role),
          avatarUrl: str(row.avatarUrl),
        };
      })
    : [];

  const setItems = (next: { quote: string; authorName: string; role: string; avatarUrl?: string }[]) => onChange({ items: next });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-800">Testimonials List (Max 12)</p>
        {items.length < LIMITS.listMax && (
          <button
            type="button"
            onClick={() =>
              setItems([...items, { quote: "Attending this school was transformative for our child's academic confidence.", authorName: "Mrs. Adebayo", role: "Parent of JSS3 Student" }])
            }
            className="text-xs font-bold text-primary hover:underline"
          >
            + Add Testimonial
          </button>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                maxLength={LIMITS.author}
                value={item.authorName}
                placeholder="Author Name (e.g. Mr. Johnson)"
                onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, authorName: e.target.value } : r)))}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-bold"
              />
              <input
                type="text"
                maxLength={LIMITS.itemName}
                value={item.role}
                placeholder="Role (e.g. Parent of Grade 5 Student)"
                onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, role: e.target.value } : r)))}
                className="rounded-md border border-border px-3 py-1.5 text-xs"
              />
            </div>
            <textarea
              rows={2}
              maxLength={LIMITS.body}
              value={item.quote}
              placeholder="Testimonial quote"
              onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, quote: e.target.value } : r)))}
              className="w-full rounded-md border border-border px-3 py-1.5 text-xs"
            />
            <ImagePickerField
              id={`t-img-${i}`}
              label="Author Photo / Avatar (Optional)"
              value={item.avatarUrl || ""}
              mediaList={mediaList}
              onUploadMedia={onUploadMedia}
              onChange={(url) => setItems(items.map((r, idx) => (idx === i ? { ...r, avatarUrl: url } : r)))}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                className="text-xs text-error font-bold hover:underline"
              >
                Remove Testimonial
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdmissionsStepsEditor({
  section,
  onChange,
}: {
  section: WireSection;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const items: { stepNumber: string; title: string; description: string }[] = Array.isArray(section.items)
    ? (section.items as unknown[]).map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return { stepNumber: str(row.stepNumber), title: str(row.title), description: str(row.description) };
      })
    : [];

  const setItems = (next: { stepNumber: string; title: string; description: string }[]) => onChange({ items: next });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-800">Enrollment Steps (Max 6)</span>
        {items.length < 6 && (
          <button
            type="button"
            onClick={() => setItems([...items, { stepNumber: `${items.length + 1}`, title: "Entrance Assessment", description: "Student sits for a brief diagnostic evaluation." }])}
            className="text-xs font-bold text-primary hover:underline"
          >
            + Add Step
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2 shadow-sm">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Step #"
                maxLength={10}
                value={item.stepNumber}
                onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, stepNumber: e.target.value } : r)))}
                className="w-16 rounded border border-border px-2 py-1 text-xs text-center font-bold"
              />
              <input
                type="text"
                placeholder="Step Title (e.g. Obtain Form)"
                maxLength={LIMITS.itemName}
                value={item.title}
                onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, title: e.target.value } : r)))}
                className="flex-1 rounded border border-border px-2 py-1 text-xs font-bold"
              />
              <button
                type="button"
                onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                className="text-gray-400 hover:text-error text-xs px-1"
              >
                ✕
              </button>
            </div>
            <textarea
              rows={2}
              placeholder="Step instructions"
              maxLength={LIMITS.itemDescription}
              value={item.description}
              onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, description: e.target.value } : r)))}
              className="w-full rounded border border-border px-2 py-1 text-xs text-gray-600"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EventsEditor({
  section,
  onChange,
}: {
  section: WireSection;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const items: { title: string; date: string; time?: string; location?: string; category?: string }[] = Array.isArray(section.items)
    ? (section.items as unknown[]).map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return {
          title: str(row.title),
          date: str(row.date),
          time: str(row.time),
          location: str(row.location),
          category: str(row.category),
        };
      })
    : [];

  const setItems = (next: { title: string; date: string; time?: string; location?: string; category?: string }[]) => onChange({ items: next });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-800">Events List (Max 8)</p>
        {items.length < 8 && (
          <button
            type="button"
            onClick={() =>
              setItems([...items, { title: "Inter-House Sports Festival", date: "Oct 24, 2026", time: "9:00 AM", location: "Main Sports Arena", category: "Sports" }])
            }
            className="text-xs font-bold text-primary hover:underline"
          >
            + Add Event
          </button>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                maxLength={LIMITS.itemName}
                value={item.title}
                placeholder="Event Title"
                onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, title: e.target.value } : r)))}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-bold"
              />
              <input
                type="text"
                maxLength={40}
                value={item.date}
                placeholder="Date (e.g. Nov 14, 2026)"
                onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, date: e.target.value } : r)))}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                type="text"
                maxLength={40}
                value={item.time || ""}
                placeholder="Time (e.g. 10:00 AM)"
                onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, time: e.target.value } : r)))}
                className="rounded-md border border-border px-3 py-1 text-xs"
              />
              <input
                type="text"
                maxLength={LIMITS.itemName}
                value={item.location || ""}
                placeholder="Location (e.g. School Hall)"
                onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, location: e.target.value } : r)))}
                className="rounded-md border border-border px-3 py-1 text-xs"
              />
              <input
                type="text"
                maxLength={LIMITS.badge}
                value={item.category || ""}
                placeholder="Category (e.g. Academic)"
                onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, category: e.target.value } : r)))}
                className="rounded-md border border-border px-3 py-1 text-xs"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                className="text-xs text-error font-bold hover:underline"
              >
                Remove Event
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqEditor({
  section,
  onChange,
}: {
  section: WireSection;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const items: { question: string; answer: string }[] = Array.isArray(section.items)
    ? (section.items as unknown[]).map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return { question: str(row.question), answer: str(row.answer) };
      })
    : [];

  const setItems = (next: { question: string; answer: string }[]) => onChange({ items: next });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-800">FAQ List (Max 12)</p>
        {items.length < 12 && (
          <button
            type="button"
            onClick={() =>
              setItems([...items, { question: "What are the school resumption and closing hours?", answer: "School runs from 7:30 AM to 3:30 PM, Monday through Friday." }])
            }
            className="text-xs font-bold text-primary hover:underline"
          >
            + Add FAQ
          </button>
        )}
      </div>

      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <input
                type="text"
                maxLength={LIMITS.headline}
                value={item.question}
                placeholder="Question (e.g. Do you offer bus transport?)"
                onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, question: e.target.value } : r)))}
                className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs font-bold"
              />
              <button
                type="button"
                onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                className="text-gray-400 hover:text-error text-xs px-1"
              >
                ✕
              </button>
            </div>
            <textarea
              rows={2}
              maxLength={LIMITS.body}
              value={item.answer}
              placeholder="Answer details"
              onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, answer: e.target.value } : r)))}
              className="w-full rounded-md border border-border px-3 py-1.5 text-xs text-gray-700"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function GalleryEditor({
  section,
  mediaList,
  onUploadMedia,
  onChange,
}: {
  section: WireSection;
  mediaList: MediaItem[];
  onUploadMedia: (file: File) => Promise<string | null>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const items: { imageUrl: string; caption?: string; category?: string }[] = Array.isArray(section.items)
    ? (section.items as unknown[]).map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return { imageUrl: str(row.imageUrl), caption: str(row.caption), category: str(row.category) };
      })
    : [];

  const setItems = (next: { imageUrl: string; caption?: string; category?: string }[]) => onChange({ items: next });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-gray-800">Gallery Photos (Max 12)</p>
        {items.length < 12 && (
          <button
            type="button"
            onClick={() => setItems([...items, { imageUrl: "", caption: "Campus photo", category: "Campus" }])}
            className="text-xs font-bold text-primary hover:underline"
          >
            + Add Photo Slot
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2 shadow-sm">
            <ImagePickerField
              id={`g-img-${i}`}
              label={`Photo #${i + 1}`}
              value={item.imageUrl}
              mediaList={mediaList}
              onUploadMedia={onUploadMedia}
              onChange={(url) => setItems(items.map((r, idx) => (idx === i ? { ...r, imageUrl: url } : r)))}
            />
            <div className="grid gap-2 grid-cols-2">
              <input
                type="text"
                placeholder="Caption (e.g. Science Fair)"
                maxLength={LIMITS.itemName}
                value={item.caption || ""}
                onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, caption: e.target.value } : r)))}
                className="rounded border border-border px-2 py-1 text-xs"
              />
              <input
                type="text"
                placeholder="Tag (e.g. Sports)"
                maxLength={LIMITS.badge}
                value={item.category || ""}
                onChange={(e) => setItems(items.map((r, idx) => (idx === i ? { ...r, category: e.target.value } : r)))}
                className="rounded border border-border px-2 py-1 text-xs"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                className="text-xs text-error font-bold hover:underline"
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
