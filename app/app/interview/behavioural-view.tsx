"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import type { TurnSettings } from "@/lib/interview/turn-taking";
import { ScoreCard } from "./score-card";
import { useSearchParams } from "next/navigation";
import type { Answer, Attempt } from "@/lib/repos/answers";
import type { Question, QuestionGroup } from "@/lib/interview/questions";
import { behaviouralView } from "@/lib/interview/scope";
import { outOfFive, outOfFiveLabel } from "@/lib/interview/score";
import { addCustomQuestionAction, removeCustomQuestionAction, type AddQuestionState } from "../actions";
import { AnswerEditor } from "./answer-editor";
import { ModelAnswerPanel } from "./model-answer-panel";
import { SOURCE_LABEL, type ModelAnswer } from "@/lib/interview/model-answer";
import type { RolePlay } from "@/lib/interview/role-play";
import ui from "../ui.module.css";

const MockInterview = dynamic(() => import("./mock-interview").then((mod) => mod.MockInterview));
const RolePlayPanel = dynamic(() => import("./role-play-panel").then((mod) => mod.RolePlayPanel));

/**
 * The behavioural working surface: the question list, and the selected question with the
 * mock interview front and centre. It opens on the generic bank - the questions any firm
 * asks. "Why <company>?" questions (from your own applications) and questions you typed
 * yourself are one click away, under Company and My own.
 *
 * Everything it needs arrives once from the server, so picking a question is instant -
 * it only rewrites the URL (history.pushState, which Next keeps in sync with
 * useSearchParams). Saves still revalidate the page.
 */
const hasText = (a: Answer | undefined) =>
  Boolean(
    a &&
    [a.body, a.situation, a.task, a.action, a.result].some((s) => s.trim()),
  );

export interface ViewQuestion extends Question {
  /** Company questions only: the company, a compact list label, and job-description facts. */
  company?: string;
  short?: string;
  context?: string | null;
  /** Role interviews only: the round, and how `context` is labelled. */
  round?: string | null;
  contextLabel?: string;
}

