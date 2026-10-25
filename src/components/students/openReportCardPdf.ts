import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { ReportCardUI } from "@/components/report-card/ReportCardUI";
import { toReportCardData } from "@/lib/students/report-card-view";
import type { StaffReportCardRecord } from "@/lib/students/staff-report-card";

/**
 * Renders one student's report card and opens it as a PDF in a NEW window.
 *
 * WHY THE WINDOW IS OPENED FIRST
 * ------------------------------
 * Browsers allow `window.open` only while the click that caused it is still
 * being handled. Building the PDF is asynchronous (fetch → React render →
 * html2pdf), so a window opened after that work is blocked as a pop-up. The
 * blank window is therefore opened synchronously and filled in when the PDF is
 * ready.
 *
 * The card itself is mounted off-screen in the current document — the same
 * `ReportCardUI` the student and report-card review pages use — so the PDF is
 * the existing, already-designed card rather than a second layout.
 */
export async function openReportCardPdf(opts: { endpoint: string }): Promise<void> {
  const win = window.open("", "_blank");
  if (!win) {
    throw new Error("The PDF window was blocked. Allow pop-ups for this site and try again.");
  }

  win.document.open();
  win.document.write(
    '<!doctype html><html><head><title>Report Card</title></head><body style="font-family:system-ui,sans-serif;padding:24px;color:#334155">Preparing report card…</body></html>',
  );
  win.document.close();

  const host = document.createElement("div");
  host.style.cssText =
    "position:absolute;left:-9999px;top:0;width:794px;background:#ffffff;pointer-events:none;";
  document.body.appendChild(host);

  const root = createRoot(host);

  try {
    const res = await fetch(opts.endpoint);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || `Could not load the report card (HTTP ${res.status}).`);
    }

    root.render(createElement(ReportCardUI, { data: toReportCardData(body as StaffReportCardRecord) }));

    // Give React a frame to paint and the school logo to load; html2canvas
    // captures what is on screen, so a half-painted card would be captured too.
    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise((resolve) => setTimeout(resolve, 800));

    const images = Array.from(host.querySelectorAll("img"));
    if (images.length > 0) {
      await Promise.all(
        images.map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener("error", () => resolve(), { once: true });
              }),
        ),
      );
    }

    const element = host.querySelector("#report-card-ui") as HTMLElement | null;
    if (!element) throw new Error("Could not prepare the report card.");

    const html2pdfModule = await import("html2pdf.js");
    const html2pdf = html2pdfModule.default || html2pdfModule;

    const blob = (await html2pdf()
      .set({
        margin: 0,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(element)
      .outputPdf("blob")) as Blob;

    const url = URL.createObjectURL(blob);
    win.location.href = url;

    // The new tab needs the URL alive while its PDF viewer loads it.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    win.close();
    throw error;
  } finally {
    root.unmount();
    host.remove();
  }
}
