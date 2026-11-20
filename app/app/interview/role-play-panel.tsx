"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { rolePlayBasis, type RolePlay } from "@/lib/interview/role-play";
import { buildRolePlayAction } from "./full-actions";
import { speak, stopSpeaking } from "./speech";
import ui from "../ui.module.css";

/**
 * A role-play for one question (docs/FULL-INTERVIEW.md section 2): how the question and a strong
 * answer play out, follow-ups included, built from the model answer. Built once and kept; marked
 * stale when the model answer changes. Play reads it aloud: the interviewer in the interviewer's
 * voice, the candidate in a second browser voice.
 */
export function RolePlayPanel({ questionId, initial, modelAnswer }: { questionId: string; initial: RolePlay | null; modelAnswer: string | null }) {
  const [play, setPlay] = useState<RolePlay | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [playing, setPlaying] = useState<number | null>(null);
  const run = useRef(0);

  useEffect(() => () => {
    run.current += 1;
    stopSpeaking();
  }, []);

  const stale = Boolean(play && modelAnswer && play.basedOn !== rolePlayBasis(modelAnswer));

  function build() {
    setError(null);
    start(async () => {
      const r = await buildRolePlayAction(questionId);
      if (r.error || !r.rolePlay) setError(r.error ?? "Could not build the role-play.");
      else setPlay(r.rolePlay);
    });
  }

  async function playAll() {
    if (!play) return;
    const mine = ++run.current;
    let lang = "en-US";
    try {
      lang = (JSON.parse(localStorage.getItem("jobsearch.mock-interview") ?? "{}") as { lang?: string }).lang ?? lang;
    } catch {
      /* default accent */
    }
    for (let i = 0; i < play.lines.length; i++) {
      if (mine !== run.current) return;
      setPlaying(i);
      await speak(play.lines[i].say, lang, 0.97, play.lines[i].who);
    }
    if (mine === run.current) setPlaying(null);
  }

  function stop() {
    run.current += 1;
    stopSpeaking();
    setPlaying(null);
  }

  if (!modelAnswer && !play) {
    return <p className={ui.sub}>A role-play is built from the model answer. Write one, or rewrite your notes as one, first.</p>;
  }

  return (
    <div className={ui.stack}>
      {play ? (
        <>
          <div className={ui.actions}>
            {playing === null ? (
              <button className={ui.btn} data-primary="" type="button" onClick={() => void playAll()}>
                Play it
              </button>
            ) : (
              <button className={ui.btn} type="button" onClick={stop}>
                Stop
              </button>
            )}
            <button className={ui.textBtn} type="button" onClick={build} disabled={pending || !modelAnswer}>
              {pending ? "Building…" : "Rebuild"}
            </button>
            <span className={ui.sectionMeta}>{play.source === "agent" ? "From your agent" : "Built from your model answer"}</span>
          </div>
          {stale && <p className={ui.warn}>Your model answer has changed since this was built. Rebuild to match it.</p>}
          <ol className={ui.transcript} aria-label="Role-play">
            {play.lines.map((l, i) => (
              <li key={i} className={ui.turn} data-role={l.who} aria-current={playing === i ? "true" : undefined}>
                <span className={ui.turnWho}>{l.who === "interviewer" ? "Interviewer" : "Strong candidate"}</span>
                <p>{l.say}</p>
                {l.why && <p className={ui.sub}>Why it works: {l.why}</p>}
              </li>
            ))}
          </ol>
        </>
      ) : (
        <div className={ui.actions}>
          <button className={ui.btn} data-primary="" type="button" onClick={build} disabled={pending}>
            {pending ? "Building…" : "Build the role-play"}
          </button>
          <span className={ui.sub}>See how this question and a strong answer play out, follow-ups included.</span>
        </div>
      )}
      {error && <p className={ui.warn}>{error}</p>}
    </div>
  );
}
