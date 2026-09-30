/**
 * Copies the pdf.js worker into `public/` so the browser can load it from
 * `/pdf.worker.min.mjs`.
 *
 * The worker must match the installed pdfjs-dist version exactly, so it is
 * copied on every dev/build run rather than committed (and gitignored). Run by
 * the `predev` and `prebuild` npm hooks.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const target = path.join(root, "public", "pdf.worker.min.mjs");

if (!fs.existsSync(source)) {
  console.error(
    "sync-pdf-worker: pdf.worker.min.mjs was not found in node_modules — run npm install first.",
  );
  process.exit(1);
}

fs.copyFileSync(source, target);
console.log("sync-pdf-worker: public/pdf.worker.min.mjs updated");
