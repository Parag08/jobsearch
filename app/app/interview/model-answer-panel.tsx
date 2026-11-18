"use client";

import { useActionState, useState } from "react";
import { saveModelAnswerAction, type ModelAnswerState } from "../actions";
import { SOURCE_LABEL, type ModelAnswer } from "@/lib/interview/model-answer";
import ui from "../ui.module.css";

/**
 * The model answer for one question: read it, close it, then answer in your own words -
 * the mock debrief compares the two. It comes from your agent, from "Rewrite as model
 * answer" on your notes, or from you; editing it here makes it yours, and an agent then
 * leaves it alone.
 */
export function ModelAnswerPanel({ questionId, answer }: { questionId: string; answer: ModelAnswer | null }) {
  const [editing, setEditing] = useState(false);
  const [state, save, saving] = useActionState<ModelAnswerState | null, FormData>(async (prev, fd) => {
    const r = await saveModelAnswerAction(prev, fd);
    if (r.saved) setEditing(false);
    return r;
  }, null);

  if (!answer && !editing) {
    return (
      <p className={ui.sub}>
        No model answer yet. Write your notes below and choose &ldquo;Rewrite as model answer&rdquo;, or{" "}
        <button type="button" className={ui.linkBtn} onClick={() => setEditing(true)}>
          write one yourself
        </button>
        .
      </p>
    );
  }

  return (
    <details className={ui.reveal} key={questionId} open={editing || undefined}>
      <summary>
        Model answer {answer && <span className={ui.sub}>{SOURCE_LABEL[answer.source]}</span>}
      </summary>
      {editing ? (
        <form className={ui.stack} action={save}>
          <input type="hidden" name="questionId" value={questionId} />
          <textarea name="modelAnswer" className={ui.answerBox} defaultValue={answer?.text ?? ""} aria-label="Model answer" />
          <div className={ui.editorFoot}>
            <button className={ui.btn} data-primary="" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save model answer"}
            </button>
            <button className={ui.btn} type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            {state?.error && <span className={ui.warn}>{state.error}</span>}
          </div>
        </form>
      ) : (
        <>
          <p className={ui.sub}>Read it, close it, then answer in your own words: the feedback compares the two.</p>
          {answer!.text.split(/\n\s*\n/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
          <div className={ui.editorFoot}>
            <button className={ui.btn} type="button" onClick={() => setEditing(true)}>
              Edit
            </button>
            {state?.saved && <span className={ui.sub}>Saved.</span>}
          </div>
        </>
      )}
    </details>
  );
}