export function BehaviouralView({
  groups,
  generic,
  company,
  custom,
  customMaxChars,
  answers,
  attempts,
  evidenced,
  modelAnswers,
  rolePlays,
  base = { tab: "behavioural" },
  lockedCompany,
  turn = null,
}: {
  /** Hands-free end-of-turn settings (INTERVIEW_TURN_*); null = press "Done answering". */
  turn?: TurnSettings | null;
  /** The generic bank's groups, in order. */
  groups: QuestionGroup[];
  generic: ViewQuestion[];
  company: ViewQuestion[];
  custom: ViewQuestion[];
  /** Longest question you may add; undefined = adding your own is not offered. */
  customMaxChars?: number;
  answers: Answer[];
  attempts: Attempt[];
  evidenced: string[];
  /** Model answers by question id, any source. */
  modelAnswers: ModelAnswer[];
  rolePlays: RolePlay[];
  /** The URL params every link keeps (which page of the Interview tab this is). */
  base?: Record<string, string>;
  /** On a company's page: its slug. The list is that company's questions only, with no chooser. */
  lockedCompany?: string;
}) {
  const params = useSearchParams();
  const detailRef = useRef<HTMLElement>(null);

  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
  const modelAnswerFor = new Map(modelAnswers.map((m) => [m.questionId, m]));
  const rolePlayFor = new Map(rolePlays.map((p) => [p.questionId, p]));
  const bestScore = new Map<string, number>();
  for (const a of attempts)
    bestScore.set(
      a.questionId,
      Math.max(bestScore.get(a.questionId) ?? 0, a.overall),
    );

  // The generic bank unless a company or "my own" was chosen (lib/interview/scope.ts).
  const view = behaviouralView(
    { generic, company, custom },
    { q: params.get("q"), company: lockedCompany ?? params.get("company"), scope: lockedCompany ? null : params.get("scope") },
    new Set(bestScore.keys()),
  );
  const { scope, companies, questions } = view;
  const selected = questions.find((q) => q.id === view.selectedId);

  const written = questions.filter((q) => hasText(byQuestion.get(q.id))).length;
  const practised = questions.filter((q) => bestScore.has(q.id)).length;

  const current = selected ? byQuestion.get(selected.id) : undefined;
  const history = selected
    ? attempts.filter((a) => a.questionId === selected.id)
    : [];
  const cvBacked = selected ? evidenced.includes(selected.competency) : false;

  const href = (next: { q?: string; company?: string; mine?: boolean }) => {
    const sp = new URLSearchParams(base);
    if (next.mine) sp.set("scope", "mine");
    if (next.company && !lockedCompany) sp.set("company", next.company);
    if (next.q) sp.set("q", next.q);
    return `/app/interview?${sp.toString()}`;
  };
  /** A link to a question keeps you in the list you are looking at. */
  const questionHref = (q: string) =>
    href({ q, mine: scope.kind === "mine", company: scope.kind === "company" ? scope.slug : undefined });

  const show = (url: string) => {
    window.history.pushState(null, "", url);
    const top = detailRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) detailRef.current?.scrollIntoView({ block: "start" });
  };
  // Plain links (so open-in-new-tab and copy-link work), but a normal click stays on the client.
  const go = (e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    show(url);
  };

  // Companies have their own page now (the "Preparing for" strip); here it is the bank or your own.
  const scopes = [
    { id: "general", label: "Question bank", url: href({}), on: scope.kind !== "mine" },
    { id: "mine", label: "Your own", url: href({ mine: true }), on: scope.kind === "mine" },
  ];
  // A company's round reads like the interview: grouped by what each question tests.
  const competencyKey = (c: string) => c.toLowerCase().replace(/-/g, " ").trim();
  const competencyGroups = [...new Set(questions.map((q) => competencyKey(q.competency)))].map((c) => ({ id: c, label: c.charAt(0).toUpperCase() + c.slice(1) }));
  const listGroups: QuestionGroup[] =
    scope.kind === "general" ? groups : scope.kind === "company" ? competencyGroups : [{ id: questions[0]?.group ?? "", label: "" }];
  const inGroup = (q: ViewQuestion, g: QuestionGroup) => (scope.kind === "company" ? competencyKey(q.competency) === g.id : q.group === g.id);

  return (
    <div className={ui.split}>
      <aside className={ui.qside} aria-label="Questions">
        {!lockedCompany && (
          <div className={ui.qsideHead}>
            <nav className={ui.segmented} aria-label="Which questions">
              {scopes.map((sc) => (
                <a key={sc.id} href={sc.url} onClick={(e) => go(e, sc.url)} className={ui.pill} aria-current={sc.on ? "true" : undefined}>
                  {sc.label}
                </a>
              ))}
            </nav>
            {scope.kind === "mine" && customMaxChars && (
              <AddQuestion maxChars={customMaxChars} onAdded={(id) => show(href({ q: id, mine: true }))} />
            )}
          </div>
        )}

        {questions.length > 0 && (
          <div className={ui.progress}>
            <div className={ui.meter} aria-hidden="true">
              <i
                style={
                  {
                    "--w": `${(practised / questions.length) * 100}%`,
                  } as React.CSSProperties
                }
              />
            </div>
            <p>
              <b>{practised}</b> of {questions.length} practised · {written} with
              notes
            </p>
          </div>
        )}

        <div className={ui.qlist}>
          {scope.kind === "mine" && !questions.length && (
            <p className={ui.sub}>
              {customMaxChars
                ? "Type any question you expect to be asked. It is practised and scored like the rest, and kept here."
                : "Adding your own questions is switched off on this deployment."}
            </p>
          )}
          {listGroups.map((group) => {
            const qs = questions.filter((q) => inGroup(q, group));
            if (!qs.length) return null;
            return (
              <div key={group.id} className={ui.qgroup}>
                {group.label && <p className={ui.mono}>{group.label}</p>}
                {qs.map((q) => {
                  const best = bestScore.get(q.id);
                  const state =
                    best !== undefined
                      ? "practised"
                      : hasText(byQuestion.get(q.id))
                        ? "notes"
                        : "new";
                  const url = questionHref(q.id);
                  return (
                    <div key={q.id} className={ui.qrow}>
                      <a
                        href={url}
                        onClick={(e) => go(e, url)}
                        className={ui.qitem}
                        aria-current={
                          q.id === selected?.id ? "true" : undefined
                        }
                      >
                        <span
                          className={ui.qdot}
                          data-state={state}
                          title={
                            state === "new"
                              ? "Not started"
                              : state === "notes"
                                ? "Notes written"
                                : "Practised"
                          }
                        />
                        <span className={ui.qtext}>{q.short ?? q.text}</span>
                        {best !== undefined && (
                          <span className={ui.qscore} title={`Best score ${outOfFiveLabel(best)}`} aria-label={`Best score ${outOfFiveLabel(best)}`}>
                            {outOfFive(best)}
                          </span>
                        )}
                      </a>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Keyed by question: the notes editor, model answer and mock interview each hold
          their own state ("Saved.", follow-ups, an open editor), and none of it may carry
          over to the next question when the switch happens in the browser. */}
      {selected && (
        <section className={ui.qdetail} ref={detailRef} key={selected.id}>
          <div className={ui.qhead}>
            <h2>{selected.text}</h2>
            {scope.kind === "mine" && (
              <RemoveQuestion questionId={selected.id} onRemoved={() => show(href({ mine: true }))} />
            )}
          </div>

          <QuestionAids
            key={selected.id}
            questionId={selected.id}
            lookFor={selected.lookFor}
            round={selected.round ?? null}
            context={selected.context ? { label: selected.contextLabel ?? "From the job description", text: selected.context } : null}
            cvBacked={cvBacked}
            answer={modelAnswerFor.get(selected.id) ?? null}
            rolePlay={rolePlayFor.get(selected.id) ?? null}
          />

          <MockInterview questionId={selected.id} questionText={selected.text} turn={turn} />

          <NotesDisclosure openFirst={!modelAnswerFor.has(selected.id)}>
            <summary>
              Your notes
              {hasText(current) && <span className={ui.sectionMeta}>Saved</span>}
            </summary>
            <AnswerEditor
              questionId={selected.id}
              questionText={selected.text}
              initial={{
                mode: current?.mode ?? "free",
                body: current?.body ?? "",
                situation: current?.situation ?? "",
                task: current?.task ?? "",
                action: current?.action ?? "",
                result: current?.result ?? "",
              }}
            />
          </NotesDisclosure>

          {history.length > 0 && (
            <details className={ui.reveal}>
              <summary>
                Your attempts <span className={ui.sectionMeta}>{history.length}</span>
              </summary>
              <ul className={ui.rows}>
                {history.map((a) => (
                  <li key={a.id}>
                    {/* Each attempt opens into its full report: scores, feedback, the whole transcript. */}
                    <details className={ui.reveal}>
                      <summary className={ui.row}>
                        <div>
                          <p>
                            {a.transcript.length > 140
                              ? `${a.transcript.slice(0, 140)}…`
                              : a.transcript}
                          </p>
                          {a.improvements[0] && (
                            <span className={ui.sub}>
                              Next time: {a.improvements[0]}
                            </span>
                          )}
                        </div>
                        <span className={ui.mono}>
                          {outOfFive(a.overall)} · {a.createdAt.slice(0, 10)}
                        </span>
                      </summary>
                      <ScoreCard
                        result={{
                          overall: a.overall,
                          scores: a.scores,
                          strengths: a.strengths,
                          improvements: a.improvements,
                          model: a.model,
                        }}
                      />
                      <h4>Transcript</h4>
                      <p className={ui.sub} style={{ whiteSpace: "pre-wrap" }}>
                        {a.transcript}
                      </p>
                    </details>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}
    </div>
  );
}

/**
 * What good looks like and the model answer: one row of pill toggles under the question, so
 * both read as things to open (Parag, 2026-11-19), with whichever is open shown right below.
 */
function QuestionAids({
  questionId,
  lookFor,
  round,
  context,
  cvBacked,
  answer,
  rolePlay,
}: {
  questionId: string;
  lookFor: string;
  round: string | null;
  context: { label: string; text: string } | null;
  cvBacked: boolean;
  answer: ModelAnswer | null;
  rolePlay: RolePlay | null;
}) {
  const [open, setOpen] = useState<{ look: boolean; model: boolean; play: boolean }>({ look: false, model: false, play: false });
  const toggle = (k: "look" | "model" | "play") => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const lookId = `look-${questionId}`;
  const modelId = `model-${questionId}`;
  const playId = `play-${questionId}`;
  return (
    <>
      <div className={ui.aidRow}>
        <button type="button" className={ui.aidBtn} aria-expanded={open.look} aria-controls={lookId} onClick={() => toggle("look")}>
          What good looks like
          {cvBacked && <span className={ui.sectionMeta}>· your CV has evidence</span>}
          <span className={ui.aidChevron} aria-hidden="true">
            ›
          </span>
        </button>
        <button type="button" className={ui.aidBtn} aria-expanded={open.model} aria-controls={modelId} onClick={() => toggle("model")}>
          Model answer
          <span className={ui.sectionMeta}>· {answer ? SOURCE_LABEL[answer.source] : "none yet"}</span>
          <span className={ui.aidChevron} aria-hidden="true">
            ›
          </span>
        </button>
        <button type="button" className={ui.aidBtn} aria-expanded={open.play} aria-controls={playId} onClick={() => toggle("play")}>
          Role-play
          <span className={ui.sectionMeta}>· {rolePlay ? "ready" : answer ? "build it" : "needs a model answer"}</span>
          <span className={ui.aidChevron} aria-hidden="true">
            ›
          </span>
        </button>
      </div>
      {open.look && (
        <div className={ui.aidPanel} id={lookId}>
          <h3>What good looks like</h3>
          <p>{lookFor}</p>
          {round && <p className={ui.sub}>Round: {round}</p>}
          {context && (
            <p className={ui.sub}>
              {context.label}: {context.text}
            </p>
          )}
        </div>
      )}
      {open.model && (
        <div className={ui.aidPanel} id={modelId}>
          <h3>Model answer</h3>
          <ModelAnswerPanel questionId={questionId} answer={answer} />
        </div>
      )}
      {open.play && (
        <div className={ui.aidPanel} id={playId}>
          <h3>Role-play</h3>
          <RolePlayPanel questionId={questionId} initial={rolePlay} modelAnswer={answer?.text ?? null} />
        </div>
      )}
    </>
  );
}

/**
 * The notes disclosure. Opens on its own when the question has no model answer yet, since
 * the way to one runs through your notes ("Rewrite as model answer"). After that it is
 * yours to open and close: a model answer arriving does not snap it shut.
 */
function NotesDisclosure({ openFirst, children }: { openFirst: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(openFirst);
  return (
    <details className={ui.reveal} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      {children}
    </details>
  );
}

/** Type any question; it joins "My own" and is practised and scored like a bank question. */
function AddQuestion({ maxChars, onAdded }: { maxChars: number; onAdded: (id: string) => void }) {
  const [state, add, adding] = useActionState<AddQuestionState | null, FormData>(addCustomQuestionAction, null);
  const [text, setText] = useState("");
  const opened = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!state?.id || opened.current === state.id) return;
    opened.current = state.id;
    setText("");
    onAdded(state.id);
  }, [state, onAdded]);

  return (
    <form action={add} className={ui.askOwn}>
      <textarea
        name="text"
        className={ui.input}
        rows={3}
        maxLength={maxChars}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a question you expect, e.g. Why do you want to join the Public Service?"
        aria-label="Your own question"
        required
      />
      <div className={ui.askOwnFoot}>
        <button className={ui.btn} data-primary="" type="submit" disabled={adding || !text.trim()}>
          {adding ? "Adding…" : "Add question"}
        </button>
        <span className={ui.mono}>
          {text.length} / {maxChars}
        </span>
      </div>
      {state?.error && <span className={ui.warn}>{state.error}</span>}
    </form>
  );
}

function RemoveQuestion({ questionId, onRemoved }: { questionId: string; onRemoved: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <p className={ui.sub}>
      <button
        type="button"
        className={ui.linkBtn}
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Remove this question from your list?")) return;
          start(async () => {
            const r = await removeCustomQuestionAction(questionId);
            if (r.error) setError(r.error);
            else onRemoved();
          });
        }}
      >
        {pending ? "Removing…" : "Remove this question"}
      </button>
      {error && <span className={ui.warn}> {error}</span>}
    </p>
  );
}
