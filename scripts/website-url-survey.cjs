#!/usr/bin/env node
/**
 * Website URL scheme survey — READ-ONLY.
 *
 * The section contracts refuse four link schemes (javascript:, data:,
 * vbscript:, file:) on save AND on read, so a stored one takes its whole
 * school page down to "not found" once the rule ships. This checks whether any
 * exist BEFORE deploying — the only way the rule can become a visible change.
 *
 * Usage:
 *   node scripts/website-url-survey.cjs .env.staging
 *   node scripts/website-url-survey.cjs .env.production
 *
 * Reads `website_sections` and nothing else. Never writes, never prints keys.
 * Exit code: 0 = clean, 1 = dangerous values found, 2 = could not check.
 */

const fs = require("fs");
const path = require("path");

const URL_FIELDS = ["linkUrl", "ctaLink", "secondaryCtaLink", "imageUrl", "avatarUrl", "prospectusUrl"];
const DANGEROUS = /^(?:javascript|data|vbscript|file):/;
const PAGE = 1000;

const envFile = process.argv[2] || ".env.staging";
const envPath = path.join(__dirname, "..", envFile);

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    out[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

/** The same normalisation the contracts use: strip ASCII whitespace/controls. */
const clean = (value) => value.replace(/[\u0000-\u0020\u007f]/g, "").toLowerCase();

async function fetchPage(url, key, offset) {
  const res = await fetch(
    `${url}/rest/v1/website_sections?select=id,kind,is_visible,content&order=id&limit=${PAGE}&offset=${offset}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) {
    throw new Error(`PostgREST answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

function scanSection(section, hits) {
  const walk = (node, at) => {
    if (Array.isArray(node)) {
      node.forEach((value, index) => walk(value, `${at}[${index}]`));
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      const here = at ? `${at}.${key}` : key;
      if (typeof value === "string" && URL_FIELDS.includes(key) && DANGEROUS.test(clean(value))) {
        hits.push({ kind: section.kind, visible: section.is_visible, field: here, value: value.slice(0, 100) });
      } else {
        walk(value, here);
      }
    }
  };
  walk(section.content ?? {}, "");
}

async function main() {
  let env;
  try {
    env = readEnv(envPath);
  } catch (err) {
    console.error(`could not read ${envFile}: ${err.message}`);
    process.exit(2);
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(`${envFile} needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY`);
    process.exit(2);
  }

  console.log(`surveying ${envFile} → ${url} (read-only)`);

  const hits = [];
  let scanned = 0;
  for (let offset = 0; ; offset += PAGE) {
    const rows = await fetchPage(url, key, offset);
    rows.forEach((row) => {
      scanned += 1;
      scanSection(row, hits);
    });
    if (rows.length < PAGE) break;
  }

  console.log(`sections scanned: ${scanned}`);
  if (hits.length === 0) {
    console.log("dangerous-scheme values: none — the URL rule cannot take a page down.");
    process.exit(0);
  }

  console.log(`dangerous-scheme values: ${hits.length}`);
  for (const hit of hits) {
    console.log(`  ${hit.kind} (visible=${hit.visible}) ${hit.field} = ${JSON.stringify(hit.value)}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(`survey failed: ${err.message}`);
  process.exit(2);
});
