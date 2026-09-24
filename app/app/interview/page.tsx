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
        <Behavioural answers={answers} attempts={attempts} bullets={bullets} />
      )}
      {tab === "casing" && <Casing bullets={bullets} />}
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
