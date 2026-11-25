/**
 * "Share access" — the one place a school sends its login link to staff.
 *
 * The old dashboard printed the URL and offered Copy. That is not how a school
 * office works: the admin forwards the link on WhatsApp, or prints a QR code for
 * the staff room. This modal keeps all three in one place.
 *
 * The link and QR are generated ON THIS DEVICE. Nothing about the school's URL
 * is sent to a third-party QR service, which is why this uses a local encoder
 * (`qrcode`, imported lazily) instead of a hosted image URL.
 */

"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button, Modal } from "@/components/ui";

type ShareAccessModalProps = {
  isOpen: boolean;
  onClose: () => void;
  schoolName: string;
  /** Path only (`/school/slug/login`); the origin is resolved in the browser. */
  loginPath: string;
};

const LINK_BUTTON =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-150 ease-out px-5 py-2.5 text-body min-h-[42px] bg-surface text-primary border border-primary hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

function fileNameFor(schoolName: string): string {
  const slug = schoolName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "school"}-login-qr.png`;
}

/** Nothing to subscribe to: this only asks "has hydration happened yet?". */
const subscribeToNothing = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function ShareAccessModal({
  isOpen,
  onClose,
  schoolName,
  loginPath,
}: ShareAccessModalProps) {
  // The server renders the relative path; the client swaps in the real origin
  // after hydration. `useSyncExternalStore` gives us that "mounted" signal
  // without a setState-in-effect and without a hydration mismatch — the URL is
  // only ever shown once the modal is open, which is after hydration anyway.
  const isClient = useSyncExternalStore(
    subscribeToNothing,
    getClientSnapshot,
    getServerSnapshot,
  );
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  const url = isClient
    ? `${configuredOrigin || window.location.origin}${loginPath}`
    : loginPath;

  // Keyed by the URL it was generated for, so a stale code can never sit
  // beside a newer link if the school slug changes while the modal is open.
  const [qrResult, setQrResult] = useState<{ url: string; dataUrl: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || !/^https?:\/\//i.test(url)) return;

    let cancelled = false;

    // Lazy import keeps the encoder out of the shell bundle and out of the
    // server render: this modal is the only screen that needs a QR code.
    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(url, {
          width: 512,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#16202E", light: "#FFFFFF" },
        }),
      )
      .then((dataUrl) => {
        if (!cancelled) setQrResult({ url, dataUrl });
      })
      .catch(() => {
        if (!cancelled) setQrResult({ url, dataUrl: null });
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, url]);

  const qr = qrResult?.url === url ? qrResult.dataUrl : null;
  const qrFailed = qrResult?.url === url && qrResult.dataUrl === null;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const field = document.createElement("textarea");
      field.value = url;
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      document.body.removeChild(field);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappMessage = `Log in to ${schoolName} on SchoolAid: ${url}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Share access"
      size="md"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="text-small text-text-secondary">
            Send this link to teachers and students. It opens {schoolName}
            &apos;s login page.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-bg border border-border rounded-lg px-3 py-2">
          <span className="text-small font-mono text-text-secondary break-all flex-1">{url}</span>
          <Button variant={copied ? "primary" : "secondary"} size="sm" onClick={copyLink}>
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <div className="grid grid-cols-1 tablet:grid-cols-[auto_1fr] gap-5 items-start">
          <div className="flex flex-col items-center gap-2">
            <div className="p-3 bg-white border border-border rounded-lg">
              {qr ? (
                <img
                  src={qr}
                  alt={`QR code for ${schoolName} login`}
                  className="w-48 h-48"
                  width={192}
                  height={192}
                />
              ) : qrFailed ? (
                <div className="w-48 h-48 flex items-center justify-center text-center px-3 text-caption text-text-muted">
                  QR unavailable
                </div>
              ) : (
                <div className="w-48 h-48 skeleton rounded-md" aria-hidden="true" />
              )}
            </div>
            {qrFailed ? (
              <p className="text-caption text-text-muted text-center max-w-[192px]">
                Could not generate a QR code. Copy the link instead.
              </p>
            ) : qr ? (
              <a
                href={qr}
                download={fileNameFor(schoolName)}
                className="text-caption font-semibold text-primary hover:underline"
              >
                Download QR code
              </a>
            ) : (
              <p className="text-caption text-text-muted">Generating QR code…</p>
            )}
          </div>

          <div className="space-y-3">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className={`${LINK_BUTTON} w-full`}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M20.52 3.449A11.87 11.87 0 0012.05 0C5.495 0 .16 5.334.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.305-1.654a11.87 11.87 0 005.74 1.462h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 00-3.423-8.466zM12.05 21.785h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.981.999-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.002-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.898 9.83 9.83 0 012.892 6.994c-.003 5.45-4.437 9.885-9.885 9.885z" />
              </svg>
              Share on WhatsApp
            </a>
            <p className="text-caption text-text-muted">
              Opens WhatsApp with the link already typed. Choose the staff group or a
              colleague, then send.
            </p>
          </div>
        </div>

        <p className="text-caption text-text-muted border-t border-border pt-4">
          The link and QR are generated on this device. Nothing is sent to a
          third-party service.
        </p>
      </div>
    </Modal>
  );
}
