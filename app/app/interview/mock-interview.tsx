"use client";

import { useEffect, useRef, useState } from "react";
import { mockFeedbackAction, mockTurnAction, startMockAction, type MockFeedbackResult } from "../actions";
import { MAX_FOLLOW_UPS, MIN_FOLLOW_UPS, TONES, type MockSession, type ProbeKind, type Tone, type Verdict } from "@/lib/interview/mock";
import { agentState, captionWindow, rmsLevel, type AgentState } from "@/lib/interview/agent";
import { ScoreCard } from "./practice-panel";
import { AgentAvatar } from "./agent-avatar";
import {
  LANGS,
  onSpeakingChange,
  openMicLevel,
  primeAudio,
  recognitionCtor,
  speak,
  speechActivity,
  stopSpeaking,
  type SpeechRecognitionLike,
} from "./speech";
import ui from "../ui.module.css";

/**
 * A behavioural mock interview that feels like a call: an AI interviewer (a Three.js agent)
 * on a stage, live captions instead of a chat log, a mic meter for you, and meeting
 * controls. It asks, you answer, it pushes back with follow-ups, and you get feedback at
 * the end. Code picks what to probe and when to stop (lib/interview/mock.ts); the model
 * only phrases each follow-up.
 *
 * Hands-free: the interviewer speaks (ElevenLabs when configured, else the browser), then the
 * page listens; when you go quiet for a moment your answer is sent. You can always type.
 * The browser transcribes (Chrome/Edge send the audio to Google's/Microsoft's speech
 * service); JobSearch receives only text, and only the interviewer's lines go to ElevenLabs.
 * The mic meter reads loudness in the page; that audio goes nowhere.
 */

/** How long a pause counts as "finished answering" in hands-free mode. */
const SILENCE_MS = 2500;
/** Said once when you join, before the question - a meeting opens with a hello. */
const GREETING = "Hi, thanks for joining. Let's get started.";

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
const STATE_LABEL: Record<AgentState, string> = {
  idle: "Your turn",
  listening: "Listening",
  thinking: "Thinking…",
  speaking: "Speaking",
  done: "Interview over",
};

