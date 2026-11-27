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
  { key: "cities", label: "Cities", help: "Separate multiple cities with commas.", placeholder: "Any city" },
  { key: "titles", label: "Role families", help: "Separate role families with commas.", placeholder: "Any role family" },
  { key: "excluded", label: "Titles to skip", help: "Optional words to leave out of titles.", placeholder: "No exclusions" },
] as const;

export const SETTINGS_HELP: Readonly<Record<string, string>> = {
  APPLY_FOLLOW_UP_DAYS: "Sets a reminder when you confirm an application.",
  INTERVIEW_TURN_UNFINISHED_MS: "At least as long as the finished-answer pause.",
  CV_MAX_BULLETS: "Upper limit when choosing from your evidence.",
  CV_MAX_ORG_SHARE: "Keeps one employer from dominating the CV.",
  CV_COLLISION_OVERLAP: "Higher values allow more similar bullet points.",
  CV_OVERHEAD_LINES: "Room for headings, education and other sections.",
  INTERVIEW_TURN_QUIET_LEVEL: "Raise it if background noise stops answers ending.",
};

export const SETTINGS_UNITS: Readonly<Record<string, string>> = {
  HOME_GOAL_APPLY: "/ week",
  HOME_GOAL_REACH_OUT: "/ week",
  HOME_GOAL_PRACTISE: "/ week",
  PIPELINE_COLUMN_MAX: "cards",
  INTERVIEW_TURN_SILENCE_MS: "seconds",
  INTERVIEW_TURN_UNFINISHED_MS: "seconds",
  CV_MAX_ORG_SHARE: "%",
  CV_COLLISION_OVERLAP: "%",
};

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
  if (key === "CV_MAX_ORG_SHARE" || key === "CV_COLLISION_OVERLAP") return 0.01;
  return 1;
}
