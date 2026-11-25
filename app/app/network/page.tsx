import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSourcingCompany } from "@/lib/repos/sourcing";
import { getWorkspace } from "@/lib/db";
import { listContactsWithInteractions } from "@/lib/repos/contacts";
import { loadDailySourcing } from "@/lib/services/daily-sourcing";
import { followupLabel, networkSections } from "@/lib/networking/contacts";
import { monogram, shortDate, toneFor } from "@/lib/pipeline-display";
import { norm, type Contact } from "@/lib/types";
import { editContactAction, logConversationAction } from "./actions";
import { AddContact } from "./add-contact";
import ui from "../ui.module.css";
import s from "./network.module.css";

const STATUS_LABEL: Record<Contact["status"], string> = {
  "not-contacted": "Not contacted",
  "awaiting-reply": "Awaiting reply",
  "in-conversation": "In conversation",
  met: "Met",
  dormant: "Dormant",
};
const STATUS_TONE: Partial<Record<Contact["status"], string>> = { "in-conversation": "blue", met: "good", "awaiting-reply": "mid" };
const WARMTH_TONE = { hot: "orange", warm: "teal", cold: undefined } as const;
const CHANNEL_LABEL = { linkedin: "LinkedIn", whatsapp: "WhatsApp", email: "Email", coffee: "Coffee", call: "Call" } as const;

/**
 * Networking, the minimum CRM (ROADMAP N1, DESIGN.md section 5, Network). People you add by
 * name or pasted LinkedIn link; logging a conversation sets when to follow up, from how warm
 * they are. Follow-ups due lead the page; everyone else follows, soonest first.
 */
