import { familyLabel } from "@/lib/pipeline-display";
import type { RoleRequirement } from "@/lib/insights/role-insights";
import ui from "../ui.module.css";
import s from "./insights.module.css";

const WORDINGS_SHOWN = 3;

/**
 * One status group of requirements: the term, a bar for how many roles ask, the wordings seen,
 * and links to where in the Bank you'd fix or check it. "On your CV" starts collapsed: it is
 * reassurance, not work.
 */
export function RequirementList({
  id,
  title,
  sub,
  tone,
  items,
  total,
  collapsed = false,
  links,
}: {
  id: string;
  title: string;
  sub: string;
  tone: "attention" | "mid" | "good";
  items: RoleRequirement[];
  total: number;
  collapsed?: boolean;
  links: (r: RoleRequirement) => { href: string; text: string }[];
}) {
  return (
    <details className={ui.panel} id={id} open={!collapsed}>
      <summary className={s.groupHead}>
        <span className={s.groupTitle}>
          <span className={s.dot} data-tone={tone} aria-hidden="true" />
          <b>{title}</b>
          <span className={s.groupCount}>{items.length}</span>
        </span>
        <span className={s.chevron} aria-hidden="true" />
      </summary>
      <p className={`${ui.sub} ${s.groupSub}`}>{sub}</p>
      <ul className={s.reqs}>
        {items.map((r) => {
          const wordings = r.phrases.filter((p) => p.toLowerCase() !== r.term.toLowerCase()).slice(0, WORDINGS_SHOWN);
          const pct = Math.round(r.share * 100);
          return (
            <li key={r.term} className={s.req}>
              <div className={s.reqMain}>
                <p className={s.term}>{familyLabel(r.term)}</p>
                {wordings.length > 0 && <p className={s.wordings}>Also written as {wordings.map((w) => `“${w}”`).join(", ")}</p>}
                {links(r).map((l) => (
                  <a key={l.href} href={l.href} className={s.fix} aria-label={`${familyLabel(r.term)}: ${l.text}`}>
                    {l.text}
                  </a>
                ))}
              </div>
              <div className={s.share} title={`${pct}% of the roles`}>
                <span className={s.shareText}>
                  Asked by {r.roles} of {total}
                </span>
                <span className={s.shareBar} data-tone={tone} aria-hidden="true">
                  <i style={{ width: `${pct}%` }} />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
