import type { NextConfig } from "next";

/**
 * Headers sent on every response.
 *
 * The narrow set, deliberately. A full Content-Security-Policy is NOT here:
 * the app loads Google Fonts, uses blob: downloads and inline styles, so a
 * policy strict enough to matter must allow those first — that change ships
 * report-only before it is enforced. `frame-ancestors` is safe on its own (a
 * policy that names one directive restricts nothing else), and framing IS
 * blocked because nothing in the platform is ever framed and the admin
 * console must not be clickjackable.
 */
const SECURITY_HEADERS: { key: string; value: string }[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
