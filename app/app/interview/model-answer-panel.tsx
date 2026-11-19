"use client";

import { useActionState, useState } from "react";
import { saveModelAnswerAction, type ModelAnswerState } from "../actions";
import type { ModelAnswer } from "@/lib/interview/model-answer";
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
      <p className={ui.answerHelp}>
        No model answer yet. Write your notes below and choose &ldquo;Rewrite as model answer&rdquo;, or{" "}
        <button type="button" className={ui.linkBtn} onClick={() => setEditing(true)}>
          write one yourself
        </button>
        .
      </p>
    );
  }

  // The toggle that opens this lives in the question's aid row (behavioural-view.tsx).
  return (
    <>
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
          <p className={ui.answerHelp}>Read it, close it, then answer in your own words: the feedback compares the two.</p>
          {/* The answer itself, framed so it is clear where it starts and ends; every line break is a paragraph. */}
          <blockquote className={ui.answerCard} aria-label="Model answer">
            {answer!.text
              .split(/\n+/)
              .map((para) => para.trim())
              .filter(Boolean)
              .map((para, i) => (
                <p key={i}>{para}</p>
              ))}
          </blockquote>
          <div className={ui.editorFoot}>
            <button className={ui.textBtn} type="button" onClick={() => setEditing(true)}>
              Edit model answer
            </button>
            {state?.saved && <span className={ui.sub}>Saved.</span>}
          </div>
        </>
      )}
    </>
  );
}
