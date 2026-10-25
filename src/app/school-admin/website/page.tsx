"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card } from "@/components/ui";
import { SITE_PALETTES } from "@/lib/site/theme";

/**
 * Website configuration — the first screen a school actually uses.
 *
 * Everything with a decision in it happens on the server: the PUT validates the
 * whole payload, checks that a chosen logo belongs to this school, and is the
 * only place that writes. This screen collects values and shows the result.
 *
 * There is no publish step yet — configuration takes effect on the public page
 * immediately. Draft, preview and publish arrive with their own slice; saying so
 * on the screen would be misleading, so the button says "Save", not "Publish".
 */

type SiteConfig = {
  theme: { palette: string; logo_path: string | null };
  contact: Record<string, string | null>;
  seo: { title: string | null; description: string | null };
};

type MediaItem = { id: string; path: string; url: string; alt_text: string | null };

const CONTACT_FIELDS: { key: string; label: string; placeholder: string; hint?: string; tel?: boolean }[] = [
  {
    key: "whatsapp",
    label: "WhatsApp",
    placeholder: "0803 123 4567",
    tel: true,
    hint: "Type your number — with or without +234. It becomes a WhatsApp link automatically, and the Contact section shows a “Chat us on WhatsApp” button.",
  },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/…" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/…" },
  { key: "x", label: "X", placeholder: "https://x.com/…" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@…" },
];

