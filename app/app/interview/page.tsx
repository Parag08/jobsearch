import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { listProjects } from "@/lib/repos/projects";
import { getProfile } from "@/lib/repos/profiles";
import { listAnswers, listAttempts, type Answer, type Attempt } from "@/lib/repos/answers";
import { DEFAULT_COMPETENCIES } from "@/lib/stories/types";
import { matchCompetencies } from "@/lib/stories/competencies";
import { technicalSurface, type CvExtra } from "@/lib/interview/technical";
import { caseTypeFits } from "@/lib/interview/casing";
import { firmNote, groupQuestions, questionsForFirm } from "@/lib/interview/questions";
import { FIRMS, firmLabel, questionBank } from "./bank";
import { AnswerEditor } from "./answer-editor";
import { PracticePanel } from "./practice-panel";
import ui from "../ui.module.css";

/**
 * Interview prep (DESIGN.md section 3), as three tabs.
 *
 * Behavioural is the working surface: the questions MBB firms ask, your written answer
 * to each (a blank box or STAR, both kept), and spoken practice that is scored. Casing
 * and technical are derived from your record, so they fill themselves in.
 *
 * Tab, question and firm live in the URL: every question is linkable, and back works.
 */
type Tab = "behavioural" | "casing" | "technical";
const TABS: { id: Tab; label: string }[] = [
  { id: "behavioural", label: "Behavioural" },
  { id: "casing", label: "Casing" },
  { id: "technical", label: "Technical" },
];

const hasText = (a: Answer | undefined) =>
  Boolean(a && [a.body, a.situation, a.task, a.action, a.result].some((s) => s.trim()));

