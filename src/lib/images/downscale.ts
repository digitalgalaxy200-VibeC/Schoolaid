/**
 * Prepare a picked photo for upload.
 *
 * WHY THIS EXISTS
 * ---------------
 * A serverless request body is capped (4.5 MB on Vercel). A photo straight off
 * a phone is routinely larger. When the body is refused at the edge, the route
 * never runs, so the browser reports the failure as `TypeError: Failed to fetch`
 * — with no status, no message, and no clue which of the two requests in the
 * form actually died.
 *
 * Shrinking the image in the browser before it is sent removes the limit from
 * the picture entirely: a 6 MB camera photo becomes roughly 150–300 KB at
 * 1024px, which is more than enough for an avatar.
 */

/** Comfortably below the 4.5 MB function limit, so a converted file always fits. */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Images already this small are sent untouched — no need to re-encode. */
const ALREADY_SMALL_BYTES = 1.2 * 1024 * 1024;

/** Longest edge of the stored avatar. */
const MAX_EDGE = 1024;

const NOT_AN_IMAGE = "Choose an image file (JPG, PNG or WebP).";
const TOO_LARGE = "That photo is too large. Choose one under 4 MB.";

/**
 * Returns a File that is safe to POST.
 *
 * Throws a sentence meant for the person who picked the file, never a browser
 * error: the callers show it beside the form.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error(NOT_AN_IMAGE);

  if (file.size <= ALREADY_SMALL_BYTES) return file;

  const bitmap = await loadBitmap(file);
  if (!bitmap) {
    // No decoder (very old browser) — the original only survives if it fits.
    if (file.size > MAX_UPLOAD_BYTES) throw new Error(TOO_LARGE);
    return file;
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      if (file.size > MAX_UPLOAD_BYTES) throw new Error(TOO_LARGE);
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) throw new Error("That photo could not be prepared. Try another one.");
    if (blob.size > MAX_UPLOAD_BYTES) throw new Error(TOO_LARGE);

    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } finally {
    bitmap.close?.();
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file);
  } catch {
    return null;
  }
}
