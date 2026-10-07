import type { ProviderDomain, ProviderDomainConfig } from "./domain-state";

/**
 * The hosting provider's API — transport only.
 *
 * Every call answers a typed result instead of throwing: the callers are a Super
 * Admin screen and an API route, and neither should ever show a stack trace.
 * `vercelConfigured()` is the whole reason this could be built and tested before
 * the credentials existed — with no token, every call answers "not configured",
 * the platform behaves exactly as it did before, and it says so plainly.
 *
 * The token is server-only (`VERCEL_API_TOKEN`), never NEXT_PUBLIC_, and scoped
 * to the single project this deployment runs (`VERCEL_PROJECT_ID`), with
 * `VERCEL_TEAM_ID` when the project lives under a team.
 */

const API = "https://api.vercel.com";

export type ProviderResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number; notConfigured?: boolean };

const NOT_CONFIGURED =
  "Domain automation is not configured on this deployment (no website-host credentials).";

function credentials(): { token: string; project: string; team: string | null } | null {
  const token = process.env.VERCEL_API_TOKEN;
  const project = process.env.VERCEL_PROJECT_ID;
  if (!token || !project) return null;
  return { token, project, team: process.env.VERCEL_TEAM_ID || null };
}

/**
 * Whether domain automation is set up on this deployment.
 *
 * `VERCEL_BRANCH` is for environments that are not production: a domain added to
 * a project serves the PRODUCTION deployment by default, so testing on a branch
 * preview (staging) would otherwise register the domain against the wrong code
 * and the wrong database. When it is set, the domain is attached to that branch;
 * production leaves it unset and gets the normal behaviour.
 */
export function vercelConfigured(): boolean {
  return credentials() !== null;
}

/** The branch domains are attached to here, or null for the project's production. */
export function vercelBranch(): string | null {
  const branch = process.env.VERCEL_BRANCH;
  return branch && branch.trim() ? branch.trim() : null;
}

async function call<T>(
  buildPath: (project: string) => string,
  init: { method: string; body?: unknown; scopedToBranch?: boolean },
): Promise<ProviderResult<T>> {
  const creds = credentials();
  if (!creds) return { ok: false, error: NOT_CONFIGURED, notConfigured: true };

  const params: string[] = [];
  if (creds.team) params.push(`teamId=${encodeURIComponent(creds.team)}`);
  const branch = vercelBranch();
  if (branch && init.scopedToBranch !== false) params.push(`gitBranch=${encodeURIComponent(branch)}`);

  const path = buildPath(creds.project);
  const target = params.length
    ? `${API}${path}${path.includes("?") ? "&" : "?"}${params.join("&")}`
    : `${API}${path}`;

  let response: Response;
  try {
    response = await fetch(target, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${creds.token}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // A Super Admin is waiting on a panel; do not wait forever.
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "the request failed";
    return { ok: false, error: `Could not reach the website host: ${reason}` };
  }

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    // The host puts the useful sentence in error.message ("Domain is already in
    // use by another project", for instance) — surface it, because a Super Admin
    // is the person who has to act on it.
    const message =
      (parsed as { error?: { message?: string } } | null)?.error?.message ??
      `The website host refused the request (HTTP ${response.status}).`;
    return { ok: false, error: message, status: response.status };
  }

  return { ok: true, data: (parsed ?? {}) as T };
}

const project = (path: string) => (id: string) => `/v9/projects/${encodeURIComponent(id)}${path}`;

/** Registers a domain on our project, so the host will route it to us. */
export function addDomain(domain: string): Promise<ProviderResult<ProviderDomain>> {
  const branch = vercelBranch();
  return call<ProviderDomain>((id) => `/v10/projects/${encodeURIComponent(id)}/domains`, {
    method: "POST",
    // The branch is named in the BODY here: it is what decides which deployment
    // answers this domain, and on staging that is the whole point.
    body: branch ? { name: domain, gitBranch: branch } : { name: domain },
    scopedToBranch: false,
  });
}

/** The domain's state on our project, including any ownership records. */
export function getDomain(domain: string): Promise<ProviderResult<ProviderDomain>> {
  return call<ProviderDomain>(project(`/domains/${encodeURIComponent(domain)}`), { method: "GET" });
}

/** Asks the host to re-check the school's DNS now rather than on its own schedule. */
export function verifyDomain(domain: string): Promise<ProviderResult<ProviderDomain>> {
  return call<ProviderDomain>(project(`/domains/${encodeURIComponent(domain)}/verify`), {
    method: "POST",
  });
}

/** The DNS values to show the school — the provider's own recommendations. */
export function getDomainConfig(domain: string): Promise<ProviderResult<ProviderDomainConfig>> {
  return call<ProviderDomainConfig>(() => `/v6/domains/${encodeURIComponent(domain)}/config`, {
    method: "GET",
  });
}

/** Releases a domain from our project — used when a school changes or clears it. */
export function removeDomain(domain: string): Promise<ProviderResult<unknown>> {
  return call(project(`/domains/${encodeURIComponent(domain)}`), { method: "DELETE" });
}