export default function WebsiteConfigPage() {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [template, setTemplate] = useState<{ label: string; version: string } | null>(null);

  const [palette, setPalette] = useState(SITE_PALETTES[0].id);
  const [logoPath, setLogoPath] = useState("");
  const [contact, setContact] = useState<Record<string, string>>({});
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  // The logo from School Settings is what the website uses unless a different
  // image is chosen here, so the screen has to be able to SHOW it — otherwise
  // "use the school's logo" is a label with nothing behind it.
  const [schoolLogoUrl, setSchoolLogoUrl] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState("");

  // The logo control shows ONE image — the one in use — and opens a compact
  // chooser only when asked. Rendering the whole library here turned a branding
  // decision into a wall of thumbnails.
  const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/school-admin/website/config");
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setBanner({ type: "error", text: data?.error || "Could not load the website configuration." });
        return;
      }
      if (data.enabled === false) {
        setEnabled(false);
        return;
      }

      const config = data.config as SiteConfig;
      setTemplate(data.template ?? null);
      setPalette(config.theme.palette);
      setLogoPath(config.theme.logo_path ?? "");
      setSchoolLogoUrl(data.school?.logo_url ?? null);
      setSchoolName(data.school?.name ?? "");
      setContact(
        Object.fromEntries(
          CONTACT_FIELDS.map((field) => [field.key, config.contact[field.key] ?? ""]),
        ),
      );
      setSeoTitle(config.seo.title ?? "");
      setSeoDescription(config.seo.description ?? "");

      const mediaRes = await fetch("/api/school-admin/website/media");
      if (mediaRes.ok) {
        const mediaData = await mediaRes.json().catch(() => ({}));
        setMedia(mediaData.media ?? []);
      }
    } catch {
      // fetch rejects only when the request never completed — offline, a dropped
      // connection, or the browser refusing it. Unhandled, the screen sat on
      // "Loading…" for ever, which reads as a hang rather than a failure.
      setBanner({ type: "error", text: "Could not reach the server. Reload the page and try again." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred to a microtask: `load` sets state as its first act, and calling it
    // synchronously from the effect body trips the cascading-render lint rule.
    void Promise.resolve().then(load);
  }, [load]);

  const uploadLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadingLogo(true);
    setLogoError(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("alt_text", file.name);

      const res = await fetch("/api/school-admin/website/media", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url || !data?.path) {
        setLogoError(data?.error || "Could not upload the image.");
        return;
      }

      // It is in the library now, so it belongs in the chooser and is selected.
      setMedia((prev) => [data as MediaItem, ...prev]);
      setLogoPath(data.path as string);
      setLogoPickerOpen(false);
    } catch {
      setLogoError("Could not reach the server — the image was not uploaded.");
    } finally {
      setUploadingLogo(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setBanner(null);

    try {
      const res = await fetch("/api/school-admin/website/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: { palette, logo_path: logoPath || null },
          contact,
          seo: { title: seoTitle, description: seoDescription },
        }),
      });
      const data = await res.json().catch(() => ({}));

      setBanner(
        res.ok
          ? { type: "ok", text: "Saved. Your website branding and domain settings have been updated." }
          : { type: "error", text: data?.error || "Could not save the configuration." },
      );
    } catch {
      // Unhandled, the button stayed on "Saving…" for ever and the only thing
      // the user saw was the browser's own "Failed to fetch", which does not say
      // whether anything was written. For a save button that is the question
      // that matters, so answer it.
      setBanner({
        type: "error",
        text: "Could not reach the server — nothing was saved. Check your connection and try again.",
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

  // What the site will actually show: the chosen website logo, or — by default —
  // the logo uploaded in School Settings.
  const override = media.find((item) => item.path === logoPath) ?? null;
  const effectiveLogoUrl = override?.url ?? schoolLogoUrl;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 font-extrabold text-text-primary">School website</h1>
          <p className="mt-1 text-small text-text-muted">
            {template
              ? `Template: ${template.label} v${template.version}`
              : "Template: not configured"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            className="text-small font-medium text-primary underline"
            href="/school-admin/website/content"
          >
            Page content →
          </Link>
          <Link
            className="text-small font-medium text-primary underline"
            href="/school-admin/website/media"
          >
            Media library →
          </Link>
        </div>
      </div>

      {banner ? (
        <div
          className={`rounded-sm border px-4 py-3 ${
            banner.type === "ok" ? "border-success bg-success-bg" : "border-error bg-error-bg"
          }`}
        >
          <p
            className={`text-small font-medium ${
              banner.type === "ok" ? "text-success" : "text-error"
            }`}
          >
            {banner.text}
          </p>
        </div>
      ) : null}

      <Card variant="default">
        <h2 className="text-h3 font-bold text-text-primary">Branding</h2>
        <p className="mt-1 text-small text-text-muted">
          Your colours are applied to your website only. SchoolAid keeps its own look.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 tablet:grid-cols-3 desktop:grid-cols-5">
          {SITE_PALETTES.map((option) => {
            const selected = option.id === palette;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setPalette(option.id)}
                className={`rounded-sm border p-3 text-left transition-colors ${
                  selected ? "border-primary ring-2 ring-border-focus" : "border-border hover:bg-bg"
                }`}
              >
                <span className="flex gap-1">
                  <span
                    className="h-6 w-6 rounded-full border border-border"
                    style={{ backgroundColor: option.colors.primary }}
                  />
                  <span
                    className="h-6 w-6 rounded-full border border-border"
                    style={{ backgroundColor: option.colors.accent }}
                  />
                  <span
                    className="h-6 w-6 rounded-full border border-border"
                    style={{ backgroundColor: option.colors.tint }}
                  />
                </span>
                <span className="mt-2 block text-small font-medium text-text-primary">
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <p className="text-small font-medium text-text-primary">Logo on the website</p>

          {/* One logo, the one that is live. Nothing else is shown until the
              school asks to change it. */}
          <div className="mt-2 flex flex-wrap items-center gap-4 rounded-sm border border-border bg-bg p-3">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-surface">
              {effectiveLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={effectiveLogoUrl} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="text-small font-bold text-text-muted">
                  {(schoolName || "S").slice(0, 2).toUpperCase()}
                </span>
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-small font-medium text-text-primary">
                {logoPath ? "Custom website logo" : "Your School Settings logo"}
              </p>
              <p className="text-caption text-text-muted">
                {logoPath
                  ? "Used on your website. The portal, report cards and receipts still use School Settings."
                  : "Used on your website automatically."}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {logoPath ? (
                <Button size="sm" variant="secondary" onClick={() => setLogoPath("")}>
                  Use School Settings logo
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setLogoPickerOpen((open) => !open);
                  setLogoError(null);
                }}
              >
                {logoPickerOpen ? "Cancel" : "Change logo"}
              </Button>
            </div>
          </div>

          {logoPickerOpen ? (
            <div className="mt-3 space-y-3 rounded-sm border border-border p-3">
              <div>
                <label className="text-small font-medium text-text-primary" htmlFor="website-logo">
                  Choose an image
                </label>
                <select
                  id="website-logo"
                  value={logoPath}
                  onChange={(event) => setLogoPath(event.target.value)}
                  className="mt-1 block w-full rounded-sm border border-border px-3 py-2 text-small"
                >
                  <option value="">School Settings logo (default)</option>
                  {media.map((item) => (
                    <option key={item.id} value={item.path}>
                      {item.alt_text || item.path}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-caption text-text-muted">
                  Only the chosen image is used. Browse or rename images in the{" "}
                  <Link
                    href="/school-admin/website/media"
                    className="text-primary underline"
                  >
                    media library
                  </Link>
                  .
                </p>
              </div>

              <div>
                <input
                  ref={logoFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={uploadLogo}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  loading={uploadingLogo}
                  onClick={() => logoFileRef.current?.click()}
                >
                  Upload a new image
                </Button>
                {logoError ? (
                  <p className="mt-1 text-caption font-medium text-error">{logoError}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {schoolLogoUrl ? null : (
            <p className="mt-2 text-caption text-text-muted">
              No logo in School Settings yet — upload one in {" "}
              <Link href="/school-admin/profile" className="text-primary underline">
                School Profile
              </Link>{" "}
              and it appears here automatically.
            </p>
          )}
        </div>
      </Card>

      <Card variant="default">
        <h2 className="text-h3 font-bold text-text-primary">Contact links</h2>
        <p className="mt-1 text-small text-text-muted">
          Shown on your website. Your phone, email and address come from School Settings and
          appear automatically.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 tablet:grid-cols-2">
          {CONTACT_FIELDS.map((field) => (
            <div key={field.key}>
              <label className="text-small font-medium text-text-primary" htmlFor={`c-${field.key}`}>
                {field.label}
              </label>
              <input
                id={`c-${field.key}`}
                // A phone number is not a URL — `type="url"` would have the
                // browser reject the very thing this field now asks for.
                type={field.tel ? "text" : "url"}
                inputMode={field.tel ? "tel" : undefined}
                value={contact[field.key] ?? ""}
                placeholder={field.placeholder}
                onChange={(event) =>
                  setContact((prev) => ({ ...prev, [field.key]: event.target.value }))
                }
                className="mt-1 block w-full rounded-sm border border-border px-3 py-2 text-small"
              />
              {field.hint ? (
                <p className="mt-1 text-caption text-text-muted">{field.hint}</p>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      <Card variant="default">
        <h2 className="text-h3 font-bold text-text-primary">Search engines</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="text-small font-medium text-text-primary" htmlFor="seo-title">
              Page title
            </label>
            <input
              id="seo-title"
              type="text"
              maxLength={80}
              value={seoTitle}
              placeholder="Defaults to your school's name"
              onChange={(event) => setSeoTitle(event.target.value)}
              className="mt-1 block w-full rounded-sm border border-border px-3 py-2 text-small"
            />
          </div>
          <div>
            <label className="text-small font-medium text-text-primary" htmlFor="seo-description">
              Description
            </label>
            <input
              id="seo-description"
              type="text"
              maxLength={200}
              value={seoDescription}
              placeholder="Defaults to your school motto"
              onChange={(event) => setSeoDescription(event.target.value)}
              className="mt-1 block w-full rounded-sm border border-border px-3 py-2 text-small"
            />
          </div>
        </div>
      </Card>

      <Button variant="primary" loading={saving} onClick={() => void save()}>
        Save
      </Button>
    </div>
  );
}
