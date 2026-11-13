import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { listApiTokens } from "@/lib/repos/api-tokens";
import { TOOLS } from "@/lib/mcp/tools";
import { revokeTokenAction } from "./actions";
import { TokenForm } from "./token-form";
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
  const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "never");

  return (
    <>
      <div className={ui.head}>
        <h1>Agent access</h1>
        <span className={ui.mono}>{tokens.filter((t) => !t.revokedAt).length} active</span>
      </div>

      <section className={ui.panel}>
        <h2>Connect an agent</h2>
        <p className={ui.sub}>
          This workspace speaks MCP. An agent holding one of your tokens can read your pipeline and contacts and update
          them as you work: add an application, move a stage (with its date and evidence), log a conversation. It cannot
          see anyone else&apos;s data, and you can revoke a token at any time.
        </p>
        <pre className={ui.mono} style={{ overflowX: "auto" }}>{`claude mcp add --transport http jobsearch ${endpoint} --header "Authorization: Bearer <token>"`}</pre>
        <p className={ui.sub}>Tools: {TOOLS.map((t) => t.name).join(", ")}.</p>
      </section>

      <section className={ui.panel}>
        <h2>Tokens</h2>
        {live ? <TokenForm /> : <p className={ui.empty}>Tokens need a signed-in workspace; this is the demo.</p>}
        {tokens.length > 0 && (
          <div className={ui.tablewrap}>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td>{day(t.createdAt)}</td>
                    <td>{day(t.lastUsedAt)}</td>
                    <td>
                      {t.revokedAt ? (
                        `revoked ${day(t.revokedAt)}`
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
