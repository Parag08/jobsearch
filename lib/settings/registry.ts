import { fullInterviewSettingsFromEnv } from "../interview/full-plan";
import { turnSettingsFromEnv } from "../interview/turn-taking";
import { interviewerModels } from "../interview/interviewer-model";
import { customQuestionMaxCharsFromEnv } from "../interview/custom-questions";
import { cvPageSettingsFromEnv, cvSelectionSettingsFromEnv } from "../cv-page-settings";
import { homeGoalsFromEnv } from "../home/settings";
import { applyFollowUpDaysFromEnv } from "../apply/follow-up";
import { pipelineColumnMaxFromEnv, pipelineRecentDaysFromEnv } from "../pipeline-settings";
import { rolePlanMaxGapsFromEnv, roleReadBatchFromEnv } from "../insights/settings";
import { GATEWAY_PREMIUM_MODEL, GATEWAY_SMALL_MODEL } from "../adapters/vercel-gateway";
import modelPreferences from "../../data/settings/model-preferences.json";

/**
 * Every setting a user may change on the Settings page (/app/settings).
 *
 * Each one is an env key the app already reads; a saved value is laid over the deployment's env
 * for that user (`settingsEnv`), so the app's own parsers keep doing the reading and the checking.
 * Blank = the deployment's value. Secrets and deployment-wide keys (API keys, database, demo,
 * storage) are deliberately absent: this list is the allow-list.
 */

export type SettingKind =
  | { type: "model" }
  | { type: "int"; min: number; max?: number }
  | { type: "decimal"; min: number; max: number }
  | { type: "choice"; options: readonly string[] };

export interface Setting {
  key: string;
  group: SettingGroup;
  label: string;
  help: string;
  kind: SettingKind;
  /** Shown after the number, e.g. "ms". */
  unit?: string;
  /** What happens when neither you nor the deployment set it. */
  blank?: string;
}

export const SETTING_GROUPS = ["AI models", "Mock interviews", "Pipeline and follow-ups", "Weekly goals", "Role insights", "CV"] as const;
export type SettingGroup = (typeof SETTING_GROUPS)[number];

