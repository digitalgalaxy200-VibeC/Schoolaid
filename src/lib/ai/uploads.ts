/**
 * Upload validation (Phase 23) — what may be handed to an AI provider.
 *
 * WHY THE CLIENT'S WORD IS NOT ENOUGH
 * -----------------------------------
 * `File.type` and the filename extension are strings the client chose. They are
 * not evidence of anything. Two places in this codebase currently trust them, and
 * this module exists because of what that allows:
 *
 *   `src/app/api/teacher/ai-import/route.ts`
 *     stores the upload with `contentType: file.type || "image/jpeg"`, builds the
 *     storage path from `file.name.split(".").pop()` (an attacker-chosen
 *     extension), never checks `file.size`, and hands the bytes to a vision model
 *     labelled with the client's claim about what they are.
 *
 * So the rule here is: the CONTENT decides the type, the client merely declares
 * it, and a contradiction is a rejection rather than a preference.
 *
 * WHAT THIS PROTECTS
 * ------------------
 *   - An executable, an HTML document or an SVG (a script-bearing XML document)
 *     uploaded as an "image". The private bucket and short-lived signed URLs in
 *     `ai-import` limit the damage, but a file that is not what it claims to be
 *     should not reach storage at all, let alone a model.
 *   - Unbounded input. AI is billed and latency-bound by what it is given; a
 *     500 MB "photo" is a denial-of-service and an unpredictable bill.
 *   - Path traversal and hiding through the filename, and extensions taken from
 *     the filename rather than the bytes.
 *
 * WHAT IT DOES NOT PROTECT
 * ------------------------
 * It cannot tell a benign exam sheet from a maliciously crafted image that
 * exploits a decoder. That is the provider's and the browser's problem, and the
 * mitigation is size limits and not rendering untrusted files, both of which are
 * already in place.
 */

export type UploadKind = "image" | "audio";

/**
 * The limits, in one place, so a policy change is a one-line change.
 *
 * The image ceiling is set for a phone photograph of a mark sheet (a modern
 * phone JPEG is 2–5 MB). The audio ceiling is roughly ten minutes of compressed
 * speech, which is what a transcribed answer needs. Both are chosen to bound cost
 * and latency, not to be generous for its own sake.
 */
export const UPLOAD_POLICY: Record<UploadKind, { maxBytes: number; allowed: readonly string[] }> = {
  image: {
    maxBytes: 8 * 1024 * 1024,
    // No SVG, deliberately: it is a document that can carry script, and there is
    // no question-bank use case for it.
    allowed: ["image/png", "image/jpeg", "image/webp"],
  },
  audio: {
    maxBytes: 25 * 1024 * 1024,
    allowed: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm"],
  },
};

/**
 * Declarations that carry no information, so the sniffed type wins.
 *
 * A browser that cannot identify a file sends `application/octet-stream`. Rejecting
 * it outright would break honest uploads; rejecting it when the CONTENTS are also
 * unrecognisable (below) is the check that matters.
 */
const UNINFORMATIVE_DECLARATIONS = new Set([
  "",
  "application/octet-stream",
  "binary/octet-stream",
]);

const EXTENSION_FOR: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/webm": "webm",
};

/** A declared type that is really another spelling of one we support. */
const DECLARATION_ALIASES: Record<string, string> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "audio/mp3": "audio/mpeg",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
};

function startsWith(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
  if (bytes.length < offset + prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[offset + i] !== prefix[i]) return false;
  }
  return true;
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Identifies a file from its leading bytes.
 *
 * Returns null when nothing matches — including for a file whose container is
 * recognised but whose contents are truncated beyond the signature. Null is a
 * rejection, never a fallback to the client's claim.
 *
 * It identifies types we do NOT allow (GIF, SVG) as well as ones we do, so the
 * refusal can say "this is an SVG" instead of "not recognised" — a message a user
 * can act on.
 */
