"use client";

import { useEffect, useState } from "react";
import {
  THEME_STORAGE_KEY,
  msUntilNextSwitch,
  nextPref,
  parsePref,
  resolveTheme,
  SYSTEM_DARK,
  type ThemePref,
} from "@/lib/theme";
import styles from "./theme-toggle.module.css";

const LABEL: Record<ThemePref, string> = {
  auto: "Auto (dark from 7pm to 7am, your local time)",
  system: "System",
  light: "Light",
  dark: "Dark",
};
const THEME_CHANGED = "jobsearch-theme-change";

function readPref(): ThemePref {
  try {
    return parsePref(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "auto";
  }
}

function apply(pref: ThemePref) {
  document.documentElement.setAttribute("data-theme", resolveTheme(pref, new Date(), matchMedia(SYSTEM_DARK).matches));
}

function useThemePreference() {
  const [pref, setPref] = useState<ThemePref | null>(null);
  useEffect(() => {
    setPref(readPref());
    const change = (event: Event) => setPref((event as CustomEvent<ThemePref>).detail);
    const storage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) setPref(readPref());
    };
    window.addEventListener(THEME_CHANGED, change);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(THEME_CHANGED, change);
      window.removeEventListener("storage", storage);
    };
  }, []);
  return pref;
}

function changeTheme(next: ThemePref) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // storage blocked: the choice holds for this page only
  }
  apply(next);
  window.dispatchEvent(new CustomEvent(THEME_CHANGED, { detail: next }));
}

export function ThemeRuntime() {
  const pref = useThemePreference();

  useEffect(() => {
    if (!pref) return;
    if (pref === "system") {
      const media = matchMedia(SYSTEM_DARK);
      const update = () => apply(pref);
      update();
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    apply(pref);
    if (pref !== "auto") return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      apply("auto");
      clearTimeout(timer);
      timer = setTimeout(schedule, msUntilNextSwitch(new Date()) + 1000);
    };
    const onVisible = () => document.visibilityState === "visible" && schedule();
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pref]);

  return null;
}

export function AppearancePicker({ className }: { className?: string }) {
  const pref = useThemePreference();
  const choices: readonly ThemePref[] = ["system", "light", "dark", "auto"];
  return (
    <div className={className}>
      <span>Appearance</span>
      <div role="group" aria-label="Appearance">
        {choices.map((choice) => <button key={choice} type="button" aria-pressed={(pref ?? "auto") === choice}
          title={LABEL[choice]} onClick={() => changeTheme(choice)}>{choice === "auto" ? "Auto" : LABEL[choice]}</button>)}
      </div>
    </div>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const pref = useThemePreference();
  const current = pref ?? "auto";
  return (
    <button
      type="button"
      onClick={() => changeTheme(nextPref(current))}
      className={`${styles.toggle} ${className ?? ""}`}
      aria-label={`Theme: ${LABEL[current]}. Switch to ${nextPref(current)}.`}
      title={`Theme: ${LABEL[current]}`}
    >
      {/* Drawn after mount: Auto's sun or moon depends on the browser's clock, which the server can't know. */}
      {pref !== null && <Icon pref={current} />}
      {pref === "auto" && (
        <span className={styles.autoBadge} aria-hidden="true">
          A
        </span>
      )}
    </button>
  );
}

/**
 * The theme in effect as a sun or a moon. Auto shows the one the clock has picked, with a
 * small "A" beside it (a clock face for "auto" was a riddle; critique 1.7).
 */
function Icon({ pref }: { pref: ThemePref }) {
  const shown = resolveTheme(pref, new Date(), matchMedia(SYSTEM_DARK).matches);
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (shown === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  );
}
