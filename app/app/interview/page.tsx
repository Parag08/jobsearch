import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { listProjects } from "@/lib/repos/projects";
import { getProfile } from "@/lib/repos/profiles";
import { DEFAULT_COMPETENCIES } from "@/lib/stories/types";
import { matchCompetencies } from "@/lib/stories/competencies";
import { technicalSurface, type CvExtra } from "@/lib/interview/technical";
import { caseTypeFits } from "@/lib/interview/casing";
import { listStories } from "@/lib/repos/stories";
import { StoryForm } from "../story-form";
import ui from "../ui.module.css";

/**
 * Interview prep (DESIGN.md section 3), in three parts.
 *
 * Behavioural and technical are derived from the bank, not written by hand: which
 * competencies your evidence can carry, and which claims on your CV have nothing
 * behind them. Casing separates the archetypes you have lived from the ones you
 * have only read about.
 *
 * Nothing here invents a story. A competency with no evidence is shown as a gap,
 * because that is the useful thing to know before someone asks.
 */
export default async function Interview() {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const { db, userId } = w;

  const [projects, profile, stories] = await Promise.all([
    listProjects(db, userId),
    getProfile(db, userId),
    listStories(db, userId),
  ]);
  const roles = projects.map((p) => ({ id: p.id, label: p.role ? `${p.org} — ${p.role}` : p.org }));
  const storyCompetencies = new Set(stories.flatMap((s) => s.competencies));
  const bullets = projects.flatMap((p) => p.bullets);

  // Which competencies the bank can carry, and the bullets behind each.
  const byCompetency = new Map<string, string[]>();
  for (const c of DEFAULT_COMPETENCIES) byCompetency.set(c, []);
  for (const b of bullets) {
    for (const hit of matchCompetencies(`${b.text} ${b.skills.join(" ")}`)) {
      byCompetency.get(hit.competency)?.push(b.id);
    }
  }
  const covered = [...byCompetency.entries()].filter(([, ids]) => ids.length > 0);
  const gaps = [...byCompetency.entries()].filter(([, ids]) => ids.length === 0);

  const extras = (profile?.cvExtras ?? []) as CvExtra[];
  const surface = technicalSurface(bullets, extras);
  const cases = caseTypeFits(bullets);
  const lived = cases.filter((c) => c.lived);

  const text = (id: string) => bullets.find((b) => b.id === id)?.text ?? id;
  const short = (s: string) => (s.length > 78 ? `${s.slice(0, 78)}…` : s);

  return (
    <>
      <div className={ui.head}>
        <h1>Interview prep</h1>
        <span className={ui.mono}>{bullets.length} bullets · {projects.length} roles</span>
      </div>

      <div className={ui.stats}>
        <div className={ui.stat}><b>{covered.length}</b><span>competencies evidenced</span></div>
        <div className={ui.stat} data-tone={gaps.length ? "stale" : undefined}><b>{gaps.length}</b><span>with no evidence</span></div>
        <div className={ui.stat}><b>{surface.evidenced.length}</b><span>CV claims backed</span></div>
        <div className={ui.stat} data-tone={surface.asserted.length ? "stale" : undefined}><b>{surface.asserted.length}</b><span>claims asserted only</span></div>
        <div className={ui.stat}><b>{lived.length}</b><span>case types lived</span></div>
      </div>

      {/* ---- behavioural ---- */}
      <section className={ui.panel}>
        <h2>Behavioural</h2>
        <p className={ui.sub}>
          Which competencies your record can carry. A gap here is not a weakness — it is a story you
          have not written down yet, and the only person who can write it is you.
        </p>

        {gaps.length > 0 && (
          <>
            <p className={ui.mono}>No evidence — write these before you interview</p>
            <div className={ui.chips}>
              {gaps.map(([c]) => (
                <span key={c} className={ui.chip} data-tone={storyCompetencies.has(c) ? "hit" : "gap"}>
                  {c.replace(/-/g, " ")}
                  {storyCompetencies.has(c) ? " ✓ story written" : ""}
                </span>
              ))}
            </div>
            {/* Seeded with the first gap, because that is the one to write next. */}
            <StoryForm roles={roles} competency={gaps[0][0]} />
          </>
        )}

        <div className={ui.head}>
          <h3>Your stories</h3>
          <span className={ui.mono}>{stories.length} captured</span>
        </div>
        {stories.length === 0 ? (
          <p className={ui.empty}>
            Nothing captured yet. Bullets tell an interviewer what happened; a story tells them what
            you did. Write one above.
          </p>
        ) : (
          <ul className={ui.rows}>
            {stories.map((s) => (
              <li key={s.id} className={ui.row}>
                <div>
                  <p>{short(s.result)}</p>
                  <div className={ui.chips} style={{ marginTop: 6 }}>
                    {s.competencies.map((c) => (
                      <span key={c} className={ui.chip} data-tone="hit">{c.replace(/-/g, " ")}</span>
                    ))}
                    {s.numbers.map((n) => (
                      <span key={n} className={ui.chip}>{n}</span>
                    ))}
                    {!s.action.trim() && <span className={ui.chip} data-tone="gap">no Action yet</span>}
                  </div>
                </div>
                <span className={ui.mono}>{s.capturedAt}</span>
              </li>
            ))}
          </ul>
        )}
        {gaps.length === 0 && <StoryForm roles={roles} />}

        <ul className={ui.rows}>
          {covered.map(([competency, ids]) => (
            <li key={competency} className={ui.row}>
              <div>
                <p><b>{competency.replace(/-/g, " ")}</b></p>
                <span className={ui.mono}>{short(text(ids[0]))}</span>
              </div>
              <span className={ui.mono} title={`${ids.length} bullet(s) evidence this`}>{ids.length}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- technical ---- */}
      <section className={ui.panel}>
        <h2>Technical</h2>
        <p className={ui.sub}>
          Every skill and technology your CV claims is fair game. A claim with no bullet behind it is
          not dishonest — a Skills line exists to be scanned — but you should know which ones they are
          before someone asks you to talk about one.
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
                    <p><b>{c.claim}</b> <span className={ui.chip}>{c.source}</span></p>
                    <span className={ui.mono}>{short(text(c.evidencedBy[0]))}</span>
                  </div>
                  <span className={ui.mono}>{c.evidencedBy.length}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* ---- casing ---- */}
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
    </>
  );
}
