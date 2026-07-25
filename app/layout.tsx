import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { themeBootScript } from "./theme-boot";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NEXUS-5G — Edge Intelligence Digital Twin",
  description:
    "An interactive 5G edge-computing digital twin for multi-objective task scheduling, failure response, and telemetry exploration.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "NEXUS-5G — Edge Intelligence Digital Twin",
    description:
      "Explore multi-objective edge scheduling, network failures, adaptive recovery, and deterministic telemetry.",
  },
  twitter: {
    card: "summary",
    title: "NEXUS-5G — Edge Intelligence Digital Twin",
    description:
      "A real-time 5G edge-cloud digital twin for scheduling and failure recovery.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
