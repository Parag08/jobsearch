"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import type { CompanyImportRow } from "@/lib/repos/rows";
import type { ImportCompany } from "@/lib/companies/import-review";
import { removeCompanyImport } from "./actions";
import { companiesPath, importPath, targetCount } from "./paths";
import ui from "../../ui.module.css";
import s from "../../sourcing.module.css";
import styles from "./import.module.css";

export function ImportReceipt({ receipt, compact = false, companies = [] }: {
  receipt: CompanyImportRow;
  compact?: boolean;
  companies?: ImportCompany[];
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<CompanyImportRow>();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const current = saved?.id === receipt.id ? saved : receipt;
  const added = current.new_count + current.reused_count;
  const undone = current.undone_count !== null;
  const ids = new Set(current.company_ids);
  const listed = companies.filter((company) => ids.has(company.id));
  const undo = () => startTransition(async () => {
    setError("");
    try {
      const result = await removeCompanyImport(receipt.id);
      if (result.receipt) {
        setSaved(result.receipt);
        router.refresh();
      } else setError(result.error ?? "The import could not be undone. Try again.");
    } catch {
      setError("The import could not be undone. Try again.");
    }
  });

  const headline = undone ? "Import undone." : `${targetCount(added)} added to your targets.`;
  const summary = undone
    ? `${targetCount(current.undone_count ?? 0)} removed from targets. Shared company records, research, Saved roles and Network were kept.`
    : `${current.new_count} new · ${current.reused_count} re-added · ${current.skipped_count} repeated or skipped. Existing targets were kept.`;

  return <section className={ui.panel + " " + styles.receipt} data-compact={compact || undefined}>
    <div role="status">
      <p className={s.eyebrow}>Last import</p>
      {compact ? <h2>{headline}</h2> : <h1>{headline}</h1>}
      <p className={styles.muted}>{summary}</p>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!compact && listed.length > 0 && <div>
      <h2>{undone ? "Company records kept" : "Added in this import"}</h2>
      <ul className={styles.receiptCompanies}>
        {listed.map((company) => <li key={company.id}>
          <Link href={companiesPath + "/" + encodeURIComponent(company.id)}>{company.name}</Link>
          {company.website && <span className={styles.muted}>{company.website}</span>}
        </li>)}
      </ul>
    </div>}
    <div className={styles.actions}>
      {!undone && <button type="button" className={styles.button} disabled={pending} onClick={undo}>{pending ? "Undoing…" : "Undo import"}</button>}
      <Link className={styles.button} data-primary={compact ? undefined : ""} href={compact ? importPath + "?result=1" : companiesPath}>
        {compact ? "View result" : "View Companies"}
      </Link>
    </div>
  </section>;
}
