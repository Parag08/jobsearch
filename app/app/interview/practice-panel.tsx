"use client";

import { useEffect, useRef, useState } from "react";
import { scoreAnswerAction, type ScoreResult } from "../actions";
import { DIMENSION_HELP, SCORE_DIMENSIONS } from "@/lib/interview/score";
import { LANGS, recognitionCtor, type SpeechRecognitionLike } from "./speech";
import ui from "../ui.module.css";

/**
 * Spoken practice: the page asks the question aloud, records your answer, transcribes
 * it live, and sends the transcript to be scored.
 *
 * Audio is handled by the browser - speech synthesis to ask, the browser's speech
 * recognition to transcribe (Chrome/Edge send the audio to Google's/Microsoft's speech
 * service for this), MediaRecorder so you can hear yourself back (kept in the page only).
 * JobSearch's server receives only the transcript; no audio is stored (DESIGN.md section 3).
 * No new dependency: these are platform APIs.
 */

type Phase = "idle" | "recording" | "recorded" | "scoring";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function PracticePanel({ questionId, questionText, firm }: { questionId: string; questionText: string; firm: string }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lang, setLang] = useState("en-US");
  const [supported, setSupported] = useState(true);
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScoreResult | null>(null);

  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef<number>(0);
  const recording = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSupported(recognitionCtor() !== null);
    const nav = navigator.language;
    if (LANGS.some((l) => l.id === nav)) setLang(nav);
  }, []);

  // A new question starts clean.
  useEffect(() => {
    stopAll();
    setPhase("idle");
    setFinalText("");
    setInterim("");
    setElapsed(0);
    setResult(null);
    setError(null);
    setAudioUrl(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId]);

  useEffect(() => () => stopAll(), []);

  function speakQuestion() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(questionText);
    u.lang = lang;
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  }

  function stopAll() {
    recording.current = false;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    try {
      recognition.current?.stop();
    } catch {
      /* already stopped */
    }
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }

  async function start() {
    setError(null);
    setResult(null);
    setFinalText("");
    setInterim("");
    setAudioUrl(null);
    window.speechSynthesis?.cancel();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setAudioUrl(URL.createObjectURL(new Blob(chunks.current, { type: mr.mimeType })));
      };
      mr.start();
      recorder.current = mr;
    } catch {
      setError("Microphone access was blocked. Allow it in the browser's address bar, or type your answer below.");
      return;
    }

    const Ctor = recognitionCtor();
    if (Ctor) {
      const r = new Ctor();
      r.lang = lang;
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e) => {
        let add = "";
        let live = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) add += `${res[0].transcript} `;
          else live += res[0].transcript;
        }
        if (add) setFinalText((t) => t + add);
        setInterim(live);
      };
      r.onerror = (e) => {
        if (e.error !== "no-speech" && e.error !== "aborted") setError(`Transcription stopped: ${e.error}.`);
      };
      // Chrome ends recognition after a pause; carry on while we are still recording.
      r.onend = () => {
        if (recording.current) {
          try {
            r.start();
          } catch {
            /* restarting too quickly - the next onend retries */
          }
        }
      };
      r.start();
      recognition.current = r;
    }

    recording.current = true;
    startedAt.current = Date.now();
    setElapsed(0);
    timer.current = setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 250);
    setPhase("recording");
  }

  function stop() {
    setElapsed((Date.now() - startedAt.current) / 1000);
    stopAll();
    setInterim("");
    setPhase("recorded");
  }

  async function score() {
    const transcript = `${finalText} ${interim}`.trim();
    setPhase("scoring");
    setError(null);
    const r = await scoreAnswerAction({
      questionId,
      transcript,
      durationSeconds: elapsed > 0 ? Math.round(elapsed) : null,
      firm,
    });
    if (r.error) setError(r.error);
    else setResult(r);
    setPhase("recorded");
  }

  const transcript = `${finalText}${interim}`;
  const tone = elapsed > 210 ? "gap" : elapsed > 0 && elapsed < 60 ? "gap" : "hit";

  return (
    <div className={ui.stack}>
      <div className={ui.actions}>
        <button className={ui.btn} type="button" onClick={speakQuestion} disabled={phase === "recording"}>
          Ask me the question
        </button>
        {phase === "recording" ? (
          <button className={ui.btn} data-primary="" type="button" onClick={stop}>
            Stop
          </button>
        ) : (
          <button className={ui.btn} data-primary="" type="button" onClick={start} disabled={phase === "scoring"}>
            {phase === "idle" ? "Start answering" : "Record again"}
          </button>
        )}
        <select className={ui.input} value={lang} onChange={(e) => setLang(e.target.value)} disabled={phase === "recording"} aria-label="Accent">
          {LANGS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        {(phase === "recording" || elapsed > 0) && (
          <span className={ui.recording} data-live={phase === "recording" ? "" : undefined}>
            {fmt(elapsed)}
            <span className={ui.chip} data-tone={tone}>
              aim for 1:30–3:00
            </span>
          </span>
        )}
      </div>

      {!supported && (
        <p className={ui.sub}>
          This browser cannot transcribe speech (Chrome and Edge can). You can still record yourself
          to listen back, and type what you said below to have it scored.
        </p>
      )}

      {(phase !== "idle" || !supported) && (
        <textarea
          className={ui.answerBox}
          value={transcript}
          onChange={(e) => {
            setFinalText(e.target.value);
            setInterim("");
          }}
          readOnly={phase === "recording"}
          placeholder={phase === "recording" ? "Listening…" : "Your answer, as transcribed. Fix any words it misheard before scoring."}
          aria-label="Transcript"
        />
      )}

      {audioUrl && phase !== "recording" && <audio className={ui.audio} controls src={audioUrl} />}

      {phase !== "idle" && phase !== "recording" && (
        <div className={ui.actions}>
          <button className={ui.btn} data-primary="" type="button" onClick={score} disabled={phase === "scoring" || transcript.trim().length === 0}>
            {phase === "scoring" ? "Scoring…" : "Score my answer"}
          </button>
          <span className={ui.sub}>JobSearch receives only the transcript. Your browser's speech service (Google in Chrome, Microsoft in Edge) hears the audio to transcribe it.</span>
        </div>
      )}

      {error && <p className={ui.warn}>{error}</p>}

      {result?.scores && <ScoreCard result={result} />}
    </div>
  );
}

function ScoreCard({ result }: { result: ScoreResult }) {
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
