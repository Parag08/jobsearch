"use client";

import { useEffect, useRef, useState } from "react";
import { mockFeedbackAction, mockTurnAction, startMockAction, type MockFeedbackResult } from "../actions";
import { MAX_FOLLOW_UPS, MIN_FOLLOW_UPS, TONES, type MockSession, type ProbeKind, type Tone, type Verdict } from "@/lib/interview/mock";
import { agentState, captionWindow, rmsLevel, type AgentState } from "@/lib/interview/agent";
import { combineVoice, deliveryNotes, pitchHz, summarizeVoice, type VoiceFrame, type VoiceSummary } from "@/lib/interview/voice";
import { ScoreCard } from "./score-card";
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
  type MicMeter,
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

const SETTINGS_KEY = "jobsearch.mock-interview";
/** One loudness + pitch reading every 50ms while you speak. */
const VOICE_FRAME_MS = 50;
interface Settings {
  tone: Tone;
  maxFollowUps: number;
  voice: boolean;
  handsFree: boolean;
  lang: string;
}

/** Small line icons for the meeting controls, in currentColor. */
const ICON: Record<string, React.ReactNode> = {
  mic: <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v2" />,
  micOff: <path d="M15 9.3V6a3 3 0 0 0-5.7-1.3M9 9v3a3 3 0 0 0 5.1 2.1M19 12a7 7 0 0 1-1.2 3.9M5 12a7 7 0 0 0 11.3 5.5M12 19v2M4 4l16 16" />,
  keyboard: <path d="M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M7 14h10" />,
  captions: <path d="M3 6h18v12H3zM10 10.5a2 2 0 1 0 0 3M16 10.5a2 2 0 1 0 0 3" />,
  transcript: <path d="M5 6h14M5 10h14M5 14h9M5 18h6" />,
  send: <path d="M4 12h14M13 6l6 6-6 6" />,
  settings: <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm7.4 3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z" />,
};

