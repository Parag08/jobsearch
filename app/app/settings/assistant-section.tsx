import Link from "next/link";
import { headers } from "next/headers";
import type { Workspace } from "@/lib/db";
import { listApiTokens } from "@/lib/repos/api-tokens";
import { TOOLS } from "@/lib/mcp/tools";
import { settingsHref } from "@/lib/settings/sections";
import { AssistantAccess, SetupInstructions } from "./assistant-access";
import styles from "./settings.module.css";
import ui from "../ui.module.css";

export async function AssistantSection(w: Workspace) {
  const [h, tokens] = await Promise.all([headers(), w.mode === "live" ? listApiTokens(w.db, w.userId) : []]);
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocol = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const endpoint = `${protocol}://${host}/api/mcp`;
  const signIn = `/signin?next=${encodeURIComponent(settingsHref("assistant"))}`;
  return (
    <>
      {w.mode === "live" ? <AssistantAccess tokens={tokens} endpoint={endpoint} now={new Date().toISOString()} /> :
        <section className={styles.assistantCard} id="assistant-access" tabIndex={-1}>
          <h2>Connect your own assistant</h2>
          <p>Assistant access is available in your own workspace, not in the demo.</p>
          <Link className={ui.btn} data-primary="" href={signIn}>Sign in</Link>
        </section>}
      {w.mode !== "live" && <details className={`${styles.panel} ${styles.assistantDetails}`}>
        <summary>Setup instructions</summary>
        <div className={styles.groupNote}>
          <section aria-label="Connection steps">
            <ol><li>Sign in to create a key, then copy it.</li><li>Set up your MCP client:</li></ol>
            <SetupInstructions endpoint={endpoint} />
          </section>
        </div>
      </details>}
      <details className={`${styles.panel} ${styles.assistantDetails}`}>
        <summary>Technical details</summary>
        <div className={styles.groupNote}>
          <p>It connects over MCP at <code>{endpoint}</code>. Tools: {TOOLS.map((tool) => tool.name).join(", ")}.</p>
        </div>
      </details>
    </>
  );
}
