#!/usr/bin/env node
/**
 * GS-Apex Stars School — public website content.
 *
 * WHAT IT DOES
 * ------------
 * Rewrites the school's *content* only, through the same database function the
 * School Admin CMS calls (`replace_website_page_sections`), so the write is one
 * transaction and passes the same version claim. No schema change, no deploy:
 * `/site/*` is `force-dynamic`, so a content save is live immediately.
 *
 * WHY A SCRIPT AND NOT THE CMS
 * ----------------------------
 * The copy is supplied by the school and must be applied exactly. Doing it here
 * keeps the strings reviewable in one place instead of retyped into form fields.
 *
 * SAFETY
 * ------
 * - `inspect` is read-only.
 * - `apply` needs --apply, and the production guard needs --confirm-target=<ref>.
 * - Every run writes a full backup of the row + sections it is about to replace.
 * - Sections the school already has are PRESERVED in place: only the four kinds
 *   named in EDITS are touched, and order/visibility of everything is kept.
 *
 * USAGE
 * -----
 *   node scripts/gsapex-site-content.mjs inspect
 *   node scripts/gsapex-site-content.mjs apply --apply --confirm-target=iojiahkehnijxxczrgft
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const { guardDatabase, refFromUrl } = require("./lib/db-guard.js");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ENV_FILE = path.join(ROOT, ".env.production");

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function loadEnv() {
  const raw = fs.readFileSync(ENV_FILE, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// The copy — supplied by the school, applied verbatim.
// ---------------------------------------------------------------------------

const SCHOOL_PATCH = {
  name: "GS-Apex Stars School",
  motto: "Raising Global Leaders",
  address: "No. 2, Yomi Olaofe Avenue, Afolabi B/Stop, Lasu–Igando Road, Lagos",
  phone: "08032252480",
  // A real column now (migration 077), not a sentence in the contact copy, so
  // parents can tap it. `phone` stays the primary line and the WhatsApp number.
  phone_secondary: "08028761523",
  email: "gsapexstarsschool@gmail.com",
  website: "https://gsapexstars.com.ng/",
};

const VALUES_ITEMS = [
  {
    title: "Commitment to High Moral Standard",
    description:
      "We hold every member of our community to high moral standards, building character and integrity in all that we do.",
    icon: "💎",
  },
  {
    title: "Quality Education",
    description:
      "We deliver a rich, well-rounded curriculum taught by passionate and competent teachers, so every child learns to a high standard.",
    icon: "📚",
  },
  {
    title: "Honesty",
    description:
      "We teach our children to be truthful, accountable and upright in school and beyond.",
    icon: "🤝",
  },
  {
    title: "Teamwork",
    description:
      "We work together — pupils, teachers and parents — because a child thrives when the whole community supports them.",
    icon: "🌟",
  },
  {
    title: "Commitment to Raising a Total Child",
    description:
      "We nurture the total child academically, morally, socially and spiritually, in a safe and conducive learning environment.",
    icon: "🎓",
  },
];

/** Only these kinds are rewritten. Everything else is passed through untouched. */
const EDITS = {
  hero: {
    // School name singularised; no badgeText, because `school.motto` already
    // renders as the quote under the subheadline once the school row is filled.
    headline:
      "At GS-Apex Stars School, We Inspire and Nurture Every Child to Reach Their Full Potential",
  },
  values: {
    heading: "Our Mission, Vision & Core Values",
    mission:
      "Established to nurture and groom a total child in a safe and conducive learning environment, using an enriched curriculum with passionate and competent teachers, raising outshining stars.",
    vision:
      "To raise a godly generation prepared and equipped to make formidable global impact.",
    // "Our Mission" and "Our Vision" were items before; they are the dedicated
    // mission/vision fields now, so the grid holds the five core values only.
    items: VALUES_ITEMS,
  },
  contact: {
    heading: "Contact & Admissions",
    // Phone/email/address move out of this paragraph into the schools row, which
    // the Contact block already renders as its detail cards. The second line is
    // now one of those cards too (`schools.phone_secondary`), so quoting it here
    // would be the same number twice.
    intro:
      "Get in touch with GS-Apex Stars School to learn about our learning environment, academic programmes and admissions. Our admissions team is available during working hours — call, message us on WhatsApp, or visit the campus.",
  },
};

