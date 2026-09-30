#!/usr/bin/env node
// ============================================================================
// Route matrix — the regression evidence for "existing routes are unchanged".
//
// Records the HTTP status (and redirect target) of a curated set of paths for
// an anonymous visitor. Run it before and after any Website Engine change and
// diff the output: the "existing" block must be identical, and only the
// "public website" block may differ.
//
// Usage:
//   node scripts/route-matrix.cjs [BASE_URL]
// Env:
//   APP_URL  — used when no argument is given (default http://localhost:3000)
//
// Redirect targets have the base URL stripped so the output is stable across
// local, staging and production runs.
// ============================================================================

const BASE = (process.argv[2] || process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");

/**
 * Paths that exist today. These MUST NOT change.
 */
const EXISTING_PATHS = [
  "/",
  "/login",
  "/change-password",
  "/super-admin/dashboard",
  "/school-admin/dashboard",
  "/teacher/dashboard",
  "/student/dashboard",
  "/api/public/school-by-slug?slug=test",
  "/favicon.svg",
];

/**
 * Paths the Website Engine introduces. Expected to change as slices land.
 * `/site` (no trailing slash) is deliberately not bypassed by the middleware,
 * so it keeps the platform's default "unknown path" behaviour.
 */
const WEBSITE_PATHS = [
  "/site",
  "/site/",
  "/site/test-staging",
  "/site/test",
  "/site/no-such-school-probe",
];

async function probe(path) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
    const location = res.headers.get("location");
    return `${res.status}${location ? ` → ${location.replace(BASE, "")}` : ""}`;
  } catch (err) {
    return `ERROR ${err?.name || err?.message || "unknown"}`;
  }
}

(async () => {
  console.log(`route matrix → ${BASE}\n`);

  console.log("— existing (must be identical before and after) —");
  for (const path of EXISTING_PATHS) {
    console.log(`${path.padEnd(46)} ${await probe(path)}`);
  }

  console.log("\n— public website (new; changes with each Website Engine slice) —");
  for (const path of WEBSITE_PATHS) {
    console.log(`${path.padEnd(46)} ${await probe(path)}`);
  }
})();
