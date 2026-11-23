"use client";

import { useState } from "react";
import type { LineRating } from "@/lib/repos/interviewer-ratings";
import { rateLineAction } from "./full-actions";
import ui from "../ui.module.css";

export interface SavedRating {
  rating: LineRating;
  better: string | null;
}

/**
 * Good / bad on one interviewer line of a finished full interview, and for a bad one what a
 * great interviewer would have asked instead. Saved at once; pressing the same thumb again
 * clears it. These are the labels of the interviewer eval set (docs/FULL-INTERVIEW.md).
 */
export function RateLine({ sessionId, turnIndex, initial }: { sessionId: string; turnIndex: number; initial?: SavedRating }) {
  const [rating, setRating] = useState<LineRating | null>(initial?.rating ?? null);
  const [better, setBetter] = useState(initial?.better ?? "");
  const [savedBetter, setSavedBetter] = useState(initial?.better ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(next: LineRating | null, nextBetter: string) {
    setState("saving");
    const r = await rateLineAction({ sessionId, turnIndex, rating: next, better: next === "bad" ? nextBetter : null });
    if (r.error) {
      setError(r.error);
      setState("error");
      return false;
    }
    setError(null);
    setState("saved");
    return true;
  }

  async function pick(r: LineRating) {
    const prev = rating;
    const next = prev === r ? null : r;
    setRating(next);
    if (!(await save(next, better))) setRating(prev);
  }

  async function saveBetter() {
    if (better.trim() === savedBetter.trim()) return;
    if (await save("bad", better)) setSavedBetter(better);
  }

  return (
    <div className={ui.rateRow}>
      <span className={ui.rateAsk}>Good question?</span>
      <button className={ui.rateBtn} type="button" aria-pressed={rating === "good"} onClick={() => void pick("good")} disabled={state === "saving"} aria-label="Good question">
        Good
      </button>
      <button className={ui.rateBtn} type="button" aria-pressed={rating === "bad"} onClick={() => void pick("bad")} disabled={state === "saving"} aria-label="Bad question">
        Bad
      </button>
      {rating === "bad" && (
        <span className={ui.rateBetter}>
          <input
            className={ui.input}
            value={better}
            maxLength={400}
            placeholder="What should it have asked instead? (optional)"
            aria-label="What the interviewer should have asked instead"
            onChange={(e) => setBetter(e.target.value)}
            onBlur={() => void saveBetter()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void saveBetter();
              }
            }}
          />
        </span>
      )}
      <span className={ui.rateState} role="status">
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : error}
      </span>
    </div>
  );
}
