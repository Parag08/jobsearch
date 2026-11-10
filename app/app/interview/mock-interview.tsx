"use client";

import { useEffect, useRef, useState } from "react";
import { mockFeedbackAction, mockTurnAction, startMockAction, type MockFeedbackResult } from "../actions";
import { MAX_FOLLOW_UPS, MIN_FOLLOW_UPS, TONES, type MockSession, type ProbeKind, type Tone, type Verdict } from "@/lib/interview/mock";
import { ScoreCard } from "./practice-panel";
import { LANGS, recognitionCtor, speak, stopSpeaking, type SpeechRecognitionLike } from "./speech";
import ui from "../ui.module.css";

/**
 * A behavioural mock interview: the interviewer asks, you answer, it pushes back and asks
 * follow-ups, and you get feedback at the end. Code picks what to probe and when to stop
 * (lib/interview/mock.ts); the model only phrases each follow-up.
 *
 * Hands-free: the interviewer speaks (ElevenLabs when configured, else the browser), then the
 * page listens; when you go quiet for a moment your answer is sent. You can always type.
 * The browser transcribes (Chrome/Edge send the audio to Google's/Microsoft's speech
 * service); JobSearch receives only text, and only the interviewer's lines go to ElevenLabs.
 */

/** How long a pause counts as "finished answering" in hands-free mode. */
const SILENCE_MS = 2500;

const TONE_LABEL: Record<Tone, string> = { friendly: "Friendly", neutral: "Neutral", tough: "Tough (sceptical partner)" };
const PROBE_LABEL: Record<ProbeKind, string> = {
  numbers: "Number check",
  ownership: "What you did",
  result: "The result",
  specificity: "Specifics",
  reflection: "Reflection",
  depth: "Judgement",
};
const VERDICT_LABEL: Record<Verdict, string> = { held: "held up", partial: "partly", weak: "did not hold" };

type Busy = "start" | "turn" | "feedback" | null;

