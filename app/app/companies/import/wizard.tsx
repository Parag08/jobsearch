"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type DragEvent, type MouseEvent } from "react";
import {
  analyzeImport, buildImportPlan, importColumns, importCounts, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, mapImportRows, suggestImportColumns,
  type ImportCompany, type ImportMapping, type ImportOverride, type ImportSheet,
} from "@/lib/companies/import-review";
import type { CompanyImportRow } from "@/lib/repos/rows";
import type { ImportPayload } from "@/lib/repos/company-import";
import { saveCompanyImport } from "./actions";
import type { WorkerResult } from "./parser.worker";
import { companiesPath, importPath, targetCount } from "./paths";
import { ImportReceipt } from "./receipt";
import { ReviewTable } from "./review-table";
import ui from "../../ui.module.css";
import s from "../../sourcing.module.css";
import styles from "./import.module.css";

const steps = ["File", "Columns", "Review"] as const;
const titles = ["Bring your company list.", "Choose the company columns.", "Review before adding targets."];
const initialMapping: ImportMapping = { start: 1, headers: true, name: null, website: null };
const template = (format: string) => `/company-list-template.${format}`;
const columnName = (index: number): string => (index >= 26 ? columnName(Math.floor(index / 26) - 1) : "") + String.fromCharCode(65 + index % 26);

