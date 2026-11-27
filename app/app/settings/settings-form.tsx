"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import type { SettingKind } from "@/lib/settings/registry";
import { displayNumber, SECTIONS, settingsHref, SOURCING_FIELDS, type SettingsSection } from "@/lib/settings/sections";
import { Evidence, EVIDENCE_TEXT, type EvidenceCode } from "@/lib/watchlist/safe-kit";
import { saveSettingsAction, type SettingsState } from "./actions";
import { SettingsDialog } from "./dialog";
import { useNavigationGuard } from "./navigation-guard";
import { useClearSettingsSearch } from "./settings-frame";
import ui from "../ui.module.css";
import styles from "./settings.module.css";

export interface ModelOption {
  id: string;
  name: string;
  price: string;
  interview: number;
  eligible: boolean | null;
  reasoning: boolean;
  recommended: boolean;
}

export interface FieldView {
  key: string;
  group: string;
  label: string;
  help?: string;
  unit?: string;
  kind: SettingKind;
  saved: string;
  fallback: string;
  blank?: string;
  ranked?: ModelOption[];
  others?: ModelOption[];
  recommended?: string | null;
}

type Values = Record<string, string | null>;
type Sourcing = Record<(typeof SOURCING_FIELDS)[number]["key"], string>;
const money = (n: number) => n < 0.01 ? "under 1 cent" : `$${n.toFixed(2)}`;
const groupOrder = ["Weekly goals", "Follow-ups & pipeline", "Full mock interviews", "Answer pauses", "CV export",
  "AI models", "Interview controls", "CV fitting", "Role insights"];