/** The About body still states the old vision; this swaps just that sentence. */
const ABOUT_VISION_FROM =
  "Our vision: to raise confident, knowledgeable, values-driven leaders who excel academically and make a meaningful difference.";
const ABOUT_VISION_TO =
  "Our vision: to raise a godly generation prepared and equipped to make a formidable global impact.";

/**
 * The About prose says "primary"; the programme cards say "Basic Classes". The
 * school confirmed "Basic" is the correct stage name, so the prose follows the
 * cards rather than the two disagreeing on the same page.
 */
const ABOUT_STAGE_FROM = "primary builds strong academic foundations";
const ABOUT_STAGE_TO = "basic classes build strong academic foundations";

/**
 * The welcome message carried its own signature, which the block then also
 * rendered from `authorName` / `authorTitle` — so the name appeared twice and
 * the card itself still said "Principal". The signature moves into the fields
 * the renderer already has.
 */
const PRINCIPAL_SIGNATURE = "\n\n— Mrs Priscillia Uzoamaka Ariguzo, Proprietress";
const PRINCIPAL_NAME = "Mrs Priscillia Uzoamaka Ariguzo";
const PRINCIPAL_TITLE = "Proprietress";

/** School name used in prose: plural, and missing the hyphen. */
function singularise(text) {
  return text
    .split("GS Apex Stars Schools")
    .join("GS-Apex Stars School")
    .split("GS Apex Stars School School")
    .join("GS-Apex Stars School")
    .split("GS Apex Stars")
    .join("GS-Apex Stars");
}

const SEO = {
  title: "GS-Apex Stars School | Raising Global Leaders",
  description:
    "GS-Apex Stars School, Lagos — raising a godly generation prepared and equipped to make a formidable global impact. Pre School, Nursery and Basic classes.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function preview(value, max = 90) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ");
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** Applies EDITS over what is already stored, so nothing unrelated is lost. */
function buildSections(stored) {
  const changed = [];
  const sections = stored.map((row) => {
    const kind = row.kind;
    const content = { ...(row.content || {}) };

    if (Object.prototype.hasOwnProperty.call(EDITS, kind)) {
      Object.assign(content, EDITS[kind]);
      changed.push(kind);
    }

    if (kind === "about" && typeof content.body === "string") {
      if (content.body.includes(ABOUT_VISION_FROM)) {
        content.body = content.body.split(ABOUT_VISION_FROM).join(ABOUT_VISION_TO);
        changed.push("about (vision sentence)");
      }
      if (content.body.includes(ABOUT_STAGE_FROM)) {
        content.body = content.body.split(ABOUT_STAGE_FROM).join(ABOUT_STAGE_TO);
        changed.push("about (stage name)");
      }
    }

    if (kind === "principal_message") {
      if (typeof content.message === "string" && content.message.endsWith(PRINCIPAL_SIGNATURE)) {
        content.message = content.message.slice(0, -PRINCIPAL_SIGNATURE.length).trimEnd();
        changed.push("principal_message (signature)");
      }
      content.authorName = PRINCIPAL_NAME;
      content.authorTitle = PRINCIPAL_TITLE;
    }

    if (kind === "about" && typeof content.heading === "string") {
      content.heading = singularise(content.heading);
    }

    // Prose in `about` / `principal_message` still said "GS Apex Stars Schools".
    for (const field of ["body", "message"]) {
      if (typeof content[field] === "string") content[field] = singularise(content[field]);
    }

    return { kind, is_visible: row.is_visible, content };
  });

  return { sections, changed };
}

