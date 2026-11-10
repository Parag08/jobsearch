"use client";

import { useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { Answer, Attempt } from "@/lib/repos/answers";
import type { Question, QuestionGroup } from "@/lib/interview/questions";
import { AnswerEditor } from "./answer-editor";
import { MockInterview } from "./mock-interview";
import ui from "../ui.module.css";

/**
 * The behavioural working surface: the question list, and the selected question with the
 * mock interview front and centre. Behavioural questions are generic; "Why <company>?"
 * questions come from your own applications and are listed first.
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
}

export function BehaviouralView({
  groups,
  questions,
  answers,
  attempts,
  evidenced,
}: {
  groups: QuestionGroup[];
  questions: ViewQuestion[];
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

  const written = questions.filter((q) => hasText(byQuestion.get(q.id))).length;
  const practised = questions.filter((q) => bestScore.has(q.id)).length;
  const hasCompanies = questions.some((q) => q.group === "company");

  // Open on what you asked for; otherwise on the first question you have not practised.
  const selected =
    questions.find((q) => q.id === params.get("q")) ??
    questions.find((q) => !bestScore.has(q.id)) ??
    questions[0];
  const current = selected ? byQuestion.get(selected.id) : undefined;
  const history = selected
    ? attempts.filter((a) => a.questionId === selected.id)
    : [];
  const cvBacked = selected ? evidenced.includes(selected.competency) : false;

  const href = (q?: string) => {
    const sp = new URLSearchParams({ tab: "behavioural" });
    if (q) sp.set("q", q);
    return `/app/interview?${sp.toString()}`;
  };

  // Plain links (so open-in-new-tab and copy-link work), but a normal click stays on the client.
  const go = (e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    window.history.pushState(null, "", url);
    const top = detailRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) detailRef.current?.scrollIntoView({ block: "start" });
  };

  return (
    <div className={ui.split}>
      <aside className={ui.qside} aria-label="Questions">
        <div className={ui.progress}>
          <div className={ui.meter} aria-hidden="true">
            <i
              style={
                {
                  "--w": `${questions.length ? (practised / questions.length) * 100 : 0}%`,
                } as React.CSSProperties
              }
            />
          </div>
          <p>
            <b>{practised}</b> of {questions.length} practised · {written} with
            notes
          </p>
        </div>

        <div className={ui.qlist}>
          {!hasCompanies && (
            <p className={ui.sub}>
              Add an application to the pipeline and its “Why …?” questions
              appear here.
            </p>
          )}
          {groups.map((group) => {
            const qs = questions.filter((q) => q.group === group.id);
            if (!qs.length) return null;
            return (
              <div key={group.id} className={ui.qgroup}>
                <p className={ui.mono}>{group.label}</p>
                {qs.map((q, i) => {
                  const best = bestScore.get(q.id);
                  const newCompany =
                    q.company && q.company !== qs[i - 1]?.company;
                  const state =
                    best !== undefined
                      ? "practised"
                      : hasText(byQuestion.get(q.id))
                        ? "notes"
                        : "new";
                  const url = href(q.id);
                  return (
                    <div key={q.id} className={ui.qrow}>
                      {newCompany && <p className={ui.qcompany}>{q.company}</p>}
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
              {selected.context && (
                <p className={ui.sub}>
                  From the job description: {selected.context}
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
