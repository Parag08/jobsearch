/**
 * Theme choice (docs/DESIGN.md section 5, "Light by day, dark by night").
 * The user picks light, dark or auto; auto follows the viewer's LOCAL clock -
 * the browser's own time and timezone - not the OS colour scheme.
 */

export type ThemePref = "auto" | "light" | "dark";
export type Theme = "light" | "dark";

/** Auto is dark from DARK_FROM_HOUR (inclusive) until DARK_UNTIL_HOUR, local time. */
export const DARK_FROM_HOUR = 19;
export const DARK_UNTIL_HOUR = 7;

export const THEME_STORAGE_KEY = "jobsearch-theme";

const PREFS: readonly ThemePref[] = ["auto", "light", "dark"];

export function parsePref(raw: string | null | undefined): ThemePref {
  return PREFS.includes(raw as ThemePref) ? (raw as ThemePref) : "auto";
}

export function nextPref(pref: ThemePref): ThemePref {
  return PREFS[(PREFS.indexOf(pref) + 1) % PREFS.length];
}

function isNight(hour: number): boolean {
  return hour >= DARK_FROM_HOUR || hour < DARK_UNTIL_HOUR;
}

export function resolveTheme(pref: ThemePref, now: Date): Theme {
  if (pref !== "auto") return pref;
  return isNight(now.getHours()) ? "dark" : "light";
}

/** Milliseconds from `now` until auto next flips (the next DARK_FROM or DARK_UNTIL, local). */
export function msUntilNextSwitch(now: Date): number {
  const target = new Date(now);
  target.setMinutes(0, 0, 0);
  const h = now.getHours();
  if (isNight(h)) {
    if (h >= DARK_FROM_HOUR) target.setDate(target.getDate() + 1);
    target.setHours(DARK_UNTIL_HOUR);
  } else {
    target.setHours(DARK_FROM_HOUR);
  }
  return target.getTime() - now.getTime();
}

/**
 * The inline script that sets `data-theme` on <html> before first paint, so a
 * dark evening never flashes white. Self-contained: it mirrors resolveTheme
 * and is tested by running it.
 */
export function themeBootScript(): string {
  return (
    "(function(){var p='auto';" +
    `try{p=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||'auto'}catch(e){}` +
    "var t=p;if(p!=='light'&&p!=='dark'){var h=new Date().getHours();" +
    `t=(h>=${DARK_FROM_HOUR}||h<${DARK_UNTIL_HOUR})?'dark':'light'}` +
    "document.documentElement.setAttribute('data-theme',t)})()"
  );
}
