import { ImageResponse } from "next/og";

/**
 * The WhatsApp / social share card, generated rather than uploaded.
 *
 * WHY GENERATED: a share image is the first thing a school owner sees when this
 * link is forwarded, and a missing one shows a bare grey URL. Building it here
 * means it can never go stale with the headline, needs no binary in the repo, and
 * is drawn with the same navy/amber identity as the page.
 *
 * Fonts are ImageResponse's built-in sans — no network fetch at render time, so
 * the card is produced identically on every deploy.
 */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_ALT = "SchoolAid — your school, digitised with you.";

export function renderOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#0F1F3D",
          padding: "72px 80px",
          color: "#FFFFFF",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              backgroundColor: "#F5A524",
              color: "#0F1F3D",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 38,
              fontWeight: 800,
            }}
          >
            S
          </div>
          <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: -0.5 }}>SchoolAid</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.1, maxWidth: 940 }}>
            Your school has outgrown paper.
          </div>
          <div style={{ fontSize: 44, color: "#F5A524", fontWeight: 600, lineHeight: 1.2 }}>
            We&apos;ll take it digital, with you.
          </div>
          <div style={{ fontSize: 30, color: "#D6DEEE", maxWidth: 900, lineHeight: 1.35 }}>
            Records · Results · CBT exams · Attendance · Fees · Your school website
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 26, color: "#D6DEEE" }}>schoolaid.online</div>
          <div style={{ fontSize: 26, color: "#D6DEEE" }}>
            Nigeria · Benin · Francophone Africa
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
