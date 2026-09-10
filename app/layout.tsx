import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
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
    "Write your experience down once. JobSearch tailors a CV and cover letter to each job from what you have actually done.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        {/* gates the scroll-reveal styles: without JS everything is simply visible */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.setAttribute('data-js','')" }} />
        {children}
      </body>
    </html>
  );
}
