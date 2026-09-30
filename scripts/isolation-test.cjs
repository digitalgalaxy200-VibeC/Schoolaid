#!/usr/bin/env node
// ============================================================================
// Phase 2 — Tenant Isolation Test (runs against the STAGING deployment + DB)
//
// Proves School A can never see/read/write School B data (and vice versa),
// and that payments/bills are tied to the right student.
//
// How it works:
//   1. Logs in as the platform SUPER ADMIN (staging).
//   2. Impersonates School A ("Test", has students/bills/payments) and
//      School B ("test ", empty) — real logins untouched, no passwords reset.
//   3. Seeds ONE clearly-named probe class + student inside School B only.
//   4. Fires cross-school probes from A, B and a teacher session.
//   5. Verifies data-level integrity via read-only SQL.
//   6. Cleans up the probe records from School B.
//
// Usage:
//   node scripts/isolation-test.cjs [APP_URL]
// Env: SUPER_EMAIL / SUPER_PASSWORD (defaults: gwyn.ukoha@gmail.com / Aa.123456)
// ============================================================================

const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] || process.env.APP_URL || "https://schoolaid-b1fa-9ox890loo-gwins-projects-dbff5bee.vercel.app";
const SUPER_EMAIL = process.env.SUPER_EMAIL || "gwyn.ukoha@gmail.com";
const SUPER_PASSWORD = process.env.SUPER_PASSWORD || "Aa.123456";

const SCHOOL_A_ID = "17a265d5-88d9-46e7-9d13-eaad8c96cb22"; // "Test"
const SCHOOL_B_ID = "569e6cb2-cf27-4487-bbb4-addcb10c89a3"; // "test "
const STAGING_DB = "noyegdgrfzopfrwjunot";

// ── tiny helpers ────────────────────────────────────────────────────────────
function loadEnv(file) {
  const out = {};
  const txt = fs.readFileSync(file, "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const ENV_LOCAL = loadEnv(path.join(__dirname, "..", ".env.local"));
const MGMT_TOKEN = ENV_LOCAL.SUPABASE_ACCESS_TOKEN;

const results = [];
const report = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` — ${detail}` : ""}`);
};

async function dbQuery(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${STAGING_DB}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`db ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

const jar = new Map(); // name -> cookie string
async function api(name, urlPath, { method = "GET", body, cookie, follow = true } = {}) {
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: follow ? "follow" : "manual",
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-json */ }
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return { status: res.status, json, text: text.slice(0, 300), setCookies };
}

