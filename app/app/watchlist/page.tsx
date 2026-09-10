import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { listWatchlist } from "@/lib/repos/watchlist";
import { listSourcedJobs } from "@/lib/repos/sourced-jobs";
import { addWatchlist, refreshWatchlistAction, removeWatchlist, setJobStatus, toggleWatchlist } from "../actions";
import ui from "../ui.module.css";

/**
 * Company-targeted sourcing (DESIGN.md section 4): declared targets, sourced
 * from their own ATS boards - keyless, no scraping. Aggregator discovery
 * shares the same table with a lower weight.
 */
export default async function Watchlist() {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const { db, userId } = w;

  const [entries, jobs] = await Promise.all([listWatchlist(db, userId), listSourcedJobs(db, userId)]);
  const open = jobs.filter((j) => j.status === "new" || j.status === "shortlisted");

  return (
    <>
      <div className={ui.head}>
        <h1>Watchlist</h1>
        <form action={refreshWatchlistAction}>
          <button className={ui.btn} data-primary="" type="submit" disabled={entries.filter((e) => e.active).length === 0}>
            Check boards now
          </button>
        </form>
      </div>

      <section className={ui.panel}>
        <h2>Companies you are watching</h2>
        <p className={ui.sub}>
          Paste a careers page URL. Greenhouse, Lever, Ashby and SmartRecruiters boards are read directly from their public
          endpoints; anything else is kept for you to check by hand.
        </p>
        <form action={addWatchlist} className={ui.form}>
          <input className={ui.input} name="company" placeholder="Company" required />
          <input className={ui.input} name="careersUrl" placeholder="https://boards.greenhouse.io/…" required style={{ flex: 1, minWidth: 240 }} />
          <button className={ui.btn} type="submit">Watch</button>
        </form>
        {entries.length === 0 ? (
          <p className={ui.empty}>No targets yet. A declared target outranks anything an aggregator stumbles on.</p>
        ) : (
          <ul className={ui.rows}>
            {entries.map((e) => (
              <li key={e.id} className={ui.row}>
                <div>
                  <p>
                    <b>{e.company}</b> <span className={ui.chip} data-tone={e.ats === "unknown" ? "gap" : "hit"}>{e.ats}</span>
                  </p>
                  <span className={ui.mono}>{e.careersUrl}</span>
                </div>
                <div className={ui.actions}>
                  <form action={toggleWatchlist.bind(null, e.id, !e.active)}>
                    <button className={ui.btn} type="submit">{e.active ? "pause" : "resume"}</button>
                  </form>
                  <form action={removeWatchlist.bind(null, e.id)}>
                    <button className={ui.btn} type="submit">remove</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={ui.panel}>
        <h2>Open roles found</h2>
        {open.length === 0 ? (
          <p className={ui.empty}>Nothing sourced yet. Add a company above and check its board.</p>
        ) : (
          <div className={ui.tablewrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Company</th>
                  <th>Location</th>
                  <th>Fit</th>
                  <th>Source</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {open.map((j) => (
                  <tr key={j.id}>
                    <td>{j.url ? <a href={j.url} target="_blank" rel="noopener noreferrer">{j.title}</a> : j.title}</td>
                    <td>{j.company}</td>
                    <td>{j.location ?? ""}</td>
                    <td className={ui.mono}>{j.score ?? "—"}</td>
                    <td className={ui.mono}>{j.source}</td>
                    <td>
                      <div className={ui.actions}>
                        {j.status !== "shortlisted" && (
                          <form action={setJobStatus.bind(null, j.id, "shortlisted")}>
                            <button className={ui.btn} type="submit">shortlist</button>
                          </form>
                        )}
                        <form action={setJobStatus.bind(null, j.id, "dismissed")}>
                          <button className={ui.btn} type="submit">dismiss</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
