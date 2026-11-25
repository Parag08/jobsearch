import { redirect } from "next/navigation";
import Link from "next/link";
import { getWorkspace } from "@/lib/db";
import { latestCompanyImport } from "@/lib/repos/company-import";
import { listContacts } from "@/lib/repos/contacts";
import { loadDailySourcing } from "@/lib/services/daily-sourcing";
import { norm } from "@/lib/types";
import { toggleTargetCompany } from "../sourcing-actions";
import { PendingButton, SourcingDialog } from "../sourcing-controls";
import { AddTargetForm } from "../sourcing-forms";
import { CompanyList } from "./company-list";
import { importPath } from "./import/paths";
import { ImportReceipt } from "./import/receipt";
import styles from "./import/import.module.css";
import ui from "../ui.module.css";
import s from "../sourcing.module.css";

export default async function Companies({ searchParams }: { searchParams: Promise<{ removed?: string; restored?: string; added?: string; error?: string }> }) {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const [source, contacts, params, receipt] = await Promise.all([
    loadDailySourcing(w.db, w.userId), listContacts(w.db, w.userId), searchParams, latestCompanyImport(w.db, w.userId),
  ]);
  const active = source.companies.filter((c) => c.active);
  const removed = source.companies.find((c) => !c.active && c.id === params.removed);
  const companies = active.map((c) => ({
    id: c.id, name: c.name, connected: source.configured.some((b) => b.companyId ? b.companyId === c.id : norm(b.company) === c.identity),
    matching: source.available.filter((j) => norm(j.company) === c.identity).length,
    research: c.research_version > 0 ? "Available" : c.research_requested ? "Requested" : "Not requested",
    connections: contacts.filter((p) => p.companyId ? p.companyId === c.id : norm(p.company ?? "") === c.identity).length,
  }));
  const targets = <>
    {removed && <div className={ui.panel + " " + s.inlineHead}>
      <p className={s.notice} role="status"><strong>{removed.name}</strong> was removed from your targets. Saved roles, research and people are unchanged.</p>
      <form action={toggleTargetCompany.bind(null, removed.id, true)}><PendingButton label="Undo" /></form>
    </div>}
    {(params.added || params.restored || params.error) && <p className={ui.panel} role="status">
      {params.error ? "The target could not be updated. Try again." : params.restored ? "Target restored." : "Company added."}
    </p>}
    <CompanyList companies={companies} />
  </>;
  return (
    <>
      <div className={ui.head}>
        <div className={ui.headText}>
          <p className={s.eyebrow}>Companies / Your targets</p>
          <h1>Your target companies.</h1>
          <p className={ui.sub}>One company connects the roles, research and people you want to know.</p>
          <p className={ui.facts}>
            <span><b>{companies.length}</b> targets</span>
            <span><b>{companies.reduce((n, c) => n + c.matching, 0)}</b> matching roles</span>
            <span><b>{companies.reduce((n, c) => n + c.connections, 0)}</b> connections</span>
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.button} href={importPath}>Import list</Link>
          <SourcingDialog trigger="Add company" title="Add a target company" primary><AddTargetForm /></SourcingDialog>
        </div>
      </div>
      {receipt ? <ImportReceipt receipt={receipt} compact>{targets}</ImportReceipt> : targets}
    </>
  );
}
