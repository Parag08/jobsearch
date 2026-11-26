"use client";

import { useActionState, useState } from "react";
import type { SettingKind } from "@/lib/settings/registry";
import { saveSettingsAction, type SettingsState } from "./actions";
import ui from "../ui.module.css";
import s from "./settings.module.css";

export interface ModelOption {
  id: string;
  name: string;
  price: string;
  /** Estimated USD for one full mock interview on this model. */
  interview: number;
  eligible: boolean | null;
  reasoning: boolean;
  recommended: boolean;
}

export interface FieldView {
  key: string;
  group: string;
  label: string;
  help: string;
  unit?: string;
  kind: SettingKind;
  /** The user's saved value ("" = none). */
  saved: string;
  /** The deployment's value, used when the field is blank. */
  fallback: string;
  /** What a blank means when the deployment has no value either. */
  blank?: string;
  ranked?: ModelOption[];
  others?: ModelOption[];
  recommended?: string | null;
}

const EFFORT_KEY = "AI_GATEWAY_INTERVIEWER_EFFORT";
const CAP_KEY = "AI_GATEWAY_INTERVIEWER_MAX_TOKENS";
const INTERVIEWER_KEY = "AI_GATEWAY_INTERVIEWER_MODEL";
/** What "Use the best for my plan" sets for a thinking interviewer: quick, with room to think. */
const THINKING_DEFAULTS = { effort: "low", cap: "2000" };

const money = (n: number) => (n < 0.01 ? "under 1 cent" : `$${n.toFixed(2)}`);

function planTag(m: ModelOption, eligibilityKnown: boolean): string {
  if (!eligibilityKnown || m.eligible === null) return "";
  return m.eligible ? "on your plan" : "needs credits";
}

export function SettingsForm({
  groups,
  fields,
  eligibilityKnown,
  catalogLoaded,
  demo,
}: {
  groups: string[];
  fields: FieldView[];
  eligibilityKnown: boolean;
  catalogLoaded: boolean;
  demo: boolean;
}) {
  const [state, action, pending] = useActionState<SettingsState | null, FormData>(saveSettingsAction, null);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, f.saved])));
  const set = (k: string, v: string) => setValues((cur) => ({ ...cur, [k]: v }));
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const errors = state?.errors ?? {};

  function useBest() {
    const next = { ...values };
    for (const f of fields) if (f.kind.type === "model" && f.recommended) next[f.key] = f.recommended;
    const interviewer = byKey.get(INTERVIEWER_KEY);
    const pick = [...(interviewer?.ranked ?? []), ...(interviewer?.others ?? [])].find((m) => m.id === next[INTERVIEWER_KEY]);
    if (pick?.reasoning) {
      next[EFFORT_KEY] = THINKING_DEFAULTS.effort;
      next[CAP_KEY] = THINKING_DEFAULTS.cap;
    }
    setValues(next);
  }

  const selectedModel = (f: FieldView) => {
    const id = values[f.key] || f.fallback;
    return [...(f.ranked ?? []), ...(f.others ?? [])].find((m) => m.id === id);
  };

  return (
    <form action={action} className={s.form}>
      {groups.map((g) => (
        <section key={g} className={ui.panel} aria-labelledby={`g-${g}`}>
          <div className={s.groupHead}>
            <h2 id={`g-${g}`}>{g}</h2>
            {g === "AI models" && catalogLoaded && (
              <button type="button" className={ui.btn} onClick={useBest}>
                Use the best for my plan
              </button>
            )}
          </div>
          {g === "AI models" && (
            <p className={ui.sub}>
              {demo
                ? "The demo answers from pre-written replies, so these choices change nothing here."
                : eligibilityKnown
                  ? "Models marked “needs credits” are not in your AI Gateway plan; a model that fails falls back to Feedback and writing."
                  : "Could not ask the AI Gateway which models your plan includes (it may be busy); prices are shown, plan marks are not."}{" "}
            </p>
          )}
          {fields
            .filter((f) => f.group === g)
            .map((f) => {
              const pick = f.kind.type === "model" ? selectedModel(f) : undefined;
              return (
                <div key={f.key} className={s.field}>
                  <label htmlFor={f.key} className={s.label}>
                    {f.label}
                    {f.unit && <span className={ui.sectionMeta}> ({f.unit})</span>}
                  </label>
                  <Input field={f} value={values[f.key] ?? ""} onChange={(v) => set(f.key, v)} eligibilityKnown={eligibilityKnown} />
                  <p className={s.help}>
                    {f.help}
                    {f.kind.type !== "model" && f.kind.type !== "choice" && f.blank && !f.fallback && ` Blank: ${f.blank}.`}
                  </p>
                  {pick && (
                    <p className={s.help}>
                      {pick.name}: {pick.price} · about {money(pick.interview)} per full interview
                      {planTag(pick, eligibilityKnown) && <span className={ui.tag} data-tone={pick.eligible ? "good" : "attention"}>{planTag(pick, eligibilityKnown)}</span>}
                    </p>
                  )}
                  {errors[f.key] && (
                    <p className={ui.warn} role="alert">
                      {errors[f.key]}
                    </p>
                  )}
                </div>
              );
            })}
        </section>
      ))}

      <div className={s.saveBar}>
        <button className={ui.btn} data-primary="" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
        {state?.saved && <span className={ui.sub} role="status">Saved.</span>}
        {state && !state.saved && <span className={ui.warn} role="alert">Nothing was saved: fix the fields marked above.</span>}
      </div>
    </form>
  );
}

function Input({
  field,
  value,
  onChange,
  eligibilityKnown,
}: {
  field: FieldView;
  value: string;
  onChange: (v: string) => void;
  eligibilityKnown: boolean;
}) {
  const k = field.kind;
  if (k.type === "model") {
    const label = (m: ModelOption) => {
      const tag = planTag(m, eligibilityKnown);
      return `${m.recommended ? "★ " : ""}${m.name} · ~${money(m.interview)}/interview${tag ? ` · ${tag}` : ""}`;
    };
    const known = [...(field.ranked ?? []), ...(field.others ?? [])].some((m) => m.id === value);
    return (
      <select id={field.key} name={field.key} className={ui.input} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Default ({field.fallback || field.blank || "off"})</option>
        {value && !known && <option value={value}>{value}</option>}
        {(field.ranked ?? []).length > 0 && (
          <optgroup label="Best for this job, in order">
            {field.ranked!.map((m) => (
              <option key={m.id} value={m.id}>
                {label(m)}
              </option>
            ))}
          </optgroup>
        )}
        {(field.others ?? []).length > 0 && (
          <optgroup label="Everything else on your plan, cheapest first">
            {field.others!.map((m) => (
              <option key={m.id} value={m.id}>
                {label(m)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    );
  }
  if (k.type === "choice") {
    return (
      <select id={field.key} name={field.key} className={ui.input} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Default{field.fallback || field.blank ? ` (${field.fallback || field.blank})` : ""}</option>
        {k.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      id={field.key}
      name={field.key}
      className={ui.input}
      inputMode={k.type === "int" ? "numeric" : "decimal"}
      value={value}
      placeholder={field.fallback || "off"}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
