import type { Metadata } from "next";
import "./globals.css";
import { themeBootScript } from "./theme-boot";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Edge Orchestration — Explainable 5G Placement",
  description:
    "Follow a Barcelona camera frame through its 5G cell to the selected compute destination, compare placement options, and replay failure recovery.",
  icons: { icon: `${basePath}/favicon.svg`, shortcut: `${basePath}/favicon.svg` },
  openGraph: {
    title: "Edge Orchestration — Explainable 5G Placement",
    description:
      "See where an AI workload runs, why that destination won, and how the route changes during a cell outage.",
  },
  twitter: {
    card: "summary",
    title: "Edge Orchestration — Explainable 5G Placement",
    description:
      "A clear, evidence-first interface for 5G edge placement and recovery.",
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
