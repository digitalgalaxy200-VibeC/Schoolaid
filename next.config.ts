import type { NextConfig } from "next";

// Previously this file configured nothing beyond defaults — no security
// headers at all (no clickjacking protection, no MIME-sniffing protection,
// no referrer policy). See docs/CORRECTIONS_SECURITE.md.
//
// NOTE: this does not include a Content-Security-Policy. A CSP for this app
// needs to enumerate every external origin actually in use (Google Fonts,
// Supabase Storage for avatars/logos, etc.) — getting it wrong silently
// breaks pages rather than failing loudly, so it needs to be built and
// tested against the real deployed app rather than guessed at here.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
