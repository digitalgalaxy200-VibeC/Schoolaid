import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

/**
 * Middleware runs on every request, and what it decides about the HOST changes
 * what a path means: on a school's own domain the root is that school's website
 * and /login is that school's login, while on a platform host both are ours.
 *
 * These are the first tests this file has had. They exist because the host
 * question was already answered wrongly in production once (schoolaid.online was
 * missing from the platform list), and because the /login rewrite is new.
 */

function request(url: string, host: string): NextRequest {
  return new NextRequest(url, { headers: { host } });
}

describe("middleware — platform hosts", () => {
  it("leaves the platform's own login alone", async () => {
    const res = await middleware(request("https://schoolaid.online/login", "schoolaid.online"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.status).toBe(200); // NextResponse.next()
  });

  it("does not treat the platform's root as a school's website", async () => {
    const res = await middleware(request("https://schoolaid.online/", "schoolaid.online"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("still gates a platform host's dashboard without a session", async () => {
    const res = await middleware(request("https://schoolaid.online/student/dashboard", "schoolaid.online"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("ignores the port when deciding", async () => {
    const res = await middleware(request("http://localhost:3000/login", "localhost:3000"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });
});

describe("middleware — a school's own domain", () => {
  const HOST = "kingscollege.edu.ng";

  it("serves the school's website at the root", async () => {
    const res = await middleware(request(`https://${HOST}/`, HOST));
    expect(res.headers.get("x-middleware-rewrite")).toContain(
      `/site/${encodeURIComponent(HOST)}`,
    );
  });

  it("serves THAT SCHOOL's login at /login", async () => {
    const res = await middleware(request(`https://${HOST}/login`, HOST));
    expect(res.headers.get("x-middleware-rewrite")).toContain(
      `/school/${encodeURIComponent(HOST)}/login`,
    );
  });

  it("does not rewrite a deeper path — the app still answers there", async () => {
    // A signed-in teacher keeps using the portal on the school's domain, so
    // /teacher/dashboard must reach the app, not be rewritten to a website.
    const res = await middleware(request(`https://${HOST}/teacher/dashboard`, HOST));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    // No session in this test, so it is the login gate — and it must stay on the
    // SCHOOL's host, where their own branded login will be waiting for them.
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`https://${HOST}/login`);
  });

  it("passes the API through untouched, on any host", async () => {
    const res = await middleware(request(`https://${HOST}/api/auth/login`, HOST));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.status).toBe(200);
  });

  it("treats a SCHOOL subdomain of the platform domain as a school", async () => {
    // The shape schools will actually get first (`gsapex.schoolaid.online`), and
    // the shape the domain test uses. If this ever regresses, a school's own
    // address serves the platform's root instead of the school's website.
    const school = "gsapex.schoolaid.online";

    const root = await middleware(request(`https://${school}/`, school));
    expect(root.headers.get("x-middleware-rewrite")).toContain(`/site/${encodeURIComponent(school)}`);

    const login = await middleware(request(`https://${school}/login`, school));
    expect(login.headers.get("x-middleware-rewrite")).toContain(
      `/school/${encodeURIComponent(school)}/login`,
    );
  });
});
