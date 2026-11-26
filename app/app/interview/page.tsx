import Link from "next/link";
import { envFor } from "@/lib/services/settings";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { listProjects } from "@/lib/repos/projects";
import { getProfile } from "@/lib/repos/profiles";
import { listAnswers, listAttempts, type Answer, type Attempt } from "@/lib/repos/answers";
import { listApplications } from "@/lib/repos/applications";
import { matchCompetencies } from "@/lib/stories/competencies";
import { technicalSurface, type CvExtra } from "@/lib/interview/technical";
import { caseTypeFits } from "@/lib/interview/casing";
import { listCompanyQuestions, listCustomQuestions, questionBank } from "./bank";
import { firmLabels } from "@/lib/interview/bank-data";
import { listModelAnswers } from "@/lib/repos/model-answers";
import { listRolePlays } from "@/lib/repos/role-plays";
import type { ModelAnswer } from "@/lib/interview/model-answer";
import type { RolePlay } from "@/lib/interview/role-play";
import type { CompanyQuestion } from "@/lib/interview/company-questions";
import type { RoleQuestion } from "@/lib/interview/role-questions";
import { customQuestionMaxCharsFromEnv } from "@/lib/interview/custom-questions";
import type { Question } from "@/lib/interview/questions";
import { fullInterviewSettingsFromEnv, type FullInterviewSettings } from "@/lib/interview/full-plan";
import { turnSettingsFromEnv } from "@/lib/interview/turn-taking";
import { GENERAL, choosePrep, prepEntries, type PrepEntry } from "@/lib/interview/prep";
import { fullInterviewsFor, generalInterviewCard, type FullInterviewCard } from "@/lib/services/full-interview";
import { outOfFive } from "@/lib/interview/score";
import { BehaviouralView } from "./behavioural-view";
import { FullInterview } from "./full-interview";
import { listCaseSessions, type StoredCaseSession } from "@/lib/repos/case-sessions";
import { caseLibrary } from "./cases";
import { caseProgress, type CaseProgress } from "@/lib/interview/case-progress";
import { CaseRoom } from "./case-room";
import ui from "../ui.module.css";

/**
 * Interview prep (DESIGN.md section 3, docs/FULL-INTERVIEW.md section 3), company first.
 *
 * A "Preparing for" strip leads the page: Practice (always there, for days with no interview
 * coming up) and one entry per company you're applying to. The company decides the kind of
 * interview - the round an agent pushed, case and fit at a consulting firm, or one built from
 * the job ad - so there is no type to choose. Each page leads with a full mock interview; the
 * same questions sit below for one-at-a-time practice, each with its model answer and role-play.
 * Practice keeps the question bank, your own questions, technical and cases.
 *
 * Everything lives in the URL (`prep`, `tab`, `q`, `case`, `full`), so every state is linkable.
 */
type Tab = "behavioural" | "casing" | "technical";
const TABS: { id: Tab; label: string }[] = [
  { id: "behavioural", label: "Questions" },
  { id: "technical", label: "Technical" },
  { id: "casing", label: "Cases" },
];

type Params = { prep?: string; tab?: string; q?: string; case?: string; type?: string; company?: string; full?: string };

const url = (p: Record<string, string | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) sp.set(k, v);
  return `/app/interview?${sp.toString()}`;
};

const KIND_LINE: Record<PrepEntry["kind"], string> = { round: "", consulting: "Case and fit", job: "From the job ad" };

