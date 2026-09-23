import { describe, it, expect } from "vitest";
import {
  UPLOAD_POLICY,
  normaliseDeclaredType,
  safeFilename,
  sniffMimeType,
  validateUpload,
} from "../uploads";

function bytesOf(...parts: (number[] | string)[]): Uint8Array {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      for (const ch of part) out.push(ch.charCodeAt(0));
    } else {
      out.push(...part);
    }
  }
  return new Uint8Array(out);
}

const PNG = bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 0]);
const JPEG = bytesOf([0xff, 0xd8, 0xff, 0xe0], [0, 0, 0, 0]);
const WEBP = bytesOf("RIFF", [0, 0, 0, 0], "WEBP", [0, 0, 0, 0]);
const WAV = bytesOf("RIFF", [0, 0, 0, 0], "WAVE", [0, 0, 0, 0]);
const OGG = bytesOf("OggS", [0, 0, 0, 0], [0, 0, 0, 0]);
const MP3_ID3 = bytesOf("ID3", [3, 0, 0, 0, 0, 0, 0, 0]);
const MP3_FRAME = bytesOf([0xff, 0xfb, 0x90, 0x00], [0, 0, 0, 0]);
const M4A = bytesOf([0, 0, 0, 0x18], "ftyp", "M4A ", [0, 0, 0, 0]);
const WEBM = bytesOf([0x1a, 0x45, 0xdf, 0xa3], [0, 0, 0, 0], [0, 0, 0, 0]);
const GIF = bytesOf("GIF89a", [0, 0, 0, 0]);
const SVG = bytesOf('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
const HTML = bytesOf("<!DOCTYPE html><html><body>x</body></html>");

describe("sniffMimeType", () => {
  it("identifies each supported format from its bytes", () => {
    expect(sniffMimeType(PNG)).toBe("image/png");
    expect(sniffMimeType(JPEG)).toBe("image/jpeg");
    expect(sniffMimeType(WEBP)).toBe("image/webp");
    expect(sniffMimeType(WAV)).toBe("audio/wav");
    expect(sniffMimeType(OGG)).toBe("audio/ogg");
    expect(sniffMimeType(MP3_ID3)).toBe("audio/mpeg");
    expect(sniffMimeType(MP3_FRAME)).toBe("audio/mpeg");
    expect(sniffMimeType(M4A)).toBe("audio/mp4");
    expect(sniffMimeType(WEBM)).toBe("audio/webm");
  });

  it("separates WAV from WebP, which differ only from byte 8", () => {
    // Both open with RIFF. A sniffer that stops at "RIFF" calls a sound file an
    // image, and the mismatch check downstream then blames the user's file.
    expect(sniffMimeType(WAV)).toBe("audio/wav");
    expect(sniffMimeType(WEBP)).toBe("image/webp");
    // A RIFF container we do not accept is unidentified, not mistaken for one we do.
    expect(sniffMimeType(bytesOf("RIFF", [0, 0, 0, 0], "AVI ", [0, 0, 0, 0]))).toBeNull();
  });

  it("identifies the formats it refuses, so the refusal can name them", () => {
    expect(sniffMimeType(SVG)).toBe("image/svg+xml");
    expect(sniffMimeType(HTML)).toBe("text/html");
    expect(sniffMimeType(GIF)).toBe("image/gif");
  });

  it("returns null for something it cannot identify", () => {
    expect(sniffMimeType(bytesOf([0x01, 0x02]))).toBeNull();
    expect(sniffMimeType(bytesOf("PK", [3, 4], "this is a zip"))).toBeNull();
    expect(sniffMimeType(new Uint8Array(0))).toBeNull();
  });

  it("does not mistake a JPEG for an MP3 frame sync", () => {
    // Both begin 0xFF. Ordering in the sniffer is what keeps them apart.
    expect(sniffMimeType(JPEG)).toBe("image/jpeg");
  });
});

describe("normaliseDeclaredType", () => {
  it("drops parameters, lower-cases, and resolves aliases", () => {
    expect(normaliseDeclaredType("image/jpeg; charset=binary")).toBe("image/jpeg");
    expect(normaliseDeclaredType("IMAGE/PNG")).toBe("image/png");
    expect(normaliseDeclaredType("image/jpg")).toBe("image/jpeg");
    expect(normaliseDeclaredType("audio/x-m4a")).toBe("audio/mp4");
    expect(normaliseDeclaredType(null)).toBe("");
    expect(normaliseDeclaredType(undefined)).toBe("");
  });
});

describe("validateUpload — the happy path", () => {
  it("accepts a PNG and reports the VERIFIED type", () => {
    const result = validateUpload({
      kind: "image",
      bytes: PNG,
      declaredMimeType: "image/png",
      filename: "mark sheet.png",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.upload.mimeType).toBe("image/png");
    expect(result.upload.extension).toBe("png");
    expect(result.upload.size).toBe(PNG.length);
    expect(result.upload.filename).toBe("mark_sheet.png");
  });

  it("accepts a file whose declaration is uninformative but whose bytes are clear", () => {
    const result = validateUpload({
      kind: "image",
      bytes: PNG,
      declaredMimeType: "application/octet-stream",
      filename: "photo",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts the file exactly at the size limit", () => {
    const limit = UPLOAD_POLICY.image.maxBytes;
    const bytes = new Uint8Array(limit);
    bytes.set(PNG.subarray(0, 8));
    expect(validateUpload({ kind: "image", bytes }).ok).toBe(true);
  });

  it("accepts audio in the audio kind", () => {
    const result = validateUpload({ kind: "audio", bytes: MP3_ID3, declaredMimeType: "audio/mpeg" });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.upload.extension).toBe("mp3");
  });
});

describe("validateUpload — refuses", () => {
  it("refuses an empty file", () => {
    const result = validateUpload({ kind: "image", bytes: new Uint8Array(0) });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("empty");
  });

  it("refuses a file over the limit, naming the limit", () => {
    const bytes = new Uint8Array(UPLOAD_POLICY.image.maxBytes + 1);
    bytes.set(PNG.subarray(0, 8));

    const result = validateUpload({ kind: "image", bytes });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("8 MB limit");
  });

  it("refuses content it cannot identify rather than trusting the client", () => {
    const result = validateUpload({
      kind: "image",
      bytes: bytesOf("PK", [3, 4], "not an image"),
      declaredMimeType: "image/png",
      filename: "totally-a-photo.png",
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("could not be recognised");
  });

  it("refuses content that contradicts what the client declared", () => {
    const result = validateUpload({
      kind: "image",
      bytes: PNG,
      declaredMimeType: "image/jpeg",
      filename: "a.jpg",
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("declared as image/jpeg");
    expect(result.ok === false && result.reason).toContain("image/png");
  });

  it("refuses an SVG uploaded as an image, and says what it is", () => {
    // SVG is a document that can carry script, not a raster image, and no
    // question-bank use case needs it.
    const result = validateUpload({
      kind: "image",
      bytes: SVG,
      declaredMimeType: "image/png",
      filename: "diagram.png",
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("image/svg+xml");
  });

  it("refuses an HTML document uploaded as an image", () => {
    const result = validateUpload({ kind: "image", bytes: HTML, filename: "page.png" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("text/html");
  });

  it("refuses a GIF, which is a real image format but not an accepted one", () => {
    const result = validateUpload({ kind: "image", bytes: GIF, declaredMimeType: "image/gif" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("image/gif");
  });

  it("refuses an image supplied to the audio kind, and the reverse", () => {
    const imageAsAudio = validateUpload({ kind: "audio", bytes: PNG, declaredMimeType: "image/png" });
    expect(imageAsAudio.ok).toBe(false);

    const audioAsImage = validateUpload({ kind: "image", bytes: MP3_ID3, declaredMimeType: "audio/mpeg" });
    expect(audioAsImage.ok).toBe(false);
  });
});

describe("safeFilename", () => {
  it("takes the extension from the VERIFIED type, never from the name", () => {
    // The defect this closes: `file.name.split(".").pop()` let the client choose
    // the extension of a file written into storage.
    const result = validateUpload({
      kind: "image",
      bytes: PNG,
      declaredMimeType: "image/png",
      filename: "payload.html",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.upload.filename).toBe("payload.png");
    expect(result.upload.filename).not.toContain("html");
  });

  it("removes any path from the name", () => {
    expect(safeFilename("../../etc/passwd.png", "image/png")).toBe("passwd.png");
    expect(safeFilename("..\\..\\windows\\system32\\cmd.exe", "image/png")).toBe("cmd.png");
  });

  it("cannot produce a hidden file", () => {
    // A dotfile's whole name reads as an extension, so nothing usable survives —
    // hence a generated name rather than a hidden one. What matters is the
    // outcome: the result is not hidden.
    expect(safeFilename(".htaccess", "image/png")).toBe("upload.png");
    expect(safeFilename("...", "image/png")).toBe("upload.png");
    expect(safeFilename(".htaccess", "image/png").startsWith(".")).toBe(false);
  });

  it("falls back to a generated name when there is nothing usable", () => {
    expect(safeFilename(null, "image/png")).toBe("upload.png");
    expect(safeFilename("", "image/jpeg")).toBe("upload.jpg");
    expect(safeFilename("///", "audio/mpeg")).toBe("upload.mp3");
  });

  it("keeps an otherwise reasonable name", () => {
    // Trailing punctuation from the original name is trimmed, not left as `_`.
    expect(safeFilename("Term 1 Marks (JSS2).jpg", "image/jpeg")).toBe("Term_1_Marks_JSS2.jpg");
  });

  it("bounds the length of the name", () => {
    const name = `${"a".repeat(200)}.png`;
    const out = safeFilename(name, "image/png");
    expect(out.length).toBeLessThanOrEqual(64);
    expect(out.endsWith(".png")).toBe(true);
  });

  it("strips invisible and control characters from the name", () => {
    expect(safeFilename("ma\u202Erks\u0000.png", "image/png")).toBe("marks.png");
  });
});
