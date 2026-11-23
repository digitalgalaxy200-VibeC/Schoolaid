import { OG_ALT, OG_SIZE, renderOgImage } from "@/lib/landing/og";

// No `runtime = "edge"`: the card is static content, so it is better generated
// once at build time and served from the CDN than rendered per request.
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage();
}
