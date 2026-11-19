import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { listWatchlist } from "@/lib/repos/watchlist";
import { listSourcedJobs } from "@/lib/repos/sourced-jobs";
import { addWatchlist, refreshWatchlistAction, removeWatchlist, saveJobTargets, setJobStatus, toggleWatchlist, watchAllReadable, watchCompany } from "../actions";
import { getProfile } from "@/lib/repos/profiles";
import { listCompanies } from "@/lib/repos/companies";
import { atsLabel, orderRoles, postedLabel, suggestedCompanies, targetSummary } from "@/lib/watchlist/display";
import { monogram, toneFor } from "@/lib/pipeline-display";
import ui from "../ui.module.css";
import s from "./watchlist.module.css";

const SUGGESTIONS_SHOWN = 12;
/** Roles listed before "Show all"; shortlisted ones sort first, so they are always in view. */
const ROLES_SHOWN = 20;

const sourceName = (source: string) => atsLabel(source as never) ?? source.charAt(0).toUpperCase() + source.slice(1);

/**
 * Company-targeted sourcing (DESIGN.md sections 4 and 5, Watchlist): the companies you name,
 * read from their own job boards when you check. The roles found come first because they
 * are what the page is for; the companies feed them; the filters are set once and fold away.
 * With nothing watched yet, adding a company is the invitation, so it leads.
 */
