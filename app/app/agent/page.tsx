import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { listApiTokens } from "@/lib/repos/api-tokens";
import { isExpired } from "@/lib/agent/token";
import { TOOLS } from "@/lib/mcp/tools";
import { shortDate } from "@/lib/pipeline-display";
import { revokeTokenAction } from "./actions";
import { TokenForm } from "./token-form";
import { CopyButton } from "./copy-button";
import a from "./agent.module.css";
import ui from "../ui.module.css";

/**
 * Agent access: personal tokens for the MCP endpoint (/api/mcp), so an agent working
 * elsewhere - a chat, a terminal, a scheduled job - can read and update this workspace.
 */
export default async function AgentAccess() {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const live = w.mode === "live";
  const tokens = live ? await listApiTokens(w.db, w.userId) : [];

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const endpoint = `${proto}://${host}/api/mcp`;
  const nowIso = new Date().toISOString();
  const day = (iso: string | null) => (iso ? shortDate(iso, nowIso.slice(0, 10)) : "Never");

  const connected = tokens.filter((t) => !t.revokedAt && !isExpired(t.expiresAt, nowIso)).length;
  const command = `claude mcp add --transport http jobsearch ${endpoint} --header "Authorization: Bearer <token>"`;

  return (
    <>
      <div className={ui.head}>
        <div className={ui.headText}>
          <h1>AI assistant</h1>
          <p className={ui.facts}>
            <span>{connected === 0 ? "No assistants connected" : `${connected} ${connected === 1 ? "assistant" : "assistants"} connected`}</span>
          </p>
        </div>
      </div>

      <section className={ui.panel} aria-labelledby="connect-h">
        <h2 id="connect-h">Connect an AI assistant</h2>
        <p className={ui.sub}>
          Let Claude or another assistant update your pipeline while you work: add applications, move stages, log
          conversations. It only sees your data, and you can disconnect it any time.
        </p>
        <ol className={a.howto}>
          <li>Create a key below, and copy it.</li>
          <li>
            Run this where your assistant runs, with your key in place of <code>&lt;token&gt;</code>:
            <div className={a.codeRow}>
              <pre className={ui.code}>{command}</pre>
              <CopyButton text={command} />
            </div>
          </li>
        </ol>
        <div>
          <p className={ui.sumLabel}>What it can do</p>
          <ul className={a.can}>
            <li>Read your pipeline and what roles ask for</li>
            <li>Add and update applications, and move their stage</li>
            <li>Keep your contacts and log conversations</li>
            <li>Prepare interview questions and model answers</li>
          </ul>
        </div>
        <details className={ui.reveal}>
          <summary>Technical details</summary>
          <p>
            It connects over MCP at <code>{endpoint}</code>. Tools: {TOOLS.map((t) => t.name).join(", ")}.
          </p>
        </details>
      </section>

      <section className={ui.panel}>
        <h2>Keys</h2>
        <p className={ui.sub}>Each key expires. A read-only key can&apos;t change anything, and you can revoke one at any time.</p>
        {live ? <TokenForm /> : <p className={ui.none}>Keys need a signed-in account; you&apos;re looking at sample data.</p>}
        {tokens.length > 0 && (
          <div className={ui.tablewrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Access</th>
                  <th>Created</th>
                  <th>Expires</th>
                  <th>Last used</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{t.scope === "write" ? "Read and update" : "Read only"}</td>
                    <td>{day(t.createdAt)}</td>
                    <td>{isExpired(t.expiresAt, nowIso) ? `Expired ${day(t.expiresAt)}` : day(t.expiresAt)}</td>
                    <td>{day(t.lastUsedAt)}</td>
                    <td>
                      {t.revokedAt ? (
                        `Revoked ${day(t.revokedAt)}`
                      ) : (
                        <form action={revokeTokenAction.bind(null, t.id)}>
                          <button type="submit" className={ui.btn}>
                            Revoke
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
