"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import type { CompanyImportRow } from "@/lib/repos/rows";
import type { ImportCompany } from "@/lib/companies/import-review";
import { removeCompanyImport } from "./actions";
import { companiesPath, importPath, targetCount } from "./paths";
import ui from "../../ui.module.css";
import s from "../../sourcing.module.css";
import styles from "./import.module.css";

export function ImportReceipt({ receipt, compact = false, companies = [], children }: {
  receipt: CompanyImportRow;
  compact?: boolean;
  companies?: ImportCompany[];
  children?: ReactNode;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<CompanyImportRow>();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [dismissedId, setDismissedId] = useState<string>();
  const dismissalKey = `jobsearch.company-import.dismissed.${receipt.id}`;
  const dismissed = compact && dismissedId === receipt.id;
  useEffect(() => {
    if (!compact) return;
    try {
      if (localStorage.getItem(dismissalKey) === "1") setDismissedId(receipt.id);
    } catch {
      // The banner can still be dismissed without browser storage.
    }
  }, [compact, dismissalKey, receipt.id]);
  const dismiss = () => {
    setDismissedId(receipt.id);
    try {
      localStorage.setItem(dismissalKey, "1");
    } catch {
      // The local dismissal remains in effect.
    }
  };
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

  const undoButton = !undone && <button type="button" className={dismissed ? styles.receiptLink : styles.button} disabled={pending} onClick={undo}>
    {pending ? "Undoing…" : "Undo import"}
  </button>;

  const banner = <section className={ui.panel + " " + styles.receipt} data-compact={compact || undefined}>
    {compact && <button type="button" className={styles.dismissReceipt} aria-label="Dismiss" onClick={dismiss}>×</button>}
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
      {undoButton}
      <Link className={styles.button} data-primary={compact ? undefined : ""} href={compact ? importPath + "?result=1" : companiesPath}>
        {compact ? "View result" : "View Companies"}
      </Link>
    </div>
  </section>;

  return <>
    {!dismissed && banner}
    {children}
    {dismissed && <section className={styles.receiptFooter} aria-label="Last import">
      <div className={styles.receiptLine}>
        <span role="status">Last import: {undone ? "Import undone" : `${added} added`}</span>
        {!undone && <><span aria-hidden="true">·</span>{undoButton}</>}
        <span aria-hidden="true">·</span>
        <Link className={styles.receiptLink} href={importPath + "?result=1"}>View result</Link>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </section>}
  </>;
}