export default async function Watchlist({ searchParams }: { searchParams: Promise<{ roles?: string }> }) {
  const allRoles = (await searchParams).roles === "all";
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const { db, userId } = w;

  const [profile, entries, jobs, directory] = await Promise.all([
    getProfile(db, userId),
    listWatchlist(db, userId),
    listSourcedJobs(db, userId),
    listCompanies(db).catch(() => []),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const watched = new Set(entries.map((e) => e.company));
  const suggestions = suggestedCompanies(directory, watched);
  const active = entries.filter((e) => e.active).length;
  const roles = orderRoles(jobs.filter((j) => j.status === "new" || j.status === "shortlisted"));
  const shortlisted = roles.filter((j) => j.status === "shortlisted").length;
  const targets = {
    targetGeos: profile?.targetGeos ?? [],
    targetTitles: profile?.targetTitles ?? [],
    excludedTitles: profile?.excludedTitles ?? [],
  };
  const filtersSet = targets.targetGeos.length + targets.targetTitles.length + targets.excludedTitles.length > 0;

  const rolesPanel = (
    <section className={ui.panel} aria-labelledby="roles-h">
      <div>
        <h2 id="roles-h">Roles found</h2>
        <p className={ui.sub}>From the job boards of the companies you watch. Shortlist the ones worth a closer look.</p>
      </div>
      {roles.length === 0 ? (
        <p className={ui.none}>
          {active > 0 ? "No open roles match yet. Check for new roles, or widen the filters below." : "Watch a company and check its board to see roles here."}
        </p>
      ) : (
        <ul className={s.list}>
          {(allRoles ? roles : roles.slice(0, ROLES_SHOWN)).map((j) => {
            const posted = postedLabel(j.postedAt, today);
            return (
              <li key={j.id} className={s.role}>
                <span className={ui.monogram} data-tone={toneFor(j.company)} aria-hidden="true">
                  {monogram(j.company)}
                </span>
                <div className={s.roleBody}>
                  <p className={s.roleTitle}>
                    {j.url ? (
                      <a href={j.url} target="_blank" rel="noopener noreferrer">
                        {j.title}
                        <span className={s.srOnly}> (opens the posting)</span>
                      </a>
                    ) : (
                      j.title
                    )}
                  </p>
                  <p className={s.meta}>{[j.company, j.location, posted, `via ${sourceName(j.source)}`].filter(Boolean).join(" · ")}</p>
                  {(j.status === "shortlisted" || j.score !== null) && (
                    <div className={s.tags}>
                      {j.status === "shortlisted" && (
                        <span className={ui.tag} data-tone="blue">
                          Shortlisted
                        </span>
                      )}
                      {j.score !== null && <span className={ui.tag}>Fit {Math.round(j.score)}</span>}
                    </div>
                  )}
                </div>
                <div className={s.actions}>
                  {j.status !== "shortlisted" && (
                    <form action={setJobStatus.bind(null, j.id, "shortlisted")}>
                      <button className={ui.textBtn} type="submit" aria-label={`Shortlist ${j.title} at ${j.company}`}>
                        Shortlist
                      </button>
                    </form>
                  )}
                  <form action={setJobStatus.bind(null, j.id, "dismissed")}>
                    <button className={ui.textBtn} data-tone="quiet" type="submit" aria-label={`Dismiss ${j.title} at ${j.company}`}>
                      Dismiss
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {roles.length > ROLES_SHOWN && (
        <Link href={allRoles ? "/app/watchlist" : "/app/watchlist?roles=all"} className={ui.sumLink} scroll={false}>
          {allRoles ? "Show fewer" : `Show all ${roles.length}`}
        </Link>
      )}
    </section>
  );

  const companiesPanel = (
    <section className={ui.panel} aria-labelledby="companies-h">
      <div>
        <h2 id="companies-h">Companies you watch</h2>
        <p className={ui.sub}>
          Paste a company&apos;s careers page. We read Greenhouse, Lever, Ashby and SmartRecruiters boards when you check
          for new roles; for any other site, we&apos;ll remind you to check it yourself.
        </p>
      </div>
      <form action={addWatchlist} className={s.addForm}>
        <input className={ui.input} name="company" placeholder="Company" aria-label="Company" required />
        <input className={ui.input} name="careersUrl" type="url" placeholder="https://boards.greenhouse.io/company" aria-label="Careers page" required />
        <button className={ui.btn} type="submit">
          Add company
        </button>
      </form>

      {entries.length === 0 ? (
        <p className={ui.none}>No companies yet. Add one above{suggestions.length ? ", or pick from the suggestions below" : ""}, and we&apos;ll read its job board when you check for new roles.</p>
      ) : (
        <ul className={s.list}>
          {entries.map((e) => {
            const board = atsLabel(e.ats);
            return (
              <li key={e.id} className={s.company} data-paused={!e.active || undefined}>
                <span className={ui.monogram} data-tone={toneFor(e.company)} aria-hidden="true">
                  {monogram(e.company)}
                </span>
                <div className={s.roleBody}>
                  <p className={s.roleTitle}>
                    {e.company}
                    {!e.active && <span className={ui.tag}>Paused</span>}
                  </p>
                  <p className={s.meta}>
                    {board ? <span>Read from {board}</span> : <span className={s.byHand}>Check by hand</span>}
                    {" · "}
                    <a href={e.careersUrl} target="_blank" rel="noopener noreferrer" className={s.url}>
                      {e.careersUrl.replace(/^https?:\/\/(www\.)?/, "")}
                    </a>
                  </p>
                </div>
                <div className={s.actions}>
                  <form action={toggleWatchlist.bind(null, e.id, !e.active)}>
                    <button className={ui.textBtn} type="submit" aria-label={`${e.active ? "Pause" : "Resume"} ${e.company}`}>
                      {e.active ? "Pause" : "Resume"}
                    </button>
                  </form>
                  <form action={removeWatchlist.bind(null, e.id)}>
                    <button className={ui.textBtn} data-tone="quiet" type="submit" aria-label={`Remove ${e.company}`}>
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {suggestions.length > 0 && (
        <details className={s.suggest} open={entries.length === 0}>
          <summary className={s.suggestHead}>
            <span>Suggested companies</span>
            <span className={s.count}>{suggestions.length} with boards we can read</span>
          </summary>
          <ul className={s.suggestList}>
            {suggestions.slice(0, SUGGESTIONS_SHOWN).map((c) => (
              <li key={c.id}>
                <form action={watchCompany.bind(null, c.id)}>
                  <button type="submit" className={s.suggestBtn} aria-label={`Watch ${c.name}`}>
                    <span aria-hidden="true">+</span> {c.name}
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <form action={watchAllReadable}>
            <button type="submit" className={ui.textBtn}>
              Watch all {suggestions.length}
            </button>
          </form>
        </details>
      )}
    </section>
  );

  const filtersPanel = (
    <details className={ui.panel} open={!filtersSet}>
      <summary className={s.filtersHead}>
        <span>
          <b>What to look for</b>
          <span className={s.count}>{targetSummary(targets)}</span>
        </span>
        <span className={s.chevron} aria-hidden="true" />
      </summary>
      <p className={ui.sub}>
        We only show roles in these cities whose title matches a phrase you include and none you skip. One per line. An
        empty box filters nothing.
      </p>
      <form action={saveJobTargets} className={s.filters}>
        <label className={s.field}>
          <span>Cities</span>
          <textarea className={ui.input} name="geos" rows={5} defaultValue={targets.targetGeos.join("\n")} placeholder="Singapore" />
        </label>
        <label className={s.field}>
          <span>Job titles to include</span>
          <textarea className={ui.input} name="titles" rows={5} defaultValue={targets.targetTitles.join("\n")} placeholder={"product manager\nchief of staff"} />
        </label>
        <label className={s.field}>
          <span>Job titles to skip</span>
          <textarea className={ui.input} name="excluded" rows={5} defaultValue={targets.excludedTitles.join("\n")} placeholder={"designer\nsales"} />
        </label>
        <div className={s.filtersFoot}>
          <button className={ui.btn} type="submit" disabled={!profile}>
            Save filters
          </button>
        </div>
      </form>
    </details>
  );

  return (
    <>
      <div className={ui.head}>
        <div className={ui.headText}>
          <h1>Watchlist</h1>
          <p className={ui.facts}>
            <span>
              <b>{entries.length}</b> {entries.length === 1 ? "company" : "companies"}
            </span>
            <span>
              <b>{roles.length}</b> open {roles.length === 1 ? "role" : "roles"}
            </span>
            <span>
              <b>{shortlisted}</b> shortlisted
            </span>
          </p>
        </div>
        {active > 0 && (
          <form action={refreshWatchlistAction}>
            <button className={ui.btn} data-primary="" type="submit">
              Check for new roles
            </button>
          </form>
        )}
      </div>

      {entries.length === 0 ? (
        <>
          {companiesPanel}
          {filtersPanel}
        </>
      ) : (
        <>
          {rolesPanel}
          {companiesPanel}
          {filtersPanel}
        </>
      )}
    </>
  );
}
