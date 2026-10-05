"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";

/**
 * Website media library.
 *
 * Reached at /school-admin/website/media, and from the Website section of the
 * school-admin navigation. It carries its own link back to the Website hub:
 * hiding the menu entry is advice, and once you are on this screen the only way
 * off it should not be the browser's back button.
 *
 * Everything with a decision in it happens on the server — validation, type
 * detection from the bytes, quota, tenancy. This screen uploads, edits alt
 * text, and asks before removing.
 */

type MediaItem = {
  id: string;
  path: string;
  mime: string;
  bytes: number;
  alt_text: string | null;
  created_at: string;
  url: string;
};

const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export default function WebsiteMediaPage() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [usedBytes, setUsedBytes] = useState(0);
  const [limitBytes, setLimitBytes] = useState(0);
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/school-admin/website/media");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Could not load the media library.");
        return;
      }
      setError("");
      setItems(data.media ?? []);
      setUsedBytes(data.usedBytes ?? 0);
      setLimitBytes(data.limitBytes ?? 0);

      const drafts: Record<string, string> = {};
      for (const item of data.media ?? []) drafts[item.id] = item.alt_text ?? "";
      setAltDrafts(drafts);
    } catch {
      // Without this a failed load rendered as an EMPTY library — "you have no
      // images" — which is a different and much more worrying statement than
      // "we could not ask".
      setError("Could not reach the server — the media library did not load. Reload the page and try again.");
    }
  }, []);

  useEffect(() => {
    // Deferred to a microtask: `load` sets state as its first act, and calling it
    // synchronously from the effect body trips the cascading-render lint rule.
    void Promise.resolve().then(load);
  }, [load]);

  const upload = async (file: File) => {
    setBusy(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/school-admin/website/media", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data?.error || "Upload failed.");
      else await load();
    } catch {
      // fetch rejects only when the request never completed. Say so plainly,
      // including whether anything happened, instead of surfacing the
      // browser's bare "Failed to fetch".
      setError("Could not reach the server — the image was not uploaded. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const saveAlt = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/school-admin/website/media/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alt_text: altDrafts[id] ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data?.error || "Could not save the alt text.");
      else await load();
    } catch {
      setError("Could not reach the server — the alt text was not saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/school-admin/website/media/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data?.error || "Could not remove the image.");
      else await load();
    } catch {
      setError("Could not reach the server — the image was not removed. Check your connection and try again.");
    } finally {
      setPendingDelete(null);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div>
        <Link
          href="/school-admin/website"
          className="text-caption font-semibold text-primary underline"
        >
          ← Back to School Website
        </Link>
        <h1 className="mt-2 text-h1 font-extrabold text-text-primary">Website media</h1>
        <p className="mt-1 text-small text-text-muted">
          Images available to your school website — PNG, JPEG or WebP.
          {limitBytes > 0 ? ` ${formatMb(usedBytes)} of ${formatMb(limitBytes)} used.` : ""}
        </p>
      </div>

      {error ? (
        <div className="rounded-sm border border-error bg-error-bg px-4 py-3">
          <p className="text-small font-medium text-error">{error}</p>
        </div>
      ) : null}

      <Card variant="default">
        <label className="text-small font-medium text-text-primary" htmlFor="media-file">
          Add an image
        </label>
        <input
          id="media-file"
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          className="mt-2 block w-full text-small text-text-secondary"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </Card>

      {items.length === 0 ? (
        <Card variant="clay">
          <p className="text-small text-text-muted">No images yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} variant="default" className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt={item.alt_text ?? ""}
                className="h-40 w-full rounded-sm border border-border object-cover"
              />

              <p className="font-mono text-caption text-text-muted">
                {item.mime} · {formatMb(item.bytes)}
              </p>

              <div>
                <label className="text-caption text-text-secondary" htmlFor={`alt-${item.id}`}>
                  Alt text (describe the image for screen readers)
                </label>
                <input
                  id={`alt-${item.id}`}
                  type="text"
                  value={altDrafts[item.id] ?? ""}
                  maxLength={200}
                  disabled={busy}
                  onChange={(event) =>
                    setAltDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))
                  }
                  className="mt-1 block w-full rounded-sm border border-border px-3 py-2 text-small"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={busy}
                  onClick={() => void saveAlt(item.id)}
                >
                  Save alt text
                </Button>

                {pendingDelete === item.id ? (
                  <>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={busy}
                      onClick={() => void remove(item.id)}
                    >
                      Confirm remove
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPendingDelete(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setPendingDelete(item.id)}>
                    Remove
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
