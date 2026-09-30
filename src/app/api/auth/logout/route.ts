import { NextResponse } from "next/server";

/**
 * Clears every authentication cookie this app can set.
 *
 * Previously only `schoolaid-session` and `schoolaid-email` were cleared,
 * which left `schoolaid-super-session` (a full Super Admin session token) and
 * `schoolaid-return-path` alive in the browser after logout.
 */

const AUTH_COOKIES = [
  "schoolaid-session",
  "schoolaid-super-session",
  "schoolaid-return-path",
  "schoolaid-impersonate-school",
];

export async function POST() {
  const response = NextResponse.json({ success: true });

  for (const name of AUTH_COOKIES) {
    response.cookies.set(name, "", { maxAge: 0, path: "/" });
  }

  return response;
}
