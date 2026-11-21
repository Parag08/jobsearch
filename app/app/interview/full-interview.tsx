"use client";

import { useEffect, useRef, useState } from "react";
import {
  finishFullAction,
  fullDebriefAction,
  fullTurnAction,
  resumeFullAction,
  startFullAction,
  type FullDebriefResult,
} from "./full-actions";
import { canScoreFull, topicsAsked, type FullSession } from "@/lib/interview/full-session";
import { PROBE_KINDS, TONES, type ProbeKind, type Tone, type Verdict } from "@/lib/interview/mock";
import { agentState, captionWindow, rmsLevel, type AgentState } from "@/lib/interview/agent";
import { combineVoice, deliveryNotes, FILLERS_PER_100_LIMIT, pitchHz, summarizeVoice, type VoiceFrame, type VoiceSummary } from "@/lib/interview/voice";
import { outOfFive } from "@/lib/interview/score";
import { endOfTurnMs, shouldCutIn, type TurnSettings } from "@/lib/interview/turn-taking";
import type { FullInterviewCard } from "@/lib/services/full-interview";
import { AgentAvatar } from "./agent-avatar";
import { ScoreCard } from "./score-card";
import { LANGS, onSpeakingChange, openMicLevel, primeAudio, recognitionCtor, speak, speechActivity, stopSpeaking, type MicMeter, type SpeechRecognitionLike } from "./speech";
import ui from "../ui.module.css";

/**
 * The full mock interview (docs/FULL-INTERVIEW.md): one application's round, many topics, one
 * debrief. Same room as the single-question mock - the avatar, voice, hands-free mic, captions
 * and delivery metrics - but the interviewer moves through the round, choosing each next
 * question from what code allows after your answer. The agenda is not shown during the call (a
 * real interviewer does not show it); the debrief shows the path taken.
 *
 * The session is saved on the server after every turn, so a refresh can resume it.
 *
 * Turn-taking (lib/interview/turn-taking.ts): hands-free ends an answer on a silence whose length
 * depends on whether it sounds finished, and only once the mic is quiet too; a long ramble gets
 * cut in on. Each turn logs "[interview-latency]" to the console: from your last word to the
 * interviewer's voice, split into the end-of-turn wait, the server and the voice.
 */

const VOICE_FRAME_MS = 50;
const SETTINGS_KEY = "jobsearch.mock-interview";
const GREETING = "Hi, thanks for making the time. Let's get started.";

const TONE_LABEL: Record<Tone, string> = { friendly: "Friendly", neutral: "Neutral", tough: "Tough" };
const PROBE_LABEL: Record<ProbeKind, string> = {
  numbers: "Number check",
  ownership: "What you did",
  result: "The result",
  specificity: "Specifics",
  reflection: "Reflection",
  depth: "Judgement",
};
const VERDICT_LABEL: Record<Verdict, string> = { held: "Held up", partial: "Partly", weak: "Did not hold" };
const VERDICT_TONE: Record<Verdict, string> = { held: "good", partial: "mid", weak: "attention" };
const STATE_LABEL: Record<AgentState, string> = { idle: "Your turn", listening: "Listening", thinking: "Thinking…", speaking: "Speaking", done: "Interview over" };

type Busy = "start" | "turn" | "feedback" | null;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function moveLabel(move: string | undefined): string | null {
  if (!move) return null;
  if (move === "deepen") return "Went deeper";
  if (move.startsWith("probe:")) {
    const k = PROBE_KINDS.find((p) => p === move.slice(6));
    return k ? `Probed: ${PROBE_LABEL[k]}` : null;
  }
  return null;
}

