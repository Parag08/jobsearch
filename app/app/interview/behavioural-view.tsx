"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import type { Answer, Attempt } from "@/lib/repos/answers";
import type { Question, QuestionGroup } from "@/lib/interview/questions";
import { behaviouralView } from "@/lib/interview/scope";
import { addCustomQuestionAction, removeCustomQuestionAction, type AddQuestionState } from "../actions";
import { AnswerEditor } from "./answer-editor";
import { MockInterview } from "./mock-interview";
import ui from "../ui.module.css";

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
}: {
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
}) {
  const params = useSearchParams();
  const detailRef = useRef<HTMLElement>(null);

  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
  const bestScore = new Map<string, number>();
  for (const a of attempts)
    bestScore.set(
      a.questionId,
      Math.max(bestScore.get(a.questionId) ?? 0, a.overall),
    );

  // The generic bank unless a company or "my own" was chosen (lib/interview/scope.ts).
  const view = behaviouralView(
    { generic, company, custom },
    { q: params.get("q"), company: params.get("company"), scope: params.get("scope") },
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
    const sp = new URLSearchParams({ tab: "behavioural" });
    if (next.mine) sp.set("scope", "mine");
    if (next.company) sp.set("company", next.company);
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

  const scopes = [
    { id: "general", label: "General", url: href({}), on: scope.kind === "general" },
    { id: "mine", label: "My own", url: href({ mine: true }), on: scope.kind === "mine" },
    { id: "company", label: "Company", url: href({ company: companies[0]?.slug }), on: scope.kind === "company" },
  ];
  const listGroups: QuestionGroup[] = scope.kind === "general" ? groups : [{ id: questions[0]?.group ?? "", label: "" }];

  return (
    <div className={ui.split}>
      <aside className={ui.qside} aria-label="Questions">
        <div className={ui.qsideHead}>
          <nav className={ui.segmented} aria-label="Which questions">
            {scopes.map((sc) =>
              sc.id === "company" && !companies.length ? (
                <span key={sc.id} className={ui.pill} aria-disabled="true" title="Add an application to the pipeline first">
                  {sc.label}
                </span>
              ) : (
                <a key={sc.id} href={sc.url} onClick={(e) => go(e, sc.url)} className={ui.pill} aria-current={sc.on ? "true" : undefined}>
                  {sc.label}
                </a>
              ),
            )}
          </nav>
          {scope.kind === "company" && (
            <select
              className={ui.input}
              aria-label="Company"
              value={scope.slug}
              onChange={(e) => show(href({ company: e.target.value }))}
            >
              {companies.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {scope.kind === "mine" && customMaxChars && (
            <AddQuestion maxChars={customMaxChars} onAdded={(id) => show(href({ q: id, mine: true }))} />
          )}
        </div>

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
          {scope.kind === "general" && !companies.length && (
            <p className={ui.sub}>
              Add an application to the pipeline and its “Why …?” questions
              appear under Company.
            </p>
          )}
          {scope.kind === "mine" && !questions.length && (
            <p className={ui.sub}>
              {customMaxChars
                ? "Type any question you expect to be asked. It is practised and scored like the rest, and kept here."
                : "Adding your own questions is switched off on this deployment."}
            </p>
          )}
          {listGroups.map((group) => {
            const qs = questions.filter((q) => q.group === group.id);
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
                          <span className={ui.qscore}>{best.toFixed(1)}</span>
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

      {selected && (
        <section className={ui.qdetail} ref={detailRef}>
          <div className={ui.qhead}>
            <h2>{selected.text}</h2>
            {scope.kind === "mine" && (
              <RemoveQuestion questionId={selected.id} onRemoved={() => show(href({ mine: true }))} />
            )}
            <details className={ui.reveal}>
              <summary>
                What good looks like
                {cvBacked && (
                  <span className={ui.chip} data-tone="hit">
                    your CV has evidence
                  </span>
                )}
              </summary>
              <p>{selected.lookFor}</p>
              {selected.round && <p className={ui.sub}>Round: {selected.round}</p>}
              {selected.context && (
                <p className={ui.sub}>
                  {selected.contextLabel ?? "From the job description"}: {selected.context}
                </p>
              )}
            </details>
          </div>

          <MockInterview questionId={selected.id} />

          <details className={ui.reveal}>
            <summary>
              Your notes
              {hasText(current) && <span className={ui.sub}>saved</span>}
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
          </details>

          {history.length > 0 && (
            <details className={ui.reveal}>
              <summary>
                Your attempts <span className={ui.sub}>{history.length}</span>
              </summary>
              <ul className={ui.rows}>
                {history.map((a) => (
                  <li key={a.id} className={ui.row}>
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
                      {a.overall.toFixed(1)} · {a.createdAt.slice(0, 10)}
                    </span>
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
