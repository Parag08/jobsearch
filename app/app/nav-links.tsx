"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { SETTINGS_PATH } from "@/lib/settings/sections";
import styles from "./app.module.css";

/**
 * The app nav needs to say where you are. `/app` is a prefix of every other
 * route, so it matches exactly while the rest match by prefix (so an
 * application detail page still highlights Pipeline).
 *
 * Below 640px the row of links does not fit, so it folds into a menu button
 * that names the current page and opens the same links in a glass sheet
 * (glass is for floating things, docs/DESIGN.md section 5).
 */
/** The overview's address: the JobSearch name is its tab on wide screens. */
export const OVERVIEW = "/app/home";

export function SettingsLink() {
  const path = usePathname();
  return (
    <Link href={SETTINGS_PATH} title="Settings" aria-label="Settings" className={styles.gear}
      aria-current={path === SETTINGS_PATH ? "page" : undefined}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
        <path d="m10.1 3-.6 2.3-1.6.9-2.3-.6-1.9 3.3 1.7 1.7v1.8l-1.7 1.7 1.9 3.3 2.3-.6 1.6.9.6 2.3h3.8l.6-2.3 1.6-.9 2.3.6 1.9-3.3-1.7-1.7v-1.8l1.7-1.7-1.9-3.3-2.3.6-1.6-.9-.6-2.3z" />
        <circle cx="12" cy="11.5" r="3" />
      </svg>
    </Link>
  );
}

/**
 * The logo and name, acting as the Overview tab (Parag, 2026-11-19: a name that did nothing
 * visible beside an Overview tab that did the same thing was one control too many). It takes
 * the current-page pill like any tab, so it reads as one.
 */
export function BrandLink({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = pathname === OVERVIEW;
  return (
    <Link href={OVERVIEW} className={styles.brand} aria-current={current ? "page" : undefined} aria-label="JobSearch, overview" title="Overview">
      {children}
    </Link>
  );
}

export function NavLinks({ items }: { items: ReadonlyArray<readonly [string, string]> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrap = useRef<HTMLDivElement>(null);

  const isCurrent = (href: string) =>
    href === "/app" ? pathname === "/app" || pathname.startsWith("/app/applications") : pathname.startsWith(href);
  const currentLabel = items.find(([href]) => isCurrent(href))?.[1] ?? "Pages";

  // A new page closes the menu.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const link = ([href, label]: readonly [string, string]) => (
    <Link key={href} href={href} className={styles.link} aria-current={isCurrent(href) ? "page" : undefined}>
      {label}
    </Link>
  );
  // The row skips Overview (the name is its tab); the phone menu lists every page.
  const rowLinks = items.filter(([href]) => href !== OVERVIEW).map(link);
  const menuLinks = items.map(link);

  return (
    <>
      <div className={styles.links}>{rowLinks}</div>
      <div className={styles.menuWrap} ref={wrap}>
        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => setOpen((o) => !o)}
        >
          {currentLabel}
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" data-open={open ? "" : undefined}>
            <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        {open && (
          <nav id={menuId} className={styles.menu} aria-label="Pages">
            {menuLinks}
          </nav>
        )}
      </div>
    </>
  );
}
