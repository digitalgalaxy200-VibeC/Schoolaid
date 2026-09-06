import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ToastProvider";
import { GlobalCopilot } from "@/components/copilot/GlobalCopilot";

// ─── Fonts ───────────────────────────────────────────────────────────────────
// Inter only. Single font family = faster load, zero FOUT on mobile.
// IBM Plex Mono is loaded below via Google Fonts CDN (mono-only, small payload).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: true,
});

// ─── Viewport (PWA foundation) ───────────────────────────────────────────────
// viewport-fit=cover: content extends under iPhone notch / home bar.
// Prevents the browser from zooming in on input focus (16px form font rule
// handles this in globals.css, but this locks the scale as well).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",
  themeColor: "#2A4B8D", // cobalt — matches status bar on Android PWA
};

// ─── App Metadata ─────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: {
    default: "SchoolAid — School Management & Result Processing",
    template: "%s | SchoolAid",
  },
  description:
    "A mobile-first, multi-tenant school management platform for African schools. Configure, enter scores, generate results, publish and download PDF report cards.",
  // PWA — apple
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent", // content flows under status bar
    title: "SchoolAid",
  },
  // PWA — manifest (added in Phase 7)
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  // Prevent search engines from indexing the private app
  robots: { index: false, follow: false },
};

// ─── Root Layout ─────────────────────────────────────────────────────────────
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <head>
        {/* IBM Plex Mono — loaded separately (mono-only, small subset) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&display=swap"
          rel="stylesheet"
        />
        {/* PWA — mobile chrome / safari UI color */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <ToastProvider />
        <GlobalCopilot />
      </body>
    </html>
  );
}
