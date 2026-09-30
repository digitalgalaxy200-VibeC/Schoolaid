"use client";

/**
 * Browser-side PDF → page images (the V1 PDF import path).
 *
 * WHY THE BROWSER DOES THIS
 * -------------------------
 * The original PDF never reaches the server: it is rendered here, page by page,
 * into JPEGs, and only those images travel (to the existing AI vision flow).
 * That keeps large files off serverless request limits, keeps scanned papers
 * working (they are images to a vision model, which is exactly right), and means
 * the source document is never stored anywhere.
 *
 * The worker file is copied into `public/` by `scripts/sync-pdf-worker.mjs` on
 * every dev/build, so the worker always matches the installed library version.
 */

/** The most pages one import analyses. Mirrors the server-side cap. */
export const MAX_PDF_PAGES = 10;

export type RenderedPage = { blob: Blob; width: number; height: number };

export async function renderPdfPages(
  file: File,
  opts: { maxPages?: number; maxEdge?: number; quality?: number } = {},
): Promise<{ pages: RenderedPage[]; totalPages: number; truncated: boolean }> {
  const maxPages = opts.maxPages ?? MAX_PDF_PAGES;
  const maxEdge = opts.maxEdge ?? 1600;
  const quality = opts.quality ?? 0.75;

  // Dynamic import: pdf.js is heavy and is only needed when a teacher actually
  // chooses a PDF, so it stays out of the main bundle.
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data });
  const doc = await loadingTask.promise;
  const totalPages = doc.numPages;
  const pageCount = Math.min(totalPages, maxPages);

  const pages: RenderedPage[] = [];
  try {
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);

      // At most 2× the natural size, and never a long edge above `maxEdge`;
      // pages come out at a few hundred KB each, which is what the analysis
      // request's size budget expects.
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, maxEdge / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("This browser cannot render PDF pages.");

      await page.render({ canvas, canvasContext: ctx, viewport }).promise;

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("A page could not be rendered."))),
          "image/jpeg",
          quality,
        );
      });

      pages.push({ blob, width: canvas.width, height: canvas.height });
      page.cleanup();
    }
  } finally {
    // v6 moved teardown to the loading task; it releases the worker too.
    await loadingTask.destroy();
  }

  return { pages, totalPages, truncated: totalPages > maxPages };
}

/**
 * Prepares a device photo or screenshot for upload: bounded long edge, JPEG,
 * comfortably inside the analysis request's size budget. Also used for a
 * question's attached image, so both paths send identically shaped files.
 */
export async function downscaleImage(
  file: File,
  opts: { maxEdge?: number; quality?: number } = {},
): Promise<Blob> {
  const maxEdge = opts.maxEdge ?? 1600;
  const quality = opts.quality ?? 0.82;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot prepare images.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("A page could not be prepared."))),
        "image/jpeg",
        quality,
      );
    });
  } finally {
    bitmap.close();
  }
}
