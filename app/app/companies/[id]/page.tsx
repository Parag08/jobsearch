import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getWorkspace } from "@/lib/db";
import { listContacts } from "@/lib/repos/contacts";
import { getSourcingCompany } from "@/lib/repos/sourcing";
import { loadDailySourcing } from "@/lib/services/daily-sourcing";
import { norm } from "@/lib/types";
import { AddCompanyWebsiteForm, ConnectBoardForm } from "../../sourcing-forms";
import { PendingButton, SourcingDialog } from "../../sourcing-controls";
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
  const { id } = await params;
  if (w.mode === "live" && !z.uuid().safeParse(id).success) notFound();
  const [sp, source, contacts, company] = await Promise.all([
    searchParams, loadDailySourcing(w.db, w.userId), listContacts(w.db, w.userId), getSourcingCompany(w.db, w.userId, id),
  ]);
  if (!company) notFound();
  const view = sp.view === "research" || sp.view === "network" ? sp.view : "overview";
  const path = "/app/companies/" + id;
  const network = "/app/network?companyId=" + encodeURIComponent(id);
  const open = source.available.filter((j) => norm(j.company) === company.identity);
  const saved = source.apps.filter((a) => a.stage === "saved" && (a.companyId ?? id) === id && norm(a.company) === company.identity);
  const boards = source.configured.filter((b) => b.companyId ? b.companyId === id : norm(b.company) === company.identity);
  const people = contacts.filter((p) => p.companyId ? p.companyId === id : norm(p.company ?? "") === company.identity);
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
          <h1>{company.name}</h1>
          {!company.active && <p className={ui.sub}>Not a target</p>}
        </div>
        <div className={s.formFoot}>
          {company.website && <a href={company.website} target="_blank" rel="noreferrer" className={ui.btn}>Company website ↗</a>}
          {company.active ? <SourcingDialog trigger="Remove target" title={"Remove " + company.name + "?"}>
            <form action={toggleTargetCompany.bind(null, id, false)} className={s.form}>
              <p>New roles from this company will no longer appear in Today. Saved roles, research and people are unchanged.</p>
              <div><PendingButton label="Remove target" /></div>
            </form>
          </SourcingDialog> : <form action={toggleTargetCompany.bind(null, id, true)}><PendingButton label="Restore target" /></form>}
        </div>
      </div>
      <nav className={s.tabs} aria-label="Company views">
        {VIEWS.map(([key, label]) => <Link key={key} href={key === "overview" ? path : path + "?view=" + key}
          aria-current={view === key ? "page" : undefined}>{label}</Link>)}
      </nav>

      {view === "overview" && <div className={s.split}>
        <div className={s.stack}>
          <section className={ui.panel} id="company-roles">
            <h2>Roles</h2>
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
          <section className={ui.panel}>
            <h2>Company research</h2>
            <Link href={path + "?view=research"}>{company.research_requested ? "Requested" : facts.length ? "View public sources" : "Not requested"}</Link>
          </section>
          <section className={ui.panel}>
            <h2>People</h2>
            {people.length ? <ul className={s.reasons}>{people.map((person) => <li key={person.id}><Link href={network + "#contact-" + person.id}>{person.name}</Link></li>)}</ul>
              : <p className={ui.sub}>No connections yet.</p>}
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
        {company.research_requested ? <p className={s.tagline}>Requested</p>
          : !facts.length && company.website && <p className={ui.sub}>No public sources recorded yet.</p>}
        {sp.error && <p className={s.notice} role="alert">Research could not be requested. Try again.</p>}
        {!!facts.length && <ul className={s.reasons}>{facts.map((fact) => <li key={fact.kind + fact.url}>
          <a href={fact.url} target="_blank" rel="noreferrer">{RESEARCH_LABELS[fact.kind]} ↗</a> · Checked {fact.checkedAt}
        </li>)}</ul>}
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
          <h2>People</h2>
          {people.length ? <ul className={s.reasons}>{people.map((person) => <li key={person.id}><Link href={network + "#contact-" + person.id}>{person.name}</Link></li>)}</ul>
            : <p className={ui.sub}>No connections yet.</p>}
          <div className={s.inlineHead}>
            <Link className={ui.btn} href={network}>Open company Network</Link>
            <a className={ui.btn} href={"https://www.linkedin.com/search/results/people/?keywords=" + encodeURIComponent(company.name)}
              target="_blank" rel="noreferrer">Find people on LinkedIn ↗</a>
          </div>
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
        </aside>
      </div>}
    </>
  );
}