export default async function Interview({ searchParams }: { searchParams: Promise<Params> }) {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const { db, userId } = w;
  const params = await searchParams;
  const env = await envFor(db, userId);
  const settings = fullInterviewSettingsFromEnv(env);

  const [companyQs, apps] = await Promise.all([listCompanyQuestions(db, userId), listApplications(db, userId)]);
  const entries = prepEntries(
    companyQs.map((q) => ({ id: q.id, company: q.company, round: "round" in q ? (q as RoleQuestion).round : null })),
    apps.filter((a) => a.closedReason === null).map((a) => ({ company: a.company, role: a.role, roleFamily: a.jdExtract?.roleFamily ?? null })),
    firmLabels,
  );
  const prep = choosePrep(params, entries, (id) => companyQs.find((q) => q.id === id)?.company ?? null);
  const entry = entries.find((e) => e.slug === prep) ?? null;
  const tab: Tab = entry ? "behavioural" : TABS.some((t) => t.id === params.tab) ? (params.tab as Tab) : "behavioural";

  const needQuestions = tab === "behavioural";
  const needCases = tab === "casing" || entry?.kind === "consulting";
  const [projects, profile, answers, attempts, caseSessions, customQs, modelAnswers, rolePlays, fullCards, generalCard] = await Promise.all([
    listProjects(db, userId),
    getProfile(db, userId),
    listAnswers(db, userId),
    listAttempts(db, userId),
    needCases ? listCaseSessions(db, userId) : Promise.resolve([]),
    needQuestions && !entry ? listCustomQuestions(db, userId) : Promise.resolve([]),
    needQuestions ? listModelAnswers(db, userId).catch(() => []) : Promise.resolve([]),
    needQuestions ? listRolePlays(db, userId).catch(() => []) : Promise.resolve([]),
    settings && entry ? fullInterviewsFor(db, userId, settings).catch(() => []) : Promise.resolve([]),
    settings && !entry && tab === "behavioural" ? generalInterviewCard(db, userId, settings).catch(() => null) : Promise.resolve(null),
  ]);
  const bullets = projects.flatMap((p) => p.bullets);

  return (
    <>
      <div className={ui.head}>
        <h1>Interview prep</h1>
      </div>

      <nav className={ui.prepStrip} aria-label="Preparing for">
        <Link href={url({ prep: GENERAL })} scroll={false} className={ui.prepItem} aria-current={prep === GENERAL ? "page" : undefined}>
          <b>Practice</b>
        </Link>
        {entries.length > 0 && <span className={ui.prepDivider} aria-hidden="true" />}
        {entries.map((e) => (
          <Link key={e.slug} href={url({ prep: e.slug })} scroll={false} className={ui.prepItem} aria-current={prep === e.slug ? "page" : undefined}>
            <b>{e.name}</b>
            <span>{e.round ?? KIND_LINE[e.kind]}</span>
          </Link>
        ))}
      </nav>

      {entry ? (
        <CompanyPrep
          env={env}
          entry={entry}
          card={fullCards.find((c) => c.slug === entry.slug) ?? null}
          settings={settings}
          full={params.full === "1"}
          questions={companyQs.filter((q) => q.company && entries.find((e) => e.name === q.company)?.slug === entry.slug)}
          answers={answers}
          attempts={attempts}
          bullets={bullets}
          modelAnswers={modelAnswers}
          rolePlays={rolePlays}
          sessions={caseSessions}
          caseId={params.case}
          caseType={params.type}
        />
      ) : (
        <>
          <nav className={ui.tabs} aria-label="Practice">
            {TABS.map((t) => (
              <Link key={t.id} href={url({ prep: GENERAL, tab: t.id })} scroll={false} className={ui.tab} aria-current={t.id === tab ? "page" : undefined}>
                {t.label}
              </Link>
            ))}
          </nav>
          {tab === "behavioural" && (
            <>
              <FullLead
                env={env}
                card={generalCard}
                settings={settings}
                full={params.full === "1"}
                base={{ prep: GENERAL, tab: "behavioural" }}
                title="Full practice interview"
                line={`A general behavioural interview, ${settings ? `up to ${settings.maxTopics} questions` : "several questions"}, starting with what you have practised least. It follows your answers and ends in one debrief.`}
              />
              {params.full !== "1" && (
                <Behavioural
                  env={env}
                  answers={answers}
                  attempts={attempts}
                  bullets={bullets}
                  companyQuestions={[]}
                  customQuestions={customQs}
                  modelAnswers={modelAnswers}
                  rolePlays={rolePlays}
                  base={{ prep: GENERAL, tab: "behavioural" }}
                />
              )}
            </>
          )}
          {tab === "casing" && <Casing bullets={bullets} sessions={caseSessions} selectedId={params.case} type={params.type} base={{ prep: GENERAL, tab: "casing" }} />}
          {tab === "technical" && <Technical bullets={bullets} extras={(profile?.cvExtras ?? []) as CvExtra[]} />}
        </>
      )}
    </>
  );
}

// ---- the full mock interview, leading a page ---------------------------------------------

function FullLead({
  card,
  settings,
  full,
  base,
  title,
  line,
  env,
}: {
  env: Record<string, string | undefined>;
  card: FullInterviewCard | null;
  settings: FullInterviewSettings | null;
  full: boolean;
  base: Record<string, string>;
  title: string;
  line: string;
}) {
  if (!settings) {
    return (
      <p className={ui.sub}>
        The full mock interview is switched off on this deployment (INTERVIEW_FULL_* settings). Practise question by question below.
      </p>
    );
  }
  if (!card) return null;
  if (full) {
    return (
      <section className={ui.stack} aria-label={title}>
        <Link href={url(base)} scroll={false} className={ui.mono}>
          ← Back to the questions
        </Link>
        <FullInterview card={card} maxTopics={settings.maxTopics} questionBase={base} turn={turnSettingsFromEnv(env)} />
      </section>
    );
  }
  const status = card.runningId ? "One in progress" : card.best !== null ? `Best ${outOfFive(card.best)}` : null;
  return (
    <div className={ui.fullLead}>
      <div>
        <b>{title}</b>
        <p>{line}</p>
        {status && <p>{status}</p>}
      </div>
      <Link href={url({ ...base, full: "1" })} className={ui.btn} data-primary="">
        {card.runningId ? "Resume interview" : "Open full interview"}
      </Link>
    </div>
  );
}