export function SettingsForm({ section, sourcing, fields, evidence = [], catalogLoaded, eligibilityKnown, demo }: {
  section: SettingsSection;
  sourcing?: Sourcing;
  fields: FieldView[];
  evidence?: EvidenceCode[];
  catalogLoaded?: boolean;
  eligibilityKnown?: boolean;
  demo?: boolean;
}) {
  const [saved, setSaved] = useState<Values>(() => sourcing ?? Object.fromEntries(fields.map((field) => [field.key, field.saved || null])));
  const clearSearch = useClearSettingsSearch();
  const [draft, setDraft] = useState(saved);
  const [savedClaims, setSavedClaims] = useState(evidence);
  const [claims, setClaims] = useState(evidence);
  const [attested, setAttested] = useState(false);
  const [state, setState] = useState<SettingsState>({});
  const [savedMessage, setSavedMessage] = useState(false);
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const focusError = useRef("");
  const changed = Object.keys(draft).filter((key) => draft[key] !== saved[key]);
  const evidenceChanged = claims.length !== savedClaims.length || claims.some((code) => !savedClaims.includes(code));
  const dirty = changed.length > 0 || evidenceChanged;
  useNavigationGuard(dirty, (next) => setLeaving(() => next));

  useEffect(() => {
    if (!savedMessage) return;
    const timer = window.setTimeout(() => setSavedMessage(false), 3000);
    return () => window.clearTimeout(timer);
  }, [savedMessage]);

  useEffect(() => {
    if (!state.errors || !focusError.current) return;
    const target = document.getElementById(focusError.current);
    if (target) {
      const group = target.closest("details");
      if (group) group.open = true;
      target.focus();
    }
    focusError.current = "";
  }, [state]);

  function set(key: string, value: string | null) {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setSavedMessage(false);
    setState(({ errors }) => ({ errors: errors && Object.fromEntries(Object.entries(errors).filter(([k]) => k !== key)) }));
  }

  function discard() {
    setDraft(saved);
    setClaims(savedClaims);
    setAttested(false);
    setState({});
  }

  function useBest() {
    const next = { ...draft };
    for (const field of fields) {
      if (!field.recommended) continue;
      next[field.key] = field.recommended;
      if (field.key === "AI_GATEWAY_INTERVIEWER_MODEL" && field.ranked?.find((option) => option.recommended)?.reasoning) {
        next.AI_GATEWAY_INTERVIEWER_EFFORT = "low";
        next.AI_GATEWAY_INTERVIEWER_MAX_TOKENS = "2000";
      }
    }
    setDraft(next);
    setState({});
    setSavedMessage(false);
  }

  async function save() {
    if (inFlight.current || !dirty) return;
    inFlight.current = true;
    setPending(true);
    setState({});
    const data = new FormData();
    for (const key of sourcing ? Object.keys(draft) : changed) data.set(key, draft[key] ?? "");
    if (evidenceChanged) {
      data.set("changed-evidence", "");
      for (const claim of claims) data.append("evidence", claim);
      if (attested) data.set("attested", "on");
    }
    const blank = fields.find(({ key, kind }) => draft[key] === "" && (kind.type === "int" || kind.type === "decimal"));
    let result: SettingsState;
    try {
      result = blank ? { errors: { [blank.key]: "Enter a number or use the app default." } } : await saveSettingsAction(section, data);
    } catch {
      result = { failed: true };
    }
    inFlight.current = false;
    setPending(false);
    if (result.errors || result.failed) {
      clearSearch();
      if (result.errors) {
        const first = Object.keys(result.errors).find((key) => form.current?.contains(document.getElementById(key)));
        focusError.current = first ?? "settings-errors";
      }
      setState(result);
      setLeaving(null);
      return;
    }
    setSaved(draft);
    setSavedClaims(claims);
    setSavedMessage(true);
    setLeaving(null);
    leaving?.();
  }

  return (
    <form className={styles.form} ref={form} noValidate onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className={styles.heading}>
        <h1 className={styles.title}>{SECTIONS[section]}</h1>
        <span className={styles.saveNote}>
          {!dirty && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m5 12 4 4L19 6" />
          </svg>}
          {pending ? "Saving…" : dirty ? "Unsaved changes" : "Up to date"}
        </span>
      </div>
      <fieldset className={styles.fieldset} disabled={pending}>
        {sourcing && <>
          <div className={styles.panel}>
            {SOURCING_FIELDS.map((field) => <Field key={field.key} id={field.key} label={field.label} help={field.help} error={state.errors?.[field.key]}>
              {field.key === "target" ?
                <input id={field.key} className={`${ui.input} ${styles.number}`} type="number" inputMode="numeric" min={1} max={2147483647} step={1}
                  aria-invalid={!!state.errors?.target} aria-describedby="target-help" value={draft.target ?? ""} onChange={(event) => set("target", event.target.value)} /> :
                <input id={field.key} className={ui.input} maxLength={2000} aria-invalid={!!state.errors?.[field.key]} aria-describedby={`${field.key}-help`}
                  placeholder={field.placeholder} onPaste={(event) => pasteSourcingTerms(event, (value) => set(field.key, value))}
                  value={draft[field.key] ?? ""} onChange={(event) => set(field.key, event.target.value)} />}
            </Field>)}
          </div>
          <Link className={styles.related} href="/app/companies">Manage target companies <span aria-hidden="true">→</span></Link>
        </>}
        {groupOrder.map((group) => {
          const members = fields.filter((field) => field.group === group);
          if (!members.length) return null;
          const rows = <>
            {group === "AI models" && <div className={styles.groupNote}>
              <p>For tools inside JobSearch, not the model in your own assistant.</p>
              {demo && <p>The demo uses pre-written replies, so these choices don’t affect its answers.</p>}
              {!catalogLoaded ? <p>Model catalog unavailable. You can keep the current model or use the app default.</p> :
                !eligibilityKnown && <p>Plan eligibility is temporarily unavailable. Estimated costs are shown.</p>}
              {catalogLoaded && members.some((field) => field.recommended) && <button type="button" className={ui.btn} onClick={useBest}>Use the best for my plan</button>}
            </div>}
            {members.map((field) => <SettingInput key={field.key} field={field} value={draft[field.key]} error={state.errors?.[field.key]}
              onChange={(value) => set(field.key, value)} />)}
          </>;
          return section === "advanced" ?
            <details className={styles.panel} key={group} open={group === "AI models"}>
              <summary id={group === "CV fitting" ? "cv-fitting" : undefined}>{group}</summary>{rows}
            </details> :
            <section className={styles.panel} key={group} aria-label={group}><h2>{group}</h2>{rows}</section>;
        })}
        {section === "cv" && <>
          <details className={styles.panel}>
            <summary id="evidence">Verified experience and matching evidence</summary>
            <div className={styles.groupNote}>
              <p>Select only claims you can verify. They can help match roles without sharing a private CV.</p>
              {Evidence.options.map((code) => <label key={code} className={styles.check}>
                <input type="checkbox" checked={claims.includes(code)} onChange={(event) => {
                  setClaims(event.target.checked ? [...claims, code] : claims.filter((claim) => claim !== code));
                  setAttested(false);
                  setState({});
                  setSavedMessage(false);
                }} />{EVIDENCE_TEXT[code]}
              </label>)}
              <label className={styles.check}><input type="checkbox" checked={attested} id="attested"
                aria-invalid={!!state.errors?.attested} aria-describedby={state.errors?.attested ? "attested-error" : undefined}
                onChange={(event) => setAttested(event.target.checked)} />Each selected claim describes work I actually did.</label>
              {state.errors?.attested && <p className={styles.error} id="attested-error">{state.errors.attested}</p>}
            </div>
          </details>
          <a className={styles.related} href={`${settingsHref("advanced")}#cv-fitting`} data-settings-result>Open CV layout tuning <span aria-hidden="true">→</span></a>
        </>}
        {section === "advanced" && <button type="button" className={styles.related} onClick={() => {
          setDraft(Object.fromEntries(fields.map(({ key }) => [key, null])));
          setState({});
          setSavedMessage(false);
        }}>Restore app defaults for Advanced</button>}
      </fieldset>
      {!!state.errors && Object.keys(state.errors).length > 0 && <div id="settings-errors" className={styles.notice} role="alert" tabIndex={-1}>
        Fix the marked settings before saving.
        {Object.entries(state.errors).filter(([key]) => !Object.hasOwn(draft, key) && key !== "attested")
          .map(([key, error]) => <p key={key}>{error}</p>)}
      </div>}
      {dirty && <div className={styles.saveBar}>
        {state.failed && <p className={styles.error} role="alert">Couldn’t save your changes. Your edits are still here.</p>}
        <div className={styles.saveActions}>
          <span>{pending ? "Saving…" : "Unsaved changes"}</span>
          <button type="button" className={ui.btn} onClick={discard} disabled={pending}>Discard</button>
          <button type="submit" className={ui.btn} data-primary="" disabled={pending}>{state.failed ? "Retry save" : "Save changes"}</button>
        </div>
      </div>}
      {savedMessage && <div className={styles.toast} role="status">Saved.</div>}
      {leaving && <SettingsDialog title="Leave with unsaved changes?" onClose={() => { if (!pending) setLeaving(null); }}>
        <p>You have changes in this section that haven’t been saved.</p>
        <div className={styles.dialogActions}>
          <button type="button" className={ui.btn} disabled={pending} onClick={() => setLeaving(null)}>Keep editing</button>
          <button type="button" className={ui.btn} disabled={pending} onClick={() => { discard(); setLeaving(null); leaving(); }}>Discard</button>
          <button type="button" className={ui.btn} data-primary="" disabled={pending} onClick={() => void save()}>{pending ? "Saving…" : "Save and continue"}</button>
        </div>
      </SettingsDialog>}
    </form>
  );
}

