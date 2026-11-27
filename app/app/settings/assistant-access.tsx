"use client";

import { useRef, useState } from "react";
import type { ApiToken } from "@/lib/repos/api-tokens";
import { DEFAULT_TOKEN_DAYS, isExpired, TOKEN_LIFETIME_DAYS, type TokenScope } from "@/lib/agent/token-options";
import { createTokenAction, revokeTokenAction } from "./assistant-actions";
import { CopyButton } from "./copy-button";
import { SettingsDialog } from "./dialog";
import { useNavigationGuard } from "./navigation-guard";
import styles from "./settings.module.css";
import ui from "../ui.module.css";

type Dialog = "access" | "key" | "setup" | "revoke";

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value)) : "Never";
}

export function AssistantAccess({ tokens, endpoint, now }: { tokens: ApiToken[]; endpoint: string; now: string }) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<TokenScope>("read");
  const [days, setDays] = useState(DEFAULT_TOKEN_DAYS);
  const [key, showKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [selected, selectToken] = useState<ApiToken | null>(null);
  const [revoked, setRevoked] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [losingKey, setLosingKey] = useState<(() => void) | null>(null);
  const inFlight = useRef(false);
  const unsaved = dialog === "key" && !copied;
  useNavigationGuard(unsaved, (next) => setLosingKey(() => next));
  const active = tokens.filter((token) => !token.revokedAt && !revoked.includes(token.id) && !isExpired(token.expiresAt, now));

  function finish() {
    showKey("");
    setDialog(null);
    setLosingKey(null);
    setError("");
  }

  function close() {
    if (inFlight.current) return;
    if (losingKey) setLosingKey(null);
    else if (unsaved) setLosingKey(() => finish);
    else finish();
  }

  async function create() {
    if (inFlight.current) return;
    setError("");
    if (!name.trim()) {
      setError("Enter a name for this key.");
      document.getElementById("key-name")?.focus();
      return;
    }
    inFlight.current = true;
    setPending(true);
    const data = new FormData();
    data.set("name", name);
    data.set("scope", scope);
    data.set("days", String(days));
    try {
      const result = await createTokenAction(data);
      if (result.token) {
        showKey(result.token);
        setCopied(false);
        setDialog("key");
      } else setError(result.error ?? "Couldn’t create a key. Try again.");
    } catch {
      setError("Couldn’t create a key. Your choices are still here—try again.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  async function revoke() {
    if (!selected || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      if (await revokeTokenAction(selected.id)) {
        setRevoked((previous) => [...previous, selected.id]);
        setNotice(`Revoked ${selected.name}. Its key can no longer access your workspace.`);
        finish();
      } else setError("Couldn’t revoke this key. Try again.");
    } catch {
      setError("Couldn’t revoke this key. Try again.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <section className={styles.assistantCard} id="assistant-access" tabIndex={-1}>
        <h2>{active.length ? "Assistant access" : "Connect your own assistant"}</h2>
        <p>{active.length ? "Manage the access keys you’ve shared with your assistants." : "Let Claude or another MCP client work with your JobSearch workspace."}</p>
        <button type="button" className={ui.btn} data-primary="" onClick={() => {
          setName(""); setScope("read"); setDays(DEFAULT_TOKEN_DAYS); setNotice(""); setDialog("access");
        }}>{active.length ? "Add access key" : "Connect assistant"}</button>
      </section>
      {notice && <p role="status">{notice}</p>}
      {!!tokens.length && <ul className={styles.tokenList} aria-label="Access keys">
        {tokens.map((token) => {
          const isRevoked = !!token.revokedAt || revoked.includes(token.id);
          const expired = isExpired(token.expiresAt, now);
          return <li key={token.id} className={styles.panel}>
            <div>
              <strong>{token.name}</strong>
              <p>{isRevoked ? "Revoked" : expired ? "Expired" : token.lastUsedAt ? "Recently used" : "Not used yet"}</p>
              <p>{token.scope === "read" ? "Read only" : "Read and update"} · Expires {date(token.expiresAt)} · Last used: {date(token.lastUsedAt)}</p>
            </div>
            {!isRevoked && !expired && <div className={styles.tokenActions}>
              <button type="button" className={ui.btn} aria-label={`Setup details for ${token.name}`} onClick={() => setDialog("setup")}>Setup details</button>
              <button type="button" className={ui.btn} aria-label={`Revoke ${token.name}`} onClick={() => { selectToken(token); setDialog("revoke"); }}>Revoke</button>
            </div>}
          </li>;
        })}
      </ul>}
      <p className={styles.help}>You choose its access and can revoke it at any time.</p>
      {dialog && <SettingsDialog title={losingKey ? "Leave without saving this key?" :
        dialog === "access" ? "Connect your assistant" : dialog === "key" ? "Copy your access key" :
          dialog === "setup" ? "Connect from your assistant" : "Revoke this access key?"} onClose={close}>
        {losingKey ? <>
          <p>This key is shown only once. If you leave now, you’ll need to create another key. You can revoke any key you no longer use.</p>
          <div className={styles.dialogActions}>
            <button type="button" className={ui.btn} onClick={() => setLosingKey(null)}>Keep copying</button>
            <button type="button" className={ui.btn} onClick={() => { const next = losingKey; finish(); next(); }}>Leave without saving</button>
          </div>
        </> : <>
          {dialog !== "revoke" && <ol className={styles.steps} aria-label="Setup progress">
            {(["Access", "Copy key", "Connect"] as const).map((step, i) => <li key={step}
              aria-current={i === (dialog === "access" ? 0 : dialog === "key" ? 1 : 2) ? "step" : undefined}>{i + 1} · {step}</li>)}
          </ol>}
          {dialog === "access" && <form onSubmit={(event) => { event.preventDefault(); void create(); }}>
            <fieldset className={styles.fieldset} disabled={pending}>
              <label className={styles.stack}>Key name
                <input id="key-name" className={ui.input} maxLength={60} placeholder="Claude on my laptop" required value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <fieldset className={styles.permission}>
                <legend>Access</legend>
                <label className={styles.check}><input type="radio" name="scope" checked={scope === "read"} onChange={() => setScope("read")} />Read only</label>
                <label className={styles.check}><input type="radio" name="scope" checked={scope === "write"} onChange={() => setScope("write")} />Read and update</label>
                <p className={styles.help}>Read and update lets your assistant change workspace data, including Pipeline and Network.</p>
              </fieldset>
              <label className={styles.stack}>Expires after
                <select className={ui.input} value={days} onChange={(event) => setDays(Number(event.target.value))}>
                  {TOKEN_LIFETIME_DAYS.map((day) => <option key={day} value={day}>{day} days</option>)}
                </select>
              </label>
            </fieldset>
            {error && <p role="alert" className={styles.error}>{error}</p>}
            <div className={styles.dialogActions}>
              <button type="button" className={ui.btn} disabled={pending} onClick={close}>Cancel</button>
              <button type="submit" className={ui.btn} data-primary="" disabled={pending}>{pending ? "Creating…" : error ? "Retry creation" : "Create access key"}</button>
            </div>
          </form>}
          {dialog === "key" && <>
            <p>Shown once. Copy it before leaving this step.</p>
            <pre className={ui.code} tabIndex={0}>{key}</pre>
            <CopyButton text={key} label="Copy key" onCopy={() => setCopied(true)} />
            <div className={styles.dialogActions}>
              <button type="button" className={ui.btn} onClick={close}>Close</button>
              <button type="button" className={ui.btn} data-primary="" onClick={() => { showKey(""); setDialog("setup"); }}>I’ve saved this key →</button>
            </div>
          </>}
          {dialog === "setup" && <>
            <SetupInstructions endpoint={endpoint} />
            <p className={styles.help}>A key is “Not used yet” until your assistant makes a request. Last use doesn’t indicate that an assistant is online.</p>
            <div className={styles.dialogActions}><button type="button" className={ui.btn} data-primary="" onClick={finish}>Done</button></div>
          </>}
          {dialog === "revoke" && <>
            <p><strong>{selected?.name}</strong> will lose access to your workspace. Your data stays, and you’ll need a new key to reconnect.</p>
            {error && <p role="alert" className={styles.error}>{error}</p>}
            <div className={styles.dialogActions}>
              <button type="button" className={ui.btn} disabled={pending} onClick={close}>Cancel</button>
              <button type="button" className={ui.btn} disabled={pending} onClick={() => void revoke()}>{pending ? "Revoking…" : "Revoke key"}</button>
            </div>
          </>}
        </>}
      </SettingsDialog>}
    </>
  );
}

export function SetupInstructions({ endpoint }: { endpoint: string }) {
  const [client, setClient] = useState("claude");
  const command = `claude mcp add --transport http jobsearch ${endpoint} --header "Authorization: Bearer <YOUR_KEY>"`;
  return (
    <div className={styles.instructions}>
      <label className={styles.stack}>Assistant
        <select className={ui.input} value={client} onChange={(event) => setClient(event.target.value)}>
          <option value="claude">Claude Code</option>
          <option value="other">Another MCP client</option>
        </select>
      </label>
      {client === "claude" ? <>
        <p>Run this in the terminal where Claude Code is installed. Replace <code>&lt;YOUR_KEY&gt;</code> with the access key you saved.</p>
        <pre className={ui.code} tabIndex={0}>{command}</pre>
        <CopyButton text={command} label="Copy command" />
      </> : <>
        <p>Use an MCP client that supports HTTP servers and custom headers.</p>
        <p>MCP server URL</p><pre className={ui.code} tabIndex={0}>{endpoint}</pre>
        <p>HTTP header</p><pre className={ui.code} tabIndex={0}>Authorization: Bearer &lt;YOUR_KEY&gt;</pre>
      </>}
    </div>
  );
}