export function sniffMimeType(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;

  // Documents first: SVG is XML text, and identifying it is the point.
  if (asciiAt(bytes, 0, "<?xml") || asciiAt(bytes, 0, "<svg")) return "image/svg+xml";
  if (asciiAt(bytes, 0, "<!DOCTYPE html") || asciiAt(bytes, 0, "<html")) return "text/html";

  // RIFF is a container shared by WAV and WEBP: the discriminator is at offset 8,
  // so checking only "RIFF" would confuse a sound file with an image.
  if (asciiAt(bytes, 0, "RIFF")) {
    if (asciiAt(bytes, 8, "WEBP")) return "image/webp";
    if (asciiAt(bytes, 8, "WAVE")) return "audio/wav";
    return null;
  }

  // MP4 is a CONTAINER that can hold audio or video, so this identifies the
  // container, not the payload. Brands do not separate the two reliably (`isom`
  // and `mp42` are used by both), so a video would be accepted here and an
  // audio-only transcription request would then fail at the provider with a 400.
  // Rejecting every ambiguous brand would refuse honest recorder output, which is
  // the worse trade: the provider naming the problem is a better error than the
  // application refusing a file that was fine.
  if (asciiAt(bytes, 4, "ftyp")) return "audio/mp4";

  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "audio/webm";
  if (asciiAt(bytes, 0, "OggS")) return "audio/ogg";
  if (asciiAt(bytes, 0, "ID3")) return "audio/mpeg";

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (asciiAt(bytes, 0, "GIF87a") || asciiAt(bytes, 0, "GIF89a")) return "image/gif";

  // An MPEG audio frame sync, checked last because it is only two bytes wide and
  // therefore the easiest to match by accident.
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "audio/mpeg";

  return null;
}

/** Normalises a client-declared type: lower case, parameters dropped, aliases resolved. */
export function normaliseDeclaredType(declared: string | null | undefined): string {
  if (!declared) return "";
  const base = declared.split(";")[0].trim().toLowerCase();
  return DECLARATION_ALIASES[base] ?? base;
}

/**
 * A filename that is safe to build a storage path from.
 *
 * The extension comes from the VERIFIED type, never from the name — which is the
 * specific defect in `ai-import` today. The basename is reduced to a conservative
 * character set, so a traversal sequence, a control character or a hidden file has
 * nowhere to survive, and leading dots are stripped so `.htaccess`-shaped names
 * cannot be produced.
 */
export function safeFilename(name: string | null | undefined, mimeType: string): string {
  const base = (name ?? "")
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(/\.[^.]*$/, "") // the extension is discarded; the bytes decide it
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    // Leading and trailing separators are trimmed: `A very good photo (1).jpg`
    // would otherwise become `A_very_good_photo_1_.jpg`, and a name that ends in a
    // separator looks like a mistake in a storage listing.
    .replace(/^[._-]+/, "")
    .replace(/[._-]+$/, "")
    .replace(/_{2,}/g, "_")
    .slice(0, 60);

  const extension = EXTENSION_FOR[mimeType] ?? "bin";
  return base ? `${base}.${extension}` : `upload.${extension}`;
}

export type ValidatedUpload = {
  /** The VERIFIED type, from the bytes. Use this, not what the client said. */
  mimeType: string;
  extension: string;
  filename: string;
  bytes: Uint8Array;
  size: number;
};

export type UploadResult =
  | { ok: true; upload: ValidatedUpload }
  | { ok: false; reason: string };

/**
 * Validates one upload.
 *
 * Order matters: size first (so a huge file is refused before anything reads it),
 * then content, then the declaration, then the name. Every check fails closed,
 * and every refusal names what was wrong with it.
 */
export function validateUpload(args: {
  kind: UploadKind;
  bytes: Uint8Array;
  declaredMimeType?: string | null;
  filename?: string | null;
}): UploadResult {
  const policy = UPLOAD_POLICY[args.kind];
  const size = args.bytes?.length ?? 0;

  if (size === 0) {
    return { ok: false, reason: "The uploaded file was empty." };
  }

  if (size > policy.maxBytes) {
    const limitMb = (policy.maxBytes / (1024 * 1024)).toFixed(0);
    return {
      ok: false,
      reason: `The file is larger than the ${limitMb} MB limit for ${args.kind} uploads.`,
    };
  }

  const sniffed = sniffMimeType(args.bytes);

  if (!sniffed) {
    return {
      ok: false,
      reason:
        "The file's contents could not be recognised. Only PNG, JPEG and WebP " +
        "images, and MP3, WAV, OGG, M4A or WebM audio, are accepted.",
    };
  }

  if (!policy.allowed.includes(sniffed)) {
    // A precise refusal, because the user's file is usually fine and mislabelled.
    return {
      ok: false,
      reason: `The file's contents are ${sniffed}, which is not accepted for ${args.kind} uploads.`,
    };
  }

  const declared = normaliseDeclaredType(args.declaredMimeType);
  if (!UNINFORMATIVE_DECLARATIONS.has(declared) && declared !== sniffed) {
    return {
      ok: false,
      reason: `The file was declared as ${declared} but its contents are ${sniffed}.`,
    };
  }

  return {
    ok: true,
    upload: {
      mimeType: sniffed,
      extension: EXTENSION_FOR[sniffed] ?? "bin",
      filename: safeFilename(args.filename, sniffed),
      bytes: args.bytes,
      size,
    },
  };
}