type Busy = "start" | "turn" | "feedback" | null;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

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
  const [speaking, setSpeakingState] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<MockFeedbackResult | null>(null);
  const [showCaptions, setShowCaptions] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [typing, setTyping] = useState(false);
  const [caption, setCaption] = useState<{ who: "Interviewer" | "You"; text: string } | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [clock, setClock] = useState(0);

  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const busyRef = useRef<Busy>(null);
  const silence = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef("");
  const interimRef = useRef("");
  const sessionRef = useRef<MockSession | null>(null);
  const handsFreeRef = useRef(handsFree);
  const mic = useRef<{ level: () => number; close: () => void } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  draftRef.current = draft;
  interimRef.current = interim;
  sessionRef.current = session;
  handsFreeRef.current = handsFree;
  busyRef.current = busy;

  useEffect(() => {
    setCanListen(recognitionCtor() !== null);
    if (LANGS.some((l) => l.id === navigator.language)) setLang(navigator.language);
    return onSpeakingChange(setSpeakingState);
  }, []);

  // A new question starts clean.
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  useEffect(() => () => reset(), []);

  // Captions, the mic meter and the clock refresh ~10 times a second while in the room.
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => {
      const a = speechActivity(rmsLevel);
      if (a.speaking && a.text) setCaption({ who: "Interviewer", text: captionWindow(a.text, a.progress) });
      else if (listeningRef.current && (interimRef.current || draftRef.current)) {
        setCaption({ who: "You", text: captionWindow(`${draftRef.current} ${interimRef.current}`.trim(), 1, 14) });
      } else {
        // Silent voice, or between turns: the interviewer's last line stays up, like a
        // caption that has not been replaced yet - otherwise a muted interview has no question.
        const last = [...(sessionRef.current?.turns ?? [])].reverse().find((t) => t.role === "interviewer");
        setCaption(last ? { who: "Interviewer", text: last.text } : null);
      }
      setMicLevel(mic.current ? mic.current.level() : 0);
      if (startedAt) setClock((Date.now() - startedAt) / 1000);
    }, 100);
    return () => clearInterval(id);
  }, [session, startedAt]);

  useEffect(() => {
    if (feedback) endRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [feedback]);

  // What the avatar reads every frame - refs, so React never re-renders to animate.
  const getAgentState = (): AgentState =>
    agentState({
      ended: sessionRef.current?.status === "done" && busyRef.current !== "feedback",
      busy: busyRef.current === "turn" || busyRef.current === "feedback" || busyRef.current === "start",
      speaking: speechActivity(rmsLevel).speaking,
      listening: listeningRef.current,
    });
  const getLevel = (): number => {
    const a = speechActivity(rmsLevel);
    if (a.speaking) return a.level;
    return mic.current ? mic.current.level() : 0;
  };

  function reset() {
    stopListening();
    stopSpeaking();
    setSession(null);
    setDraft("");
    setInterim("");
    setBusy(null);
    setError(null);
    setFeedback(null);
    setCaption(null);
    setStartedAt(null);
    setClock(0);
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
    mic.current?.close();
    mic.current = null;
    setMicLevel(0);
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
    void openMicLevel(rmsLevel).then((m) => {
      if (m && listeningRef.current) mic.current = m;
      else m?.close();
    });
  }

  /** Say the interviewer's new line; in hands-free mode, listen once it has finished. */
  async function interviewerSays(text: string) {
    if (voice) await speak(text, lang);
    if (handsFreeRef.current && canListen && !typing && sessionRef.current?.status === "running") startListening();
  }

  async function start() {
    reset();
    primeAudio(); // inside the click, so the voice can drive the avatar
    setBusy("start");
    const r = await startMockAction({ questionId, tone, maxFollowUps });
    setBusy(null);
    if (r.error || !r.session) return setError(r.error ?? "Could not start.");
    setSession(r.session);
    sessionRef.current = r.session;
    setStartedAt(Date.now());
    void interviewerSays(voice ? `${GREETING} ${r.session.turns[0].text}` : r.session.turns[0].text);
  }

  async function send() {
    const s = sessionRef.current;
    const answer = `${draftRef.current} ${interimRef.current}`.trim();
    if (!s || !answer || s.status === "done" || busyRef.current) return;
    stopListening();
    setBusy("turn");
    busyRef.current = "turn";
    setError(null);
    const r = await mockTurnAction({ session: s, answer, firm });
    if (r.retryAfter) {
      setError(r.error ?? null);
      setBusy(null);
      busyRef.current = null;
      setTimeout(() => void send(), r.retryAfter * 1000);
      return;
    }
    setBusy(null);
    busyRef.current = null;
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
    busyRef.current = "feedback";
    setError(null);
    const answer = s.status === "running" ? `${draftRef.current} ${interimRef.current}`.trim() : undefined;
    const r = await mockFeedbackAction({ session: s, answer: answer || undefined, firm });
    setBusy(null);
    busyRef.current = null;
    if (r.session) {
      setSession(r.session);
      sessionRef.current = r.session;
    }
    if (answer) setDraft("");
    if (r.error) return setError(r.error);
    setFeedback(r);
  }

  // ---- the lobby ---------------------------------------------------------------------
  if (!session) {
    return (
      <div className={ui.meeting}>
        <div className={ui.stage} data-size="lobby">
          <AgentAvatar getState={() => (busy === "start" ? "thinking" : "idle")} getLevel={() => 0} label="AI interviewer, waiting" />
          <div className={ui.stageTop}>
            <span className={ui.agentName}>AI interviewer</span>
            <span className={ui.statusPill} data-state="idle">
              Ready when you are
            </span>
          </div>
        </div>

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
            {busy === "start" ? "Joining…" : "Join the interview"}
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
            ? "Answer out loud, as you would on a call. Pause for a few seconds and the interviewer follows up."
            : "Type or talk, then send. The interviewer follows up on what you said."}{" "}
          Feedback comes at the end.
        </p>
        {error && <p className={ui.warn}>{error}</p>}
      </div>
    );
  }

  // ---- the room ----------------------------------------------------------------------
  const done = session.status === "done";
  const answered = session.turns.some((t) => t.role === "candidate");
  const live = agentState({ ended: done && busy !== "feedback", busy: busy !== null, speaking, listening });
  const followUps = session.turns.filter((t) => t.probe).length;
  const bars = [0.15, 0.35, 0.6, 0.85];

  return (
    <div className={ui.meeting}>
      <div className={ui.stage} data-state={live}>
        <AgentAvatar getState={getAgentState} getLevel={getLevel} label={`AI interviewer, ${STATE_LABEL[live].toLowerCase()}`} />

        <div className={ui.stageTop}>
          <span className={ui.agentName}>AI interviewer</span>
          <span className={ui.statusPill} data-state={live} aria-live="polite">
            {busy === "feedback" ? "Writing your feedback…" : STATE_LABEL[live]}
          </span>
          <span className={ui.stageClock}>
            {fmt(clock)} · follow-up {Math.min(followUps, session.maxFollowUps)}/{session.maxFollowUps}
          </span>
        </div>

        {showCaptions && caption && caption.text && (
          <p className={ui.caption} aria-live="off">
            <b>{caption.who}</b> {caption.text}
          </p>
        )}

        <div className={ui.selfTile} data-live={listening ? "" : undefined}>
          <span>You</span>
          <span className={ui.micBars} aria-label={listening ? "Microphone on" : "Microphone off"}>
            {bars.map((b) => (
              <i key={b} data-on={listening && micLevel > b ? "" : undefined} />
            ))}
          </span>
          <span className={ui.sub}>{listening ? "mic on" : "mic off"}</span>
        </div>
      </div>

      {!done && (
        <div className={ui.controls}>
          {canListen && (
            <button
              className={ui.btn}
              data-primary={listening ? "" : undefined}
              type="button"
              onClick={listening ? stopListening : startListening}
              aria-pressed={listening}
              disabled={busy !== null}
            >
              <span className={ui.recording} data-live={listening ? "" : undefined}>
                {listening ? "Mute" : "Unmute"}
              </span>
            </button>
          )}
          <button className={ui.btn} type="button" onClick={() => void send()} disabled={busy !== null || !`${draft}${interim}`.trim()}>
            {busy === "turn" ? "Waiting…" : "Done answering"}
          </button>
          <button className={ui.btn} type="button" aria-pressed={typing} onClick={() => setTyping((t) => !t)}>
            {typing ? "Hide keyboard" : "Type instead"}
          </button>
          <button className={ui.btn} type="button" aria-pressed={showCaptions} onClick={() => setShowCaptions((c) => !c)}>
            Captions {showCaptions ? "on" : "off"}
          </button>
          <button className={ui.btn} type="button" aria-pressed={showTranscript} onClick={() => setShowTranscript((t) => !t)}>
            Transcript
          </button>
          <button className={ui.btn} type="button" onClick={() => void getFeedback()} disabled={busy !== null || (!answered && !draft.trim())}>
            End and get feedback
          </button>
        </div>
      )}

      {typing && !done && (
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
            placeholder="Type your answer. Ctrl+Enter to send."
            aria-label="Your answer"
            disabled={busy !== null}
          />
        </div>
      )}

      {error && <p className={ui.warn}>{error}</p>}

      {showTranscript && (
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
        </ol>
      )}

      <div ref={endRef} />
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
            <button className={ui.btn} type="button" onClick={() => setShowTranscript((t) => !t)}>
              {showTranscript ? "Hide transcript" : "Read the transcript"}
            </button>
          </div>
        </>
      ) : (
        done &&
        busy !== "feedback" && (
          <div className={ui.actions}>
            <button className={ui.btn} data-primary="" type="button" onClick={() => void getFeedback()}>
              Get my feedback
            </button>
          </div>
        )
      )}
    </div>
  );
}
