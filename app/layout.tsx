import type { Metadata } from "next";
import "./globals.css";
import { themeBootScript } from "./theme-boot";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "NEXUS Edge — Barcelona Edge Operations Workbench",
  description:
    "An evidence-first 5G edge-operations workbench with real Barcelona context photography, attributed geography, deterministic scheduling, and inspectable provenance.",
  icons: { icon: `${basePath}/favicon.svg`, shortcut: `${basePath}/favicon.svg` },
  openGraph: {
    title: "NEXUS Edge — Barcelona Edge Operations Workbench",
    description:
      "Explore three Barcelona edge scenarios with licensed nearby photography and explicit observed, authored-fixture, and computed evidence.",
  },
  twitter: {
    card: "summary",
    title: "NEXUS Edge — Barcelona Edge Operations Workbench",
    description:
      "A realistic, evidence-first interface for edge scheduling and failure recovery.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
