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
import { FIRMS, firmLabel, questionBank } from "./bank";
import { BehaviouralView } from "./behavioural-view";
import { listCaseSessions, type StoredCaseSession } from "@/lib/repos/case-sessions";
import { caseLibrary } from "./cases";
import { CaseRoom } from "./case-room";
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

export default async function Interview({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; firm?: string; case?: string; type?: string }>;
}) {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const { db, userId } = w;

  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === params.tab) ? (params.tab as Tab) : "behavioural";
  const firm = params.firm === "all" || FIRMS.includes(params.firm ?? "") ? (params.firm as string) : "bain";

  const [projects, profile, answers, attempts, caseSessions] = await Promise.all([
    listProjects(db, userId),
    getProfile(db, userId),
    listAnswers(db, userId),
    listAttempts(db, userId),
    tab === "casing" ? listCaseSessions(db, userId) : Promise.resolve([]),
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
        <Behavioural answers={answers} attempts={attempts} bullets={bullets} />
      )}
      {tab === "casing" && (
        <Casing bullets={bullets} sessions={caseSessions} selectedId={params.case} type={params.type} />
      )}
      {tab === "technical" && <Technical bullets={bullets} extras={(profile?.cvExtras ?? []) as CvExtra[]} />}
    </>
  );
}

// ---- behavioural ---------------------------------------------------------------------------

/**
 * The server side of the behavioural tab: read everything once, hand it to the client
 * view. Question and firm switching then happen in the browser with no round trip.
 */
function Behavioural({
  answers,
  attempts,
  bullets,
}: {
  answers: Answer[];
  attempts: Attempt[];
  bullets: { id: string; text: string; skills: string[] }[];
}) {
  // What your CV bullets already evidence, before you have written anything.
  const evidenced = new Set<string>();
  for (const b of bullets) for (const h of matchCompetencies(`${b.text} ${b.skills.join(" ")}`)) evidenced.add(h.competency);
  const firmLabels = Object.fromEntries([...FIRMS, "all"].map((f) => [f, firmLabel(f)]));

  return (
    <>
      <BehaviouralView
        bank={questionBank}
        firms={FIRMS}
        firmLabels={firmLabels}
        answers={answers}
        attempts={attempts}
        evidenced={[...evidenced]}
      />

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

/** Display names for case types; an unknown type falls back to its id, prettified. */
const CASE_TYPE_LABEL: Record<string, string> = {
  "m-and-a": "M&A",
  "post-merger-integration": "Post-merger",
  "pe-due-diligence": "PE due diligence",
  "pe-value-creation": "PE value creation",
};
const caseTypeLabel = (t: string) => CASE_TYPE_LABEL[t] ?? t.replace(/-/g, " ");
const pretty = (s: string) => s.replace(/-/g, " ");

function Casing({
  bullets,
  sessions,
  selectedId,
  type,
}: {
  bullets: { id: string; text: string; skills: string[]; projectId: string; roleFamily: string }[];
  sessions: StoredCaseSession[];
  selectedId?: string;
  type?: string;
}) {
  const types = [...new Set(caseLibrary.cases.map((c) => c.caseType))];
  const activeType = type && types.includes(type) ? type : "all";
  const shown = caseLibrary.cases.filter((c) => activeType === "all" || c.caseType === activeType);
  const selected = caseLibrary.cases.find((c) => c.id === selectedId);

  const best = new Map<string, number>();
  const tries = new Map<string, number>();
  for (const s of sessions) {
    tries.set(s.caseId, (tries.get(s.caseId) ?? 0) + 1);
    if (s.overall !== null) best.set(s.caseId, Math.max(best.get(s.caseId) ?? 0, s.overall));
  }
  const latest = selected ? sessions.find((s) => s.caseId === selected.id) : undefined; // newest first

  const link = (next: { case?: string; type?: string }) => {
    const sp = new URLSearchParams({ tab: "casing" });
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
            key={latest?.id ?? "new"}
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
                <span className={ui.sub}>
                  {best.has(c.id) ? (
                    <>
                      Best <b>{best.get(c.id)!.toFixed(1)}</b> / 5 · {tries.get(c.id)} {tries.get(c.id) === 1 ? "attempt" : "attempts"}
                    </>
                  ) : tries.has(c.id) ? (
                    "In progress"
                  ) : (
                    "Not tried yet"
                  )}
                </span>
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
