"use client";

import type { ScoreResult } from "../actions";
import { DIMENSION_HELP, SCORE_DIMENSIONS } from "@/lib/interview/score";
import ui from "../ui.module.css";

/** The six scores, delivery signals and what to change - shown after an interview. */

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function ScoreCard({ result }: { result: ScoreResult }) {
  const s = result.signals;
  return (
    <div className={ui.callout}>
      <div className={ui.head}>
        <h3>
          {result.overall?.toFixed(1)} <span className={ui.sub}>/ 5</span>
        </h3>
        <span className={ui.mono}>{result.model}</span>
      </div>

      <div className={ui.scoreBars}>
        {SCORE_DIMENSIONS.map((d) => (
          <div key={d} className={ui.scoreRow} title={DIMENSION_HELP[d]}>
            <span className={ui.scoreName}>{d}</span>
            <span className={ui.scoreTrack}>
              <i style={{ width: `${((result.scores?.[d] ?? 0) / 5) * 100}%` }} />
            </span>
            <span className={ui.mono}>{result.scores?.[d]}</span>
          </div>
        ))}
      </div>

      {s && (
        <div className={ui.chips}>
          {s.durationSeconds !== null && <span className={ui.chip}>{fmt(s.durationSeconds)}</span>}
          {s.wordsPerMinute !== null && <span className={ui.chip}>{s.wordsPerMinute} words/min</span>}
          <span className={ui.chip} data-tone={s.pace === "good" ? "hit" : "gap"}>
            {s.pace === "good" ? "good length" : s.pace === "too-short" ? "too short" : "too long"}
          </span>
          <span className={ui.chip} data-tone={s.ownershipRatio !== null && s.ownershipRatio < 0.5 ? "gap" : undefined}>
            “I” ×{s.iCount} · “we” ×{s.weCount}
          </span>
        </div>
      )}

      {result.saidNotWritten && result.saidNotWritten.length > 0 && (
        <p className={ui.warn}>
          You said {result.saidNotWritten.join(", ")} — your written answer does not contain{" "}
          {result.saidNotWritten.length === 1 ? "that number" : "those numbers"}. Say the same number every
          time; an interviewer who hears two versions stops trusting both.
        </p>
      )}

      {result.strengths && result.strengths.length > 0 && (
        <>
          <p className={ui.mono}>What worked</p>
          <ul className={ui.rows}>
            {result.strengths.map((x) => (
              <li key={x} className={ui.row}>
                <p>{x}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      {result.improvements && result.improvements.length > 0 && (
        <>
          <p className={ui.mono}>Do differently next time</p>
          <ul className={ui.rows}>
            {result.improvements.map((x) => (
              <li key={x} className={ui.row}>
                <p>{x}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
