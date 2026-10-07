import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { verifySuperAdmin } from "@/lib/api-auth";
import {
  addDomain,
  getDomain,
  getDomainConfig,
  removeDomain,
  vercelConfigured,
  verifyDomain,
} from "@/lib/vercel/domains";
import {
  dnsRecordsFrom,
  domainProblem,
  domainStateFrom,
  type DnsRecord,
  type DomainState,
} from "@/lib/vercel/domain-state";

/**
 * A school's custom domain — registering it, and telling the truth about it.
 *
 * PUT  sets (or clears) the domain. The domain is registered with the website
 *      host BEFORE anything is stored: a domain we recorded but never registered
 *      would be a domain that silently cannot serve, which is exactly the state
 *      this route used to leave behind.
 *
 * GET  asks the host what is actually true right now, stores that, and returns
 *      it with the DNS records the school has to set. This is the panel's
 *      "Check again".
 *
 * WITH NO CREDENTIALS the feature is inert, not broken: saving still works,
 * nothing claims to be live, and both verbs say that automation is not set up.
 * That is why this could be built and tested before the API token existed.
 */

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

type DomainCheck = {
  state: DomainState;
  records: DnsRecord[];
  error: string | null;
  checkedAt: string;
};

/**
 * Asks the host what is true, in one round of calls.
 *
 * `recheck` additionally asks the host to re-verify NOW rather than on its own
 * schedule — that is what the panel's button is for. Both are best-effort: a
 * failure here is stored as an error message, never thrown at the caller.
 */
async function checkDomain(domain: string, recheck: boolean): Promise<DomainCheck> {
  const checkedAt = new Date().toISOString();

  if (recheck) await verifyDomain(domain);

  const [domainResult, configResult] = await Promise.all([getDomain(domain), getDomainConfig(domain)]);

  if (!domainResult.ok) {
    // A domain that is saved here but absent from the host is the shape left
    // behind by the years before this automation existed — name the fix rather
    // than repeating the host's 404.
    const error =
      domainResult.status === 404
        ? "This domain is not registered with the website host yet. Press “Save Domain” to register it now."
        : domainResult.error;
    return { state: "error", records: [], error, checkedAt };
  }

  const config = configResult.ok ? configResult.data : null;
  const state = domainStateFrom(domainResult.data);

  return {
    state,
    records: dnsRecordsFrom(domainResult.data, config, domain),
    error: domainProblem(domainResult.data, config),
    checkedAt,
  };
}

