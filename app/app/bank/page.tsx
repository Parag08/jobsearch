import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { listProjects } from "@/lib/repos/projects";
import { getProfile } from "@/lib/repos/profiles";
import { needsMetric } from "@/lib/onboarding";
import { readiness, nudgeQueue } from "@/lib/onboarding";
import ui from "../ui.module.css";

/**
 * The bullet bank (M2) - the single source of evidence. Bullets needing a
 * metric are marked, not hidden; the readiness meter and nudge queue are the
 * onboarding hand-over surface (docs/ONBOARDING.md screen 7).
 */
export default async function Bank() {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const { db, userId } = w;

  const [projects, profile] = await Promise.all([listProjects(db, userId), getProfile(db, userId)]);
  const bullets = projects.flatMap((p) => p.bullets);
  const thisYear = new Date().getFullYear();

  const ready = readiness({
    identity: Boolean(profile?.displayName),
    education: projects.some((p) => /school|university|insead|mba|college/i.test(`${p.org} ${p.name}`)),
    roles: projects.map((p) => ({ points: p.bullets.length, recent: (p.dates ?? "").includes(String(thisYear)) || (p.dates ?? "").includes(String(thisYear - 1)) || /present|now/i.test(p.dates ?? "") })),
    targets: profile?.roleFamilies.length ?? 0,
  });
  const nudges = nudgeQueue({
    targets: profile?.roleFamilies.length ?? 0,
    workAuthorisation: Boolean(profile?.visaContext),
    languages: false,
    summary: false,
    roles: projects.map((p) => ({ id: p.name, points: p.bullets.length, recent: /present|now|2026|2025/i.test(p.dates ?? "") })),
    bullets: bullets.map((b) => ({ id: b.id, needsMetric: needsMetric(b.text) })),
  });

  const byId = Object.fromEntries(bullets.map((b) => [b.id, b.text]));
  const label = (ref: string) => (byId[ref] ? `“${byId[ref].slice(0, 60)}${byId[ref].length > 60 ? "…" : ""}”` : ref);

  return (
    <>
      <div className={ui.head}>
        <h1>Bank</h1>
        <span className={ui.mono}>
          {projects.length} roles · {bullets.length} bullets
        </span>
      </div>

      <div className={ui.grid2}>
        <section className={ui.panel}>
          <h2>Readiness</h2>
          <div className={ui.meter} aria-label={`readiness ${ready.score}%`}>
            <i style={{ "--w": `${ready.score}%` } as React.CSSProperties} />
          </div>
          <p className={ui.sub}>
            {ready.score}%{ready.missing.length ? ` — to improve: ${ready.missing.join(", ")}` : " — a credible one-page CV can be rendered"}
          </p>
        </section>
        <section className={ui.panel}>
          <h2>Nudges</h2>
          {nudges.length === 0 ? (
            <p className={ui.sub}>Nothing deferred.</p>
          ) : (
            <ul className={ui.rows}>
              {nudges.slice(0, 6).map((n) => (
                <li key={`${n.kind}-${n.ref}`} className={ui.row}>
                  <p>
                    {n.kind.replace(/-/g, " ")}
                    {n.ref ? ` · ${label(n.ref)}` : ""}
                  </p>
                  <span className={ui.mono}>p{n.priority}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {projects.map((p) => (
        <section key={p.id} className={ui.panel}>
          <div className={ui.head}>
            <h2>
              {p.org}
              {p.role ? ` — ${p.role}` : ""}
            </h2>
            <span className={ui.mono}>{p.dates ?? ""}</span>
          </div>
          {p.bullets.length === 0 ? (
            <p className={ui.sub}>No points yet.</p>
          ) : (
            <ul className={ui.rows}>
              {p.bullets.map((b) => (
                <li key={b.id} className={ui.row}>
                  <div>
                    <p>{b.text}</p>
                    <div className={ui.chips} style={{ marginTop: 6 }}>
                      <span className={ui.chip}>{b.roleFamily}</span>
                      {b.skills.slice(0, 5).map((s) => (
                        <span key={s} className={ui.chip}>{s}</span>
                      ))}
                      {(b.variants?.length ?? 0) > 0 && <span className={ui.chip}>{b.variants!.length} variant{b.variants!.length > 1 ? "s" : ""}</span>}
                      {needsMetric(b.text) && <span className={ui.chip} data-tone="gap">needs a metric</span>}
                    </div>
                  </div>
                  <span className={ui.mono} title="strength">{"●".repeat(b.strength ?? 3)}{"○".repeat(5 - (b.strength ?? 3))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