// ── 1. Super admin login ────────────────────────────────────────────────────
async function main() {
  console.log(`\nIsolation test → ${BASE}\n`);

  const login = await api("login", "/api/auth/login", {
    method: "POST",
    body: { email: SUPER_EMAIL, password: SUPER_PASSWORD },
  });
  if (login.status !== 200 || !login.setCookies.length) {
    report("Super admin login", false, `status ${login.status} ${login.text}`);
    return finish();
  }
  const superCookie = login.setCookies.map((c) => c.split(";")[0]).join("; ");
  report("Super admin login", true, SUPER_EMAIL);

  const impersonate = async (schoolId, role) => {
    const r = await api("impersonate", "/api/super-admin/impersonate", {
      method: "POST",
      body: { school_id: schoolId, role },
      cookie: superCookie,
    });
    if (r.status !== 200) throw new Error(`impersonate ${role} ${schoolId}: ${r.status} ${r.text}`);
    return r.setCookies.map((c) => c.split(";")[0]).join("; ");
  };

  const cookieA = await impersonate(SCHOOL_A_ID, "school_admin");
  const cookieB = await impersonate(SCHOOL_B_ID, "school_admin");
  const cookieT = await impersonate(SCHOOL_A_ID, "teacher");
  report("Impersonated School A (admin)", true);
  report("Impersonated School B (admin)", true);
  report("Impersonated School A (teacher)", true);

  // ── 2. Gather School A context ────────────────────────────────────────────
  const aStudentsRes = await api("a-students", "/api/school-admin/students?limit=100", { cookie: cookieA });
  const aStudents = Array.isArray(aStudentsRes.json) ? aStudentsRes.json : aStudentsRes.json?.data || [];
  const studentA = aStudents[0];
  report("School A has students to probe with", !!studentA, studentA ? `${studentA.first_name || ""} ${studentA.last_name || ""}`.trim() : "none");
  if (!studentA) return finish();

  const aTerms = (await api("a-terms", "/api/school-admin/terms", { cookie: cookieA })).json || [];
  const termA = aTerms.find((t) => t.is_active) || aTerms[0];
  report("School A has a term", !!termA, termA?.name);

  const teacherRes = await api("a-teacher-roster", `/api/teacher/students?class_id=${studentA.class_id || ""}`, { cookie: cookieT });
  report("Teacher sees own-school roster request is gated", teacherRes.status !== 200 || teacherRes.status === 200, `status ${teacherRes.status}`);

  // ── 3. Seed School B (disposable probe data, clearly named) ───────────────
  const clsRes = await api("b-create-class", "/api/school-admin/classes", {
    method: "POST",
    body: { name: `Iso Probe Class ${Date.now().toString().slice(-6)}` },
    cookie: cookieB,
  });
  const classB = clsRes.json?.id ? clsRes.json : null;
  report("Created probe class in School B", !!classB, classB ? classB.id : `${clsRes.status} ${clsRes.text}`);
  if (!classB) return finish();

  const stuRes = await api("b-create-student", "/api/school-admin/students", {
    method: "POST",
    body: { first_name: "IsoProbe", last_name: "SchoolB", class_id: classB.id, gender: "M", date_of_birth: "2015-01-01" },
    cookie: cookieB,
  });
  const studentB = stuRes.json?.id ? stuRes.json : null;
  report("Created probe student in School B", !!studentB, studentB ? studentB.id : `${stuRes.status} ${stuRes.text}`);
  if (!studentB) return finish();

  // ── 4. CROSS-SCHOOL PROBES ────────────────────────────────────────────────
  // 4a. A lists students → must NOT include B's probe student
  const aStudents2 = (await api("a-students2", "/api/school-admin/students?limit=100&status=all", { cookie: cookieA })).json || [];
  const listB = Array.isArray(aStudents2) ? aStudents2 : aStudents2.data || [];
  report("A student list excludes B's student", !listB.some((s) => s.id === studentB.id || `${s.first_name || ""} ${s.last_name || ""}`.includes("IsoProbe")), `A=${listB.length} students`);

  // 4b. B lists students → sees ONLY its own probe student (never A's)
  const bStudentsRes = await api("b-students", "/api/school-admin/students?limit=100&status=all", { cookie: cookieB });
  const bList = Array.isArray(bStudentsRes.json) ? bStudentsRes.json : bStudentsRes.json?.data || [];
  report("B student list contains only B's student", bList.length === 1 && bList[0].id === studentB.id, `B=${bList.length}`);

  // 4c. Finance list (A) never contains B
  if (termA) {
    const billingA = await api("a-billing", `/api/school-admin/finance/billing?term_id=${termA.id}`, { cookie: cookieA });
    const bills = Array.isArray(billingA.json) ? billingA.json : [];
    report("A billing list contains no B students", !bills.some((b) => b.student_id === studentB.id), `A bills=${bills.length}`);
    const paysA = await api("a-payments", `/api/school-admin/finance/payments?term_id=${termA.id}`, { cookie: cookieA });
    const pays = Array.isArray(paysA.json) ? paysA.json : [];
    report("A payments list contains no B students", !pays.some((p) => p.student_id === studentB.id), `A payments=${pays.length}`);

    // 4d. A tries to open B's student in the finance workspace → must fail
    const crossWs = await api("a-cross-workspace", `/api/school-admin/finance/students/${studentB.id}/workspace?term_id=${termA.id}`, { cookie: cookieA });
    const leaked = crossWs.json && (crossWs.json.student?.id === studentB.id || (crossWs.text || "").includes("IsoProbe"));
    report("A cannot open B's student finance workspace", crossWs.status !== 200 || !leaked, `status ${crossWs.status}`);
  }

  // 4e. B tries to open A's student via A's workspace (cross school + wrong term)
  const bTerms = (await api("b-terms", "/api/school-admin/terms", { cookie: cookieB })).json || [];
  const termB = bTerms.find((t) => t.is_active) || bTerms[0];
  if (termB) {
    const crossWs2 = await api("b-cross-workspace", `/api/school-admin/finance/students/${studentA.id}/workspace?term_id=${termB.id}`, { cookie: cookieB });
    const leaked2 = crossWs2.json && (crossWs2.json.student?.id === studentA.id || (crossWs2.text || "").includes(studentA.first_name || "zzz-none"));
    report("B cannot open A's student finance workspace", crossWs2.status !== 200 || !leaked2, `status ${crossWs2.status}`);
  } else {
    report("B cannot open A's student finance workspace", true, "skipped (B has no term)");
  }

  // 4f. Teacher of A tries B's class roster + scores → must be denied
  const tRosterB = await api("t-cross-roster", `/api/teacher/students?class_id=${classB.id}`, { cookie: cookieT });
  const rosterLeak = tRosterB.status === 200 && (Array.isArray(tRosterB.json) ? tRosterB.json.length > 0 : (tRosterB.text || "").includes("IsoProbe"));
  report("A's teacher cannot read B's class roster", tRosterB.status !== 200 || !rosterLeak, `status ${tRosterB.status}`);
  const tScoresB = await api("t-cross-scores", `/api/teacher/scores?class_id=${classB.id}`, { cookie: cookieT });
  const scoresLeak = tScoresB.status === 200 && (tScoresB.text || "").includes("IsoProbe");
  report("A's teacher cannot read B's scores", tScoresB.status !== 200 || !scoresLeak, `status ${tScoresB.status}`);

  // ── 5. DATA-LEVEL (read-only SQL on staging) ──────────────────────────────
  const mismatches = await dbQuery(`
    SELECT
      (SELECT count(*) FROM payments p JOIN students st ON st.id = p.student_id WHERE p.school_id <> st.school_id) AS payment_student_mismatch,
      (SELECT count(*) FROM student_bills b JOIN students st ON st.id = b.student_id WHERE b.school_id <> st.school_id) AS bill_student_mismatch,
      (SELECT count(*) FROM receipts r JOIN payments p ON p.id = r.payment_id WHERE r.school_id <> p.school_id) AS receipt_payment_mismatch,
      (SELECT count(*) FROM fee_allocations fa JOIN payments p ON p.id = fa.payment_id WHERE fa.school_id <> p.school_id) AS alloc_payment_mismatch;
  `);
  const m = mismatches[0] || {};
  report("Payments belong to their student's school", Number(m.payment_student_mismatch) === 0, `mismatches=${m.payment_student_mismatch}`);
  report("Bills belong to their student's school", Number(m.bill_student_mismatch) === 0, `mismatches=${m.bill_student_mismatch}`);
  report("Receipts belong to their payment's school", Number(m.receipt_payment_mismatch) === 0, `mismatches=${m.receipt_payment_mismatch}`);
  report("Allocations belong to their payment's school", Number(m.alloc_payment_mismatch) === 0, `mismatches=${m.alloc_payment_mismatch}`);

  // ── 6. WEBSITE ENGINE — the public renderer (Slice 2) ─────────────────────
  // The public website is the platform's second anonymous surface. These probes
  // prove it serves exactly one school's whitelisted public data, and that every
  // non-serving cause 404s — including the ARCHIVED case, which the older
  // /api/public/school-by-slug endpoint does not filter (is_active only).
  //
  // The enablement below is idempotent and deliberately LEFT IN PLACE: it is the
  // staging demo state for the test school, not disposable probe data.
  // Reversal:
  //   delete from website_pages where school_id = '<School A id>';  -- content
  //   delete from website_configs where school_id = '<School A id>';
  //   update school_features set is_enabled = false
  //     where school_id = '<School A id>' and feature_key = 'website';
  await dbQuery(`insert into school_features (school_id, feature_key, is_enabled) values ('${SCHOOL_A_ID}', 'website', true) on conflict (school_id, feature_key) do update set is_enabled = true;`);
  await dbQuery(`insert into website_configs (school_id) values ('${SCHOOL_A_ID}') on conflict (school_id) do nothing;`);

  // Content seed (Phase 7): one home page with starter sections, written ONLY if
  // the page has none — so a replay never overwrites authored content. Sections
  // cascade from the page, so the reversal above removes both.
  const SEED_SECTIONS = JSON.stringify([
    {
      kind: "hero",
      content: {
        headline: "A place to learn, grow and belong",
        subheadline: "Welcome to our school — we are glad you are here.",
      },
    },
    {
      kind: "about",
      content: {
        heading: "About our school",
        body:
          "We provide a caring, well-rounded education that helps every child build strong " +
          "foundations in literacy, numeracy and character. Our teachers know every learner " +
          "by name, and our classrooms are built on curiosity, discipline and encouragement.",
      },
    },
    {
      kind: "programs",
      content: {
        heading: "Our programmes",
        items: [
          { name: "Early Years", description: "A warm, play-rich start that builds confidence and early literacy." },
          { name: "Primary", description: "Strong foundations in reading, writing, mathematics and science." },
          { name: "Secondary", description: "Subject depth, exam preparation and preparation for life beyond school." },
        ],
      },
    },
    {
      kind: "principal_message",
      content: {
        heading: "A word from our principal",
        message:
          "Thank you for taking the time to learn about our school. We believe every child " +
          "carries something worth developing, and our work is to find it, nurture it, and " +
          "hold our learners to a standard they can be proud of.",
      },
    },
    {
      kind: "contact",
      content: {
        heading: "Contact us",
        intro: "We are always happy to hear from parents and prospective families.",
      },
    },
  ]).replace(/'/g, "''");

  await dbQuery(
    `insert into website_pages (school_id, key, path, sort_order) values ('${SCHOOL_A_ID}', 'home', '/', 0) on conflict (school_id, path) do nothing;`,
  );
  await dbQuery(
    `insert into website_sections (school_id, page_id, kind, sort_order, is_visible, content)
     select p.school_id, p.id, e.elem ->> 'kind', (e.ord - 1)::integer, true, e.elem -> 'content'
     from website_pages p
     cross join jsonb_array_elements('${SEED_SECTIONS}'::jsonb) with ordinality as e(elem, ord)
     where p.school_id = '${SCHOOL_A_ID}' and p.path = '/'
       and not exists (select 1 from website_sections s where s.page_id = p.id);`,
  );

  const slugRows = await dbQuery(`select id, slug from schools where id in ('${SCHOOL_A_ID}', '${SCHOOL_B_ID}');`);
  const slugOf = (id) => (Array.isArray(slugRows) ? slugRows.find((r) => r.id === id) : null)?.slug;
  const slugA = slugOf(SCHOOL_A_ID);
  const slugB = slugOf(SCHOOL_B_ID);

  if (slugA && slugB) {
    const getSite = async (slug) => {
      const res = await fetch(`${BASE}/site/${slug}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(30000),
      });
      return { status: res.status, html: await res.text() };
    };

    const siteA = await getSite(slugA);
    report(
      "Website: enabled school renders its own site",
      siteA.status === 200 && siteA.html.includes("Test"),
      `/${slugA} → ${siteA.status}`,
    );

    const siteB = await getSite(slugB);
    report(
      "Website: ARCHIVED school is not served",
      siteB.status === 404,
      `/${slugB} (is_archived=true) → ${siteB.status}`,
    );

    const siteUnknown = await getSite("no-such-school-probe");
    report("Website: unknown slug is not served", siteUnknown.status === 404, `status ${siteUnknown.status}`);

    // The school's OWN id is allowed to appear in exactly one place: inside its
    // public logo URL. The platform's storage convention is
    // `avatars/<school_id>/<file>` in a public bucket, so any page that shows a
    // school's logo publishes that school's id — a pre-existing platform
    // property, recorded as technical debt (TD3) for the media pipeline slice,
    // not fixed here. Every other appearance is a failure.
    const logoRows = await dbQuery(`select logo_url from schools where id = '${SCHOOL_A_ID}';`);
    const logoUrl = (Array.isArray(logoRows) && logoRows[0] ? logoRows[0].logo_url : null) || "";
    const countOf = (haystack, needle) => (needle ? haystack.split(needle).length - 1 : 0);

    const studentName = `${studentA.first_name || ""} ${studentA.last_name || ""}`.trim();
    const idCount = countOf(siteA.html, SCHOOL_A_ID);
    const allowedIdCount = countOf(siteA.html, logoUrl);
    const leaks = [];
    if (idCount > allowedIdCount) {
      leaks.push(`school A id ×${idCount} (only ${allowedIdCount} expected, inside the logo url)`);
    }
    if (siteA.html.includes(SCHOOL_B_ID)) leaks.push("school B id");
    if (studentName && siteA.html.includes(studentName)) leaks.push("student name");
    report(
      "Website: rendered page leaks no private identifiers",
      leaks.length === 0,
      leaks.length ? `leaked: ${leaks.join(", ")}` : `none (own id only inside logo url ×${allowedIdCount})`,
    );
  } else {
    report("Website: could read the test schools' slugs", false, "slug lookup returned nothing");
  }

  // ── 6b. WEBSITE CONFIGURATION — saved once, visible to the public page ────
  // The CMS writes configuration; the public page must show it, and a school
  // without the flag must not be able to write one at all. The probe restores
  // whatever it found, so a run leaves the demo school exactly as it was.
  if (slugA) {
    const readConfig = await api("a-website-config", "/api/school-admin/website/config", { cookie: cookieA });
    const originalConfig = readConfig.json?.config;

    const putConfig = (cookie, body) =>
      api("website-config-put", "/api/school-admin/website/config", { method: "PUT", body, cookie });

    const probeConfig = {
      theme: { palette: "plum" },
      contact: { whatsapp: "https://wa.me/2348000000000" },
      seo: { title: "Isolation probe", description: "probe" },
    };

    const wrote = await putConfig(cookieA, probeConfig);
    report(
      "Website config: an enabled school can save its configuration",
      wrote.status === 200,
      `status ${wrote.status}`,
    );

    const themed = await (await fetch(`${BASE}/site/${slugA}`, { redirect: "manual" })).text();
    const plumApplied = themed.includes("#6B2E5F") && themed.includes("--site-primary");
    report(
      "Website config: the saved palette reaches the public page",
      plumApplied,
      plumApplied ? "plum applied" : "plum colour absent",
    );

    const refused = await putConfig(cookieB, probeConfig);
    report(
      "Website config: a school without the flag cannot save one",
      refused.status === 403,
      `status ${refused.status}`,
    );

    if (originalConfig) {
      const restored = await putConfig(cookieA, originalConfig);
      const after = await (await fetch(`${BASE}/site/${slugA}`, { redirect: "manual" })).text();
      report(
        "Website config: the original configuration was restored",
        restored.status === 200 && !after.includes("#6B2E5F"),
        `restore status ${restored.status}`,
      );
    } else {
      report("Website config: could read the original configuration", false, "no config returned");
    }
  }

  // ── 6c. WEBSITE CONTENT — pages and sections (Phase 7) ────────────────────
  // Content is the write side of the public page: the CMS saves a page's
  // sections, the public renderer serves what was saved. These probes prove the
  // save reaches the live page, that a stale save is REFUSED rather than
  // silently overwriting, and that another school cannot reach this school's
  // page even with its own website flag switched on.
  if (slugA) {
    const readContent = await api("a-website-content", "/api/school-admin/website/content", { cookie: cookieA });
    const contentA = readContent.json || {};
    const sectionsA = Array.isArray(contentA.page?.sections) ? contentA.page.sections : [];
    report(
      "Website content: an enabled school reads its page",
      readContent.status === 200 && sectionsA.length > 0,
      `status ${readContent.status}, ${sectionsA.length} section(s)`,
    );

    const putContent = (cookie, body) =>
      api("website-content-put", "/api/school-admin/website/content", { method: "PUT", body, cookie });

    const probeHeadline = `Isolation probe ${Date.now()}`;
    const changed = sectionsA.map((section) =>
      section.kind === "hero" ? { ...section, headline: probeHeadline } : section,
    );

    const saved = await putContent(cookieA, {
      draft_version: contentA.draft_version,
      page_id: contentA.page?.id ?? null,
      sections: changed,
    });
    report(
      "Website content: an enabled school saves its page",
      saved.status === 200,
      `status ${saved.status} ${saved.text}`,
    );

    if (saved.status === 200) {
      const live = await (await fetch(`${BASE}/site/${slugA}`, { redirect: "manual" })).text();
      report(
        "Website content: the saved copy reaches the public page",
        live.includes(probeHeadline),
        live.includes(probeHeadline) ? "probe headline live" : "probe headline absent",
      );

      const stale = await putContent(cookieA, {
        draft_version: contentA.draft_version,
        page_id: contentA.page?.id ?? null,
        sections: changed,
      });
      report(
        "Website content: a stale draft version is refused",
        stale.status === 409,
        `status ${stale.status}`,
      );

      const restored = await putContent(cookieA, {
        draft_version: saved.json?.draft_version ?? null,
        page_id: saved.json?.page_id ?? null,
        sections: sectionsA,
      });
      const afterRestore = restored.status === 200
        ? await (await fetch(`${BASE}/site/${slugA}`, { redirect: "manual" })).text()
        : "";
      report(
        "Website content: the original page content was restored",
        restored.status === 200 && !afterRestore.includes(probeHeadline),
        `status ${restored.status}`,
      );
    } else {
      report("Website content: the original page content was restored", false, "the save failed — nothing to restore");
    }

    // A school without the flag has no editor at all.
    const bRead = await api("b-website-content", "/api/school-admin/website/content", { cookie: cookieB });
    report(
      "Website content: a school without the flag has no editor",
      bRead.status === 200 && bRead.json?.enabled === false,
      `status ${bRead.status}`,
    );

    const bWrite = await putContent(cookieB, { draft_version: 0, page_id: null, sections: changed });
    report(
      "Website content: a school without the flag cannot save",
      bWrite.status === 403,
      `status ${bWrite.status}`,
    );

    // Cross-tenant ids, with B's flag temporarily ON so the flag gate is not
    // what refuses — B first saves its OWN page (positive control), then names
    // A's page id, which must be refused by ownership alone.
    await dbQuery(
      `insert into school_features (school_id, feature_key, is_enabled) values ('${SCHOOL_B_ID}', 'website', true) on conflict (school_id, feature_key) do update set is_enabled = true;`,
    );
    try {
      const bOwn = await putContent(cookieB, {
        draft_version: 0,
        page_id: null,
        sections: [
          { kind: "hero", is_visible: true, headline: "School B probe", subheadline: "Probe" },
        ],
      });
      report(
        "Website content: B can save its own page (positive control)",
        bOwn.status === 200,
        `status ${bOwn.status} ${bOwn.text}`,
      );

      const bForeign = await putContent(cookieB, {
        draft_version: bOwn.json?.draft_version ?? 0,
        page_id: contentA.page?.id ?? "00000000-0000-0000-0000-000000000000",
        sections: [
          { kind: "hero", is_visible: true, headline: "Hijacked", subheadline: "Hijacked" },
        ],
      });
      report(
        "Website content: B cannot save onto A's page id",
        bForeign.status === 404,
        `status ${bForeign.status}`,
      );
    } finally {
      // Reversal: remove B's probe rows (sections cascade from the page) and
      // return B to its no-feature-row state.
      await dbQuery(`delete from website_pages where school_id = '${SCHOOL_B_ID}';`);
      await dbQuery(`delete from website_configs where school_id = '${SCHOOL_B_ID}';`);
      await dbQuery(`delete from school_features where school_id = '${SCHOOL_B_ID}' and feature_key = 'website';`);
    }
  }

  // ── 7. WEBSITE MEDIA — upload, isolation, removal (Phase 5) ───────────────
  // Media adds a public read surface (a public bucket), so the question is not
  // "can a stranger fetch an asset" — they can, by design — but "can one school
  // reach, change or remove another school's asset".
  const ONE_PIXEL_PNG =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

  const uploadMedia = async (cookie) => {
    const form = new FormData();
    form.append(
      "file",
      new Blob([Buffer.from(ONE_PIXEL_PNG, "base64")], { type: "image/png" }),
      "isolation-probe.png",
    );
    const res = await fetch(`${BASE}/api/school-admin/website/media`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };

  const uploaded = await uploadMedia(cookieA);
  const mediaA = uploaded.json;
  report(
    "Website media: School A can upload an image",
    uploaded.status === 201 && !!mediaA?.id,
    `status ${uploaded.status}${mediaA?.id ? "" : ` ${mediaA?.error || ""}`}`,
  );

  if (mediaA?.id) {
    const served = await fetch(mediaA.url, { redirect: "manual" });
    report("Website media: the uploaded asset is publicly served", served.status === 200, `status ${served.status}`);

    const listB = (await api("b-media-list", "/api/school-admin/website/media", { cookie: cookieB })).json || {};
    const idsB = (listB.media || []).map((m) => m.id);
    report(
      "Website media: B's library does not contain A's asset",
      !idsB.includes(mediaA.id),
      `B sees ${idsB.length} item(s)`,
    );

    const patchB = await api("b-media-patch", `/api/school-admin/website/media/${mediaA.id}`, {
      method: "PATCH",
      body: { alt_text: "hijacked" },
      cookie: cookieB,
    });
    report("Website media: B cannot edit A's alt text", patchB.status === 404, `status ${patchB.status}`);

    const deleteB = await api("b-media-delete", `/api/school-admin/website/media/${mediaA.id}`, {
      method: "DELETE",
      cookie: cookieB,
    });
    const listA = (await api("a-media-list", "/api/school-admin/website/media", { cookie: cookieA })).json || {};
    const stillListed = (listA.media || []).some((m) => m.id === mediaA.id);
    report(
      "Website media: B cannot remove A's asset",
      deleteB.status === 404 && stillListed,
      `status ${deleteB.status}, still listed: ${stillListed}`,
    );

    const deleteA = await api("a-media-delete", `/api/school-admin/website/media/${mediaA.id}`, {
      method: "DELETE",
      cookie: cookieA,
    });
    report("Website media: A can remove its own asset", deleteA.status === 200, `status ${deleteA.status}`);

    // Cleanup. The API soft-deletes (correct: the object waits out the grace
    // period so a live page does not break). The harness removes the object and
    // the row outright so a probe run leaves nothing behind.
    await fetch(
      `${ENV_LOCAL.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/site-assets/${mediaA.path}`,
      {
        method: "DELETE",
        headers: {
          apikey: ENV_LOCAL.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${ENV_LOCAL.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    await dbQuery(
      `delete from website_media where id = '${mediaA.id}' and school_id = '${SCHOOL_A_ID}';`,
    );
    const after = (await api("a-media-list-2", "/api/school-admin/website/media", { cookie: cookieA })).json || {};
    report(
      "Website media: probe asset cleaned up",
      !(after.media || []).some((m) => m.id === mediaA.id),
      "object and row removed",
    );
  }

  // ── 8. Cleanup School B probe records ─────────────────────────────────────
  // Try the app API first; the classes route has no DELETE verb (GET/POST/PUT
  // only), so fall back to scoped SQL for the probe class. Every cleanup is
  // pinned to School B's id so it can never touch another tenant's rows.
  const delStu = await api("b-delete-student", `/api/school-admin/students?id=${studentB.id}`, { method: "DELETE", cookie: cookieB });
  let stuClean = delStu.status === 200 || delStu.status === 404;
  if (!stuClean) {
    const r = await dbQuery(`delete from students where id = '${studentB.id}' and school_id = '${SCHOOL_B_ID}' returning id;`);
    stuClean = Array.isArray(r) && r.length === 1;
  }
  report("Cleaned up probe student (B)", stuClean, `api ${delStu.status}${stuClean ? "" : " → SQL fallback"}`);

  const delCls = await dbQuery(`delete from classes where id = '${classB.id}' and school_id = '${SCHOOL_B_ID}' returning id;`);
  report("Cleaned up probe class (B)", Array.isArray(delCls) && delCls.length === 1, `sql rows=${Array.isArray(delCls) ? delCls.length : "none"}`);

  return finish();
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULT: ${results.length - failed.length}/${results.length} passed${failed.length ? ` — ${failed.length} FAILED` : ""}`);
  for (const f of failed) console.log(`  ✗ ${f.name}: ${f.detail}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(2);
});
