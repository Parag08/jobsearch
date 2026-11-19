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
import { STATUS_LABEL, STATUS_ORDER, STATUS_SUB, STATUS_TONE, basedOn, statusCounts } from "@/lib/insights/display";
import { familyLabel } from "@/lib/pipeline-display";
import { draftRolePlanAction, readUnreadRolesAction } from "./actions";
import { RequirementList } from "./requirement-list";
import ui from "../ui.module.css";
import s from "./insights.module.css";

/** "On your CV" -> "on your CV": sentence case mid-sentence, acronyms kept. */
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

type Params = { family?: string; title?: string; error?: string; read?: string; failed?: string };

/**
 * Role insights (DESIGN.md section 5, Insights): what the roles you've collected ask for, and
 * whether your Bank backs it. The summary says how much it rests on; the groups run from
 * what needs attention to what is done; every row links to where you'd fix it.
 */
export default async function Insights({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const { db, userId } = w;

  const [apps, projects, profile] = await Promise.all([listApplications(db, userId), listProjects(db, userId), getProfile(db, userId)]);
  const taxonomy = profile?.taxonomy ?? { tags: {} };
  const unread = (await unreadRoleIds(db, userId)).length;
  const families = roleFamilies(apps);
  const readTotal = families.reduce((n, f) => n + f.roles, 0);
  const readBatch = roleReadBatchFromEnv(process.env);
  const planEnabled = rolePlanMaxGapsFromEnv(process.env) !== undefined;

  const family = sp.family?.trim() || undefined;
  const title = sp.title?.trim() || undefined;
  const by: RoleSelector = family || title ? { ...(family ? { family } : {}), ...(title ? { title } : {}) } : families[0] ? { family: families[0].family } : {};
  const active = by.family !== undefined || by.title !== undefined;
  const insights = active ? roleInsights(selectRoles(apps, by), projects, taxonomy) : null;
  const plan = active ? await getRolePlan(db, userId, planKey(by)) : null;

  const reqs = insights?.requirements ?? [];
  const counts = statusCounts(reqs);
  const roleName = new Map(projects.map((p) => [p.id, p.org || p.name]));
  const failed = Number(sp.failed ?? 0);
  const familyHref = (f: string) => `/app/insights?family=${encodeURIComponent(f)}`;
  const selectionName = [by.family ? familyLabel(by.family) : null, by.title ? `“${by.title}”` : null].filter(Boolean).join(", ");
  const toPlan = counts.gap + counts.unstated;

  /** One status group, or nothing when it is empty (the summary already says so). */
  const group = (st: (typeof STATUS_ORDER)[number]) => {
    const items = reqs.filter((r) => r.status === st);
    if (!insights || items.length === 0) return null;
    return (
      <RequirementList
        id={st}
        title={STATUS_LABEL[st]}
        sub={STATUS_SUB[st]}
        tone={STATUS_TONE[st]}
        items={items}
        total={insights.roles}
        collapsed={st === "evidenced"}
        links={(r) =>
          st === "unstated"
            ? r.projectIds.map((id) => ({ href: `/app/bank#role-${id}`, text: `Mentioned in ${roleName.get(id) ?? "a role"}: add it as a point` }))
            : st === "evidenced" && r.bulletIds[0]
              ? [{ href: `/app/bank#point-${r.bulletIds[0]}`, text: `Backed by ${r.bulletIds.length} ${r.bulletIds.length === 1 ? "point" : "points"}` }]
              : []
        }
      />
    );
  };

  const selection = (
    <>
      {by.family && <input type="hidden" name="family" value={by.family} />}
      {by.title && <input type="hidden" name="title" value={by.title} />}
    </>
  );

  // Nothing to plan and nothing planned: the panel would only be an empty promise.
  const planPanel = insights && (toPlan > 0 || plan) && (
    <section className={ui.panel} id="plan" aria-labelledby="plan-h">
      <div className={s.planHead}>
        <div>
          <h2 id="plan-h">Plan for the gaps</h2>
          <p className={ui.sub}>
            {plan ? `Written ${plan.generatedAt} from ${plan.rolesSeen} ${plan.rolesSeen === 1 ? "role" : "roles"}.` : "A short plan for closing what these roles ask for and your Bank doesn't show."}
          </p>
        </div>
        {planEnabled && toPlan > 0 && (
          <form action={draftRolePlanAction}>
            {selection}
            <button className={ui.btn} data-primary="" type="submit">
              {plan ? "Redraft the plan" : "Make a plan for these gaps"}
            </button>
          </form>
        )}
      </div>
      {plan && (
        <div className={s.prose}>
          {plan.text.split(/\n\s*\n/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}
      {!planEnabled && <p className={ui.none}>Plans aren&apos;t switched on for this workspace yet.</p>}
    </section>
  );

  return (
    <>
      <div className={ui.head}>
        <div className={ui.headText}>
          <h1>Insights</h1>
          <p className={ui.facts}>
            <span>What the roles you&apos;ve collected ask for, and whether your Bank backs it.</span>
          </p>
        </div>
      </div>

      {sp.error && <p className={s.alert} role="alert">{sp.error}</p>}

      {families.length === 0 ? (
        <section className={ui.panel}>
          <p className={ui.none}>
            Nothing has been read yet. Add a job to your <Link href="/app">pipeline</Link> and its requirements show up here once
            the posting is read.
          </p>
          {unread > 0 && <UnreadNotice unread={unread} readBatch={readBatch} selection={selection} />}
        </section>
      ) : (
        <>
          <nav className={s.picker} aria-label="Role families">
            <ul className={s.families}>
              {families.map((f) => (
                <li key={f.family}>
                  <Link className={s.family} href={familyHref(f.family)} aria-current={f.family === by.family && !by.title ? "page" : undefined}>
                    {familyLabel(f.family)} <span>{f.roles}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <form method="get" action="/app/insights" className={s.search} role="search">
              {by.family && <input type="hidden" name="family" value={by.family} />}
              <input className={ui.input} type="search" name="title" defaultValue={title ?? ""} placeholder="Filter by title" aria-label="Filter by words in the job title" />
              <button className={ui.btn} type="submit">
                Filter
              </button>
              {title && (
                <Link href={by.family ? familyHref(by.family) : "/app/insights"} className={ui.sumLink}>
                  Clear
                </Link>
              )}
            </form>
          </nav>

          {insights && (
            <section className={ui.panel} aria-label="Summary">
              <div className={ui.summary}>
                <div className={ui.sumStat}>
                  <span className={ui.sumLabel}>Roles read{selectionName ? ` · ${selectionName}` : ""}</span>
                  <b className={ui.sumValue}>{insights.roles}</b>
                  <span className={ui.sumNote}>{basedOn(readTotal, apps.length)}</span>
                </div>
                <div className={ui.sumStat}>
                  <span className={ui.sumLabel}>What they ask for</span>
                  <div className={ui.sumBar} role="img" aria-label={STATUS_ORDER.map((st) => `${counts[st]} ${lowerFirst(STATUS_LABEL[st])}`).join(", ")}>
                    {[...STATUS_ORDER].reverse().map((st) => (counts[st] > 0 ? <i key={st} data-tone={STATUS_TONE[st]} style={{ flexGrow: counts[st] }} /> : null))}
                  </div>
                  <span className={ui.legend}>
                    {[...STATUS_ORDER].reverse().map((st) => (
                      <span key={st} data-tone={STATUS_TONE[st]}>
                        {counts[st]} {lowerFirst(STATUS_LABEL[st])}
                      </span>
                    ))}
                  </span>
                </div>
                <div className={ui.sumStat}>
                  <span className={ui.sumLabel}>Not on record</span>
                  <b className={ui.sumValue} data-tone={counts.gap ? "attention" : "good"}>{counts.gap}</b>
                  <span className={ui.sumNote}>
                    {counts.gap ? (
                      <a href="#gap" className={ui.sumLink}>See the gaps</a>
                    ) : (
                      "Nothing these roles ask for is missing from your history."
                    )}
                  </span>
                </div>
              </div>
              {(unread > 0 || sp.read !== undefined) && (
                <UnreadNotice unread={unread} readBatch={readBatch} selection={selection} justRead={sp.read !== undefined ? Number(sp.read) : undefined} failed={failed} />
              )}
            </section>
          )}

          {group("gap")}
          {group("unstated")}
          {planPanel}
          {group("evidenced")}
        </>
      )}
    </>
  );
}

/** "3 saved roles haven't been read yet" with the button beside it, or the result of reading. */
function UnreadNotice({
  unread,
  readBatch,
  selection,
  justRead,
  failed = 0,
}: {
  unread: number;
  readBatch: number | undefined;
  selection: React.ReactNode;
  justRead?: number;
  failed?: number;
}) {
  const result =
    justRead !== undefined
      ? `Read ${justRead} ${justRead === 1 ? "role" : "roles"}${failed > 0 ? `; ${failed} couldn't be read` : ""}.`
      : null;
  return (
    <div className={ui.notice} data-tone={failed > 0 ? "attention" : undefined} role="status">
      <span>
        {result}
        {result && unread > 0 ? " " : ""}
        {unread > 0 && `${unread} saved ${unread === 1 ? "role hasn't" : "roles haven't"} been read yet.`}
        {unread > 0 && readBatch === undefined && " Reading roles isn't switched on for this workspace."}
      </span>
      {unread > 0 && readBatch !== undefined && (
        <form action={readUnreadRolesAction}>
          {selection}
          <button className={ui.btn} type="submit">
            Read {Math.min(unread, readBatch)} now
          </button>
        </form>
      )}
    </div>
  );
}
