"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { Bullet } from "@/lib/types";
import { toneFor } from "@/lib/pipeline-display";
import { BAND_LABEL, DEFAULT_STRENGTH, effectiveStrength, chipsFor, strengthBand, usageNote, type CvUse } from "@/lib/bank/display";
import { MAX_UNEVIDENCED_STRENGTH, needsMetric } from "@/lib/onboarding/intake-guard";
import { deletePointAction, savePointAction, type PointState } from "./actions";
import ui from "../ui.module.css";
import s from "./bank.module.css";

const LEVELS = [1, 2, 3, 4, 5] as const;

/** Five dots, filled to the score, all in the band's colour, with the band named under them. */
export function Strength({ value }: { value: number | undefined }) {
  const v = value ?? DEFAULT_STRENGTH;
  const band = strengthBand(v);
  return (
    <span className={s.strength} data-band={band} title={`Strength ${v} of 5`}>
      <span className={s.dots} aria-hidden="true">
        {LEVELS.map((n) => (
          <i key={n} data-on={n <= v || undefined} />
        ))}
      </span>
      <span className={s.bandLabel}>
        {BAND_LABEL[band]}
        <span className={s.srOnly}>, {v} of 5</span>
      </span>
    </span>
  );
}

/** One point: read view with an Edit button, or the editor in its place. */
export function PointRow({ point, families, usage }: { point: Bullet; families: string[]; usage?: CvUse }) {
  const [editing, setEditing] = useState(false);
  const editBtn = useRef<HTMLButtonElement>(null);
  const chips = chipsFor(point);
  const gap = needsMetric(point.text);

  const close = () => {
    setEditing(false);
    requestAnimationFrame(() => editBtn.current?.focus());
  };

  return (
    <li id={`point-${point.id}`} className={s.point} data-editing={editing || undefined}>
      {editing ? (
        <PointEditor point={point} families={families} usage={usage} onDone={close} />
      ) : (
        <>
          <div className={s.pointBody}>
            <p className={s.pointText}>{point.text}</p>
            <div className={s.chips}>
              {gap && <span className={s.needsNumber}>Needs a number</span>}
              <span className={ui.tag} data-tone={toneFor(point.roleFamily)}>{chips.family}</span>
              {chips.skills.map((k) => (
                <span key={k} className={s.chip}>{k}</span>
              ))}
              {chips.more > 0 && <span className={s.chip} title={point.skills.join(", ")}>+{chips.more}</span>}
              {(point.variants?.length ?? 0) > 0 && (
                <span className={s.meta}>
                  {point.variants!.length} variant{point.variants!.length > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
          <div className={s.pointSide}>
            <Strength value={effectiveStrength(point)} />
            <button ref={editBtn} type="button" className={s.editBtn} onClick={() => setEditing(true)} aria-label={`Edit point: ${point.text.slice(0, 60)}`}>
              Edit
            </button>
          </div>
        </>
      )}
    </li>
  );
}

/** "+ Add a point" at the foot of a role; opens the same editor, empty. */
export function AddPoint({ projectId, families, role }: { projectId: string; families: string[]; role: string }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  if (!open) {
    return (
      <button ref={btn} type="button" className={ui.ghostAdd} onClick={() => setOpen(true)} aria-label={`Add a point to ${role}`}>
        <span aria-hidden="true">+</span> Add a point
      </button>
    );
  }
  return (
    <div className={s.point} data-editing>
      <PointEditor projectId={projectId} families={families} onDone={() => setOpen(false)} />
    </div>
  );
}

/**
 * The editor. Strength is capped at 2 while the wording has no number (the intake guard), so
 * the higher dots switch off and say why; the server applies the same cap. Variants are other
 * wordings of the same fact: their labels are fixed (CVs pick them by label), their text is
 * editable, and changing the main wording flags them for review instead of rewriting them.
 */
function PointEditor({
  point,
  projectId,
  families,
  usage,
  onDone,
}: {
  point?: Bullet;
  usage?: CvUse;
  projectId?: string;
  families: string[];
  onDone: () => void;
}) {
  const [state, save, saving] = useActionState<PointState, FormData>(savePointAction, {});
  const [delState, del, deleting] = useActionState<PointState, FormData>(deletePointAction, {});
  const [text, setText] = useState(point?.text ?? "");
  const [strength, setStrength] = useState(point?.strength ?? DEFAULT_STRENGTH);
  const [variants, setVariants] = useState(point?.variants ?? []);
  const [confirming, setConfirming] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  const noNumber = text.trim() !== "" && needsMetric(text);
  const shown = noNumber ? Math.min(strength, MAX_UNEVIDENCED_STRENGTH) : strength;
  const reworded = point !== undefined && text.trim() !== point.text.trim();

  useEffect(() => textRef.current?.focus(), []);
  useEffect(() => {
    if (state.saved || delState.saved) onDone();
  }, [state.saved, delState.saved, onDone]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onDone();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      form.current?.requestSubmit();
    }
  };

  const error = state.error ?? delState.error;

  return (
    <div className={s.editor} onKeyDown={onKey}>
      <form ref={form} action={save} className={s.editorForm}>
        {point ? <input type="hidden" name="id" value={point.id} /> : <input type="hidden" name="projectId" value={projectId} />}

        <label className={s.field}>
          <span className={s.fieldLabel}>Wording</span>
          <textarea
            ref={textRef}
            name="text"
            className={`${ui.input} ${s.textarea}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            required
            placeholder="Cut onboarding time 40% by rebuilding the setup flow with the support team"
          />
          {noNumber && <span className={s.hint} data-tone="stale">No number yet. A figure (%, $, a count, a time) makes this point stronger, so strength stays at 2 until it has one.</span>}
        </label>

        <div className={s.fieldRow}>
          <fieldset className={s.field}>
            <legend className={s.fieldLabel}>Strength</legend>
            <input type="hidden" name="strength" value={shown} />
            <span className={s.picker} data-band={strengthBand(shown)}>
              {LEVELS.map((n) => {
                const capped = noNumber && n > MAX_UNEVIDENCED_STRENGTH;
                return (
                  <button
                    key={n}
                    type="button"
                    className={s.pick}
                    data-on={n <= shown || undefined}
                    aria-pressed={n === shown}
                    aria-label={`Strength ${n} of 5`}
                    disabled={capped}
                    onClick={() => setStrength(n)}
                  />
                );
              })}
              <span className={s.bandLabel}>{BAND_LABEL[strengthBand(shown)]}</span>
            </span>
          </fieldset>

          <label className={s.field}>
            <span className={s.fieldLabel}>Role family</span>
            <input name="roleFamily" className={ui.input} list={`${id}-families`} defaultValue={point ? point.roleFamily.replace(/-/g, " ") : ""} placeholder="product management" />
            <datalist id={`${id}-families`}>
              {families.map((f) => (
                <option key={f} value={f.replace(/-/g, " ")} />
              ))}
            </datalist>
          </label>
        </div>

        <label className={s.field}>
          <span className={s.fieldLabel}>Skills, separated by commas</span>
          <input name="skills" className={ui.input} defaultValue={point ? point.skills.map((k) => k.replace(/-/g, " ")).join(", ") : ""} placeholder="stakeholder management, roadmap" />
        </label>

        {variants.length > 0 && (
          <fieldset className={s.field}>
            <legend className={s.fieldLabel}>Variants · {variants.length}</legend>
            {reworded && <span className={s.hint} data-tone="stale">These were written for the old wording. Check they still say the same fact.</span>}
            {variants.map((v, i) => (
              <div key={v.label} className={s.variant}>
                <input type="hidden" name="variantLabel" value={v.label} />
                <span className={s.variantLabel}>{v.label}</span>
                <textarea
                  name="variantText"
                  className={`${ui.input} ${s.textarea}`}
                  rows={2}
                  value={v.text}
                  onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  aria-label={`Variant ${v.label}`}
                />
                <button type="button" className={s.linkBtn} onClick={() => setVariants(variants.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            ))}
          </fieldset>
        )}

        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}

        <div className={s.editorFoot}>
          {point && !confirming && (
            <button type="button" className={s.deleteLink} onClick={() => setConfirming(true)}>
              Delete point
            </button>
          )}
          <span className={s.spacer} />
          <button type="button" className={ui.btn} onClick={onDone}>
            Cancel
          </button>
          <button type="submit" className={ui.btn} data-primary disabled={saving}>
            {saving ? "Saving…" : point ? "Save" : "Add point"}
          </button>
        </div>
      </form>

      {point && confirming && (
        <form action={del} className={s.confirm} role="alertdialog" aria-label="Delete this point?">
          <input type="hidden" name="id" value={point.id} />
          <p>
            <strong>Delete this point?</strong> {usageNote(usage)} This can&apos;t be undone.
          </p>
          <div className={s.confirmActions}>
            <button type="button" className={ui.btn} onClick={() => setConfirming(false)} autoFocus>
              Keep it
            </button>
            <button type="submit" className={`${ui.btn} ${s.danger}`} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** A to-do link into a collapsed role opens that role first, then scrolls to the target. */
export function OpenOnHash() {
  useEffect(() => {
    const open = () => {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (!target) return;
      const details = target.closest("details");
      if (details && !details.open) details.open = true;
      target.scrollIntoView({ block: "center" });
    };
    // After the first paint: the router restores scroll to the top on arrival, which would
    // undo a scroll made during mount.
    const t = window.setTimeout(open, 50);
    window.addEventListener("hashchange", open);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("hashchange", open);
    };
  }, []);
  return null;
}
