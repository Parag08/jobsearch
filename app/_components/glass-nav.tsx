"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import styles from "./glass-nav.module.css";

/**
 * Floating liquid-glass navigation. Sits flush at the top on load and lifts
 * into a compact translucent bar once the page scrolls - the blur reveals the
 * content passing beneath it. One spring, no shadow.
 */
export function GlassNav({ brand, children }: { brand: ReactNode; children?: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className={styles.wrap}>
      <nav className={styles.bar} data-scrolled={scrolled ? "" : undefined} aria-label="Primary">
        <Link href="/" className={styles.brand}>
          {brand}
        </Link>
        <div className={styles.actions}>{children}</div>
      </nav>
    </div>
  );
}
