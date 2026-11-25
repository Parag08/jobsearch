import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { listContacts } from "@/lib/repos/contacts";
import { loadDailySourcing } from "@/lib/services/daily-sourcing";
import { norm } from "@/lib/types";
import { AddCompanyWebsiteForm, ConnectBoardForm } from "../../sourcing-forms";
import { PendingButton } from "../../sourcing-controls";
import { askForCompanyResearch, toggleTargetCompany } from "../../sourcing-actions";
import { ClaudeRequest } from "../../claude-request";
import { currentResearch, RESEARCH_LABELS } from "@/lib/watchlist/safe-kit";
import { safePostingUrl } from "@/lib/watchlist/daily";
import ui from "../../ui.module.css";
import s from "../../sourcing.module.css";

const VIEWS = [["overview", "Overview"], ["research", "Company research"], ["network", "Network"]] as const;

export default async function CompanyPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; role?: string; saved?: string; source?: string; error?: string }>;
}) {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const [{ id }, sp, source, contacts] = await Promise.all([
    params, searchParams, loadDailySourcing(w.db, w.userId), listContacts(w.db, w.userId),
  ]);
  const company = source.companies.find((c) => c.id === id);
  if (!company) notFound();
  const view = sp.view === "research" || sp.view === "network" ? sp.view : "overview";
  const path = "/app/companies/" + id;
  const network = "/app/network?companyId=" + encodeURIComponent(id);
  const open = source.available.filter((j) => norm(j.company) === company.identity);
  const saved = source.apps.filter((a) => a.stage === "saved" && (a.companyId ?? id) === id && norm(a.company) === company.identity);
  const boards = source.configured.filter((b) => b.companyId ? b.companyId === id : norm(b.company) === company.identity);
  const people = contacts.filter((p) => p.companyId ? p.companyId === id : norm(p.company ?? "") === company.identity).length;
  const referralRoles = [
    ...open.map((j) => ({ id: j.id, title: j.title })),
    ...saved.map((a) => ({ id: a.id, title: a.role })),
  ];
  const role = referralRoles.find((job) => job.id === sp.role);
  const facts = currentResearch(company.research, company.website);
  return (
    <>
      <div className={ui.head}>
        <div className={ui.headText}>
          <Link href="/app/companies">‹ All target companies</Link>
          <p className={s.eyebrow}>Companies / Shared company record</p>
          <h1>{company.name}</h1>
          <p className={ui.sub}>{company.active ? "Target company" : "Not a target"} · {boards.length ? "Source connected" : "Source setup needed"}</p>
        </div>
        <div className={s.formFoot}>
          {company.website && <a href={company.website} target="_blank" rel="noreferrer" className={ui.btn}>Company website ↗</a>}
          <form action={toggleTargetCompany.bind(null, id, !company.active)}>
            <PendingButton label={company.active ? "Remove target" : "Restore target"} />
          </form>
        </div>
      </div>
      <nav className={s.tabs} aria-label="Company views">
        {VIEWS.map(([key, label]) => <Link key={key} href={key === "overview" ? path : path + "?view=" + key}
          aria-current={view === key ? "page" : undefined}>{label}</Link>)}
      </nav>

      {view === "overview" && <div className={s.split}>
        <div className={s.stack}>
          <section className={ui.panel}>
            <h2>One company, connected.</h2>
            <p className={ui.sub}>Company research stays the same when you switch roles. People stay in your private Network.</p>
            <div className={s.formFoot}>
              <Link href={path + "?view=research"} className={ui.btn}>Company research</Link>
              <Link href={path + "?view=network"} className={ui.btn}>Network · {people}</Link>
            </div>
          </section>
          <section className={ui.panel} id="company-roles">
            <h2>Roles at {company.name}</h2>
            <p className={ui.sub}>{open.length} matching · {saved.length} saved</p>
            {open.length + saved.length === 0 && <p className={ui.none}>No matching or Saved roles yet.</p>}
            <ul className={s.reasons}>
              {open.map((job) => <li key={job.id}>{job.title} · {job.location ?? "Location not stated"} · {job.url &&
                <a href={job.url} target="_blank" rel="noreferrer">Employer posting</a>}
                {" · "}<Link href={path + "?view=network&role=" + job.id}>Find referral path</Link>
              </li>)}
              {saved.map((app) => <li key={app.id}><Link href={"/app/applications/" + app.id}>{app.role}</Link> · Saved ·{" "}
                <Link href={path + "?view=network&role=" + app.id}>Find referral path</Link>
              </li>)}
            </ul>
          </section>
        </div>
        <aside className={ui.panel}>
          <h2>Job board</h2>
          {sp.source && <p role="status" className={ui.sub}>Board connected. Use Refresh roles to check it.</p>}
          {boards.length ? <ul className={s.reasons}>{boards.map((b) => {
            const href = safePostingUrl(b.careersUrl);
            return <li key={b.id}>{href ? <a href={href} target="_blank" rel="noreferrer">{b.ats} board</a> : b.ats}
              {" · "}{b.lastCheckFailed ? "Check failed" : b.lastSuccessAt ? "Last checked " + b.lastSuccessAt.slice(0, 10) : "Not checked yet"}
              <details><summary>Replace board</summary>
                <p className={ui.sub}>A replacement needs a fresh check. Saved applications are kept.</p>
                <ConnectBoardForm companyId={id} replaceId={b.id} />
              </details>
            </li>;
          })}</ul> : company.active ?
            <><p className={ui.sub}>Connect this company’s public ATS board to get roles from it.</p>
              <ConnectBoardForm companyId={id} /></> : <p className={ui.sub}>Restore the target to connect a board.</p>}
        </aside>
      </div>}

      {view === "research" && <section className={ui.panel}>
        <h2>{company.name} · Company research</h2>
        <p className={ui.sub}>One public-source record for this company’s roles and Network.</p>
        <p className={s.tagline}>{company.research_requested ? "Requested" : facts.length ? "Public sources recorded" : "Not requested"}</p>
        {sp.error && <p className={s.notice} role="alert">Research could not be requested. Try again.</p>}
        {!!facts.length && <ul className={s.reasons}>{facts.map((fact) => <li key={fact.kind + fact.url}>
          <a href={fact.url} target="_blank" rel="noreferrer">{RESEARCH_LABELS[fact.kind]} ↗</a> · Checked {fact.checkedAt}
        </li>)}</ul>}
        {!!facts.length && <p className={ui.sub}>These sources describe the organization; fit for a specific role is not a company fact.</p>}
        {company.research_requested ? <ClaudeRequest prompt={
          "Use get_sourcing_company with companyId " + id + ". Review the official website for public facts and use save_sourcing_research with the current version, only approved fact kinds, official URLs, and checked dates. Do not send names, profile links, or personal information."
        } /> : company.website ? <form action={askForCompanyResearch.bind(null, id)}>
          <PendingButton label={facts.length ? "Ask my Claude to refresh research" : "Ask my Claude for company research"} />
        </form> : <>
          <p className={ui.sub}>Add a public company website before requesting research.</p>
          <AddCompanyWebsiteForm companyId={id} />
        </>}
      </section>}

      {view === "network" && <div className={s.split}>
        <section className={ui.panel}>
          <h2>People at {company.name}</h2>
          <p className={ui.sub}>{people} private {people === 1 ? "connection" : "connections"} in your Network. No message is sent from here.</p>
          <div className={s.inlineHead}>
            <Link className={ui.btn} href={network}>Open company Network</Link>
            <a className={ui.btn} href={"https://www.linkedin.com/search/results/people/?keywords=" + encodeURIComponent(company.name)}
              target="_blank" rel="noreferrer">Find people at {company.name} ↗</a>
          </div>
          <details className={s.rankDetails}>
            <summary>Plan a coffee chat</summary>
            <p>Learn about the team and its work before asking about a role.</p>
            <Link href={network}>Choose a connection in Network</Link>
          </details>
        </section>
        <aside className={s.stack}>
          <section className={ui.panel}>
            <h2>Role for a referral</h2>
            {!referralRoles.length ? <p className={ui.sub}>A matching or Saved role is needed for a role-specific referral.</p> :
              <form method="get" className={s.form}>
                <input type="hidden" name="view" value="network" />
                <label className={s.field}>Exact role
                  <select className={ui.input} name="role" defaultValue={role?.id ?? ""} required>
                    <option value="" disabled>Choose a role</option>
                    {referralRoles.map((r) => <option value={r.id} key={r.id}>{r.title} · {r.id}</option>)}
                  </select>
                </label>
                <button className={ui.btn} type="submit">Discuss referral</button>
              </form>}
            {role && <p className={ui.sub}>Ask about <strong>{role.title}</strong> ({role.id}). <Link href={network + "&role=" + role.id}>Choose a connection</Link>.</p>}
          </section>
          <section className={ui.panel}>
            <h2>Prepare with shared facts</h2>
            <Link href={path + "?view=research"}>Open company research</Link>
          </section>
        </aside>
      </div>}
    </>
  );
}