// ---- a company's page ---------------------------------------------------------------------

function CompanyPrep({
  env,
  entry,
  card,
  settings,
  full,
  questions,
  answers,
  attempts,
  bullets,
  modelAnswers,
  rolePlays,
  sessions,
  caseId,
  caseType,
}: {
  env: Record<string, string | undefined>;
  entry: PrepEntry;
  card: FullInterviewCard | null;
  settings: FullInterviewSettings | null;
  full: boolean;
  questions: (CompanyQuestion | RoleQuestion)[];
  answers: Answer[];
  attempts: Attempt[];
  bullets: { id: string; text: string; skills: string[]; projectId: string; roleFamily: string }[];
  modelAnswers: ModelAnswer[];
  rolePlays: RolePlay[];
  sessions: StoredCaseSession[];
  caseId?: string;
  caseType?: string;
}) {
  const base = { prep: entry.slug };
  const n = card?.topics ?? questions.length;
  const asked = settings && settings.maxTopics < n ? ` (${settings.maxTopics} asked)` : "";
  const line =
    entry.kind === "round"
      ? `${n} questions${asked}${card?.interviewer ? ` · ${card.interviewer}` : ""}`
      : entry.kind === "consulting"
        ? "The fit part of the interview: why this firm, why you, and your stories. Practise a case below."
        : "Built from the job ad. Ask your agent to push this round's questions for a more realistic interview.";
  return (
    <>
      <div className={ui.head}>
        <h2>
          {entry.name}
          {entry.role ? ` · ${entry.role}` : ""}
        </h2>
        <span className={ui.sectionMeta}>
          {entry.round ?? (entry.kind === "consulting" ? "Case and fit" : "From the job ad")}
        </span>
      </div>
      <FullLead env={env} card={card} settings={settings} full={full} base={base} title="Full mock interview" line={line} />
      {!full && !caseId && (
        <Behavioural
          env={env}
          answers={answers}
          attempts={attempts}
          bullets={bullets}
          companyQuestions={questions}
          customQuestions={[]}
          modelAnswers={modelAnswers}
          rolePlays={rolePlays}
          base={base}
          lockedCompany={entry.slug}
        />
      )}
      {!full && entry.kind === "consulting" && (
        <section className={ui.stack} aria-label="Cases">
          <h2>Case interview</h2>
          <Casing bullets={bullets} sessions={sessions} selectedId={caseId} type={caseType} base={base} />
        </section>
      )}
    </>
  );
}

// ---- questions ------------------------------------------------------------------------------

/** Read everything once and hand it to the client view; switching questions is then instant. */
function Behavioural({
  answers,
  attempts,
  bullets,
  companyQuestions,
  customQuestions,
  modelAnswers,
  rolePlays,
  base,
  lockedCompany,
  env,
}: {
  answers: Answer[];
  attempts: Attempt[];
  bullets: { id: string; text: string; skills: string[] }[];
  companyQuestions: (CompanyQuestion | RoleQuestion)[];
  customQuestions: Question[];
  modelAnswers: ModelAnswer[];
  rolePlays: RolePlay[];
  base: Record<string, string>;
  lockedCompany?: string;
  /** This user's env (deployment env + their Settings). */
  env: Record<string, string | undefined>;
}) {
  // What your CV bullets already evidence, before you have written anything.
  const evidenced = new Set<string>();
  for (const b of bullets) for (const h of matchCompetencies(`${b.text} ${b.skills.join(" ")}`)) evidenced.add(h.competency);

  return (
    <BehaviouralView
      turn={turnSettingsFromEnv(env)}
      groups={questionBank.groups}
      generic={lockedCompany ? [] : questionBank.questions}
      company={companyQuestions}
      custom={customQuestions}
      customMaxChars={customQuestionMaxCharsFromEnv(env)}
      answers={answers}
      attempts={attempts}
      evidenced={[...evidenced]}
      modelAnswers={modelAnswers}
      rolePlays={rolePlays}
      base={base}
      lockedCompany={lockedCompany}
    />
  );
}

// ---- casing ---------------------------------------------------------------------------------