export function MockInterview({ questionId, firm }: { questionId: string; firm: string }) {
  const [tone, setTone] = useState<Tone>("neutral");
  const [maxFollowUps, setMaxFollowUps] = useState(3);
  const [voice, setVoice] = useState(true);
  const [handsFree, setHandsFree] = useState(true);
  const [lang, setLang] = useState("en-US");
  const [canListen, setCanListen] = useState(false);

  const [session, setSession] = useState<MockSession | null>(null);
  const [draft, setDraft] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<MockFeedbackResult | null>(null);

  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const silence = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef("");
  const sessionRef = useRef<MockSession | null>(null);
  const handsFreeRef = useRef(handsFree);
  const endRef = useRef<HTMLDivElement>(null);

  draftRef.current = draft;
  sessionRef.current = session;
  handsFreeRef.current = handsFree;

  useEffect(() => {
    setCanListen(recognitionCtor() !== null);
    if (LANGS.some((l) => l.id === navigator.language)) setLang(navigator.language);
  }, []);

  // A new question starts clean.
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  useEffect(() => () => reset(), []);

  const turnCount = session?.turns.length ?? 0;
  useEffect(() => {
    if (turnCount > 1) endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turnCount, busy, feedback]);

  function reset() {
    stopListening();
    stopSpeaking();
    setSession(null);
    setDraft("");
    setInterim("");
    setBusy(null);
    setError(null);
    setFeedback(null);
  }

  function clearSilence() {
    if (silence.current) clearTimeout(silence.current);
    silence.current = null;
  }

  function stopListening() {
    clearSilence();
    listeningRef.current = false;
    setListening(false);
    setInterim("");
    try {
      recognition.current?.stop();
    } catch {
      /* already stopped */
    }
  }

  function startListening() {
    const Ctor = recognitionCtor();
    if (!Ctor || listeningRef.current) return;
    stopSpeaking();
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let add = "";
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) add += res[0].transcript;
        else live += res[0].transcript;
      }
      if (add.trim()) setDraft((d) => (d ? `${d.trimEnd()} ${add.trim()}` : add.trim()));
      setInterim(live);
      // Every bit of speech pushes the "you've finished" moment back.
      clearSilence();
      if (handsFreeRef.current) {
        silence.current = setTimeout(() => {
          if (draftRef.current.trim()) void send();
        }, SILENCE_MS);
      }
    };
    r.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") setError(`Transcription stopped: ${e.error}.`);
    };
    // Chrome ends recognition after a pause; carry on while we are still listening.
    r.onend = () => {
      if (listeningRef.current) {
        try {
          r.start();
        } catch {
          /* restarting too quickly - the next onend retries */
        }
      }
    };
    recognition.current = r;
    listeningRef.current = true;
    setListening(true);
    r.start();
  }

  /** Say the interviewer's new line; in hands-free mode, listen once it has finished. */
  async function interviewerSays(text: string) {
    if (voice) await speak(text, lang);
    if (handsFreeRef.current && canListen && sessionRef.current?.status === "running") startListening();
  }

  async function start() {
    reset();
    setBusy("start");
    const r = await startMockAction({ questionId, tone, maxFollowUps });
    setBusy(null);
    if (r.error || !r.session) return setError(r.error ?? "Could not start.");
    setSession(r.session);
    sessionRef.current = r.session;
    void interviewerSays(r.session.turns[0].text);
  }

  async function send() {
    const s = sessionRef.current;
    const answer = draftRef.current.trim();
    if (!s || !answer || s.status === "done") return;
    stopListening();
    setBusy("turn");
    setError(null);
    const r = await mockTurnAction({ session: s, answer, firm });
    if (r.retryAfter) {
      setError(r.error ?? null);
      setTimeout(() => void send(), r.retryAfter * 1000);
      return;
    }
    setBusy(null);
    if (r.error || !r.session) return setError(r.error ?? "The interviewer lost the thread.");
    setDraft("");
    setSession(r.session);
    sessionRef.current = r.session;
    const last = r.session.turns[r.session.turns.length - 1];
    if (r.session.status === "done") {
      if (voice) void speak(last.text, lang);
      void getFeedback(r.session);
    } else {
      void interviewerSays(last.text);
    }
  }

  async function getFeedback(s = sessionRef.current) {
    if (!s) return;
    stopListening();
    setBusy("feedback");
    setError(null);
    const answer = s.status === "running" ? draftRef.current.trim() : undefined;
    const r = await mockFeedbackAction({ session: s, answer, firm });
    setBusy(null);
    if (r.session) {
      setSession(r.session);
      sessionRef.current = r.session;
    }
    if (answer) setDraft("");
    if (r.error) return setError(r.error);
    setFeedback(r);
  }

  if (!session) {
    return (
      <div className={ui.stack}>
        <div className={ui.actions}>
          <label className={ui.toggle}>
            Interviewer
            <select className={ui.input} value={tone} onChange={(e) => setTone(e.target.value as Tone)} aria-label="Interviewer style">
              {TONES.map((t) => (
                <option key={t} value={t}>
                  {TONE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className={ui.toggle}>
            Follow-ups
            <select
              className={ui.input}
              value={maxFollowUps}
              onChange={(e) => setMaxFollowUps(Number(e.target.value))}
              aria-label="Most follow-up questions"
            >
              {Array.from({ length: MAX_FOLLOW_UPS - MIN_FOLLOW_UPS + 1 }, (_, i) => MIN_FOLLOW_UPS + i).map((n) => (
                <option key={n} value={n}>
                  up to {n}
                </option>
              ))}
            </select>
          </label>
          <select className={ui.input} value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Accent">
            {LANGS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <div className={ui.actions}>
          <button className={ui.btn} data-primary="" type="button" onClick={start} disabled={busy === "start"}>
            {busy === "start" ? "Starting…" : "Start the interview"}
          </button>
          <label className={ui.toggle}>
            <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Interviewer speaks
          </label>
          {canListen && (
            <label className={ui.toggle}>
              <input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} /> Hands-free
            </label>
          )}
        </div>
        <p className={ui.sub}>
          {handsFree && canListen
            ? "Answer out loud. When you pause for a few seconds your answer is sent, and the interviewer follows up."
            : "Type or talk, then send. The interviewer follows up on what you said."}{" "}
          Feedback comes at the end.
        </p>
        {error && <p className={ui.warn}>{error}</p>}
      </div>
    );
  }

  const done = session.status === "done";
  const answered = session.turns.some((t) => t.role === "candidate");

  return (
    <div className={ui.stack}>
      <ol className={ui.transcript}>
        {session.turns.map((t, i) => (
          <li key={i} className={ui.turn} data-role={t.role}>
            <span className={ui.mono}>
              {t.role === "interviewer" ? "Interviewer" : "You"}
              {t.probe ? ` · ${PROBE_LABEL[t.probe]}` : ""}
            </span>
            <p>{t.text}</p>
          </li>
        ))}
        {busy === "turn" && (
          <li className={ui.turn} data-role="interviewer">
            <span className={ui.mono}>Interviewer</span>
            <p className={ui.sub}>…</p>
          </li>
        )}
      </ol>

      {feedback?.scores ? (
        <>
          {feedback.followUps && feedback.followUps.length > 0 && (
            <div className={ui.callout}>
              <p className={ui.mono}>How you handled the follow-ups</p>
              <ul className={ui.rows}>
                {feedback.followUps.map((f) => (
                  <li key={f.probe} className={ui.row}>
                    <p>{f.note}</p>
                    <span className={ui.chip} data-tone={f.verdict === "held" ? "hit" : f.verdict === "weak" ? "gap" : undefined}>
                      {PROBE_LABEL[f.probe]}: {VERDICT_LABEL[f.verdict]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ScoreCard result={feedback} />
          <div className={ui.actions}>
            <button className={ui.btn} data-primary="" type="button" onClick={start}>
              Try this question again
            </button>
          </div>
        </>
      ) : done ? (
        <div className={ui.callout}>
          <p>{busy === "feedback" ? "Writing your feedback…" : "That's the end of this question."}</p>
          {busy !== "feedback" && (
            <div className={ui.actions}>
              <button className={ui.btn} data-primary="" type="button" onClick={() => void getFeedback()}>
                Get my feedback
              </button>
            </div>
          )}
          {error && <p className={ui.warn}>{error}</p>}
        </div>
      ) : (
        <div className={ui.composer}>
          <textarea
            className={ui.answerBox}
            value={interim ? `${draft} ${interim}`.trim() : draft}
            onChange={(e) => {
              setDraft(e.target.value);
              clearSilence();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={listening ? "Listening… answer out loud" : "Type or talk. Ctrl+Enter to send."}
            aria-label="Your answer"
            disabled={busy !== null}
          />
          <div className={ui.editorFoot}>
            <button className={ui.btn} data-primary="" type="button" onClick={() => void send()} disabled={busy !== null || !draft.trim()}>
              {busy === "turn" ? "Waiting…" : "Send"}
            </button>
            {canListen && (
              <button className={ui.btn} type="button" onClick={listening ? stopListening : startListening} aria-pressed={listening} disabled={busy !== null}>
                <span className={ui.recording} data-live={listening ? "" : undefined}>
                  {listening ? "Stop talking" : "Talk"}
                </span>
              </button>
            )}
            <button className={ui.btn} type="button" onClick={() => void getFeedback()} disabled={busy !== null || (!answered && !draft.trim())}>
              {busy === "feedback" ? "Writing feedback…" : "Finish and get feedback"}
            </button>
            {error && <span className={ui.warn}>{error}</span>}
          </div>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
