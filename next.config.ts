import type { NextConfig } from "next";
import { execSync } from "child_process";

// Auto-generate version from git commit count
// Vercel uses shallow clones — fetch full history first if needed
let minor = "00";
try {
  // Try to unshallow if this is a shallow clone (Vercel)
  try { execSync("git fetch --unshallow 2>/dev/null || true", { encoding: "utf8" }); } catch {}
  
  const count = parseInt(execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim(), 10) || 1;
  minor = String(count).padStart(2, "0").slice(-2);
} catch {
  // Fallback: use Vercel-provided commit SHA's first 2 hex chars as decimal
  try {
    const sha = process.env.VERCEL_GIT_COMMIT_SHA || "";
    if (sha) {
      const num = parseInt(sha.substring(0, 4), 16) % 100;
      minor = String(num).padStart(2, "0");
    }
  } catch {}
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: `v1.${minor}`,
  },
};

export default nextConfig;