export function ImportWizard({ companies, initialReceipt }: { companies: ImportCompany[]; initialReceipt: CompanyImportRow | null }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<{ name: string; sheets: ImportSheet[] }>();
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState(initialMapping);
  const [overrides, setOverrides] = useState<Record<number, ImportOverride>>({});
  const [catalog, setCatalog] = useState(companies);
  const [receipt, setReceipt] = useState(initialReceipt);
  const [filter, setFilter] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"discard" | "mapping">("discard");
  const worker = useRef<Worker | null>(null);
  const readToken = useRef(0);
  const warning = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const focusHeading = useRef(false);
  useEffect(() => () => { ++readToken.current; worker.current?.terminate(); }, []);
  useEffect(() => {
    if (focusHeading.current) {
      heading.current?.focus();
      focusHeading.current = false;
    }
  }, [step, receipt]);

  const sheet = file?.sheets[sheetIndex];
  const columns = sheet ? importColumns(sheet, mapping.start, mapping.headers) : [];
  const selectedCount = sheet?.rows.filter((r) => mapping.headers ? r.number > mapping.start : r.number >= mapping.start).length ?? 0;
  const mapped = sheet && selectedCount <= IMPORT_MAX_ROWS ? mapImportRows(sheet, mapping) : null;
  const review = step === 2 && mapped ? analyzeImport(mapped, catalog, overrides) : [];
  const counts = importCounts(review);
  const ready = counts.new + counts.readd;
  const shown = filter ? review.filter((r) => r.kind === "issue") : review;

  function go(next: number) {
    focusHeading.current = true;
    setError("");
    setStep(next);
  }

  function setSource(nextSheet: ImportSheet, start: number, headers: boolean) {
    setMapping({ start, headers, ...suggestImportColumns(nextSheet, start, headers) });
    setOverrides({});
  }

  function stopRead() {
    ++readToken.current;
    worker.current?.terminate();
    worker.current = null;
    setReading(false);
  }

  function readFile(next: File) {
    stopRead();
    setError("");
    if (!/\.(csv|xlsx)$/i.test(next.name) || next.size > IMPORT_MAX_BYTES || !next.size) {
      setError(next.size > IMPORT_MAX_BYTES ? "This file is over 5 MB. Split it into smaller files and try again."
        : /\.xls$/i.test(next.name) ? "Use Save As .xlsx in Excel, then choose the new file."
        : !/\.(csv|xlsx)$/i.test(next.name) ? "Choose a CSV or XLSX file."
        : "This file is empty. Add company rows and try again.");
      return;
    }
    setReading(true);
    try {
      const reader = new Worker(new URL("./parser.worker.ts", import.meta.url));
      worker.current = reader;
      reader.onmessage = ({ data }: MessageEvent<WorkerResult>) => {
        if (worker.current !== reader) return;
        stopRead();
        if ("error" in data) { setError(data.error); return; }
        setFile({ name: next.name, sheets: data.sheets });
        setSheetIndex(0);
        setSource(data.sheets[0], 1, true);
        setFilter(false);
        go(1);
      };
      reader.onerror = () => {
        if (worker.current !== reader) return;
        stopRead();
        setError("The file could not be read. Try exporting it again.");
      };
      reader.postMessage(next);
    } catch {
      stopRead();
      setError("The file reader could not start. Reload the page and try again.");
    }
  }

  async function loadSample(format: "csv" | "xlsx") {
    stopRead();
    const token = readToken.current;
    setReading(true);
    setError("");
    try {
      const response = await fetch(template(format));
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (token === readToken.current) readFile(new File([blob], `Sample company list.${format}`));
    } catch {
      if (token === readToken.current) {
        stopRead();
        setError("The sample could not be loaded. Choose a file or try again.");
      }
    }
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length === 1) readFile(event.dataTransfer.files[0]);
    else if (event.dataTransfer.files.length > 1) setError("Choose one company list at a time.");
  }

  function warn(kind: "discard" | "mapping") {
    setDialog(kind);
    warning.current?.showModal();
  }

  function leave(event: MouseEvent<HTMLAnchorElement>) {
    if (!file && !reading) return;
    event.preventDefault();
    if (!pending) warn("discard");
  }

  function changeRow(number: number, edit: ImportOverride, replace = false) {
    setError("");
    setOverrides((current) => ({ ...current, [number]: { ...(replace ? {} : current[number]), ...edit } }));
  }

  function confirm() {
    if (!ready || counts.issue || pending) return;
    const plan: ImportPayload = buildImportPlan(review).flatMap(({ id, name, identity, website, active }): ImportPayload =>
      id === null ? (name === null ? [] : [[name, website]]) : [[id, identity, website, active === true]]);
    const key = JSON.stringify([plan, counts.skipped]);
    const submission = attempt.current?.key === key ? attempt.current : { key, id: crypto.randomUUID() };
    attempt.current = submission;
    setError("");
    startTransition(async () => {
      try {
        const result = await saveCompanyImport(submission.id, plan, counts.skipped);
        if (result.receipt) {
          setFile(undefined);
          setOverrides({});
          attempt.current = null;
          setReceipt(result.receipt);
          router.replace(importPath + "?result=1");
        } else {
          if (result.companies) { setCatalog(result.companies); setFilter(false); }
          setError(result.error ?? "The import could not be saved. Try again.");
        }
      } catch {
        setError("We couldn’t confirm the save. Your preview is still here; retry to check the result.");
      }
    });
  }

  if (receipt) return <ImportReceipt receipt={receipt} companies={companies} />;

  return <>
    <header className={ui.head}>
      <div className={ui.headText}>
        <Link className={styles.crumb} href={companiesPath} onClick={leave}>‹ Companies</Link>
        <h1 ref={heading} tabIndex={-1}>{titles[step]}</h1>
      </div>
    </header>
    <ol className={styles.progress} aria-label="Import progress">
      {steps.map((name, i) => <li key={name} aria-current={step === i ? "step" : undefined} data-complete={i < step || undefined}>
        <span aria-hidden="true">{i < step ? "✓" : i + 1}</span>{name}
      </li>)}
    </ol>

    {step === 0 && <div className={s.split}>
      <section className={ui.panel} aria-label="Choose a company list">
        <div className={styles.drop} data-dragging={dragging || undefined}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
          <span className={styles.uploadIcon} aria-hidden="true">↑</span>
          <h2>{reading ? "Reading your file…" : "Drop your company list here"}</h2>
          {!reading && <p className={styles.muted}>CSV or XLSX · Up to 5 MB and 1,000 company rows.</p>}
          {reading
            ? <button className={styles.button} type="button" onClick={stopRead}>Cancel</button>
            : <label className={styles.fileButton} data-primary>Choose file
              <input type="file" accept=".csv,.xlsx" onChange={(event) => {
                const chosen = event.target.files?.[0];
                event.target.value = "";
                if (chosen) readFile(chosen);
              }} />
            </label>}
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          {file && !reading && <button className={styles.button} type="button" onClick={() => go(1)}>Resume {file.name}</button>}
          <a className={styles.button} href={template("csv")} download>CSV template</a>
          <a className={styles.button} href={template("xlsx")} download>XLSX template</a>
        </div>
      </section>
      <aside className={s.stack}>
        <p className={ui.panel}>Use a public company list, not a contact list. Your file stays in this browser.</p>
        <section className={ui.panel}><h2>Try a sample</h2><div className={styles.actions}>
          <button className={styles.button} type="button" disabled={reading} onClick={() => void loadSample("csv")}>Sample CSV</button>
          <button className={styles.button} type="button" disabled={reading} onClick={() => void loadSample("xlsx")}>Sample XLSX</button>
        </div></section>
      </aside>
    </div>}

    {step === 1 && sheet && file && <>
      <div>
        <section className={ui.panel}>
          <div className={styles.spread}><h2>{file.name}</h2><button type="button" className={styles.button} onClick={() => go(0)}>Change file</button></div>
          {/\.xlsx$/i.test(file.name) && <label className={s.field}>Worksheet
            <select className={ui.input} value={sheetIndex} onChange={(event) => {
              const index = Number(event.target.value);
              setSheetIndex(index);
              setSource(file.sheets[index], 1, true);
            }}>
              {file.sheets.map((sheet, index) => <option key={sheet.name} value={index}>{sheet.name}</option>)}
            </select>
          </label>}
          <div className={styles.fields}>
            <label className={s.field}>{mapping.headers ? "Header row" : "First data row"}
              <input className={ui.input} type="number" min="1" value={mapping.start || ""} onChange={(event) =>
                setSource(sheet, Number(event.target.value), mapping.headers)} />
            </label>
            <label className={styles.checkbox}><input type="checkbox" checked={mapping.headers} onChange={(event) =>
              setSource(sheet, mapping.start, event.target.checked)} /> This row has column names</label>
            {(["name", "website"] as const).map((key) => <label className={s.field} key={key}>
              {key === "name" ? "Company name · required" : "Company website · optional"}
              <select className={ui.input} value={mapping[key] ?? ""} onChange={(event) => {
                const value = event.target.value;
                setMapping((current) => ({ ...current, [key]: value ? Number(value) : null }));
              }}>
                <option value="">{key === "name" ? "Choose a column" : "Do not import"}</option>
                {columns.map(({ index, title }) => <option value={index} key={index}>{columnName(index)}{title ? ` · ${title}` : ""}</option>)}
              </select>
            </label>)}
          </div>
        </section>
      </div>
      <section className={ui.panel}>
        <h2>Mapped preview</h2>
        {selectedCount > IMPORT_MAX_ROWS ? <p className={styles.error} role="alert">This selection has more than 1,000 company rows. Split the file and try again.</p>
          : !selectedCount ? <p role="status">No company rows were found. Choose another worksheet or change the starting row.</p>
          : mapping.name !== null && mapping.name === mapping.website ? <p className={styles.error} role="alert">Choose different columns for company name and website.</p>
          : !mapped ? <p role="status">Choose the required company name column to see your mapped rows.</p>
          : <table className={styles.table} aria-label="First three mapped rows">
            <thead><tr><th scope="col">File row</th><th scope="col">Company name</th><th scope="col">Website</th></tr></thead>
            <tbody>{mapped.slice(0, 3).map((row) => <tr key={row.number}>
              <td data-label="File row">{row.number}</td><td data-label="Company name">{row.name || "—"}</td>
              <td data-label="Website">{row.website || "—"}{row.formula && <div>Formula needs a fix</div>}</td>
            </tr>)}</tbody>
          </table>}
      </section>
      <div className={styles.footer}>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={() => go(0)}>Back</button>
          <button type="button" className={styles.button} data-primary disabled={!mapped?.length} onClick={() => go(2)}>Review rows</button>
        </div>
      </div>
    </>}

    {step === 2 && <>
      <dl className={styles.counts} aria-live="polite">
        <div><dt>Already targets</dt><dd>{counts.existing}</dd></div>
        <div><dt>Repeated or skipped</dt><dd>{counts.skipped}</dd></div>
        <div data-warning={counts.issue > 0 || undefined}><dt>Need attention</dt><dd>{counts.issue}</dd></div>
      </dl>
      <fieldset className={styles.reviewFieldset} disabled={pending}>
        {counts.issue > 0 && <div className={styles.attention}>
          <p>Fix or skip each problem row before importing.</p>
          <button className={styles.button} type="button" onClick={() => {
            setError("");
            setOverrides((current) => ({ ...current, ...Object.fromEntries(review.filter((row) => row.kind === "issue")
              .map((row) => [row.number, { ...current[row.number], skip: true }])) }));
          }}>Skip problem rows</button>
        </div>}
        {!ready && !counts.issue && <p className={styles.attention} role="status">No new targets. Your existing list stays unchanged.</p>}
        <section className={ui.panel}>
          <div className={styles.spread}><div className={styles.actions} aria-label="Filter company rows">
            <button type="button" className={styles.button} aria-pressed={!filter} onClick={() => setFilter(false)}>All rows</button>
            <button type="button" className={styles.button} aria-pressed={filter} onClick={() => setFilter(true)}>Need attention</button>
          </div></div>
          {shown.length ? <ReviewTable rows={shown} onChange={changeRow} /> : <p role="status">No rows need attention.</p>}
        </section>
      </fieldset>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.footer}>
        <p className={styles.muted}>Only public company names and websites will be imported.</p>
        <div className={styles.actions}>
          <button type="button" className={styles.button} disabled={pending}
            onClick={() => Object.keys(overrides).length ? warn("mapping") : go(1)}>Back to columns</button>
          <button type="button" className={styles.button} data-primary disabled={!ready || !!counts.issue || pending} onClick={confirm}>
            {pending ? "Saving…" : `Import ${targetCount(ready)}`}
          </button>
        </div>
      </div>
    </>}

    <dialog className={s.dialog} ref={warning} aria-labelledby="import-warning">
      <h2 id="import-warning">{dialog === "discard" ? "Discard this import preview?" : "Go back to columns?"}</h2>
      <p className={styles.muted}>{dialog === "discard" ? "No new targets are added. Your current list stays unchanged." : "Your file and column choices stay here, but row fixes and skips will be reset."}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={() => warning.current?.close()}>Keep reviewing</button>
        <button type="button" className={styles.button} data-primary onClick={() => {
          warning.current?.close();
          if (dialog === "discard") {
            stopRead();
            setFile(undefined);
            setOverrides({});
            router.push(companiesPath);
          } else { setOverrides({}); setFilter(false); go(1); }
        }}>{dialog === "discard" ? "Discard preview" : "Reset row fixes"}</button>
      </div>
    </dialog>
  </>;
}