/** Display names for case types; an unknown type falls back to its id, prettified. */
const CASE_TYPE_LABEL: Record<string, string> = {
  "m-and-a": "M&A",
  "post-merger-integration": "Post-merger",
  "pe-due-diligence": "PE due diligence",
  "pe-value-creation": "PE value creation",
};
/** One line under each case card: how far you have got with it. */
function progressLine(p: CaseProgress | undefined): string {
  if (!p) return "Not tried yet";
  if (p.best !== null) {
    const tries = `${p.finished} ${p.finished === 1 ? "attempt" : "attempts"}`;
    return `Best ${p.best.toFixed(1)} / 5 · ${tries}${p.running ? " · one in progress" : ""}`;
  }
  return p.running ? "In progress" : "Finished - open it to get your feedback";
}
const caseTypeLabel = (t: string) => CASE_TYPE_LABEL[t] ?? t.replace(/-/g, " ");
const pretty = (s: string) => s.replace(/-/g, " ");

function Casing({
  bullets,
  sessions,
  selectedId,
  type,
  base,
}: {
  bullets: { id: string; text: string; skills: string[]; projectId: string; roleFamily: string }[];
  sessions: StoredCaseSession[];
  selectedId?: string;
  type?: string;
  /** The page's own URL params (Practice > Cases, or a consulting firm's page). */
  base: Record<string, string>;
}) {
  const types = [...new Set(caseLibrary.cases.map((c) => c.caseType))];
  const activeType = type && types.includes(type) ? type : "all";
  const shown = caseLibrary.cases.filter((c) => activeType === "all" || c.caseType === activeType);
  const selected = caseLibrary.cases.find((c) => c.id === selectedId);

  const progress = caseProgress(sessions);
  const latest = selected ? sessions.find((s) => s.caseId === selected.id) : undefined; // newest first

  const link = (next: { case?: string; type?: string }) => {
    const sp = new URLSearchParams(base);
    const t = next.type ?? activeType;
    if (t !== "all") sp.set("type", t);
    if (next.case) sp.set("case", next.case);
    return `/app/interview?${sp.toString()}`;
  };

  const cases = caseTypeFits(bullets);
  const text = (id: string) => bullets.find((b) => b.id === id)?.text ?? id;
  const short = (s: string) => (s.length > 90 ? `${s.slice(0, 90)}…` : s);

  return (
    <>
      {selected ? (
        <section className={ui.stack} aria-label={selected.title}>
          <Link href={link({})} scroll={false} className={ui.mono}>
            ← All cases
          </Link>
          <div className={ui.head}>
            <h2>{selected.title}</h2>
            <span className={ui.chips}>
              <span className={ui.chip}>{caseTypeLabel(selected.caseType)}</span>
              <span className={ui.chip}>{pretty(selected.sector)}</span>
              <span className={ui.chip}>{selected.level}</span>
            </span>
          </div>
          <CaseRoom
            key={`${selected.id}:${latest?.id ?? "new"}`}
            sheet={selected}
            latest={
              latest
                ? {
                    id: latest.id,
                    session: latest.session,
                    debrief:
                      latest.status === "done" && latest.scores
                        ? {
                            overall: latest.overall ?? undefined,
                            scores: latest.scores,
                            strengths: latest.strengths,
                            improvements: latest.improvements,
                            perQuestion: latest.perQuestion,
                            model: latest.model,
                          }
                        : null,
                  }
                : null
            }
          />
        </section>
      ) : (
        <section className={ui.stack}>
          <p className={ui.sub}>
            Bain-style candidate-led interviews: you drive, ask for data, and the interviewer hands it over only when
            you ask. Each case follows the flow of a published casebook case, re-set in technology deals. Type or talk.
          </p>
          <nav className={ui.segmented} aria-label="Case type">
            {["all", ...types].map((t) => (
              <Link key={t} href={link({ type: t })} scroll={false} className={ui.pill} aria-current={t === activeType ? "true" : undefined}>
                {t === "all" ? "All" : caseTypeLabel(t)}
              </Link>
            ))}
          </nav>
          <div className={ui.caseList}>
            {shown.map((c) => (
              <Link key={c.id} href={link({ case: c.id })} className={ui.caseCard}>
                <b>{c.title}</b>
                <span className={ui.chips}>
                  <span className={ui.chip}>{caseTypeLabel(c.caseType)}</span>
                  <span className={ui.chip}>{pretty(c.sector)}</span>
                  <span className={ui.chip}>
                    {c.level} · {c.minutes} min
                  </span>
                </span>
                <span className={ui.sub}>{progressLine(progress.get(c.id))}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <details className={ui.panel}>
        <summary>Case types you have lived</summary>
        <p className={ui.sub}>
          A real operating example beats a framework. These are the case types your CV shows you have actually worked
          on - reach for them when an interviewer asks whether you have seen this before.
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
      </details>
    </>
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
      {surface.evidenced.length === 0 && surface.asserted.length === 0 ? (
        <p className={ui.empty}>No Skills or Technologies line on the profile yet.</p>
      ) : surface.evidenced.length === 0 ? null : (
        <>
          <p className={ui.sub}>Backed by your experience</p>
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
