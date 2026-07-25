import type { NextConfig } from "next";
import { execSync } from "child_process";

// Auto-generate version from git commit count
let minor = "00";
try {
  const count = parseInt(execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim(), 10) || 1;
  minor = String(count).padStart(2, "0").slice(-2);
} catch { /* fallback */ }

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: `v1.${minor}`,
  },
};

export default nextConfig;