export function FullInterview({
  card,
  maxTopics,
  questionBase,
  turn,
}: {
  card: FullInterviewCard;
  maxTopics: number;
  questionBase: Record<string, string>;
  /** Hands-free end-of-turn settings (INTERVIEW_TURN_*); null = the candidate presses "Done answering". */
  turn: TurnSettings | null;
}) {
  const questionHref = (id: string) => `/app/interview?${new URLSearchParams({ ...questionBase, q: id }).toString()}`;
  const [tone, setTone] = useState<Tone>("neutral");
  const [voice, setVoice] = useState(true);
  const [handsFree, setHandsFree] = useState(true);
  const [lang, setLang] = useState("en-US");
  const [canListen, setCanListen] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [session, setSession] = useState<FullSession | null>(null);
  const [draft, setDraft] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [debrief, setDebrief] = useState<FullDebriefResult | null>(null);
  const [typing, setTyping] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [caption, setCaption] = useState<{ who: string; text: string } | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [clock, setClock] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  /** A past report being opened from the list. */
  const [viewing, setViewing] = useState<string | null>(null);

  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const listeningRef = useRef(false);
  const busyRef = useRef<Busy>(null);
  const silence = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef("");
  const interimRef = useRef("");
  const sessionRef = useRef<FullSession | null>(null);
  const idRef = useRef<string | null>(null);
  const handsFreeRef = useRef(handsFree);
  const mic = useRef<MicMeter | null>(null);
  const voiceFrames = useRef<VoiceFrame[]>([]);
  const voiceClock = useRef<{ start: number; timer: ReturnType<typeof setInterval> | null }>({ start: 0, timer: null });
  const spoken = useRef<VoiceSummary[]>([]);
  const gen = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);
  /** For the latency log: when the last word was heard, when the answer went, when the reply came. */
  const lastWordAt = useRef(0);
  const latency = useRef<{ lastWord: number; sent: number; replied: number } | null>(null);

  draftRef.current = draft;
  interimRef.current = interim;
  sessionRef.current = session;
  idRef.current = sessionId;
  handsFreeRef.current = handsFree;
  busyRef.current = busy;

  useEffect(() => {
    setCanListen(recognitionCtor() !== null);
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<{ tone: Tone; voice: boolean; handsFree: boolean; lang: string }> | null;
      if (saved?.tone && TONES.includes(saved.tone)) setTone(saved.tone);
      if (typeof saved?.voice === "boolean") setVoice(saved.voice);
      if (typeof saved?.handsFree === "boolean") setHandsFree(saved.handsFree);
      if (saved?.lang && LANGS.some((l) => l.id === saved.lang)) setLang(saved.lang);
    } catch {
      /* defaults are fine */
    }
    const off = onSpeakingChange((on) => {
      setSpeaking(on);
      const l = latency.current;
      if (!on || !l) return;
      latency.current = null;
      const now = performance.now();
      const ms = (a: number, b: number) => Math.round(b - a);
      console.info(
        `[interview-latency] total=${ms(l.lastWord, now)}ms wait=${ms(l.lastWord, l.sent)}ms server=${ms(l.sent, l.replied)}ms voice=${ms(l.replied, now)}ms`,
      );
    });
    return () => {
      off();
      gen.current += 1;
      stopListening();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => {
      const a = speechActivity(rmsLevel);
      if (a.speaking && a.text) setCaption({ who: "Interviewer", text: captionWindow(a.text, a.progress) });
      else if (listeningRef.current && (interimRef.current || draftRef.current)) setCaption({ who: "You", text: captionWindow(`${draftRef.current} ${interimRef.current}`.trim(), 1, 14) });
      else {
        const last = [...(sessionRef.current?.turns ?? [])].reverse().find((t) => t.role === "interviewer");
        setCaption(last ? { who: "Interviewer", text: last.text } : null);
      }
      setMicLevel(mic.current ? mic.current.level() : 0);
      if (startedAt && sessionRef.current?.status === "running") setClock((Date.now() - startedAt) / 1000);
    }, 100);
    return () => clearInterval(id);
  }, [session, startedAt]);

  useEffect(() => {
    if (debrief?.scores) endRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [debrief]);

  const getAgentState = (): AgentState =>
    agentState({
      ended: sessionRef.current?.status === "done" && busyRef.current !== "feedback",
      busy: busyRef.current !== null,
      speaking: speechActivity(rmsLevel).speaking,
      listening: listeningRef.current,
    });
  const getLevel = () => {
    const a = speechActivity(rmsLevel);
    return a.speaking ? a.level : mic.current ? mic.current.level() : 0;
  };

  function clearSilence() {
    if (silence.current) clearTimeout(silence.current);
    silence.current = null;
  }

  function stopListening() {
    clearSilence();
    listeningRef.current = false;
    setListening(false);
    setInterim("");
    interimRef.current = "";
    // Detach first: a stopped recognition still delivers its last results, and those landed in
    // the next answer's draft (20 Nov: one answer recorded twice).
    const r = recognition.current;
    recognition.current = null;
    if (r) {
      r.onresult = null;
      r.onend = null;
      r.onerror = null;
      try {
        r.stop();
      } catch {
        /* already stopped */
      }
    }
    if (voiceClock.current.timer) clearInterval(voiceClock.current.timer);
    voiceClock.current.timer = null;
    mic.current?.close();
    mic.current = null;
    setMicLevel(0);
  }

  /** End the answer after `ms` of silence - but only if the microphone is quiet too. */
  function armEndOfTurn(ms: number) {
    clearSilence();
    if (!turn) return;
    silence.current = setTimeout(() => {
      if (!listeningRef.current || !`${draftRef.current}${interimRef.current}`.trim()) return;
      if (mic.current && mic.current.level() > turn.quietLevel) return armEndOfTurn(turn.silenceMs);
      void send();
    }, ms);
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
      if (recognition.current !== r) return;
      let add = "";
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) add += res[0].transcript;
        else live += res[0].transcript;
      }
      const d = draftRef.current;
      const next = add.trim() ? (d ? `${d.trimEnd()} ${add.trim()}` : add.trim()) : d;
      draftRef.current = next;
      interimRef.current = live;
      setDraft(next);
      setInterim(live);
      lastWordAt.current = performance.now();
      clearSilence();
      if (!handsFreeRef.current || !turn) return;
      const said = `${next} ${live}`.trim();
      if (add.trim() && !live.trim() && shouldCutIn(next, turn)) return void send({ cutIn: true });
      armEndOfTurn(endOfTurnMs(said, turn));
    };
    r.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") setError(`Transcription stopped: ${e.error}.`);
    };
    r.onend = () => {
      if (listeningRef.current) {
        try {
          r.start();
        } catch {
          /* the next onend retries */
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
      if (!voiceFrames.current.length) voiceClock.current.start = performance.now();
      voiceClock.current.timer = setInterval(() => {
        if (mic.current) voiceFrames.current.push({ t: performance.now() - voiceClock.current.start, ...mic.current.sample() });
      }, VOICE_FRAME_MS);
    });
  }

  const voiceFor = (answer: string) => summarizeVoice(voiceFrames.current, VOICE_FRAME_MS, answer.split(/\s+/).filter(Boolean).length);

  async function interviewerSays(text: string) {
    const g = gen.current;
    if (voice) await speak(text, lang);
    if (g !== gen.current) return;
    if (handsFreeRef.current && canListen && !typing && sessionRef.current?.status === "running") startListening();
  }

  function enter(id: string, s: FullSession, greet: boolean) {
    setSessionId(id);
    setSession(s);
    sessionRef.current = s;
    idRef.current = id;
    setStartedAt(Date.now());
    setDebrief(null);
    const last = [...s.turns].reverse().find((t) => t.role === "interviewer");
    if (s.status === "running" && last) void interviewerSays(greet && voice ? `${GREETING} ${last.text}` : last.text);
  }

  async function start() {
    gen.current += 1;
    stopListening();
    stopSpeaking();
    primeAudio();
    spoken.current = [];
    voiceFrames.current = [];
    setError(null);
    setBusy("start");
    const r = await startFullAction({ applicationId: card.applicationId, tone });
    setBusy(null);
    if (r.error || !r.session || !r.sessionId) return setError(r.error ?? "Could not start.");
    enter(r.sessionId, r.session, true);
  }

  async function resume(id: string) {
    primeAudio();
    setError(null);
    setBusy("start");
    const r = await resumeFullAction(id);
    setBusy(null);
    if (r.error || !r.session || !r.sessionId) return setError(r.error ?? "Could not resume.");
    enter(r.sessionId, r.session, false);
  }

  async function showLast(id: string) {
    setError(null);
    setViewing(id);
    setBusy("feedback");
    const r = await fullDebriefAction(id);
    setBusy(null);
    if (r.error || !r.session) return setError(r.error ?? "No debrief.");
    setSession(r.session);
    setSessionId(id);
    setDebrief(r);
  }

  async function send(opts: { cutIn?: boolean } = {}) {
    const id = idRef.current;
    const s = sessionRef.current;
    const answer = `${draftRef.current} ${interimRef.current}`.trim();
    if (!id || !s || !answer || s.status === "done" || busyRef.current) return;
    // Taken at once, before any await: a second send (a late timer, a double click) finds no answer.
    busyRef.current = "turn";
    draftRef.current = "";
    interimRef.current = "";
    stopListening();
    const v = voiceFor(answer);
    setBusy("turn");
    setDraft("");
    setError(null);
    const g = gen.current;
    const sent = performance.now();
    const r = await fullTurnAction({ sessionId: id, answer, turns: s.turns.length, cutIn: opts.cutIn });
    if (g !== gen.current) return;
    const restore = () => {
      draftRef.current = answer;
      setDraft(answer);
    };
    if (r.retryAfter) {
      restore();
      setError(r.error ?? null);
      setBusy(null);
      busyRef.current = null;
      setTimeout(() => {
        if (g === gen.current) void send(opts);
      }, r.retryAfter * 1000);
      return;
    }
    setBusy(null);
    busyRef.current = null;
    if (r.error || !r.session) {
      restore();
      return setError(r.error ?? "The interviewer lost the thread.");
    }
    setSession(r.session);
    sessionRef.current = r.session;
    if (r.ignored) {
      // Already recorded (a double submit): carry on from the saved session, say nothing twice.
      if (r.session.status === "running" && handsFreeRef.current && canListen && !typing) startListening();
      return;
    }
    if (v) spoken.current.push(v);
    voiceFrames.current = [];
    latency.current = voice ? { lastWord: lastWordAt.current || sent, sent, replied: performance.now() } : null;
    if (r.timing) console.info(`[full-turn] server load=${r.timing.load}ms model=${r.timing.model}ms save=${r.timing.save}ms`);
    const last = r.session.turns[r.session.turns.length - 1];
    if (r.session.status === "done") {
      if (voice) void speak(last.text, lang);
      void finish();
    } else void interviewerSays(last.text);
  }

  async function finish() {
    const id = idRef.current;
    const s = sessionRef.current;
    if (!id || !s || busyRef.current === "feedback") return;
    gen.current += 1;
    stopListening();
    clearSilence();
    const pending = s.status === "running" ? `${draftRef.current} ${interimRef.current}`.trim() : "";
    if (!canScoreFull(s, pending)) {
      setError("There isn't enough said yet to give feedback - answer at least one question in a few full sentences.");
      return;
    }
    stopSpeaking();
    setBusy("feedback");
    busyRef.current = "feedback";
    setError(null);
    const v = pending ? voiceFor(pending) : null;
    const r = await finishFullAction({ sessionId: id, answer: pending || undefined, voice: combineVoice(v ? [...spoken.current, v] : spoken.current) });
    setBusy(null);
    busyRef.current = null;
    if (r.session) {
      setSession(r.session);
      sessionRef.current = r.session;
    }
    setDraft("");
    if (r.error) return setError(r.error);
    setDebrief(r);
  }

  const topicTitle = (id: string) => session?.plan.topics.find((t) => t.id === id)?.short ?? id;

  // ---- lobby ------------------------------------------------------------------------------
  if (!session) {
    return (
      <div className={ui.meeting}>
        <div className={ui.stage} data-size="lobby">
          <AgentAvatar getState={() => "idle"} getLevel={() => 0} label="AI interviewer, waiting" lift={0.55} />
          <div className={ui.stageTop}>
            <span className={ui.agentName}>{card.source === "general" ? "Practice interview" : card.company}</span>
            <span className={ui.status} data-state="idle">
              {TONE_LABEL[tone]} · up to {Math.min(maxTopics, card.topics)} of {card.topics} topics
            </span>
          </div>
          <div className={ui.join}>
            {card.runningId ? (
              <>
                <button className={ui.btn} data-primary="" type="button" onClick={() => void resume(card.runningId!)} disabled={busy !== null}>
                  {busy === "start" ? "Joining…" : "Resume interview"}
                </button>
                <button className={ui.btn} type="button" onClick={() => void start()} disabled={busy !== null}>
                  Start a new one
                </button>
              </>
            ) : (
              <button className={ui.btn} data-primary="" type="button" onClick={() => void start()} disabled={busy !== null}>
                {busy === "start" ? "Joining…" : "Start full interview"}
              </button>
            )}
            <p>
              {card.source === "general"
                ? "A general behavioural interview from the question bank, starting with the areas you have practised least."
                : card.interviewer
                  ? `You'll be interviewed by ${card.interviewer}.`
                  : `A hiring manager at ${card.company} for the ${card.role} role.`}{" "}
              It follows your answers: weak spots get probed, strong ones get a deeper “why”.
            </p>
          </div>
        </div>
        <div className={ui.settings}>
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
            <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Interviewer speaks
          </label>
          {canListen && (
            <label className={ui.toggle}>
              <input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} /> Hands-free
            </label>
          )}
        </div>
        {error && <p className={ui.warn}>{error}</p>}
        {card.history.length > 0 && (
          <details className={ui.reveal} open={card.history.length <= 3}>
            <summary>
              Past interviews <span className={ui.sectionMeta}>{card.history.length}{card.best !== null ? ` · best ${outOfFive(card.best)}` : ""}</span>
            </summary>
            <ul className={ui.rows}>
              {card.history.map((h) => (
                <li key={h.id} className={ui.row}>
                  <div>
                    <p>
                      {h.at.slice(0, 10)} · {h.topics} {h.topics === 1 ? "topic" : "topics"}
                    </p>
                  </div>
                  <span className={ui.mono}>
                    {outOfFive(h.overall)}{" "}
                    <button className={ui.textBtn} type="button" onClick={() => void showLast(h.id)} disabled={busy !== null}>
                      {busy === "feedback" && viewing === h.id ? "Opening…" : "Open report"}
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  }

  // ---- room -------------------------------------------------------------------------------
  const done = session.status === "done";
  const live = agentState({ ended: done && busy !== "feedback", busy: busy !== null, speaking, listening });
  const asked = topicsAsked(session).length;
  const hasAnswer = Boolean(`${draft}${interim}`.trim());
  const bars = [0.15, 0.35, 0.6, 0.85];

  return (
    <div className={ui.meeting}>
      <div className={ui.stage} data-state={live}>
        <AgentAvatar getState={getAgentState} getLevel={getLevel} label={`AI interviewer, ${STATE_LABEL[live].toLowerCase()}`} />
        <div className={ui.stageTop}>
          <span className={ui.agentName}>{session.plan.company || "Practice interview"}</span>
          <span className={ui.status} data-state={live} aria-live="polite">
            {busy === "feedback" ? "Writing your debrief…" : STATE_LABEL[live]}
          </span>
          <span className={ui.stageClock}>
            {fmt(clock)} · topic {asked} of up to {Math.min(session.settings.maxTopics, session.plan.topics.length)}
          </span>
        </div>
        {caption?.text && (
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
                aria-label={listening ? "Mute microphone" : "Unmute microphone"}
              >
                {listening ? "Mic on" : "Mic off"}
                <span className={ui.micBars} aria-hidden="true">
                  {bars.map((b) => (
                    <i key={b} data-on={listening && micLevel > b ? "" : undefined} />
                  ))}
                </span>
              </button>
            )}
            <button className={ui.iconBtn} type="button" aria-pressed={typing} data-on={typing ? "" : undefined} onClick={() => setTyping((t) => !t)}>
              {typing ? "Hide keyboard" : "Type"}
            </button>
            {(typing || !handsFree || !canListen || !turn) && hasAnswer && (
              <button className={ui.btn} data-primary="" type="button" onClick={() => void send()} disabled={busy !== null}>
                {busy === "turn" ? "Waiting…" : "Done answering"}
              </button>
            )}
            <span className={ui.callBarGap} />
            <button className={ui.btn} type="button" onClick={() => void finish()} disabled={busy === "feedback"} title="End the interview and get your debrief">
              End and debrief
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

      <div className={ui.debriefBar}>
        <button className={ui.btn} type="button" aria-expanded={showTranscript} onClick={() => setShowTranscript((t) => !t)}>
          {showTranscript ? "Hide transcript" : "Read transcript"}
        </button>
        <span className={ui.callBarGap} />
        {done && (
          <button
            className={ui.textBtn}
            type="button"
            onClick={() => {
              setSession(null);
              setDebrief(null);
              setViewing(null);
              setShowTranscript(false);
            }}
            disabled={busy !== null}
          >
            Past interviews
          </button>
        )}
        {done && (
          <button className={ui.textBtn} type="button" onClick={() => void start()} disabled={busy !== null}>
            Start a new interview
          </button>
        )}
      </div>

      {showTranscript && (
        <ol className={ui.transcript} aria-label="Transcript">
          {session.turns.map((t, i) => (
            <li key={i} className={ui.turn} data-role={t.role}>
              <span className={ui.turnWho}>
                {t.role === "interviewer" ? "Interviewer" : "You"}
                {t.role === "interviewer" && ` · ${topicTitle(t.topicId)}`}
                {moveLabel(t.move) ? ` · ${moveLabel(t.move)}` : ""}
              </span>
              <p>{t.text}</p>
            </li>
          ))}
        </ol>
      )}

      <div ref={endRef} />
      {debrief?.scores && (
        <>
          <ScoreCard result={debrief} />

          {debrief.moments && debrief.moments.length > 0 && (
            <div className={ui.callout}>
              <h3>Your weakest moments, and a stronger version</h3>
              <ol className={ui.debriefList}>
                {debrief.moments.map((m, i) => (
                  <li key={i}>
                    <span className={ui.sectionMeta}>{topicTitle(m.topicId)}</span>
                    <p>
                      You said: <q>{m.quote}</q>
                    </p>
                    <p>
                      Stronger: <q>{m.better}</q>
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <details className={ui.debriefMore} open>
            <summary>
              The path the interview took
              <span className={ui.sectionMeta}>{asked} {asked === 1 ? "topic" : "topics"}</span>
            </summary>
            <ol className={ui.debriefList}>
              {topicsAsked(session).map((id) => {
                const v = debrief.perTopic?.find((p) => p.topicId === id);
                const moves = session.turns.filter((t) => t.topicId === id).map((t) => moveLabel(t.move)).filter(Boolean);
                return (
                  <li key={id}>
                    {v && (
                      <span className={ui.tag} data-tone={VERDICT_TONE[v.verdict]}>
                        {VERDICT_LABEL[v.verdict]}
                      </span>
                    )}{" "}
                    <a href={questionHref(id)}>{topicTitle(id)}</a>
                    {moves.length > 0 && <span className={ui.sectionMeta}> · {moves.join(", ")}</span>}
                    {v?.note && <p className={ui.sub}>{v.note}</p>}
                  </li>
                );
              })}
            </ol>
            <p className={ui.sub}>Open a topic to practise it on its own, with its model answer and role-play.</p>
          </details>

          {((debrief.fillers && debrief.fillers.words > 0) || debrief.voice) && (
            <details className={ui.debriefMore}>
              <summary>
                Fillers and delivery
                {debrief.fillers && debrief.fillers.words > 0 && (
                  <span className={ui.sectionMeta}>
                    {debrief.fillers.per100} fillers per 100 words{debrief.fillers.per100 > FILLERS_PER_100_LIMIT ? ", too many" : ", clean"}
                  </span>
                )}
              </summary>
              <ul className={ui.debriefList}>
                {debrief.fillers && debrief.fillers.words > 0 && (
                  <li>
                    {debrief.fillers.total} in {debrief.fillers.words} words
                    {Object.keys(debrief.fillers.counts).length > 0 &&
                      `: ${Object.entries(debrief.fillers.counts)
                        .sort((a, b) => b[1] - a[1])
                        .map(([w, n]) => `“${w}” ×${n}`)
                        .join(", ")}`}
                  </li>
                )}
                {debrief.voice && deliveryNotes(debrief.voice, debrief.hedges ?? {}).map((n) => <li key={n.kind}>{n.text}</li>)}
              </ul>
            </details>
          )}
        </>
      )}
      {done && !debrief?.scores && busy !== "feedback" && (
        <div className={ui.actions}>
          <button className={ui.btn} data-primary="" type="button" onClick={() => void finish()}>
            {error ? "Try the debrief again" : "Get my debrief"}
          </button>
        </div>
      )}
    </div>
  );
}