async function schoolIdFor(
  supabase: ReturnType<typeof getServiceClient>,
  id: string,
): Promise<string | null> {
  const column = isUUID(id) ? "id" : "slug";
  const { data } = await supabase.from("schools").select("id").eq(column, id).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { id } = await params;
  const schoolId = await schoolIdFor(supabase, id);
  if (!schoolId) return NextResponse.json({ error: "School not found" }, { status: 404 });

  const { custom_domain } = await request.json();

  let cleanDomain: string | null = null;
  if (typeof custom_domain === "string" && custom_domain.trim()) {
    cleanDomain = custom_domain
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "");

    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(cleanDomain)) {
      return NextResponse.json(
        { error: "Invalid domain format (e.g. yourschool.edu.ng or school.com)." },
        { status: 400 },
      );
    }
  }

  const { data: existing } = await supabase
    .from("website_configs")
    .select("custom_domain")
    .eq("school_id", schoolId)
    .maybeSingle();
  const previous = (existing as { custom_domain?: string | null } | null)?.custom_domain ?? null;

  const automation = vercelConfigured();

  // ── Clearing ────────────────────────────────────────────────────────────────
  if (!cleanDomain) {
    if (previous && automation) await removeDomain(previous);

    const { error } = await supabase
      .from("website_configs")
      .upsert(
        { school_id: schoolId, custom_domain: null, domain_status: null, domain_checked_at: null, domain_error: null },
        { onConflict: "school_id" },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, custom_domain: null, domain_status: null, automation_configured: automation });
  }

  // ── Registering (only when it is new to us) ─────────────────────────────────
  let registeredNow = false;
  if (previous !== cleanDomain) {
    if (automation) {
      const added = await addDomain(cleanDomain);
      if (!added.ok) {
        // Nothing is stored: a failure must not leave a domain that looks set.
        return NextResponse.json(
          { error: added.error, automation_configured: true },
          { status: added.notConfigured ? 503 : 409 },
        );
      }
      registeredNow = true;
    }
  }

  const check: DomainCheck = automation
    ? // A save asks the host, whether the domain is new (is it registered?)
      // or unchanged (is it live?). Re-saving must never DOWNGRADE a domain
      // that is already serving, and only the host can answer that.
      await checkDomain(cleanDomain, false)
    : {
        state: "pending",
        records: [],
        error:
          "Automatic registration is not configured on this deployment, so this domain will not serve until it is added to the website host by hand.",
        checkedAt: new Date().toISOString(),
      };

  const { error: writeError } = await supabase.from("website_configs").upsert(
    {
      school_id: schoolId,
      custom_domain: cleanDomain,
      domain_status: check.state,
      domain_checked_at: check.checkedAt,
      domain_error: check.error,
    },
    { onConflict: "school_id" },
  );

  if (writeError) {
    // 23505 = the unique index created in 066: another school already holds it.
    if (writeError.code === "23505" || writeError.message?.includes("unique")) {
      if (registeredNow) await removeDomain(cleanDomain);
      return NextResponse.json(
        { error: "This domain is already registered to another school." },
        { status: 409 },
      );
    }
    if (registeredNow) await removeDomain(cleanDomain);
    return NextResponse.json({ error: writeError.message }, { status: 500 });
  }

  // The school moved from one domain to another: release the old one, after the
  // new one is safely stored, so a failure here cannot lose the new domain.
  if (previous && previous !== cleanDomain && automation) await removeDomain(previous);

  return NextResponse.json({
    ok: true,
    custom_domain: cleanDomain,
    domain_status: check.state,
    domain_error: check.error,
    domain_checked_at: check.checkedAt,
    records: check.records,
    automation_configured: automation,
  });
}

/** "Check again" — what is true about this domain right now. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { authorized } = await verifySuperAdmin(request);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getServiceClient();
  const { id } = await params;
  const schoolId = await schoolIdFor(supabase, id);
  if (!schoolId) return NextResponse.json({ error: "School not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("website_configs")
    .select("custom_domain, domain_status, domain_checked_at, domain_error")
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const row = (data ?? {}) as {
    custom_domain?: string | null;
    domain_status?: DomainState | null;
    domain_checked_at?: string | null;
    domain_error?: string | null;
  };

  if (!row.custom_domain) {
    return NextResponse.json({
      ok: true,
      custom_domain: null,
      domain_status: null,
      records: [],
      automation_configured: vercelConfigured(),
    });
  }

  if (!vercelConfigured()) {
    return NextResponse.json({
      ok: true,
      custom_domain: row.custom_domain,
      domain_status: row.domain_status,
      domain_checked_at: row.domain_checked_at,
      domain_error:
        row.domain_error ??
        "Automatic registration is not configured, so this domain will not serve until it is added to the website host by hand.",
      records: [],
      automation_configured: false,
    });
  }

  const recheck = new URL(request.url).searchParams.get("recheck") === "1";
  const check = await checkDomain(row.custom_domain, recheck);

  await supabase
    .from("website_configs")
    .update({
      domain_status: check.state,
      domain_checked_at: check.checkedAt,
      domain_error: check.error,
    })
    .eq("school_id", schoolId);

  return NextResponse.json({
    ok: true,
    custom_domain: row.custom_domain,
    domain_status: check.state,
    domain_checked_at: check.checkedAt,
    domain_error: check.error,
    records: check.records,
    automation_configured: true,
  });
}
