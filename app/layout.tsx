import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import { themeBootScript } from "@/lib/theme";
import "./globals.css";

// docs/DESIGN.md section 5: a serif for words, a sans for work, a mono for data.
const serif = Newsreader({ subsets: ["latin"], display: "swap", variable: "--font-serif" });
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-sans",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "JobSearch",
  description:
    "Your job search, end to end: find roles, read each job, build an honest CV, track applications and practise interviews with AI.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        {/* sets data-theme before first paint, so a dark evening never flashes white */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
      </head>
      <body>
        {/* gates the scroll-reveal styles: without JS everything is simply visible */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.setAttribute('data-js','')" }} />
        {children}
      </body>
    </html>
  );
}