export const SETTINGS: readonly Setting[] = [
  // ---- AI models
  { key: "AI_GATEWAY_INTERVIEWER_MODEL", group: "AI models", kind: { type: "model" }, label: "Interviewer", blank: "the Feedback and writing model", help: "Asks the follow-up questions in both mock interviews. Its judgement is the interview, so this is the one worth a strong model." },
  { key: "AI_GATEWAY_INTERVIEWER_EFFORT", group: "AI models", kind: { type: "choice", options: ["low", "medium", "high", "xhigh", "max"] }, label: "Interviewer thinking effort", blank: "the model's own default", help: "For thinking models (Claude, GPT-5, Gemini Pro). Low keeps a live voice call quick. Needs the token cap below." },
  { key: "AI_GATEWAY_INTERVIEWER_MAX_TOKENS", group: "AI models", kind: { type: "int", min: 640, max: 32000 }, label: "Interviewer token cap", help: "Room for the model's thinking plus its one-line question. 2000 is plenty at low effort." },
  { key: "AI_GATEWAY_PREMIUM_MODEL", group: "AI models", kind: { type: "model" }, label: "Feedback and writing", blank: `${GATEWAY_PREMIUM_MODEL} (built in)`, help: "Interview debriefs, model-answer rewrites, role-plays, cover letters and plans. Also the interviewer's fallback." },
  { key: "AI_GATEWAY_SMALL_MODEL", group: "AI models", kind: { type: "model" }, label: "Reading and quick tasks", blank: `${GATEWAY_SMALL_MODEL} (built in)`, help: "Reads job postings into structure and answers quick checks. High volume, low judgement: the cheapest model that returns clean JSON." },
  { key: "AI_GATEWAY_CASE_MODEL", group: "AI models", kind: { type: "model" }, label: "Case interviewer", blank: "the Reading and quick tasks model", help: "Talks you through case interviews. Code checks the maths; the model only talks." },

  // ---- Mock interviews
  { key: "INTERVIEW_TURN_SILENCE_MS", group: "Mock interviews", kind: { type: "int", min: 300, max: 20000 }, unit: "ms", label: "Wait after a finished answer", help: "Hands-free: how long a silence ends an answer that sounds finished." },
  { key: "INTERVIEW_TURN_UNFINISHED_MS", group: "Mock interviews", kind: { type: "int", min: 300, max: 30000 }, unit: "ms", label: "Wait after an unfinished answer", help: "For an answer that stops mid-sentence (\"...at Nutanix as\") or is still short. Must be at least the wait above." },
  { key: "INTERVIEW_TURN_MIN_WORDS", group: "Mock interviews", kind: { type: "int", min: 1, max: 1000 }, unit: "words", label: "Short answer", help: "Answers shorter than this always get the longer wait." },
  { key: "INTERVIEW_TURN_RAMBLE_WORDS", group: "Mock interviews", kind: { type: "int", min: 50, max: 5000 }, unit: "words", label: "Cut in after", help: "Past this many words the interviewer cuts in at the next finished phrase, as a real one does." },
  { key: "INTERVIEW_TURN_QUIET_LEVEL", group: "Mock interviews", kind: { type: "decimal", min: 0.001, max: 0.999 }, label: "Microphone quiet level", help: "Loudness (0-1) below which you count as quiet. Raise it in a noisy room." },
  { key: "INTERVIEW_FULL_MAX_TOPICS", group: "Mock interviews", kind: { type: "int", min: 2, max: 60 }, unit: "topics", label: "Topics per full interview", help: "Most questions one full interview covers." },
  { key: "INTERVIEW_FULL_TOPIC_FOLLOW_UPS", group: "Mock interviews", kind: { type: "int", min: 0, max: 10 }, label: "Follow-ups per topic", help: "Most follow-up questions on one topic." },
  { key: "INTERVIEW_FULL_TOTAL_FOLLOW_UPS", group: "Mock interviews", kind: { type: "int", min: 0, max: 100 }, label: "Follow-ups per interview", help: "Most follow-up questions in the whole interview." },
  { key: "INTERVIEW_CUSTOM_QUESTION_MAX_CHARS", group: "Mock interviews", kind: { type: "int", min: 20, max: 2000 }, unit: "characters", label: "Longest question of your own", help: "The longest question you can add under \"My own\"." },

  // ---- Pipeline and follow-ups
  { key: "APPLY_FOLLOW_UP_DAYS", group: "Pipeline and follow-ups", kind: { type: "int", min: 1, max: 90 }, unit: "days", label: "Follow up after applying", help: "Marking an application applied sets \"follow up if no reply by\" this many days later." },
  { key: "PIPELINE_RECENT_DAYS", group: "Pipeline and follow-ups", kind: { type: "int", min: 1, max: 365 }, unit: "days", label: "\"Recent\" on the board", help: "The window behind the board's \"Only the last N days\" link." },
  { key: "PIPELINE_COLUMN_MAX", group: "Pipeline and follow-ups", kind: { type: "int", min: 1, max: 100 }, unit: "cards", label: "Cards per column", help: "Cards a board column shows before the rest fold under \"Show more\"." },

  // ---- Weekly goals
  { key: "HOME_GOAL_APPLY", group: "Weekly goals", kind: { type: "int", min: 1, max: 100 }, unit: "a week", label: "Applications", help: "Your weekly target, shown under “This week” on the Overview streak card." },
  { key: "HOME_GOAL_REACH_OUT", group: "Weekly goals", kind: { type: "int", min: 1, max: 100 }, unit: "a week", label: "People reached out to", help: "Your weekly target, shown under “This week” on the Overview streak card." },
  { key: "HOME_GOAL_PRACTISE", group: "Weekly goals", kind: { type: "int", min: 1, max: 100 }, unit: "a week", label: "Practice sessions", help: "Your weekly target, shown under “This week” on the Overview streak card." },

  // ---- Role insights
  { key: "ROLE_READ_BATCH", group: "Role insights", kind: { type: "int", min: 1, max: 50 }, unit: "roles", label: "Roles read per click", help: "How many unread roles one click of \"Read them\" sends to the reading model." },
  { key: "ROLE_PLAN_MAX_GAPS", group: "Role insights", kind: { type: "int", min: 1, max: 30 }, unit: "gaps", label: "Gaps in a plan", help: "How many gaps a drafted plan covers." },

  // ---- CV
  { key: "CV_PAGE_SIZE", group: "CV", kind: { type: "choice", options: ["A4", "Letter"] }, label: "Page size", help: "The page a tailored CV is fitted to. Page size, scale and overhead lines go together." },
  { key: "CV_SCALE", group: "CV", kind: { type: "decimal", min: 0.5, max: 2 }, label: "Scale", help: "Type scale of the exported CV." },
  { key: "CV_OVERHEAD_LINES", group: "CV", kind: { type: "int", min: 0, max: 80 }, unit: "lines", label: "Overhead lines", help: "Lines that are not bullets (header, education, skills, headings) at scale 1." },
  { key: "CV_MAX_BULLETS", group: "CV", kind: { type: "int", min: 1, max: 60 }, label: "Most bullets", help: "Bullet budget when a CV is chosen from your whole pool." },
  { key: "CV_MAX_PER_ROLE", group: "CV", kind: { type: "int", min: 1, max: 20 }, label: "Most bullets per role", help: "No single role carries more than this." },
  { key: "CV_MIN_PER_ROLE", group: "CV", kind: { type: "int", min: 0, max: 10 }, label: "Fewest bullets per role", help: "Every role keeps at least this many." },
  { key: "CV_MAX_ORG_SHARE", group: "CV", kind: { type: "decimal", min: 0.05, max: 1 }, label: "Most share for one employer", help: "No employer takes more than this share of the bullet lines (0.34 = about a third)." },
  { key: "CV_COLLISION_OVERLAP", group: "CV", kind: { type: "decimal", min: 0.05, max: 1 }, label: "Same-story overlap", help: "Two bullets this similar tell the same story; only one is kept." },
];

const BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));

type Env = Record<string, string | undefined>;

/** A form's values, cleaned: registered keys only, trimmed, blanks dropped (blank = the default). */
export function cleanValues(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!BY_KEY.has(k) || typeof v !== "string") continue;
    const t = v.trim();
    if (t) out[k] = t;
  }
  return out;
}

/** The deployment env with the given values on top, unchecked. */
function overlay(env: Env, values: Record<string, string>): Env {
  return { ...env, ...values };
}

/**
 * The env this user's code reads: the deployment's, with the user's registered values on top.
 * Stored values are checked again here, not only on save (the row can be written outside the
 * form): a value that fails its field's rules, or a group the app's own readers reject, is
 * dropped and the deployment's value is used.
 */
export function settingsEnv(env: Env, values: Record<string, unknown>): Env {
  const allowed = allowedModels(env);
  const own = Object.fromEntries(Object.entries(cleanValues(values)).filter(([k, v]) => !fieldError(BY_KEY.get(k)!, v, allowed)));
  const merged = overlay(env, own);
  for (const r of READERS) {
    try {
      r.read(merged);
    } catch {
      for (const k of r.keys) {
        if (!(k in own)) continue;
        if (env[k] === undefined) delete merged[k];
        else merged[k] = env[k];
      }
    }
  }
  return merged;
}

const MODEL_KEYS = SETTINGS.filter((s) => s.kind.type === "model").map((s) => s.key);

/**
 * The models a user may pick, decided by the deployment: `AI_GATEWAY_ALLOWED_MODELS`
 * (comma-separated; set but empty = only the deployment's own) when set, else every model in data/settings/model-preferences.json. The
 * deployment's own model values and the built-in defaults are always allowed.
 */
export function allowedModels(env: Env): ReadonlySet<string> {
  const listed = env.AI_GATEWAY_ALLOWED_MODELS?.split(/[\s,]+/).filter(Boolean);
  const prefs = modelPreferences as unknown as Record<string, unknown>;
  const fromPrefs = MODEL_KEYS.flatMap((k) => (Array.isArray(prefs[k]) ? (prefs[k] as unknown[]).filter((m): m is string => typeof m === "string") : []));
  const deployment = MODEL_KEYS.map((k) => env[k]?.trim()).filter((m): m is string => !!m);
  return new Set([...(listed ?? fromPrefs), ...deployment, GATEWAY_PREMIUM_MODEL, GATEWAY_SMALL_MODEL]);
}

const MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;

function fieldError(s: Setting, v: string, allowed: ReadonlySet<string>): string | null {
  const k = s.kind;
  if (k.type === "model") return MODEL_ID.test(v) && allowed.has(v) ? null : "Pick a model from the list.";
  if (k.type === "choice") return k.options.includes(v) ? null : `One of ${k.options.join(", ")}.`;
  const n = Number(v);
  if (k.type === "int" && !Number.isInteger(n)) return "A whole number.";
  if (!Number.isFinite(n)) return "A number.";
  if (n < k.min || (k.max !== undefined && n > k.max)) return k.max !== undefined ? `Between ${k.min} and ${k.max}.` : `At least ${k.min}.`;
  return null;
}

/** The app's own readers, run on the combined env: they own the rules that span fields. */
const READERS: { keys: string[]; read: (env: Env) => unknown }[] = [
  { keys: ["AI_GATEWAY_INTERVIEWER_MAX_TOKENS", "AI_GATEWAY_INTERVIEWER_EFFORT", "AI_GATEWAY_INTERVIEWER_MODEL"], read: (e) => interviewerModels(e) },
  { keys: ["INTERVIEW_TURN_UNFINISHED_MS", "INTERVIEW_TURN_SILENCE_MS", "INTERVIEW_TURN_MIN_WORDS", "INTERVIEW_TURN_RAMBLE_WORDS", "INTERVIEW_TURN_QUIET_LEVEL"], read: turnSettingsFromEnv },
  { keys: ["INTERVIEW_FULL_MAX_TOPICS", "INTERVIEW_FULL_TOPIC_FOLLOW_UPS", "INTERVIEW_FULL_TOTAL_FOLLOW_UPS"], read: fullInterviewSettingsFromEnv },
  { keys: ["INTERVIEW_CUSTOM_QUESTION_MAX_CHARS"], read: customQuestionMaxCharsFromEnv },
  { keys: ["APPLY_FOLLOW_UP_DAYS"], read: applyFollowUpDaysFromEnv },
  { keys: ["PIPELINE_RECENT_DAYS"], read: pipelineRecentDaysFromEnv },
  { keys: ["PIPELINE_COLUMN_MAX"], read: pipelineColumnMaxFromEnv },
  { keys: ["HOME_GOAL_APPLY", "HOME_GOAL_REACH_OUT", "HOME_GOAL_PRACTISE"], read: homeGoalsFromEnv },
  { keys: ["ROLE_READ_BATCH"], read: roleReadBatchFromEnv },
  { keys: ["ROLE_PLAN_MAX_GAPS"], read: rolePlanMaxGapsFromEnv },
  { keys: ["CV_PAGE_SIZE", "CV_SCALE", "CV_OVERHEAD_LINES"], read: cvPageSettingsFromEnv },
  { keys: ["CV_MAX_BULLETS", "CV_MAX_PER_ROLE", "CV_MIN_PER_ROLE", "CV_MAX_ORG_SHARE", "CV_COLLISION_OVERLAP"], read: cvSelectionSettingsFromEnv },
];

/** Problems with a set of values, by key; empty when they can be saved. */
export function validateSettings(env: Env, raw: Record<string, unknown>): Record<string, string> {
  const values = cleanValues(raw);
  const errors: Record<string, string> = {};
  const allowed = allowedModels(env);
  for (const [k, v] of Object.entries(values)) {
    const e = fieldError(BY_KEY.get(k)!, v, allowed);
    if (e) errors[k] = e;
  }
  if (Object.keys(errors).length) return errors;

  const merged = overlay(env, values);
  for (const r of READERS) {
    try {
      r.read(merged);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const key = r.keys.map((name) => ({ name, position: msg.indexOf(name) })).filter(({ position }) => position >= 0)
        .sort((a, b) => a.position - b.position)[0]?.name ?? r.keys[0];
      errors[key] = inLabels(msg);
    }
  }
  return errors;
}

/** An app error message in the page's words: env names become the fields' labels. */
function inLabels(msg: string): string {
  let out = msg;
  for (const s of [...SETTINGS].sort((a, b) => b.key.length - a.key.length)) out = out.split(s.key).join(`"${s.label}"`);
  return out;
}
