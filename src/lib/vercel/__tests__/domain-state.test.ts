import { describe, it, expect } from "vitest";
import {
  dnsRecordsFrom,
  domainProblem,
  domainStateFrom,
  type ProviderDomain,
  type ProviderDomainConfig,
} from "../domain-state";

/**
 * The panel used to show a green "Active" badge and a hardcoded CNAME target
 * (wrong for this deployment). These tests pin the two rules that replaced it:
 * only the provider's own "verified" earns "live", and a DNS value is either
 * supplied by the provider or not shown at all.
 */

describe("domainStateFrom", () => {
  it("is live only when the provider says the domain is verified", () => {
    expect(domainStateFrom({ verified: true })).toBe("live");
  });

  it("is pending for anything the provider has not confirmed", () => {
    expect(domainStateFrom({ verified: false })).toBe("pending");
    expect(domainStateFrom({})).toBe("pending");
    expect(domainStateFrom(null)).toBe("pending");
  });

  it("does not read a stringy 'true' as success", () => {
    // Anything but the provider's own boolean is not its word for anything.
    expect(domainStateFrom({ verified: "true" as unknown as boolean })).toBe("pending");
  });
});

describe("dnsRecordsFrom", () => {
  it("returns the provider's recommended CNAME and A records", () => {
    const config: ProviderDomainConfig = {
      recommendedCNAME: [{ value: ["cname.vercel-dns.com"] }],
      recommendedIPv4: [{ value: ["76.76.21.21"] }],
    };
    expect(dnsRecordsFrom({}, config)).toEqual([
      { type: "CNAME", host: "www", value: "cname.vercel-dns.com", reason: "Points the website at SchoolAid" },
      { type: "A", host: "@", value: "76.76.21.21", reason: "The apex domain's address" },
    ]);
  });

  it("includes ownership records, with the apex stripped to the label a registrar wants", () => {
    const domain: ProviderDomain = {
      verified: false,
      verification: [
        { type: "TXT", domain: "_vercel.schoola.com", value: "vc-domain-verify=abc", reason: "Verify ownership" },
        { type: "CNAME", domain: "www.schoola.com", value: "cname.vercel-dns.com" },
      ],
    };
    const records = dnsRecordsFrom(domain, null, "schoola.com");
    expect(records[0]).toEqual({
      type: "TXT",
      host: "_vercel",
      value: "vc-domain-verify=abc",
      reason: "Verify ownership",
    });
    expect(records[1].host).toBe("www");
  });

  it("maps the apex itself to @", () => {
    const domain: ProviderDomain = {
      verification: [{ type: "TXT", domain: "schoola.com", value: "x" }],
    };
    expect(dnsRecordsFrom(domain, null, "schoola.com")[0].host).toBe("@");
  });

  it("shows nothing rather than inventing a value when the provider gave none", () => {
    // The old panel printed `cname.schoolaid.app` here. A wrong record is worse
    // than no record: the school would set it and wait for a site that cannot work.
    expect(dnsRecordsFrom(null, null)).toEqual([]);
    expect(dnsRecordsFrom({}, {})).toEqual([]);
    expect(dnsRecordsFrom({}, { recommendedCNAME: [{ value: [] }] })).toEqual([]);
  });

  it("does not repeat a record the provider sent twice", () => {
    const domain: ProviderDomain = {
      verification: [
        { type: "CNAME", domain: "www.schoola.com", value: "cname.vercel-dns.com" },
        { type: "cname", domain: "www.schoola.com", value: "CNAME.VERCEL-DNS.COM" },
      ],
    };
    expect(dnsRecordsFrom(domain, null, "schoola.com")).toHaveLength(1);
  });
});

describe("domainProblem", () => {
  it("says nothing when the provider is happy", () => {
    expect(domainProblem({ verified: true }, { misconfigured: false })).toBeNull();
  });

  it("reports misconfigured DNS as a problem, not as pending", () => {
    expect(domainProblem({ verified: false }, { misconfigured: true })).toMatch(/do not point at SchoolAid/);
  });

  it("explains waiting, in words a school can act on", () => {
    expect(domainProblem({ verified: false }, {})).toMatch(/Waiting for the school's DNS/);
  });

  it("says plainly when the domain was never registered", () => {
    expect(domainProblem(null, null)).toMatch(/not registered/);
  });
});
