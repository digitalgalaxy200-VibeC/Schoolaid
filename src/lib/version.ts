/** Set at build time by next.config.ts from git commit count. Auto-increments every deploy. */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "v1.00";
