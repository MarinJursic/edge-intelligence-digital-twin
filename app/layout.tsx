import type { Metadata } from "next";
import "./globals.css";
import { themeBootScript } from "./theme-boot";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "NEXUS Edge — Barcelona Geographic Operations Twin",
  description:
    "A geographic 5G edge-operations workbench with an attributed Barcelona map, deterministic scheduling, outage response, and inspectable provenance.",
  icons: { icon: `${basePath}/favicon.svg`, shortcut: `${basePath}/favicon.svg` },
  openGraph: {
    title: "NEXUS Edge — Barcelona Geographic Operations Twin",
    description:
      "Explore three Barcelona edge scenarios with explicit observed, simulated, and derived data layers.",
  },
  twitter: {
    card: "summary",
    title: "NEXUS Edge — Barcelona Geographic Operations Twin",
    description:
      "An attributed geographic operations map for edge scheduling and failure recovery.",
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
