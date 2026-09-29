#!/usr/bin/env node
// ============================================================================
// Website media garbage collector.
//
// Two jobs, both reported before anything is touched:
//
//   1. TOMBSTONES — rows the library soft-deleted more than the grace period
//      ago. The object is removed, then the row.
//   2. ORPHANS — objects in the bucket with no row at all. These are the debris
//      of a crashed upload (the object lands, the insert never happens) and
//      nothing else will ever collect them.
//
// DRY RUN BY DEFAULT. `--apply` is required to delete anything, and the grace
// period must be stated on the command line rather than defaulted here — this
// script deliberately carries no copy of that number, because a drifted default
// would delete an image a live page still points at. The value lives in
// `MEDIA_LIMITS.graceMs` (src/lib/site/media.ts) and is 7 days today.
//
// Usage:
//   node scripts/site-media-gc.cjs --grace-days=7              # report only
//   node scripts/site-media-gc.cjs --grace-days=7 --apply      # delete
//
// The database rule for this folder applies: staging runs freely, any other
// target must be named out loud with --confirm-target=<ref>.
// ============================================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { guardDatabase, refFromUrl } = require("./lib/db-guard");

const REPO = path.join(__dirname, "..");
const BUCKET = "site-assets";
const PREFIX = "site";
const APPLY = process.argv.includes("--apply");

const graceArg = (process.argv.find((a) => a.startsWith("--grace-days=")) || "").split("=")[1];
const graceDays = Number(graceArg);
if (!graceArg || !Number.isFinite(graceDays) || graceDays <= 0) {
  console.error(
    "REFUSING: state the grace period, e.g. --grace-days=7.\n" +
      "\n" +
      "  This script has no default on purpose: a default that drifted from\n" +
      "  MEDIA_LIMITS.graceMs would delete objects a live page still uses.\n",
  );
  process.exit(2);
}

function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv(path.join(REPO, ".env.local"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(2);
}

guardDatabase({ ref: refFromUrl(url), action: "delete website media from" });

const supabase = createClient(url, key, { auth: { persistSession: false } });
const cutoff = Date.now() - graceDays * 24 * 60 * 60 * 1000;

/** Every object under the site/ prefix, following the storage API's paging. */
async function listAllObjects() {
  const out = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const { data, error } = await supabase.storage.from(BUCKET).list(PREFIX, { limit, offset });
    if (error) throw new Error(`list ${BUCKET}/${PREFIX}: ${error.message}`);
    for (const item of data ?? []) out.push(`${PREFIX}/${item.name}`);
    if (!data || data.length < limit) break;
  }
  return out;
}

async function main() {
  console.log(`\n${APPLY ? "APPLY" : "DRY RUN"} · bucket ${BUCKET} · grace ${graceDays} day(s)\n`);

  // ── 1. Tombstones past the grace period ─────────────────────────────────────
  const { data: tombstones, error: tombError } = await supabase
    .from("website_media")
    .select("id, path, deleted_at")
    .eq("status", "tombstone");
  if (tombError) throw new Error(`read tombstones: ${tombError.message}`);

  const eligible = (tombstones ?? []).filter(
    (row) => row.deleted_at && new Date(row.deleted_at).getTime() <= cutoff,
  );
  console.log(
    `tombstones: ${(tombstones ?? []).length} total, ${eligible.length} past the grace period`,
  );

  for (const row of eligible) {
    console.log(`  ${APPLY ? "removing" : "would remove"} ${row.path} (deleted ${row.deleted_at})`);
    if (!APPLY) continue;
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([row.path]);
    // A missing object is not a failure: the object may already be gone.
    if (storageError && !/not found/i.test(storageError.message)) {
      console.error(`    ! object not removed: ${storageError.message}`);
      continue;
    }
    const { error: deleteError } = await supabase.from("website_media").delete().eq("id", row.id);
    if (deleteError) console.error(`    ! row not deleted: ${deleteError.message}`);
  }

  // ── 2. Orphan objects (a row must account for every object) ────────────────
  const objects = await listAllObjects();
  const { data: rows, error: rowError } = await supabase.from("website_media").select("path");
  if (rowError) throw new Error(`read paths: ${rowError.message}`);

  const known = new Set((rows ?? []).map((row) => row.path));
  const orphans = objects.filter((objectPath) => !known.has(objectPath));
  console.log(
    `\nobjects: ${objects.length} total, ${orphans.length} with no row (orphans)`,
  );

  for (const orphan of orphans) {
    console.log(`  ${APPLY ? "removing" : "would remove"} ${orphan}`);
    if (!APPLY) continue;
    const { error } = await supabase.storage.from(BUCKET).remove([orphan]);
    if (error) console.error(`    ! object not removed: ${error.message}`);
  }

  console.log(
    `\n${APPLY ? "Done." : "Dry run — nothing was deleted. Re-run with --apply to delete."}\n`,
  );
}

main().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});