function pasteSourcingTerms(event: ClipboardEvent<HTMLInputElement>, update: (value: string) => void) {
  const text = event.clipboardData.getData("text/plain");
  if (!/[\r\n]/.test(text)) return;
  event.preventDefault();
  const input = event.currentTarget;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const remaining = Math.max(0, input.maxLength - input.value.length + end - start);
  input.setRangeText(text.replace(/\r\n?|\n/g, ",").slice(0, remaining), start, end, "end");
  update(input.value);
}

function Field({ id, label, help, error, children }: {
  id: string; label: string; help?: string; error?: string; children: React.ReactNode;
}) {
  return <div className={styles.field}>
    <div>
      <label htmlFor={id}>{label}</label>
      {(help || error) && <p className={styles.help} id={`${id}-help`}>{help}{error && <span className={styles.error}>{error}</span>}</p>}
    </div>
    <div className={styles.fieldControl}>{children}</div>
  </div>;
}

function SettingInput({ field, value, error, onChange }: {
  field: FieldView; value: string | null; error?: string; onChange: (value: string | null) => void;
}) {
  const { key, kind, label, help, fallback, blank, unit, ranked = [], others = [] } = field;
  const options = [...ranked, ...others];
  const pick = options.find((option) => option.id === (value || fallback));
  const description = [help || error ? `${key}-help` : "", unit ? `${key}-unit` : ""].filter(Boolean).join(" ");
  const inputProps = { id: key, className: ui.input, "aria-invalid": !!error, "aria-describedby": description || undefined };
  const numeric = kind.type === "int" || kind.type === "decimal";
  const adjustedError = numeric && error ? error.replace(/^(Between |At least )([\d.]+)(?: and ([\d.]+))?\.$/,
    (_, prefix, min, max) => `${prefix}${displayNumber(key, min)}${max ? ` and ${displayNumber(key, max)}` : ""}${unit ? ` ${unit}` : ""}.`) : error;
  return <Field id={key} label={label} help={help} error={adjustedError}>
    {kind.type === "model" || kind.type === "choice" ?
      <select {...inputProps} value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">App default{fallback || blank ? ` · ${fallback || blank}` : " · Not set"}</option>
        {kind.type === "choice" ? kind.options.map((option) => <option key={option}>{option}</option>) : <>
          {value && !options.some((option) => option.id === value) && <option value={value}>{value}</option>}
          {[["Recommended and ranked", ranked], ["Other models", others]].map(([name, list]) => {
            const models = list as ModelOption[];
            return models.length > 0 && <optgroup key={name as string} label={name as string}>
              {models.map((model) => <option value={model.id} key={model.id}>
                {model.recommended ? "Recommended · " : ""}{model.name}{model.eligible === true ? " · on your plan" : model.eligible === false ? " · needs credits" : ""}
              </option>)}
            </optgroup>;
          })}
        </>}
      </select> : <>
        <div className={styles.valueRow}>
          <input {...inputProps} className={`${ui.input} ${styles.number}`} type="number" inputMode={kind.type === "int" && !key.endsWith("_MS") ? "numeric" : "decimal"}
            min={displayNumber(key, String(kind.min))} max={kind.max === undefined ? undefined : displayNumber(key, String(kind.max))}
            step={kind.type === "int" ? displayNumber(key, "1") : "any"} value={value ?? fallback} placeholder="Not set" onChange={(event) => onChange(event.target.value)} />
          {unit && <span className={styles.unit} id={`${key}-unit`}>{unit}</span>}
        </div>
        {value === null ? <span className={styles.help}>App default</span> :
          <button type="button" className={styles.defaultButton} onClick={() => onChange(null)}>Use app default</button>}
      </>}
    {pick && <span className={styles.help}>{pick.price} · about {money(pick.interview)} per full interview
      {pick.eligible !== null && ` · ${pick.eligible ? "on your plan" : "needs credits"}`}</span>}
  </Field>;
}
