/**
 * Interpreting the hosting provider — the pure half.
 *
 * Vercel answers in its own shapes (`verified`, `verification[]`, `misconfigured`,
 * `recommendedIPv4`…), and the Super Admin panel needs ours: a state that can be
 * true, and the DNS records a school must set. Doing that translation in a pure
 * function means the awkward part — every combination the API can return — is
 * tested without a network, which is what let this be built before the API token
 * existed.
 *
 * THE RULE THE PANEL LEARNED THE HARD WAY: never invent a DNS value. Records are
 * reported only when the provider actually supplied them; when it did not, the
 * panel says so. The previous hardcoded `cname.schoolaid.app` was wrong for this
 * deployment, and a school that followed it pointed its domain at nothing.
 */

/** What our own database stores in `website_configs.domain_status`. */
export type DomainState = "pending" | "live" | "error";

export type DnsRecord = {
  /** "CNAME" or "A" — what the school adds at their registrar. */
  type: string;
  /** "@" for an apex domain, "www", or a hostname for ownership checks. */
  host: string;
  value: string;
  /** Why the provider asked for this record, when it says. */
  reason?: string;
};

/** The slice of a Vercel project-domain response this platform cares about. */
export type ProviderDomain = {
  verified?: boolean;
  verification?: { type?: string; domain?: string; value?: string; reason?: string }[];
};

/** The slice of a Vercel domain-config response this platform cares about. */
export type ProviderDomainConfig = {
  misconfigured?: boolean;
  recommendedIPv4?: { value?: string[] }[];
  recommendedCNAME?: { value?: string[] }[];
};

/**
 * The state to show, from what the provider said.
 *
 * `verified` is the provider's own word for "the school has proved it controls
 * this domain", so it is the only thing that earns `live`. Anything the provider
 * could not confirm is `pending` — never `live`, because "we have not checked"
 * and "it works" must not look the same in a panel a support person trusts.
 */
export function domainStateFrom(domain: ProviderDomain | null): DomainState {
  return domain?.verified === true ? "live" : "pending";
}

/**
 * The records to show the school.
 *
 * Apex domains need an A record and subdomains need a CNAME; the provider
 * recommends one or the other, and a domain that is not yet verified also comes
 * with ownership records (a TXT or CNAME proving control). All of them are
 * included, deduplicated, because a school that sets only half of them sees a
 * domain that half works.
 */
export function dnsRecordsFrom(
  domain: ProviderDomain | null,
  config: ProviderDomainConfig | null,
  apexName?: string,
): DnsRecord[] {
  const records: DnsRecord[] = [];
  const seen = new Set<string>();

  const push = (record: DnsRecord) => {
    const key = `${record.type}:${record.host}:${record.value}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    records.push(record);
  };

  for (const recommendation of config?.recommendedCNAME ?? []) {
    for (const value of recommendation.value ?? []) {
      if (value) push({ type: "CNAME", host: "www", value, reason: "Points the website at SchoolAid" });
    }
  }

  for (const recommendation of config?.recommendedIPv4 ?? []) {
    for (const value of recommendation.value ?? []) {
      if (value) push({ type: "A", host: "@", value, reason: "The apex domain's address" });
    }
  }

  for (const record of domain?.verification ?? []) {
    const type = (record.type ?? "").toUpperCase();
    if (!type || !record.value) continue;
    // The provider names the full host; the school's registrar wants the label
    // (e.g. "_vercel" or "www"), so the apex suffix is stripped when present.
    const host = stripApex(record.domain ?? "@", apexName);
    push({ type, host, value: record.value, reason: record.reason });
  }

  return records;
}

function stripApex(domain: string, apexName?: string): string {
  if (!apexName) return domain;
  const suffix = `.${apexName}`.toLowerCase();
  const lower = domain.toLowerCase();
  if (lower === apexName.toLowerCase()) return "@";
  return lower.endsWith(suffix) ? domain.slice(0, -suffix.length) || "@" : domain;
}

/**
 * A message for the panel, or null when nothing is wrong.
 *
 * `misconfigured` from the provider is a real, actionable condition ("the DNS
 * points somewhere else"), so it is reported as the error it is rather than
 * being hidden behind a pending badge.
 */
export function domainProblem(
  domain: ProviderDomain | null,
  config: ProviderDomainConfig | null,
): string | null {
  if (!domain) return "The domain is not registered with the website host yet.";
  if (config?.misconfigured === true) {
    return "The domain's DNS records do not point at SchoolAid yet. Check the records below.";
  }
  if (domain.verified !== true) {
    return "Waiting for the school's DNS records to take effect.";
  }
  return null;
}
