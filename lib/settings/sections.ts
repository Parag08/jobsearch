export const SETTINGS_PATH = "/app/settings";

export const SECTIONS = {
  "job-search": "Job search",
  goals: "Goals & follow-ups",
  interview: "Interview",
  cv: "CV & evidence",
  assistant: "Assistant",
  advanced: "Advanced",
} as const;

export type SettingsSection = keyof typeof SECTIONS;

export function settingsSection(value: unknown): SettingsSection {
  return typeof value === "string" && Object.hasOwn(SECTIONS, value) ? value as SettingsSection : "job-search";
}

export function settingsHref(section: SettingsSection): string {
  return section === "job-search" ? SETTINGS_PATH : `${SETTINGS_PATH}?section=${section}`;
}

export function settingLocation(key: string): { section: SettingsSection; group: string } {
  if (key.startsWith("HOME_GOAL_")) return { section: "goals", group: "Weekly goals" };
  if (key.startsWith("APPLY_") || key.startsWith("PIPELINE_")) return { section: "goals", group: "Follow-ups & pipeline" };
  if (key.startsWith("INTERVIEW_FULL_")) return { section: "interview", group: "Full mock interviews" };
  if (key.endsWith("_MS")) return { section: "interview", group: "Answer pauses" };
  if (key.startsWith("AI_GATEWAY_")) return { section: "advanced", group: "AI models" };
  if (key.startsWith("INTERVIEW_")) return { section: "advanced", group: "Interview controls" };
  if (key === "CV_PAGE_SIZE" || key === "CV_MAX_BULLETS") return { section: "cv", group: "CV export" };
  if (key.startsWith("CV_")) return { section: "advanced", group: "CV fitting" };
  if (key.startsWith("ROLE_")) return { section: "advanced", group: "Role insights" };
  if (key === "evidence") return { section: "cv", group: "Verified experience and matching evidence" };
  if (key === "assistant-access") return { section: "assistant", group: "" };
  return { section: "job-search", group: "Sourcing preferences" };
}

export const SOURCING_FIELDS = [
  { key: "target", label: "Daily role maximum", help: "A maximum, not a quota." },
  { key: "cities", label: "Cities", help: "Separate cities with commas, or paste one per line." },
  { key: "titles", label: "Role families", help: "Separate role families with commas, or paste one per line." },
  { key: "excluded", label: "Titles to skip", help: "Optional title phrases. Separate with commas, or paste one per line." },
] as const;

export function displayNumber(key: string, value: string): string {
  if (!value || !Number.isFinite(Number(value))) return value;
  return String(Number((Number(value) / factor(key)).toPrecision(12)));
}

export function settingNumber(key: string, value: string): string {
  if (!value || !Number.isFinite(Number(value))) return value;
  return String(Number((Number(value) * factor(key)).toPrecision(12)));
}

function factor(key: string): number {
  if (key.endsWith("_MS")) return 1000;
  if (["CV_MAX_ORG_SHARE", "CV_COLLISION_OVERLAP", "INTERVIEW_TURN_QUIET_LEVEL"].includes(key)) return 0.01;
  return 1;
}