export default async function Network({ searchParams }: { searchParams: Promise<{ company?: string; companyId?: string; role?: string; added?: string; found?: string; logged?: string }> }) {
  const params = await searchParams;
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const { db, userId } = w;
  const today = new Date().toISOString().slice(0, 10);

  if (params.companyId && w.mode === "live" && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(params.companyId)) notFound();
  const [all, companyRecord, sourcing] = await Promise.all([
    listContactsWithInteractions(db, userId),
    params.companyId ? getSourcingCompany(db, userId, params.companyId) : null,
    params.companyId && params.role ? loadDailySourcing(db, userId) : null,
  ]);
  if (params.companyId && !companyRecord) notFound();
  const company = companyRecord?.name ?? params.company?.trim();
  const contacts = company ? all.filter((c) => companyRecord && c.companyId ? c.companyId === companyRecord.id :
    c.company && norm(c.company) === norm(company)) : all;
  const isReferralRole = (r: { id: string; company: string; companyId?: string | null }) => companyRecord && r.id === params.role &&
    (r.companyId ? r.companyId === companyRecord.id : norm(r.company) === companyRecord.identity);
  const referralTitle = sourcing?.available.find(isReferralRole)?.title ?? sourcing?.apps.find(isReferralRole)?.role;
  const { due, upcoming, rest } = networkSections(contacts, today);
  const dueAll = networkSections(all, today).due.length;
  const met = all.filter((c) => c.status === "met" || c.status === "in-conversation").length;
  const flashId = params.added ?? params.found ?? params.logged;
  const flash = flashId ? all.find((c) => c.id === flashId) : undefined;
  const flashText = params.added
    ? "is in your network. Log your first message when you send it."
    : params.found
      ? "was already here, so nothing new was added."
      : flash?.nextFollowup
        ? `is logged. Follow up on ${shortDate(flash.nextFollowup, today)}.`
        : "is logged.";

  const row = (c: Contact) => {
    const last = c.interactions[0];
    const overdue = c.nextFollowup !== null && c.nextFollowup < today;
    const meta = [c.role, c.company, c.network?.name].filter(Boolean).join(" · ");
    return (
      <li key={c.id} id={`contact-${c.id}`} className={s.person}>
        <span className={ui.monogram} data-tone={toneFor(c.name)} aria-hidden="true">
          {monogram(c.name)}
        </span>
        <div className={s.body}>
          <p className={s.name}>
            {c.linkedinUrl ? (
              <a href={c.linkedinUrl} target="_blank" rel="noopener noreferrer">
                {c.name}
                <span className={s.srOnly}> (opens LinkedIn)</span>
              </a>
            ) : (
              c.name
            )}
            <span className={ui.tag} data-tone={STATUS_TONE[c.status]}>
              {STATUS_LABEL[c.status]}
            </span>
            <span className={ui.tag} data-tone={WARMTH_TONE[c.warmth]}>
              {c.warmth.charAt(0).toUpperCase() + c.warmth.slice(1)}
            </span>
          </p>
          {meta && <p className={s.meta}>{meta}</p>}
          <p className={s.meta}>
            {last ? (
              <>
                Last: {last.summary} <span className={s.when}>({CHANNEL_LABEL[last.channel]}, {shortDate(last.date, today)})</span>
              </>
            ) : (
              "Nothing logged yet."
            )}
          </p>

          <details className={s.more} open={c.id === params.found || undefined}>
            <summary>
              Log a conversation{c.interactions.length > 0 ? ` · ${c.interactions.length} logged` : ""}
            </summary>
            <form action={logConversationAction.bind(null, c.id)} className={s.logForm}>
              <label className={s.field}>
                <span>Date</span>
                <input className={ui.input} type="date" name="date" defaultValue={today} max={today} required />
              </label>
              <label className={s.field}>
                <span>How</span>
                <select className={ui.input} name="channel" defaultValue="linkedin">
                  {Object.entries(CHANNEL_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className={s.field} data-wide="">
                <span>What was said</span>
                <input className={ui.input} name="summary" placeholder="Asked for 15 minutes about the payments team" required />
              </label>
              <label className={s.field}>
                <span>Follow up on</span>
                <input className={ui.input} type="date" name="followup" min={today} aria-describedby={`fu-${c.id}`} />
                <small id={`fu-${c.id}`} className={s.hint}>
                  Empty: set from warmth
                </small>
              </label>
              <div className={s.formFoot}>
                <button className={ui.btn} data-primary="" type="submit">
                  Log it
                </button>
              </div>
            </form>

            {c.interactions.length > 0 && (
              <ol className={s.history}>
                {c.interactions.map((i, n) => (
                  <li key={`${i.date}-${n}`}>
                    <span className={s.when}>
                      {shortDate(i.date, today)} · {CHANNEL_LABEL[i.channel]}
                    </span>
                    <span>{i.summary}</span>
                  </li>
                ))}
              </ol>
            )}

            <form action={editContactAction.bind(null, c.id)} className={s.editForm}>
              <label className={s.field}>
                <span>Warmth</span>
                <select className={ui.input} name="warmth" defaultValue={c.warmth}>
                  <option value="cold">Cold</option>
                  <option value="warm">Warm</option>
                  <option value="hot">Hot</option>
                </select>
              </label>
              <label className={s.field}>
                <span>Where it stands</span>
                <select className={ui.input} name="status" defaultValue={c.status}>
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className={s.field}>
                <span>Next follow-up</span>
                <input className={ui.input} type="date" name="followup" defaultValue={c.nextFollowup ?? ""} />
              </label>
              <div className={s.formFoot}>
                <button className={ui.textBtn} type="submit">
                  Save changes
                </button>
              </div>
            </form>
          </details>
        </div>
        <div className={s.side}>
          {c.nextFollowup ? (
            <span className={s.followup} data-tone={overdue || c.nextFollowup === today ? "attention" : undefined}>
              {followupLabel(c.nextFollowup, today)}
            </span>
          ) : (
            <span className={s.followup} data-tone="quiet">
              No follow-up set
            </span>
          )}
        </div>
      </li>
    );
  };

  const addPanel = (
    <section className={ui.panel} aria-labelledby="add-h">
      <div>
        <h2 id="add-h">Add a person</h2>
        <p className={ui.sub}>
          Type a name, or paste their LinkedIn link and we&apos;ll read the name from it. The link is kept as a link: we never
          open or copy their profile.
        </p>
      </div>
      <AddContact company={company} />
    </section>
  );

  return (
    <>
      <div className={ui.head}>
        <div className={ui.headText}>
          <h1>Network</h1>
          <p className={ui.facts}>
            <span>
              <b>{all.length}</b> {all.length === 1 ? "person" : "people"}
            </span>
            <span data-tone={dueAll ? "due" : undefined}>
              <b>{dueAll}</b> to follow up
            </span>
            <span>
              <b>{met}</b> talking or met
            </span>
          </p>
        </div>
      </div>

      {flash && (
        <p className={s.flash} role="status">
          <span>
            <b>{flash.name}</b> {flashText}
          </span>
        </p>
      )}

      {company && (
        <p className={s.filter}>
          <span>
            People at <b>{company}</b>
          </span>
          <Link href="/app/network" className={ui.textBtn}>
            Show everyone
          </Link>
        </p>
      )}
      {referralTitle && companyRecord && <p className={ui.panel}>
        Referral context: <strong>{referralTitle}</strong> · {companyRecord.name}. No message is sent from here.{" "}
        <Link href={"/app/companies/" + companyRecord.id + "?view=network&role=" + encodeURIComponent(params.role ?? "")}>View exact role</Link>
      </p>}

      {due.length > 0 && (
        <section className={ui.panel} aria-labelledby="due-h">
          <div>
            <h2 id="due-h">Follow up</h2>
            <p className={ui.sub}>Due today or overdue. Log what you sent, and the next date is set for you.</p>
          </div>
          <ul className={s.list}>{due.map(row)}</ul>
        </section>
      )}

      {all.length === 0 && addPanel}

      {upcoming.length + rest.length > 0 && (
        <section className={ui.panel} aria-labelledby="people-h">
          <div>
            <h2 id="people-h">{due.length ? "Everyone else" : "People"}</h2>
            <p className={ui.sub}>Soonest follow-up first, then everyone without one.</p>
          </div>
          <ul className={s.list}>{[...upcoming, ...rest].map(row)}</ul>
        </section>
      )}

      {company && contacts.length === 0 && <p className={ui.none}>No one at {company} yet. Add someone below.</p>}

      {all.length > 0 && addPanel}
    </>
  );
}
