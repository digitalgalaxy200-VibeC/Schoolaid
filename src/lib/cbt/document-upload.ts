"use client";

import { unzipSync } from "fflate";
import { renderPdfPages, type RenderedPage } from "./pdf-pages";

/**
 * Document intake for AI question import: PDF or Word (.docx).
 *
 * CONTENT DECIDES THE TYPE — never the extension:
 *
 *   %PDF-        a PDF; rendered to page images here, analysed by the vision
 *                model (scanned papers work, because they are images).
 *   PK..         a zip container; a Word .docx holds its text in
 *                `word/document.xml`, which is extracted here and sent down the
 *                existing TEXT import path.
 *   D0 CF 11 E0  a legacy Word 97 .doc (OLE container). Refused with
 *                instructions: reading it reliably in a browser is not
 *                something a regex can do, and guessing would fill the review
 *                screen with garbage.
 *
 * Everything happens in the BROWSER: neither the PDF nor the Word file is ever
 * uploaded. Only page images (PDF) or plain text (Word) travel to the server.
 */

export type DocumentKind = "pdf" | "docx" | "legacy_doc" | "unknown";

export type DocumentReadResult =
  | { kind: "pdf"; pages: RenderedPage[]; totalPages: number; truncated: boolean }
  | { kind: "docx"; text: string }
  | { kind: "error"; message: string };

/** The largest Word file worth reading in a browser. */
const MAX_DOCX_BYTES = 25 * 1024 * 1024;

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (bytes[i] !== prefix[i]) return false;
  return true;
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/** Identifies a document from its leading bytes. Pure; exported for tests. */
export function sniffDocumentKind(bytes: Uint8Array): DocumentKind {
  if (asciiAt(bytes, 0, "%PDF-")) return "pdf";

  // ZIP local-file header (and the empty/spanned variants). A .docx is a zip.
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08))
  ) {
    return "docx";
  }

  // OLE compound file — the Word 97–2003 format.
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return "legacy_doc";

  return "unknown";
}

function codePointToString(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 0x10ffff) return "";
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePointToString(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => codePointToString(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Decoded last, so "&amp;lt;" becomes "&lt;" rather than "<".
    .replace(/&amp;/g, "&");
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** All `<w:t>` run texts inside a fragment, decoded and concatenated. */
function runsIn(fragment: string): string {
  const runs: string[] = [];
  const runRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  for (const match of fragment.matchAll(runRe)) runs.push(decodeXmlEntities(match[1]));
  return runs.join("");
}

/**
 * Extracts the visible text of a .docx, one line per paragraph.
 *
 * Word stores text in runs inside paragraph elements, and tables nest their
 * paragraphs the same way — so matching `<w:p>…</w:p>` in document order is
 * enough to keep the reading order a teacher would recognise.
 */
export function extractDocxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const entry = Object.keys(files).find((name) =>
    name.replace(/\\/g, "/").toLowerCase().endsWith("word/document.xml"),
  );
  if (!entry) {
    throw new Error("This file is a zip archive but not a Word document (no word/document.xml).");
  }

  const xml = new TextDecoder("utf-8").decode(files[entry]);

  const paragraphs: string[] = [];
  const paragraphRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  for (const match of xml.matchAll(paragraphRe)) {
    paragraphs.push(runsIn(match[1]));
  }

  if (paragraphs.length === 0) {
    // Some producers wrap everything differently; fall back to every run, one
    // per line, rather than returning nothing.
    return tidy(runsIn(xml).split(/(?<=[.?!])\s+/).join("\n"));
  }

  return tidy(paragraphs.join("\n"));
}

/** Reads one uploaded document and returns what the import needs. */
export async function readDocumentFile(file: File): Promise<DocumentReadResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffDocumentKind(bytes);

  if (kind === "pdf") {
    if (file.size > 50 * 1024 * 1024) {
      return {
        kind: "error",
        message: "That PDF is larger than 50 MB. Split it, or upload page photos instead.",
      };
    }
    const rendered = await renderPdfPages(file);
    if (rendered.pages.length === 0) {
      return { kind: "error", message: "That PDF has no readable pages." };
    }
    return {
      kind: "pdf",
      pages: rendered.pages,
      totalPages: rendered.totalPages,
      truncated: rendered.truncated,
    };
  }

  if (kind === "docx") {
    if (file.size > MAX_DOCX_BYTES) {
      return {
        kind: "error",
        message: "That Word file is larger than 25 MB. Split it, or save it as a PDF.",
      };
    }
    try {
      const text = extractDocxText(bytes);
      if (!text) {
        return { kind: "error", message: "That Word document contains no readable text." };
      }
      return { kind: "docx", text };
    } catch (err) {
      return {
        kind: "error",
        message: err instanceof Error ? err.message : "That Word document could not be read.",
      };
    }
  }

  if (kind === "legacy_doc") {
    return {
      kind: "error",
      message:
        "That is a legacy .doc file, which cannot be read in the browser. Open it in Word and save it as .docx or PDF, then upload again.",
    };
  }

  return {
    kind: "error",
    message: "Unsupported file. Upload a PDF, a Word (.docx) document, or an image.",
  };
}
