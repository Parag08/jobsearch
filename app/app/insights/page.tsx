import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { listApplications } from "@/lib/repos/applications";
import { listProjects } from "@/lib/repos/projects";
import { getProfile } from "@/lib/repos/profiles";
import { getRolePlan } from "@/lib/repos/role-plans";
import { unreadRoleIds } from "@/lib/services/read-role";
import { planKey } from "@/lib/services/role-plan";
import { roleFamilies, roleInsights, selectRoles, type RoleSelector } from "@/lib/insights/role-insights";
import { rolePlanMaxGapsFromEnv, roleReadBatchFromEnv } from "@/lib/insights/settings";
import { draftRolePlanAction, readUnreadRolesAction } from "./actions";
import { RequirementList } from "./requirement-list";
import ui from "../ui.module.css";

type Params = { family?: string; title?: string; error?: string; read?: string; failed?: string };

/** Role insights: what the roles read so far ask for, and whether the bullet bank backs it. */
export default async function Insights({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const { db, userId } = w;

  const [apps, projects, profile] = await Promise.all([listApplications(db, userId), listProjects(db, userId), getProfile(db, userId)]);
  const taxonomy = profile?.taxonomy ?? { tags: {} };
  const unread = (await unreadRoleIds(db, userId)).length;
  const families = roleFamilies(apps);
  const readBatch = roleReadBatchFromEnv(process.env);
  const planEnabled = rolePlanMaxGapsFromEnv(process.env) !== undefined;

  const family = sp.family?.trim() || undefined;
  const title = sp.title?.trim() || undefined;
  const by: RoleSelector = family || title ? { ...(family ? { family } : {}), ...(title ? { title } : {}) } : families[0] ? { family: families[0].family } : {};
  const active = by.family !== undefined || by.title !== undefined;
  const insights = active ? roleInsights(selectRoles(apps, by), projects, taxonomy) : null;
  const plan = active ? await getRolePlan(db, userId, planKey(by)) : null;

  const reqs = insights?.requirements ?? [];
  const gaps = reqs.filter((r) => r.status === "gap");
  const unstated = reqs.filter((r) => r.status === "unstated");
  const evidenced = reqs.filter((r) => r.status === "evidenced");
  const projectName = new Map(projects.map((p) => [p.id, `${p.role ? p.role + ", " : ""}${p.org}`]));
  const failed = Number(sp.failed ?? 0);

  return (
    <>
      <div className={ui.head}>
        <h1>Role insights</h1>
      </div>
      <p className={ui.sub}>What the roles you have collected ask for, and whether your CV backs it.</p>

      {sp.error && <p className={ui.warn}>{sp.error}</p>}
      {sp.read !== undefined && (
        <p className={ui.sub}>Read {sp.read} roles.{failed > 0 ? ` ${failed} could not be read.` : ""}</p>
      )}

      {unread > 0 && (
        <div className={ui.form}>
          <p className={ui.sub}>{unread} saved roles have a posting that has not been read yet.</p>
          {readBatch !== undefined ? (
            <form action={readUnreadRolesAction}>
              {by.family && <input type="hidden" name="family" value={by.family} />}
              {by.title && <input type="hidden" name="title" value={by.title} />}
              <button className={ui.btn} type="submit">Read them</button>
            </form>
          ) : (
            <span className={ui.mono}>Set ROLE_READ_BATCH to enable.</span>
          )}
        </div>
      )}

      {families.length === 0 ? (
        <p className={ui.empty}>
          Nothing has been read yet. Roles appear here once a pasted or agent-added posting has been read.
        </p>
      ) : (
        <nav className={ui.form} aria-label="Role families">
          <div className={ui.chips}>
            {families.map((f) => (
              <Link
                key={f.family}
                className={ui.chip}
                data-tone={f.family === by.family ? "hit" : undefined}
                href={`/app/insights?family=${encodeURIComponent(f.family)}`}
                aria-current={f.family === by.family ? "page" : undefined}
              >
                {f.family} ({f.roles})
              </Link>
            ))}
          </div>
          <form method="get" action="/app/insights" className={ui.form}>
            {by.family && <input type="hidden" name="family" value={by.family} />}
            <input className={ui.input} name="title" defaultValue={title ?? ""} placeholder="or title words, e.g. forward deployed" />
            <button className={ui.btn} type="submit">Filter</button>
          </form>
        </nav>
      )}

      {insights && (
        <>
          <div className={ui.stats}>
            <div className={ui.stat}><b>{insights.roles}</b><span>roles read</span></div>
            <div className={ui.stat}><b>{evidenced.length}</b><span>requirements evidenced</span></div>
            <div className={ui.stat}><b>{unstated.length}</b><span>unstated</span></div>
            <div className={ui.stat}><b>{gaps.length}</b><span>gaps</span></div>
          </div>
          <RequirementList title="Gaps" sub="Nothing on record backs these." items={gaps} total={insights.roles} detail={() => null} />
          <RequirementList
            title="Unstated"
            sub="Your history mentions these but no CV bullet says so."
            items={unstated}
            total={insights.roles}
            detail={(r) => `Mentioned in: ${r.projectIds.map((id) => projectName.get(id) ?? id).join("; ")}`}
          />
          <RequirementList
            title="Backed by your CV"
            sub="At least one bullet in your bank says so."
            items={evidenced}
            total={insights.roles}
            detail={(r) => `${r.bulletIds.length} backing ${r.bulletIds.length === 1 ? "bullet" : "bullets"}`}
          />

          <section className={ui.panel} id="plan">
            <h2>Gap plan</h2>
            {plan ? (
              <>
                {plan.text.split(/\n\s*\n/).map((para, i) => (
                  <p key={i} style={{ whiteSpace: "pre-wrap" }}>{para}</p>
                ))}
                <span className={ui.mono}>Written {plan.generatedAt} from {plan.rolesSeen} roles.</span>
              </>
            ) : (
              <p className={ui.sub}>No plan drafted for this selection yet.</p>
            )}
            {!planEnabled ? (
              <span className={ui.mono}>Set ROLE_PLAN_MAX_GAPS to enable plan drafting.</span>
            ) : gaps.length + unstated.length > 0 ? (
              <form action={draftRolePlanAction}>
                {by.family && <input type="hidden" name="family" value={by.family} />}
                {by.title && <input type="hidden" name="title" value={by.title} />}
                <button className={ui.btn} data-primary="" type="submit">{plan ? "Redraft the plan" : "Draft a plan"}</button>
              </form>
            ) : null}
          </section>
        </>
      )}
    </>
  );
}
