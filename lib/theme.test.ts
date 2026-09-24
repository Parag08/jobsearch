import { describe, expect, it } from "vitest";
import {
  DARK_FROM_HOUR,
  DARK_UNTIL_HOUR,
  msUntilNextSwitch,
  nextPref,
  parsePref,
  resolveTheme,
  themeBootScript,
} from "./theme";

const at = (h: number, m = 0) => new Date(2026, 8, 24, h, m, 0, 0);

describe("resolveTheme", () => {
  it("honours an explicit choice at any hour", () => {
    expect(resolveTheme("light", at(23))).toBe("light");
    expect(resolveTheme("dark", at(12))).toBe("dark");
  });

  it("auto goes dark in the evening and light in the day, by local clock", () => {
    expect(resolveTheme("auto", at(DARK_FROM_HOUR - 1, 59))).toBe("light");
    expect(resolveTheme("auto", at(DARK_FROM_HOUR))).toBe("dark");
    expect(resolveTheme("auto", at(2))).toBe("dark");
    expect(resolveTheme("auto", at(DARK_UNTIL_HOUR - 1, 59))).toBe("dark");
    expect(resolveTheme("auto", at(DARK_UNTIL_HOUR))).toBe("light");
  });
});

describe("parsePref", () => {
  it("accepts the three known values and defaults anything else to auto", () => {
    expect(parsePref("dark")).toBe("dark");
    expect(parsePref("light")).toBe("light");
    expect(parsePref("auto")).toBe("auto");
    expect(parsePref(null)).toBe("auto");
    expect(parsePref("sepia")).toBe("auto");
  });
});

describe("nextPref", () => {
  it("cycles auto -> light -> dark -> auto", () => {
    expect(nextPref("auto")).toBe("light");
    expect(nextPref("light")).toBe("dark");
    expect(nextPref("dark")).toBe("auto");
  });
});

describe("msUntilNextSwitch", () => {
  it("counts to the evening switch during the day", () => {
    expect(msUntilNextSwitch(at(DARK_FROM_HOUR - 1, 30))).toBe(30 * 60_000);
  });

  it("counts to the morning switch after midnight", () => {
    expect(msUntilNextSwitch(at(DARK_UNTIL_HOUR - 2))).toBe(2 * 3_600_000);
  });

  it("counts across midnight in the evening", () => {
    const hoursLeft = 24 - DARK_FROM_HOUR + DARK_UNTIL_HOUR;
    expect(msUntilNextSwitch(at(DARK_FROM_HOUR))).toBe(hoursLeft * 3_600_000);
  });
});

describe("themeBootScript", () => {
  // Runs the inline script against a stand-in document, the way the browser
  // does before first paint.
  function boot(stored: string | null, hour: number, throwOnStorage = false) {
    const attrs: Record<string, string> = {};
    const document = { documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
    const localStorage = {
      getItem: () => {
        if (throwOnStorage) throw new Error("blocked");
        return stored;
      },
    };
    const FakeDate = function () {
      return at(hour);
    } as unknown as DateConstructor;
    new Function("document", "localStorage", "Date", themeBootScript())(document, localStorage, FakeDate);
    return attrs["data-theme"];
  }

  it("applies the stored choice", () => {
    expect(boot("dark", 12)).toBe("dark");
    expect(boot("light", 22)).toBe("light");
  });

  it("falls back to the clock when nothing is stored or storage is blocked", () => {
    expect(boot(null, 22)).toBe("dark");
    expect(boot(null, 12)).toBe("light");
    expect(boot(null, 22, true)).toBe("dark");
  });
});
