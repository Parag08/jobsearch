"use client";

import Link from "next/link";
import { useState } from "react";
import { norm } from "@/lib/types";
import { toggleTargetCompany } from "../sourcing-actions";
import { PendingButton } from "../sourcing-controls";
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
  const visible = companies.filter((c) => norm(c.name).includes(norm(query)));
  return (
    <section className={ui.panel} aria-labelledby="all-target-companies">
      <div className={s.inlineHead}>
        <h2 id="all-target-companies">All target companies</h2>
        <p className={ui.sub} aria-live="polite">{visible.length} of {companies.length} shown</p>
      </div>
      {companies.length > 0 && <label className={s.field}>Find a company
        <input className={ui.input} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your targets" />
      </label>}
      {companies.length === 0 && <p className={ui.sub}>Add a target to start sourcing roles from its public board.</p>}
      {companies.length > 0 && visible.length === 0 && <div className={s.inlineHead}>
        <p className={ui.sub}>No companies match your search.</p>
        <button type="button" className={ui.btn} onClick={() => setQuery("")}>Clear search</button>
      </div>}
      <ul className={s.companyList}>
        {visible.map((company) => {
          const path = "/app/companies/" + company.id;
          return (
            <li key={company.id} className={s.companyRow}>
              <div><strong><Link href={path}>{company.name}</Link></strong>
                <p className={ui.sub}>{company.connected ? "Source connected" : "Source setup needed"}</p>
              </div>
              <Link href={path + "#company-roles"}>{company.matching} matching</Link>
              <Link href={path + "?view=research"}>Research · {company.research}</Link>
              <Link href={path + "?view=network"}>{company.connections} {company.connections === 1 ? "connection" : "connections"}</Link>
              <form action={toggleTargetCompany.bind(null, company.id, false)}>
                <PendingButton label="Remove" ariaLabel={"Remove " + company.name} />
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
