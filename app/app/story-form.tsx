"use client";

import { useActionState, useState } from "react";
import { probeStoryAction, saveStoryAction, type ProbeState } from "./actions";
import ui from "./ui.module.css";

/**
 * STAR capture (DESIGN.md section 3). You write it; the model never does.
 *
 * "Ask an interviewer" sends the draft to the model and gets back the follow-up
 * questions a real interviewer would ask about it. That is the one kind of help
 * that cannot corrupt the story: probing adds no claim, writing one does. A
 * fabricated interview answer collapses on the first follow-up, which is exactly
 * the moment it matters.
 */
export function StoryForm({
  roles,
  competency,
}: {
  roles: { id: string; label: string }[];
  competency?: string;
}) {
  const [saveError, save, saving] = useActionState(saveStoryAction, null);
  const [probe, askInterviewer, probing] = useActionState<ProbeState | null, FormData>(probeStoryAction, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className={ui.btn} type="button" onClick={() => setOpen(true)}>
        {competency ? `Write a ${competency.replace(/-/g, " ")} story` : "Write a story"}
      </button>
    );
  }

  return (
    <form className={ui.stack}>
      {competency && (
        <p className={ui.sub}>
          Writing a <b>{competency.replace(/-/g, " ")}</b> story. Rough is fine — you can sharpen it after.
        </p>
      )}

      <label className={ui.sub} htmlFor="story-project">
        Which role is this from?
      </label>
      <select id="story-project" name="projectId" className={ui.input} required defaultValue={roles[0]?.id ?? ""}>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>

      <label className={ui.sub} htmlFor="story-situation">
        Situation — what was going on?
      </label>
      <textarea id="story-situation" name="situation" className={ui.jd} placeholder="Fleet costs were climbing while revenue stayed flat, and nobody had established why." />

      <label className={ui.sub} htmlFor="story-task">
        Task — what were you responsible for?
      </label>
      <textarea id="story-task" name="task" className={ui.jd} placeholder="I was handed the problem with no diagnosis attached, and two months." />

      <label className={ui.sub} htmlFor="story-action">
        Action — what did <b>you</b> personally do?
      </label>
      <textarea id="story-action" name="action" className={ui.jd} placeholder="I spent the first weeks learning the operation from the dispatchers and drivers before I opened a spreadsheet." />

      <label className={ui.sub} htmlFor="story-result">
        Result — what changed because of it? <span className={ui.chip} data-tone="gap">required</span>
      </label>
      <textarea id="story-result" name="result" className={ui.jd} required placeholder="Isolated the cost drivers and sized two strategies worth up to 30%. The CEO approved both." />

      <div className={ui.actions}>
        <button className={ui.btn} data-primary="" type="submit" formAction={save} disabled={saving}>
          {saving ? "Saving…" : "Save story"}
        </button>
        <button className={ui.btn} type="submit" formAction={askInterviewer} disabled={probing}>
          {probing ? "Reading your draft…" : "Ask an interviewer"}
        </button>
        <button className={ui.btn} type="button" onClick={() => setOpen(false)}>
          Close
        </button>
        {saveError && <span className={ui.warn}>{saveError}</span>}
        {probe?.error && <span className={ui.warn}>{probe.error}</span>}
      </div>

      {probe?.questions && probe.questions.length > 0 && (
        <div className={ui.panel}>
          <h3>What an interviewer would ask next</h3>
          <p className={ui.sub}>
            These come from your draft. Answering them in the boxes above is what turns a summary
            into a story — the model will not write it for you, and should not.
          </p>
          <ul className={ui.rows}>
            {probe.questions.map((q) => (
              <li key={q} className={ui.row}>
                <p>{q}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
