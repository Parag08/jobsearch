"use client";

import { useRef } from "react";
import { useSearchParams } from "next/navigation";
import type { Answer, Attempt } from "@/lib/repos/answers";
import { firmNote, groupQuestions, questionsForFirm, type QuestionBank } from "@/lib/interview/questions";
import { AnswerEditor } from "./answer-editor";
import { PracticePanel } from "./practice-panel";
import ui from "../ui.module.css";

/**
 * The behavioural working surface: firm filter, question list, and the selected question.
 *
 * Everything it needs arrives once from the server, so picking a question or a firm is
 * instant - it only rewrites the URL (history.pushState, which Next keeps in sync with
 * useSearchParams). No server round trip per click; saves still revalidate the page.
 */
const hasText = (a: Answer | undefined) =>
  Boolean(a && [a.body, a.situation, a.task, a.action, a.result].some((s) => s.trim()));

export function BehaviouralView({
  bank,
  firms,
  firmLabels,
  answers,
  attempts,
  evidenced,
}: {
  bank: QuestionBank;
  firms: string[];
  firmLabels: Record<string, string>;
  answers: Answer[];
  attempts: Attempt[];
  evidenced: string[];
}) {
  const params = useSearchParams();
  const detailRef = useRef<HTMLElement>(null);

  const firmParam = params.get("firm") ?? "";
  const firm = firmParam === "all" || firms.includes(firmParam) ? firmParam : "bain";
  const questions = questionsForFirm(bank, firm);
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
  const bestScore = new Map<string, number>();
  for (const a of attempts) bestScore.set(a.questionId, Math.max(bestScore.get(a.questionId) ?? 0, a.overall));

  const answered = questions.filter((q) => hasText(byQuestion.get(q.id))).length;
  const practised = questions.filter((q) => bestScore.has(q.id)).length;

  // Open on what you asked for; otherwise on the first question you have not answered.
  const selected =
    questions.find((q) => q.id === params.get("q")) ??
    questions.find((q) => !hasText(byQuestion.get(q.id))) ??
    questions[0];
  const current = selected ? byQuestion.get(selected.id) : undefined;
  const history = selected ? attempts.filter((a) => a.questionId === selected.id) : [];
  const note = selected ? firmNote(selected, firm) : null;
  const label = (f: string) => firmLabels[f] ?? f;

  const href = (next: { q?: string; firm?: string }) => {
    const sp = new URLSearchParams();
    sp.set("tab", "behavioural");
    sp.set("firm", next.firm ?? firm);
    if (next.q) sp.set("q", next.q);
    return `/app/interview?${sp.toString()}`;
  };

  // Plain links (so open-in-new-tab and copy-link work), but a normal click stays on the client.
  const go = (e: React.MouseEvent<HTMLAnchorElement>, url: string, reveal: boolean) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    window.history.pushState(null, "", url);
    // Bring the question into view if you picked it from further down the page.
    const top = detailRef.current?.getBoundingClientRect().top ?? 0;
    if (reveal && top < 0) detailRef.current?.scrollIntoView({ block: "start" });
  };

  return (
    <div className={ui.split}>
      <aside className={ui.qside} aria-label="Questions">
        <div className={ui.qsideHead}>
          <nav className={ui.segmented} aria-label="Firm">
            {[...firms, "all"].map((f) => {
              const url = href({ firm: f, q: selected?.id });
              return (
                <a
                  key={f}
                  href={url}
                  onClick={(e) => go(e, url, false)}
                  className={ui.pill}
                  aria-current={f === firm ? "true" : undefined}
                >
                  {f === "all" ? "All" : label(f)}
                </a>
              );
            })}
          </nav>
          <div className={ui.progress}>
            <p>
              <b>{answered}</b>/{questions.length} answered · <b>{practised}</b> practised aloud
            </p>
            <div className={ui.meter} aria-label={`${answered} of ${questions.length} answered`}>
              <i style={{ "--w": `${questions.length ? (answered / questions.length) * 100 : 0}%` } as React.CSSProperties} />
            </div>
            {answered < 7 && <p>Seven strong stories cover most interviews. Start with the ones you would dread.</p>}
          </div>
        </div>

        <div className={ui.qlist}>
          {groupQuestions(bank, questions).map(({ group, questions: qs }) => (
            <div key={group.id} className={ui.qgroup}>
              <p className={ui.mono}>{group.label}</p>
              {qs.map((q) => {
                const done = hasText(byQuestion.get(q.id));
                const best = bestScore.get(q.id);
                const url = href({ q: q.id });
                return (
                  <a
                    key={q.id}
                    href={url}
                    onClick={(e) => go(e, url, true)}
                    className={ui.qitem}
                    aria-current={q.id === selected?.id ? "true" : undefined}
                  >
                    <span className={ui.qtext}>{q.text}</span>
                    <span className={ui.qstatus}>
                      {best !== undefined ? (
                        <span className={ui.chip} data-tone="hit">{best.toFixed(1)}</span>
                      ) : done ? (
                        <span className={ui.chip}>draft</span>
                      ) : null}
                    </span>
                  </a>
                );
              })}
            </div>
          ))}
        </div>
      </aside>

      {selected && (
        <section className={ui.qdetail} ref={detailRef}>
          <div className={ui.stack}>
            <h2>{selected.text}</h2>
            <p className={ui.sub}>
              <b>A strong answer shows:</b> {selected.lookFor}
            </p>
            {note && (
              <p className={ui.firmNote}>
                <b>{label(firm)}:</b> {note}
              </p>
            )}
            {evidenced.includes(selected.competency) && (
              <p className={ui.sub}>Your CV already evidences this — start from the bullet behind it.</p>
            )}
          </div>

          <div className={ui.panel}>
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
          </div>

          <div className={ui.panel}>
            <h3>Practise out loud</h3>
            <p className={ui.sub}>Hear the question, answer it aloud, get scored.</p>
            <PracticePanel questionId={selected.id} questionText={selected.text} firm={firm} />
          </div>

          {history.length > 0 && (
            <div className={ui.panel}>
              <h3>Your attempts</h3>
              <ul className={ui.rows}>
                {history.map((a) => (
                  <li key={a.id} className={ui.row}>
                    <div>
                      <p>{a.transcript.length > 140 ? `${a.transcript.slice(0, 140)}…` : a.transcript}</p>
                      {a.improvements[0] && <span className={ui.sub}>Next time: {a.improvements[0]}</span>}
                    </div>
                    <span className={ui.mono}>
                      {a.overall.toFixed(1)} · {a.createdAt.slice(0, 10)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
