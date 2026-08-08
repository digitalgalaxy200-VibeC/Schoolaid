import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ToastProvider";
import { GlobalCopilot } from "@/components/copilot/GlobalCopilot";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  preload: false,
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-landing-display",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  preload: false,
});

export const metadata: Metadata = {
  title: "SchoolAid — Digital Transformation Partner for African Schools",
  description:
    "SchoolAid partners with African schools to replace paper-based administration and disconnected spreadsheets with connected digital operations — from admissions to graduation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} h-full antialiased`}>
      <head>
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
      </head>
      <body className="min-h-full flex flex-col">
        <noscript>
          <style>{`.js-reveal { opacity: 1 !important; transform: none !important; }`}</style>
        </noscript>
        {children}
        <ToastProvider />
        <GlobalCopilot />
      </body>
    </html>
  );
}