export default async function Interview({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; firm?: string }>;
}) {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const { db, userId } = w;

  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === params.tab) ? (params.tab as Tab) : "behavioural";
  const firm = params.firm === "all" || FIRMS.includes(params.firm ?? "") ? (params.firm as string) : "bain";

  const [projects, profile, answers, attempts] = await Promise.all([
    listProjects(db, userId),
    getProfile(db, userId),
    listAnswers(db, userId),
    listAttempts(db, userId),
  ]);
  const bullets = projects.flatMap((p) => p.bullets);

  const href = (next: { tab?: Tab; q?: string; firm?: string }) => {
    const sp = new URLSearchParams();
    sp.set("tab", next.tab ?? tab);
    sp.set("firm", next.firm ?? firm);
    if (next.q) sp.set("q", next.q);
    return `/app/interview?${sp.toString()}`;
  };

  return (
    <>
      <div className={ui.head}>
        <h1>Interview prep</h1>
      </div>

      <nav className={ui.tabs} aria-label="Interview prep">
        {TABS.map((t) => (
          <Link key={t.id} href={href({ tab: t.id })} scroll={false} className={ui.tab} aria-current={t.id === tab ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "behavioural" && (
        <Behavioural firm={firm} selectedId={params.q} answers={answers} attempts={attempts} bullets={bullets} href={href} />
      )}
      {tab === "casing" && <Casing bullets={bullets} />}
      {tab === "technical" && <Technical bullets={bullets} extras={(profile?.cvExtras ?? []) as CvExtra[]} />}
    </>
  );
}

// ---- behavioural ---------------------------------------------------------------------------

function Behavioural({
  firm,
  selectedId,
  answers,
  attempts,
  bullets,
  href,
}: {
  firm: string;
  selectedId?: string;
  answers: Answer[];
  attempts: Attempt[];
  bullets: { id: string; text: string; skills: string[] }[];
  href: (n: { tab?: Tab; q?: string; firm?: string }) => string;
}) {
  const questions = questionsForFirm(questionBank, firm);
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
  const bestScore = new Map<string, number>();
  for (const a of attempts) bestScore.set(a.questionId, Math.max(bestScore.get(a.questionId) ?? 0, a.overall));

  const answered = questions.filter((q) => hasText(byQuestion.get(q.id))).length;
  const practised = questions.filter((q) => bestScore.has(q.id)).length;

  // Open on what you asked for; otherwise on the first question you have not answered.
  const selected =
    questions.find((q) => q.id === selectedId) ??
    questions.find((q) => !hasText(byQuestion.get(q.id))) ??
    questions[0];
  const current = selected ? byQuestion.get(selected.id) : undefined;
  const history = selected ? attempts.filter((a) => a.questionId === selected.id) : [];
  const note = selected ? firmNote(selected, firm) : null;

  // What your CV bullets already evidence, before you have written anything.
  const evidenced = new Set<string>();
  for (const b of bullets) for (const h of matchCompetencies(`${b.text} ${b.skills.join(" ")}`)) evidenced.add(h.competency);

  return (
    <>
      <div className={ui.split}>
        <aside className={ui.qside} aria-label="Questions">
          <div className={ui.qsideHead}>
            <nav className={ui.segmented} aria-label="Firm">
              {[...FIRMS, "all"].map((f) => (
                <Link
                  key={f}
                  href={href({ firm: f, q: selected?.id })}
                  scroll={false}
                  className={ui.pill}
                  aria-current={f === firm ? "true" : undefined}
                >
                  {f === "all" ? "All" : firmLabel(f)}
                </Link>
              ))}
            </nav>
            <div className={ui.progress}>
              <p>
                <b>{answered}</b>/{questions.length} answered · <b>{practised}</b> practised aloud
              </p>
              <div className={ui.meter} aria-label={`${answered} of ${questions.length} answered`}>
                <i style={{ "--w": `${questions.length ? (answered / questions.length) * 100 : 0}%` } as React.CSSProperties} />
              </div>
              {answered < 7 && (
                <p>Seven strong stories cover most interviews. Start with the ones you would dread.</p>
              )}
            </div>
          </div>

          <div className={ui.qlist}>
          {groupQuestions(questionBank, questions).map(({ group, questions: qs }) => (
            <div key={group.id} className={ui.qgroup}>
              <p className={ui.mono}>{group.label}</p>
              {qs.map((q) => {
                const done = hasText(byQuestion.get(q.id));
                const best = bestScore.get(q.id);
                return (
                  <Link
                    key={q.id}
                    href={href({ q: q.id })}
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
                  </Link>
                );
              })}
            </div>
          ))}
          </div>
        </aside>

        {selected && (
          <section className={ui.qdetail}>
            <div className={ui.stack}>
              <h2>{selected.text}</h2>
              <p className={ui.sub}>
                <b>A strong answer shows:</b> {selected.lookFor}
              </p>
              {note && (
                <p className={ui.firmNote}>
                  <b>{firmLabel(firm)}:</b> {note}
                </p>
              )}
              {evidenced.has(selected.competency) && (
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

      <details className={ui.panel}>
        <summary>What your CV already evidences</summary>
        <div className={ui.chips} style={{ marginTop: 10 }}>
          {DEFAULT_COMPETENCIES.map((c) => (
            <span key={c} className={ui.chip} data-tone={evidenced.has(c) ? "hit" : "gap"}>
              {c.replace(/-/g, " ")}
            </span>
          ))}
        </div>
        <p className={ui.sub}>
          Dashed ones have nothing behind them on your CV — those are the answers you most need to write.
        </p>
      </details>
    </>
  );
}

// ---- casing ---------------------------------------------------------------------------------

function Casing({ bullets }: { bullets: { id: string; text: string; skills: string[]; projectId: string; roleFamily: string }[] }) {
  const cases = caseTypeFits(bullets);
  const text = (id: string) => bullets.find((b) => b.id === id)?.text ?? id;
  const short = (s: string) => (s.length > 90 ? `${s.slice(0, 90)}…` : s);
  return (
    <section className={ui.panel}>
      <h2>Casing</h2>
      <p className={ui.sub}>
        Frameworks come from books. What a book cannot give you is a case type you have actually run —
        an interviewer who hears a real operating example in a cost case is hearing something no
        framework produces. Lived types first.
      </p>
      <ul className={ui.rows}>
        {cases.map((c) => (
          <li key={c.caseType} className={ui.row}>
            <div>
              <p>
                <b>{c.caseType.replace(/-/g, " ")}</b>{" "}
                {c.lived ? (
                  <span className={ui.chip} data-tone="hit">lived</span>
                ) : (
                  <span className={ui.chip} data-tone="gap">practice ground</span>
                )}
              </p>
              {c.lived && <span className={ui.mono}>{short(text(c.evidence[0]))}</span>}
            </div>
            <span className={ui.mono}>{c.evidence.length || "—"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---- technical ------------------------------------------------------------------------------

function Technical({
  bullets,
  extras,
}: {
  bullets: { id: string; text: string; skills: string[]; projectId: string; roleFamily: string }[];
  extras: CvExtra[];
}) {
  const surface = technicalSurface(bullets, extras);
  const text = (id: string) => bullets.find((b) => b.id === id)?.text ?? id;
  const short = (s: string) => (s.length > 90 ? `${s.slice(0, 90)}…` : s);
  return (
    <section className={ui.panel}>
      <h2>Technical</h2>
      <p className={ui.sub}>
        Every skill and technology your CV claims is fair game. A claim with no bullet behind it is not
        dishonest — a Skills line exists to be scanned — but know which ones they are before someone
        asks you to talk about one.
      </p>
      {surface.asserted.length > 0 && (
        <>
          <p className={ui.mono}>Asserted only — have an answer ready</p>
          <div className={ui.chips}>
            {surface.asserted.map((c) => (
              <span key={`${c.source}-${c.claim}`} className={ui.chip} data-tone="gap" title={`from your ${c.source} line`}>
                {c.claim}
              </span>
            ))}
          </div>
        </>
      )}
      {surface.evidenced.length === 0 ? (
        <p className={ui.empty}>No Skills or Technologies line on the profile yet.</p>
      ) : (
        <>
          <p className={ui.mono}>Backed by the bank</p>
          <ul className={ui.rows}>
            {surface.evidenced.map((c) => (
              <li key={`${c.source}-${c.claim}`} className={ui.row}>
                <div>
                  <p>
                    <b>{c.claim}</b> <span className={ui.chip}>{c.source}</span>
                  </p>
                  <span className={ui.mono}>{short(text(c.evidencedBy[0]))}</span>
                </div>
                <span className={ui.mono}>{c.evidencedBy.length}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
