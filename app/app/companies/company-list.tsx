"use client";

import Link from "next/link";
import { useState } from "react";
import { norm } from "@/lib/types";
import { toggleTargetCompany } from "../sourcing-actions";
import { PendingButton, SourcingDialog } from "../sourcing-controls";
import ui from "../ui.module.css";
import s from "../sourcing.module.css";

export type CompanyListItem = {
  id: string;
  name: string;
  matching: number;
  connected: boolean;
  research: string;
  connections: number;
};

export function CompanyList({ companies }: { companies: CompanyListItem[] }) {
  const [query, setQuery] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false);
  const visible = companies.filter((c) => (!needsSetup || !c.connected) && norm(c.name).includes(norm(query)));
  return (
    <section className={ui.panel} aria-label="All target companies">
      <div className={s.companySearch}>
        <div role="group" aria-label="Company filters" className={s.formFoot + " " + s.companyFilters}>
          <button className={ui.btn} type="button" aria-pressed={!needsSetup} onClick={() => setNeedsSetup(false)}>All {companies.length}</button>
          <button className={ui.btn} type="button" aria-pressed={needsSetup} onClick={() => setNeedsSetup(true)}>Needs source setup {companies.filter((c) => !c.connected).length}</button>
        </div>
        {companies.length > 0 && <input className={ui.input} type="search" aria-label="Search companies" value={query}
          onChange={(e) => setQuery(e.target.value)} placeholder="Search companies" />}
      </div>
      {companies.length === 0 && <p className={ui.sub}>Add a target to start sourcing roles from its public board.</p>}
      {companies.length > 0 && visible.length === 0 && <div className={s.inlineHead}>
        <p className={ui.sub}>{query ? "No companies match your search." : "No companies need source setup."}</p>
        {query && <button type="button" className={ui.btn} onClick={() => setQuery("")}>Clear search</button>}
      </div>}
      {visible.length > 0 && <div className={s.companyRow + " " + s.companyColumns} aria-hidden="true">
        <span>Company</span><span>Job source</span><span>Roles</span><span>Research</span><span>People</span>
      </div>}
      <ul className={s.companyList}>
        {visible.map((company) => {
          const path = "/app/companies/" + company.id;
          return (
            <li key={company.id} className={s.companyRow}>
              <strong><Link href={path}>{company.name}</Link></strong>
              <span>{company.connected ? "Connected" : "Setup needed"}</span>
              <Link href={path + "#company-roles"}>{company.matching} {company.matching === 1 ? "role" : "roles"}</Link>
              <Link href={path + "?view=research"} aria-label={`${company.research} — research for ${company.name}`}>{company.research}</Link>
              <Link href={path + "?view=network"}>{company.connections} {company.connections === 1 ? "person" : "people"}</Link>
              <SourcingDialog trigger="Remove" triggerLabel={"Remove " + company.name} title={"Remove " + company.name + "?"}>
                <form action={toggleTargetCompany.bind(null, company.id, false)} className={s.form}>
                  <p>New roles from this company will no longer appear in Today. Saved roles, research and people are unchanged.</p>
                  <div><PendingButton label="Remove target" /></div>
                </form>
              </SourcingDialog>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
