"use client";

import { useActionState, useState } from "react";
import { probeStoryAction, saveAnswerAction, type ProbeState, type SaveState } from "../actions";
import type { AnswerMode } from "@/lib/repos/answers";
import ui from "../ui.module.css";

export interface EditorInitial {
  mode: AnswerMode;
  body: string;
  situation: string;
  task: string;
  action: string;
  result: string;
}

/**
 * Your written answer to one question. Two ways to write it - a blank box for thinking
 * out loud, or STAR boxes for shaping - and BOTH drafts are always submitted, so
 * switching mode never throws anything away.
 *
 * "Ask an interviewer" returns the follow-ups a real interviewer would ask about what
 * you wrote. It never writes the answer for you (DESIGN.md section 3): probing a draft
 * adds no claim, and a fabricated answer collapses on the first follow-up.
 */
export function AnswerEditor({
  questionId,
  questionText,
  initial,
}: {
  questionId: string;
  questionText: string;
  initial: EditorInitial;
}) {
  const [mode, setMode] = useState<AnswerMode>(initial.mode);
  const [saveState, save, saving] = useActionState<SaveState | null, FormData>(saveAnswerAction, null);
  const [probe, askInterviewer, probing] = useActionState<ProbeState | null, FormData>(probeStoryAction, null);

  return (
    <form className={ui.stack} key={questionId}>
      <input type="hidden" name="questionId" value={questionId} />
      <input type="hidden" name="question" value={questionText} />
      <input type="hidden" name="mode" value={mode} />

      <div className={ui.segmented} role="tablist" aria-label="How to write it">
        <button type="button" role="tab" aria-selected={mode === "free"} className={ui.segment} onClick={() => setMode("free")}>
          Blank box
        </button>
        <button type="button" role="tab" aria-selected={mode === "star"} className={ui.segment} onClick={() => setMode("star")}>
          STAR
        </button>
      </div>

      {/* Hidden, not unmounted: hidden fields still submit, so the other draft survives. */}
      <div hidden={mode !== "free"} className={ui.stack}>
        <textarea
          name="body"
          className={ui.answerBox}
          defaultValue={initial.body}
          placeholder="Just tell it the way you would over coffee. Messy is fine - you can shape it into STAR afterwards."
          aria-label="Your answer"
        />
      </div>

      <div hidden={mode !== "star"} className={ui.stack}>
        <StarField name="situation" label="Situation" hint="What was going on?" initial={initial.situation} />
        <StarField name="task" label="Task" hint="What were you responsible for?" initial={initial.task} />
        <StarField name="action" label="Action" hint="What did YOU personally do?" initial={initial.action} />
        <StarField name="result" label="Result" hint="What changed because of it - with the number." initial={initial.result} />
      </div>

      <div className={ui.actions}>
        <button className={ui.btn} data-primary="" type="submit" formAction={save} disabled={saving}>
          {saving ? "Saving…" : "Save answer"}
        </button>
        <button className={ui.btn} type="submit" formAction={askInterviewer} disabled={probing}>
          {probing ? "Reading your answer…" : "Ask an interviewer"}
        </button>
        {saveState?.saved && !saving && <span className={ui.sub}>Saved.</span>}
        {saveState?.error && <span className={ui.warn}>{saveState.error}</span>}
        {probe?.error && <span className={ui.warn}>{probe.error}</span>}
      </div>

      {probe?.questions && probe.questions.length > 0 && (
        <div className={ui.callout}>
          <p className={ui.mono}>What an interviewer would ask next</p>
          <ul className={ui.rows}>
            {probe.questions.map((q) => (
              <li key={q} className={ui.row}>
                <p>{q}</p>
              </li>
            ))}
          </ul>
          <p className={ui.sub}>Answer these in your draft. That is what turns a summary into a story.</p>
        </div>
      )}
    </form>
  );
}

function StarField({ name, label, hint, initial }: { name: string; label: string; hint: string; initial: string }) {
  return (
    <label className={ui.starField}>
      <span className={ui.starLabel}>
        <b>{label}</b> <span className={ui.sub}>{hint}</span>
      </span>
      <textarea name={name} className={ui.jd} defaultValue={initial} />
    </label>
  );
}