function Icon({ name }: { name: keyof typeof ICON }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON[name]}
    </svg>
  );
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function MockInterview({ questionId }: { questionId: string }) {
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
  const [settingsOpen, setSettingsOpen] = useState(false);

  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const busyRef = useRef<Busy>(null);
  const silence = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef("");
  const interimRef = useRef("");
  const sessionRef = useRef<MockSession | null>(null);
  const handsFreeRef = useRef(handsFree);
  const mic = useRef<MicMeter | null>(null);
  // Delivery: numbers per frame while you speak (never audio), one summary per spoken answer.
  const voiceFrames = useRef<VoiceFrame[]>([]);
  const voiceClock = useRef<{ start: number; timer: ReturnType<typeof setInterval> | null }>({ start: 0, timer: null });
  const spoken = useRef<VoiceSummary[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  draftRef.current = draft;
  interimRef.current = interim;
  sessionRef.current = session;
  handsFreeRef.current = handsFree;
  busyRef.current = busy;

  useEffect(() => {
    setCanListen(recognitionCtor() !== null);
    if (LANGS.some((l) => l.id === navigator.language)) setLang(navigator.language);
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<Settings> | null;
      if (saved) {
        if (saved.tone && TONES.includes(saved.tone)) setTone(saved.tone);
        if (typeof saved.maxFollowUps === "number" && saved.maxFollowUps >= MIN_FOLLOW_UPS && saved.maxFollowUps <= MAX_FOLLOW_UPS)
          setMaxFollowUps(saved.maxFollowUps);
        if (typeof saved.voice === "boolean") setVoice(saved.voice);
        if (typeof saved.handsFree === "boolean") setHandsFree(saved.handsFree);
        if (saved.lang && LANGS.some((l) => l.id === saved.lang)) setLang(saved.lang);
      }
    } catch {
      /* private mode or bad JSON - defaults are fine */
    }
    return onSpeakingChange(setSpeakingState);
  }, []);

  // Your interview settings are remembered on this device.
  const remember = (next: Partial<Settings>) => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ tone, maxFollowUps, voice, handsFree, lang, ...next }));
    } catch {
      /* not fatal */
    }
  };

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
    voiceFrames.current = [];
    spoken.current = [];
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
    if (voiceClock.current.timer) clearInterval(voiceClock.current.timer);
    voiceClock.current.timer = null;
    mic.current?.close();
    mic.current = null;
    setMicLevel(0);
  }

  /** This answer's delivery, from the frames so far. Committed only once the answer is accepted. */
  function voiceFor(answer: string): VoiceSummary | null {
    const words = answer.split(/\s+/).filter(Boolean).length;
    return summarizeVoice(voiceFrames.current, VOICE_FRAME_MS, words);
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
    void openMicLevel(rmsLevel, pitchHz).then((m) => {
      if (!m || !listeningRef.current) return m?.close();
      mic.current = m;
      // Frame times run on across mute/unmute within one answer.
      if (!voiceFrames.current.length) voiceClock.current.start = performance.now();
      voiceClock.current.timer = setInterval(() => {
        if (!mic.current) return;
        voiceFrames.current.push({ t: performance.now() - voiceClock.current.start, ...mic.current.sample() });
      }, VOICE_FRAME_MS);
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
    const v = voiceFor(answer);
    setBusy("turn");
    busyRef.current = "turn";
    setError(null);
    const r = await mockTurnAction({ session: s, answer });
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
    if (v) spoken.current.push(v);
    voiceFrames.current = [];
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
    const v = answer ? voiceFor(answer) : null;
    const voiceSummary = combineVoice(v ? [...spoken.current, v] : spoken.current);
    const r = await mockFeedbackAction({ session: s, answer: answer || undefined, voice: voiceSummary });
    setBusy(null);
    busyRef.current = null;
    if (r.session) {
      setSession(r.session);
      sessionRef.current = r.session;
    }
    if (answer) setDraft("");
    if (r.error) return setError(r.error);
    if (v) spoken.current.push(v);
    voiceFrames.current = [];
    setFeedback(r);
  }

  const settingsPanel = (
    <div className={ui.settings} id="mock-settings">
      <label className={ui.toggle}>
        Interviewer
        <select
          className={ui.input}
          value={tone}
          onChange={(e) => {
            setTone(e.target.value as Tone);
            remember({ tone: e.target.value as Tone });
          }}
          aria-label="Interviewer style"
        >
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
          onChange={(e) => {
            setMaxFollowUps(Number(e.target.value));
            remember({ maxFollowUps: Number(e.target.value) });
          }}
          aria-label="Most follow-up questions"
        >
          {Array.from({ length: MAX_FOLLOW_UPS - MIN_FOLLOW_UPS + 1 }, (_, i) => MIN_FOLLOW_UPS + i).map((n) => (
            <option key={n} value={n}>
              {n === 0 ? "none (one answer)" : `up to ${n}`}
            </option>
          ))}
        </select>
      </label>
      <label className={ui.toggle}>
        Accent
        <select
          className={ui.input}
          value={lang}
          onChange={(e) => {
            setLang(e.target.value);
            remember({ lang: e.target.value });
          }}
          aria-label="Accent"
        >
          {LANGS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <label className={ui.toggle}>
        <input
          type="checkbox"
          checked={voice}
          onChange={(e) => {
            setVoice(e.target.checked);
            remember({ voice: e.target.checked });
          }}
        />{" "}
        Interviewer speaks
      </label>
      {canListen && (
        <label className={ui.toggle}>
          <input
            type="checkbox"
            checked={handsFree}
            onChange={(e) => {
              setHandsFree(e.target.checked);
              remember({ handsFree: e.target.checked });
            }}
          />{" "}
          Hands-free
        </label>
      )}
    </div>
  );

  // ---- the lobby ---------------------------------------------------------------------
  if (!session) {
    return (
      <div className={ui.meeting}>
        <div className={ui.stage} data-size="lobby">
          <AgentAvatar getState={() => "idle"} getLevel={() => 0} label="AI interviewer, waiting" lift={0.55} />
          <div className={ui.stageTop}>
            <span className={ui.agentName}>AI interviewer</span>
            <span className={ui.status} data-state="idle">
              {TONE_LABEL[tone].split(" ")[0]} · {maxFollowUps === 0 ? "no follow-ups" : `up to ${maxFollowUps} follow-ups`}
            </span>
            <button
              className={ui.iconBtn}
              type="button"
              onClick={() => setSettingsOpen((o) => !o)}
              aria-expanded={settingsOpen}
              aria-controls="mock-settings"
              title="Interview settings"
              aria-label="Interview settings"
            >
              <Icon name="settings" />
            </button>
          </div>
          <div className={ui.join}>
            <button className={ui.btn} data-primary="" type="button" onClick={start} disabled={busy === "start"}>
              {busy === "start" ? "Joining…" : "Join interview"}
            </button>
            <p>{handsFree && canListen ? "Answer out loud. Pause, and I'll follow up." : "Type or talk, then send. I'll follow up."}</p>
          </div>
        </div>
        {settingsOpen && settingsPanel}
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
  const hasAnswer = Boolean(`${draft}${interim}`.trim());
  const showDone = !done && (typing || !handsFree || !canListen) && hasAnswer;

  return (
    <div className={ui.meeting}>
      <div className={ui.stage} data-state={live}>
        <AgentAvatar getState={getAgentState} getLevel={getLevel} label={`AI interviewer, ${STATE_LABEL[live].toLowerCase()}`} />

        <div className={ui.stageTop}>
          <span className={ui.agentName}>AI interviewer</span>
          <span className={ui.status} data-state={live} aria-live="polite">
            {busy === "feedback" ? "Writing your feedback…" : STATE_LABEL[live]}
          </span>
          <span className={ui.stageClock}>
            {fmt(clock)}
            {session.maxFollowUps > 0 && ` · ${Math.min(followUps, session.maxFollowUps)}/${session.maxFollowUps}`}
          </span>
        </div>

        {showCaptions && caption && caption.text && (
          <p className={ui.caption} aria-live="off">
            <b>{caption.who}</b> {caption.text}
          </p>
        )}

        {!done && (
          <div className={ui.callBar}>
            {canListen && (
              <button
                className={ui.iconBtn}
                type="button"
                data-on={listening ? "" : undefined}
                onClick={listening ? stopListening : startListening}
                aria-pressed={listening}
                disabled={busy !== null}
                title={listening ? "Mute" : "Unmute"}
                aria-label={listening ? "Mute microphone" : "Unmute microphone"}
              >
                <Icon name={listening ? "mic" : "micOff"} />
                <span className={ui.micBars} aria-hidden="true">
                  {bars.map((b) => (
                    <i key={b} data-on={listening && micLevel > b ? "" : undefined} />
                  ))}
                </span>
              </button>
            )}
            <button
              className={ui.iconBtn}
              type="button"
              aria-pressed={typing}
              data-on={typing ? "" : undefined}
              onClick={() => setTyping((t) => !t)}
              title={typing ? "Hide keyboard" : "Type instead"}
              aria-label={typing ? "Hide keyboard" : "Type instead"}
            >
              <Icon name="keyboard" />
            </button>
            <button
              className={ui.iconBtn}
              type="button"
              aria-pressed={showCaptions}
              data-on={showCaptions ? "" : undefined}
              onClick={() => setShowCaptions((c) => !c)}
              title={showCaptions ? "Hide captions" : "Show captions"}
              aria-label={showCaptions ? "Hide captions" : "Show captions"}
            >
              <Icon name="captions" />
            </button>
            <button
              className={ui.iconBtn}
              type="button"
              aria-pressed={showTranscript}
              data-on={showTranscript ? "" : undefined}
              onClick={() => setShowTranscript((t) => !t)}
              title="Transcript"
              aria-label="Show transcript"
            >
              <Icon name="transcript" />
            </button>
            {showDone && (
              <button className={ui.btn} data-primary="" type="button" onClick={() => void send()} disabled={busy !== null}>
                {busy === "turn" ? "Waiting…" : "Done answering"}
              </button>
            )}
            <span className={ui.callBarGap} />
            <button
              className={ui.btn}
              type="button"
              onClick={() => void getFeedback()}
              disabled={busy !== null || (!answered && !hasAnswer)}
            >
              End
            </button>
          </div>
        )}
      </div>

      {typing && !done && (
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
          {(feedback.voice || (feedback.hedges && Object.keys(feedback.hedges).length > 0)) && (
            <div className={ui.callout}>
              <p className={ui.mono}>Delivery - measured from your voice</p>
              {feedback.voice ? (
                <ul className={ui.rows}>
                  {deliveryNotes(feedback.voice, feedback.hedges ?? {}).map((n) => (
                    <li key={n.kind} className={ui.row}>
                      <p>{n.text}</p>
                      <span className={ui.chip} data-tone={n.tone}>
                        {n.kind}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={ui.sub}>You typed your answers, so there is no voice to measure - only the words.</p>
              )}
              <p className={ui.sub}>Measured in your browser. Only these numbers were sent - never your voice.</p>
            </div>
          )}
          <ScoreCard result={feedback} />
          <div className={ui.actions}>
            <button className={ui.btn} data-primary="" type="button" onClick={start}>
              Try again
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
