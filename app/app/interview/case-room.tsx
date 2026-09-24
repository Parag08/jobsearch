"use client";

import { useEffect, useRef, useState } from "react";
import {
  caseNextQuestionAction,
  caseTurnAction,
  finishCaseAction,
  startCaseAction,
  type CaseDebriefResult,
} from "../actions";
import type { CaseSheet, Exhibit, QuestionKind } from "@/lib/interview/case-sheet";
import { CASE_DIMENSIONS, CASE_DIMENSION_HELP, type CaseSession } from "@/lib/interview/case-session";
import { BARS, OPENING } from "@/lib/interview/case-method";
import { LANGS, recognitionCtor, speak, type SpeechRecognitionLike } from "./speech";
import ui from "../ui.module.css";

/**
 * A live case interview. The transcript flows in the page (no scroll box inside a scroll
 * box); the composer sticks to the bottom of the screen. You can type or talk - speech is
 * transcribed in the browser and only the text is sent. The interviewer can read its
 * lines aloud. Everything is saved after every turn, so a refresh resumes the interview.
 */

const KIND_LABEL: Record<QuestionKind, string> = {
  structure: "Structure",
  brainstorm: "Brainstorm",
  math: "Math",
  chart: "Chart",
  recommendation: "Recommendation",
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export interface CaseRoomProps {
  sheet: CaseSheet;
  /** The latest attempt at this case, if any - resumed if running, shown if done. */
  latest: { id: string; session: CaseSession; debrief: CaseDebriefResult | null } | null;
}

export function CaseRoom({ sheet, latest }: CaseRoomProps) {
  const [sessionId, setSessionId] = useState<string | null>(latest?.id ?? null);
  const [session, setSession] = useState<CaseSession | null>(latest?.session ?? null);
  const [debrief, setDebrief] = useState<CaseDebriefResult | null>(latest?.debrief ?? null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState<"turn" | "start" | "finish" | "next" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState(true);
  const [lang, setLang] = useState("en-US");
  const [listening, setListening] = useState(false);
  const [canListen, setCanListen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [notes, setNotes] = useState("");

  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCanListen(recognitionCtor() !== null);
    if (LANGS.some((l) => l.id === navigator.language)) setLang(navigator.language);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Scratchpad notes stay on this device, per attempt.
  const notesKey = sessionId ? `case-notes:${sessionId}` : null;
  useEffect(() => {
    if (!notesKey) return;
    try {
      setNotes(localStorage.getItem(notesKey) ?? "");
    } catch {
      /* storage unavailable - notes just won't persist */
    }
  }, [notesKey]);
  const saveNotes = (v: string) => {
    setNotes(v);
    try {
      if (notesKey) localStorage.setItem(notesKey, v);
    } catch {
      /* ignore */
    }
  };

  const turnCount = session?.turns.length ?? 0;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turnCount, pending, debrief]);

  useEffect(() => () => stopListening(), []);

  function sayNew(before: number, s: CaseSession) {
    if (!voice) return;
    const lines = s.turns.slice(before).filter((t) => t.role === "interviewer").map((t) => t.text);
    if (lines.length) speak(lines.join(" "), lang);
  }

  async function start() {
    setBusy("start");
    setError(null);
    setDebrief(null);
    const r = await startCaseAction(sheet.id);
    setBusy(null);
    if (r.error || !r.session || !r.sessionId) return setError(r.error ?? "Could not start.");
    setSessionId(r.sessionId);
    setSession(r.session);
    sayNew(0, r.session);
  }

  async function send(retry?: string) {
    const text = (retry ?? draft).trim();
    if (!text || !sessionId || !session) return;
    stopListening();
    setPending(text);
    setDraft("");
    setBusy("turn");
    setError(null);
    const before = session.turns.length;
    const r = await caseTurnAction({ sessionId, text });
    setBusy(null);
    setPending(null);
    if (r.error || !r.session) {
      setDraft(text);
      setError(r.error ?? "Something went wrong.");
      // Rate-limited: nothing is lost - send the same answer again once the wait is over.
      if (r.retryAfter) setTimeout(() => void send(text), (r.retryAfter + 1) * 1000);
      return;
    }
    setSession(r.session);
    sayNew(before + 1, r.session);
  }

  async function moveOn() {
    if (!sessionId || !session) return;
    setBusy("next");
    const before = session.turns.length;
    const r = await caseNextQuestionAction(sessionId);
    setBusy(null);
    if (r.error || !r.session) return setError(r.error ?? "Could not move on.");
    setSession(r.session);
    sayNew(before, r.session);
  }

  async function finish() {
    if (!sessionId) return;
    stopListening();
    window.speechSynthesis?.cancel();
    setBusy("finish");
    setError(null);
    const r = await finishCaseAction(sessionId);
    setBusy(null);
    if (r.error) return setError(r.error);
    setDebrief(r);
    setSession((s) => (s ? { ...s, status: "done" } : s));
  }

  function startListening() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    window.speechSynthesis?.cancel();
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript;
      if (add) setDraft((d) => (d ? `${d.trimEnd()} ${add.trim()}` : add.trim()));
    };
    r.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") setError(`Transcription stopped: ${e.error}.`);
    };
    // Chrome stops after a pause; keep going while the mic is meant to be on.
    r.onend = () => {
      if (listeningRef.current) {
        try {
          r.start();
        } catch {
          /* restarting too quickly - the next onend retries */
        }
      }
    };
    try {
      r.start();
    } catch {
      return;
    }
    recognition.current = r;
    listeningRef.current = true;
    setListening(true);
  }

  function stopListening() {
    listeningRef.current = false;
    setListening(false);
    try {
      recognition.current?.stop();
    } catch {
      /* already stopped */
    }
  }

  // ---- not started ---------------------------------------------------------------------
  if (!session) {
    return (
      <div className={ui.caseIntro}>
        <p className={ui.sub}>
          {sheet.style === "candidate-led" ? "Candidate-led: you drive. " : ""}About {sheet.minutes} minutes ·{" "}
          {sheet.questions.map((q) => KIND_LABEL[q.kind]).join(" → ")}
        </p>
        <BarList title="How to open" steps={OPENING.steps} />
        <div className={ui.actions}>
          <button className={ui.btn} data-primary="" type="button" onClick={start} disabled={busy === "start"}>
            {busy === "start" ? "Starting…" : "Start the interview"}
          </button>
          <label className={ui.toggle}>
            <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Interviewer speaks
          </label>
        </div>
        {error && <p className={ui.warn}>{error}</p>}
      </div>
    );
  }

  const q = sheet.questions[session.index];
  const done = session.status === "done";
  const elapsed = (now - Date.parse(session.turns[0].at)) / 1000;
  const bar = session.index === 0 && !done ? [OPENING, BARS.structure] : [BARS[q.kind]];
  const exhibitFor = (id?: string): Exhibit | undefined => sheet.questions.find((x) => x.id === id)?.exhibit;

  return (
    <div className={ui.caseRoom}>
      <section className={ui.caseMain} aria-label="Interview">
        <ol className={ui.transcript}>
          {session.turns.map((t, i) => (
            <li key={i} className={ui.turn} data-role={t.role}>
              {t.role === "exhibit" ? (
                <ExhibitTable exhibit={exhibitFor(t.questionId)} />
              ) : (
                <>
                  <span className={ui.mono}>{t.role === "interviewer" ? "Interviewer" : "You"}</span>
                  <p>{t.text}</p>
                </>
              )}
            </li>
          ))}
          {pending && (
            <li className={ui.turn} data-role="candidate">
              <span className={ui.mono}>You</span>
              <p>{pending}</p>
            </li>
          )}
          {busy === "turn" && (
            <li className={ui.turn} data-role="interviewer">
              <span className={ui.mono}>Interviewer</span>
              <p className={ui.sub}>…</p>
            </li>
          )}
        </ol>

        {debrief?.scores ? (
          <Debrief sheet={sheet} debrief={debrief} onAgain={start} />
        ) : done ? (
          <div className={ui.callout}>
            <p>That's the end of the case.</p>
            <div className={ui.actions}>
              <button className={ui.btn} data-primary="" type="button" onClick={finish} disabled={busy === "finish"}>
                {busy === "finish" ? "Scoring the interview…" : "Get my feedback"}
              </button>
            </div>
          </div>
        ) : (
          <div className={ui.composer}>
            <textarea
              className={ui.answerBox}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={listening ? "Listening… speak your answer" : "Type or talk. Ctrl+Enter to send."}
              aria-label="Your answer"
              disabled={busy === "turn"}
            />
            <div className={ui.editorFoot}>
              <button className={ui.btn} data-primary="" type="button" onClick={() => void send()} disabled={busy !== null || !draft.trim()}>
                {busy === "turn" ? "Waiting…" : "Send"}
              </button>
              {canListen && (
                <button
                  className={ui.btn}
                  type="button"
                  onClick={listening ? stopListening : startListening}
                  aria-pressed={listening}
                >
                  <span className={ui.recording} data-live={listening ? "" : undefined}>
                    {listening ? "Stop talking" : "Talk"}
                  </span>
                </button>
              )}
              {error && <span className={ui.warn}>{error}</span>}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </section>

      <aside className={ui.caseSide} aria-label="Case progress">
        <div className={ui.caseClock}>
          <span className={ui.mono}>Time</span>
          <b data-over={elapsed > sheet.minutes * 60 ? "" : undefined}>{fmt(elapsed)}</b>
          <span className={ui.sub}>of about {sheet.minutes}:00</span>
        </div>

        <ol className={ui.steps}>
          {sheet.questions.map((x, i) => (
            <li key={x.id} data-state={i < session.index || done ? "done" : i === session.index ? "now" : "next"}>
              {KIND_LABEL[x.kind]}
            </li>
          ))}
        </ol>

        {!done && bar.map((b) => <BarList key={b.label} title={`What good looks like: ${b.label.toLowerCase()}`} steps={b.steps} />)}

        {!done && (
          <div className={ui.actions}>
            <button className={ui.btn} type="button" onClick={moveOn} disabled={busy !== null}>
              {session.index === sheet.questions.length - 1 ? "End the case" : "Move on"}
            </button>
            <button className={ui.btn} type="button" onClick={finish} disabled={busy !== null}>
              {busy === "finish" ? "Scoring…" : "Stop and get feedback"}
            </button>
          </div>
        )}

        <label className={ui.toggle}>
          <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Interviewer speaks
        </label>
        <select className={ui.input} value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Accent">
          {LANGS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>

        <label className={ui.starField}>
          <span className={ui.mono}>Scratchpad (stays on this device)</span>
          <textarea className={ui.answerBox} value={notes} onChange={(e) => saveNotes(e.target.value)} />
        </label>
      </aside>
    </div>
  );
}

function BarList({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className={ui.bar}>
      <p className={ui.mono}>{title}</p>
      <ol>
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </div>
  );
}

function ExhibitTable({ exhibit }: { exhibit?: Exhibit }) {
  if (!exhibit) return null;
  return (
    <figure className={ui.exhibit}>
      <figcaption>{exhibit.title}</figcaption>
      <div className={ui.tablewrap}>
        <table className={ui.table}>
          <thead>
            <tr>
              {exhibit.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exhibit.rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j}>{typeof cell === "number" ? cell.toLocaleString("en-US") : cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {exhibit.note && <p className={ui.sub}>{exhibit.note}</p>}
    </figure>
  );
}

function Debrief({ sheet, debrief, onAgain }: { sheet: CaseSheet; debrief: CaseDebriefResult; onAgain: () => void }) {
  const s = debrief.signals;
  const note = (id: string) => debrief.perQuestion?.find((p) => p.questionId === id)?.note;
  return (
    <div className={ui.callout}>
      <div className={ui.head}>
        <h3>
          {debrief.overall?.toFixed(1)} <span className={ui.sub}>/ 5</span>
        </h3>
        {debrief.model && <span className={ui.mono}>{debrief.model}</span>}
      </div>

      <div className={ui.scoreBars}>
        {CASE_DIMENSIONS.map((d) => (
          <div key={d} className={ui.scoreRow} title={CASE_DIMENSION_HELP[d]}>
            <span className={ui.scoreName}>{d}</span>
            <span className={ui.scoreTrack}>
              <i style={{ width: `${((debrief.scores?.[d] ?? 0) / 5) * 100}%` }} />
            </span>
            <span className={ui.mono}>{debrief.scores?.[d]}</span>
          </div>
        ))}
      </div>

      {s && (
        <div className={ui.chips}>
          <span className={ui.chip} data-tone={s.mathCorrect === s.mathTotal ? "hit" : "gap"}>
            math {s.mathCorrect}/{s.mathTotal}
          </span>
          <span className={ui.chip}>{s.clarifyingQuestions} clarifying questions</span>
          <span className={ui.chip}>
            {s.questionsReached}/{sheet.questions.length} questions in {s.minutes} min
          </span>
        </div>
      )}

      {debrief.strengths && debrief.strengths.length > 0 && (
        <>
          <p className={ui.mono}>What worked</p>
          <ul className={ui.rows}>
            {debrief.strengths.map((x) => (
              <li key={x} className={ui.row}>
                <p>{x}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      {debrief.improvements && debrief.improvements.length > 0 && (
        <>
          <p className={ui.mono}>Do differently next time</p>
          <ul className={ui.rows}>
            {debrief.improvements.map((x) => (
              <li key={x} className={ui.row}>
                <p>{x}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <details className={ui.modelAnswer}>
        <summary>Compare with the model answer</summary>
        {sheet.questions.map((q) => (
          <div key={q.id} className={ui.stack}>
            <p>
              <b>{KIND_LABEL[q.kind]}:</b> {q.ask}
            </p>
            {note(q.id) && <p className={ui.firmNote}>{note(q.id)}</p>}
            {q.keyPoints && (
              <ul>
                {q.keyPoints.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            )}
            {q.ideas && (
              <ul>
                {q.ideas.map((i) => (
                  <li key={i.bucket}>
                    <b>{i.bucket}:</b> {i.items.join("; ")}
                  </li>
                ))}
              </ul>
            )}
            {q.answer && (
              <ul>
                {q.answer.working.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            {q.advanced && (
              <p className={ui.sub}>
                <b>Outstanding answers add:</b> {q.advanced.join(" ")}
              </p>
            )}
          </div>
        ))}
        <div className={ui.stack}>
          <p>
            <b>Recommendation:</b> {sheet.recommendation.answer}
          </p>
          <p className={ui.sub}>
            Reasons: {sheet.recommendation.reasoning.join("; ")}. Risks: {sheet.recommendation.risks.join("; ")}. Next:{" "}
            {sheet.recommendation.next.join("; ")}.
          </p>
        </div>
      </details>

      <div className={ui.actions}>
        <button className={ui.btn} type="button" onClick={onAgain}>
          Try this case again
        </button>
      </div>
    </div>
  );
}
