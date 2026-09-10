"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./app.module.css";

/**
 * The app nav needs to say where you are. `/app` is a prefix of every other
 * route, so it matches exactly while the rest match by prefix (so an
 * application detail page still highlights Pipeline).
 */
export function NavLinks({ items }: { items: ReadonlyArray<readonly [string, string]> }) {
  const pathname = usePathname();

  return (
    <div className={styles.links}>
      {items.map(([href, label]) => {
        const current =
          href === "/app"
            ? pathname === "/app" || pathname.startsWith("/app/applications")
            : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={styles.link}
            aria-current={current ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