async function findSchool(supabase) {
  const { data, error } = await supabase
    .from("schools")
    .select("id, name, slug, motto, address, phone, phone_secondary, email, website, logo_url, is_active, is_archived")
    .ilike("name", "%apex%");
  if (error) throw new Error(`schools lookup failed: ${error.message}`);
  if (!data || data.length === 0) throw new Error("No school matching 'apex' in this database.");
  if (data.length > 1) {
    throw new Error(
      `Ambiguous: ${data.length} schools match 'apex': ${data.map((s) => `${s.name} (${s.slug})`).join(", ")}`,
    );
  }
  return data[0];
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function inspect(supabase) {
  const school = await findSchool(supabase);
  console.log("SCHOOL");
  for (const [key, value] of Object.entries(school)) console.log(`  ${key}: ${value}`);

  const { data: config, error: configError } = await supabase
    .from("website_configs")
    .select("*")
    .eq("school_id", school.id)
    .maybeSingle();
  if (configError) throw new Error(configError.message);
  console.log("\nWEBSITE CONFIG");
  if (!config) {
    console.log("  (none)");
  } else {
    console.log(`  template_key: ${config.template_key}`);
    console.log(`  status: ${config.status}`);
    console.log(`  draft_version: ${config.draft_version}`);
    console.log(`  custom_domain: ${config.custom_domain}`);
    console.log(`  seo: ${preview(config.seo, 200)}`);
    console.log(`  contact: ${preview(config.contact, 200)}`);
  }

  const { data: feature } = await supabase
    .from("school_features")
    .select("feature_key, is_enabled")
    .eq("school_id", school.id)
    .eq("feature_key", "website")
    .maybeSingle();
  console.log(`\nFEATURE website: ${feature ? feature.is_enabled : "(row absent)"}`);

  const { data: page } = await supabase
    .from("website_pages")
    .select("id, key, path, title, is_enabled")
    .eq("school_id", school.id)
    .eq("path", "/")
    .maybeSingle();
  console.log(`\nHOME PAGE: ${page ? `${page.id} (${page.key}, enabled=${page.is_enabled})` : "(none)"}`);
  if (!page) return;

  const { data: sections, error: sectionsError } = await supabase
    .from("website_sections")
    .select("kind, sort_order, is_visible, content")
    .eq("school_id", school.id)
    .eq("page_id", page.id)
    .order("sort_order", { ascending: true });
  if (sectionsError) throw new Error(sectionsError.message);

  if (process.argv.includes("--dump")) {
    const backupDir = path.join(HERE, "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const dumpPath = path.join(backupDir, "gsapex-current.json");
    fs.writeFileSync(
      dumpPath,
      JSON.stringify({ school, config, feature, page, sections }, null, 2),
    );
    console.log(`dumped: ${path.relative(ROOT, dumpPath)}`);
  }

  console.log(`\nSECTIONS (${sections.length})`);
  for (const row of sections) {
    console.log(`  ${String(row.sort_order).padStart(2)} ${row.kind} ${row.is_visible ? "visible" : "hidden"}`);
    for (const [key, value] of Object.entries(row.content || {})) {
      console.log(`       ${key}: ${preview(value)}`);
    }
  }
}

async function plan(supabase) {
  const school = await findSchool(supabase);
  const { data: config, error: configError } = await supabase
    .from("website_configs")
    .select("draft_version, template_key")
    .eq("school_id", school.id)
    .maybeSingle();
  if (configError) throw new Error(configError.message);

  const { data: page } = await supabase
    .from("website_pages")
    .select("id")
    .eq("school_id", school.id)
    .eq("path", "/")
    .maybeSingle();
  if (!page) throw new Error("No home page row.");

  const { data: stored, error } = await supabase
    .from("website_sections")
    .select("kind, sort_order, is_visible, content")
    .eq("school_id", school.id)
    .eq("page_id", page.id)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  const { sections, changed } = buildSections(stored);
  const backupDir = path.join(HERE, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const planPath = path.join(backupDir, "gsapex-plan.json");
  fs.writeFileSync(planPath, JSON.stringify({ template_key: config.template_key, sections }, null, 2));

  console.log(`template: ${config.template_key}`);
  console.log(`plan: ${path.relative(ROOT, planPath)}`);
  console.log(`edited: ${[...new Set(changed)].join(", ") || "(nothing)"}`);
  for (const s of sections.filter((x) => Object.prototype.hasOwnProperty.call(EDITS, x.kind))) {
    console.log(`\n[${s.kind}]`);
    for (const [k, v] of Object.entries(s.content)) console.log(`  ${k}: ${preview(v, 160)}`);
  }
}

async function apply(supabase) {
  const school = await findSchool(supabase);

  const { data: config, error: configError } = await supabase
    .from("website_configs")
    .select("id, draft_version, template_key, status, seo")
    .eq("school_id", school.id)
    .maybeSingle();
  if (configError) throw new Error(configError.message);
  if (!config) throw new Error("No website_configs row — the site is not configured.");
  if (config.template_key !== "classic") {
    throw new Error(`Unexpected template_key '${config.template_key}' (script assumes classic).`);
  }

  const { data: page, error: pageError } = await supabase
    .from("website_pages")
    .select("id")
    .eq("school_id", school.id)
    .eq("path", "/")
    .maybeSingle();
  if (pageError) throw new Error(pageError.message);
  if (!page) throw new Error("No home page row.");

  const { data: stored, error: sectionsError } = await supabase
    .from("website_sections")
    .select("kind, sort_order, is_visible, content")
    .eq("school_id", school.id)
    .eq("page_id", page.id)
    .order("sort_order", { ascending: true });
  if (sectionsError) throw new Error(sectionsError.message);

  // Backup before anything is written.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(HERE, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `gsapex-site-${stamp}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify({ takenAt: new Date().toISOString(), school, config, page, sections: stored }, null, 2),
  );
  console.log(`backup: ${path.relative(ROOT, backupPath)}`);

  const { sections, changed } = buildSections(stored);

  console.log("\nSECTIONS TO WRITE");
  for (const [index, section] of sections.entries()) {
    const edited = Object.prototype.hasOwnProperty.call(EDITS, section.kind) || section.kind === "about";
    console.log(`  ${index} ${section.kind} ${section.is_visible ? "visible" : "hidden"}${edited ? "  <- edited" : ""}`);
  }
  console.log(`\nedited: ${[...new Set(changed)].join(", ") || "(nothing)"}`);

  // 1. The school row: name, motto, address, phone, email, website.
  const schoolPatch = Object.fromEntries(
    Object.entries(SCHOOL_PATCH).filter(([key, value]) => school[key] !== value),
  );
  if (Object.keys(schoolPatch).length > 0) {
    const { error } = await supabase.from("schools").update(schoolPatch).eq("id", school.id);
    if (error) throw new Error(`schools update failed: ${error.message}`);
    console.log(`\nschools updated: ${Object.keys(schoolPatch).join(", ")}`);
  } else {
    console.log("\nschools: already correct");
  }

  // 2. The page content: one atomic replacement through the real CMS function.
  const { data, error } = await supabase.rpc("replace_website_page_sections", {
    p_school_id: school.id,
    p_page_id: page.id,
    p_expected_version: config.draft_version,
    p_sections: sections,
  });
  if (error) throw new Error(`replace_website_page_sections failed: ${error.message}`);

  const result = data || {};
  if (result.ok !== true) {
    throw new Error(`replace_website_page_sections refused: ${result.reason || JSON.stringify(result)}`);
  }
  console.log(`sections replaced: draft_version ${config.draft_version} -> ${result.draft_version}`);

  // 3. SEO copy still described the previous positioning. This field is outside
  //    the draft version (theme/contact/SEO saves never touch it).
  const currentSeo = config.seo || {};
  const seo = { ...currentSeo, ...SEO };
  if (JSON.stringify(currentSeo) !== JSON.stringify(seo)) {
    const { error: seoError } = await supabase
      .from("website_configs")
      .update({ seo })
      .eq("school_id", school.id);
    if (seoError) throw new Error(`seo update failed: ${seoError.message}`);
    console.log("seo updated");
  } else {
    console.log("seo: already correct");
  }

  console.log(`\nDONE. Live at /site/${school.slug} and https://gsapexstars.com.ng/`);
}

async function main() {
  const command = process.argv[2] || "inspect";
  const wantsApply = command === "apply";
  if (!["inspect", "plan", "apply"].includes(command)) {
    throw new Error(`Unknown command '${command}'. Use inspect, plan or apply.`);
  }
  if (wantsApply && !process.argv.includes("--apply")) {
    throw new Error("apply requires --apply (and the production guard's --confirm-target=<ref>).");
  }

  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  console.log(`▶ env: ${path.basename(ENV_FILE)}`);

  if (wantsApply) {
    guardDatabase({ ref: refFromUrl(url), action: "rewrite GS-Apex website content on" });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  if (wantsApply) await apply(supabase);
  else if (command === "plan") await plan(supabase);
  else await inspect(supabase);
}

main().catch((error) => {
  console.error(`\nFAILED: ${error.message}`);
  process.exit(1);
});
