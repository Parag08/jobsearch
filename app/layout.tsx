import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import Script from "next/script";
import { themeBootScript } from "@/lib/theme";
import "./globals.css";

// Apple-style: San Francisco on Apple devices (the system font, nothing to load) and Inter,
// its closest open cousin, everywhere else (docs/DESIGN.md section 5). Code uses the
// system monospace.
// Inter ships with the app (the Fontsource package) instead of being fetched from Google at
// build time: that fetch failing once was enough to fail a deploy.
const sans = localFont({
  src: "../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "JobSearch",
  description:
    "Your job search, end to end: find roles, read each job, build an honest CV, track applications and practise interviews with AI.",
};

// Google Tag Manager. The container ID lives in env (NEXT_PUBLIC_GTM_ID); unset = no tag.
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={sans.variable}>
      <head>
        {/* sets data-theme before first paint, so a dark evening never flashes white */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
        {GTM_ID ? (
          <Script id="gtm" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});` +
              `var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;` +
              `j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);` +
              `})(window,document,'script','dataLayer',${JSON.stringify(GTM_ID)});`}
          </Script>
        ) : null}
      </head>
      <body>
        {GTM_ID ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        ) : null}
        {/* gates the scroll-reveal styles: without JS everything is simply visible */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.setAttribute('data-js','')" }} />
        {children}
      </body>
    </html>
  );
}
