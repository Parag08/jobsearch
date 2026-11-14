import type { RoleRequirement } from "@/lib/insights/role-insights";
import ui from "../ui.module.css";

/** One status group of requirements: the term, how many roles ask, the wordings seen. */
export function RequirementList({
  title,
  sub,
  items,
  total,
  detail,
}: {
  title: string;
  sub: string;
  items: RoleRequirement[];
  total: number;
  detail: (r: RoleRequirement) => string | null;
}) {
  return (
    <section className={ui.panel}>
      <h2>{title}</h2>
      <p className={ui.sub}>{sub}</p>
      {items.length === 0 ? (
        <p className={ui.empty}>None.</p>
      ) : (
        <ul className={ui.rows}>
          {items.map((r) => {
            const phrases = r.phrases.filter((p) => p !== r.term).slice(0, 3);
            const extra = detail(r);
            return (
              <li key={r.term} className={ui.row}>
                <div>
                  <p>
                    <b>{r.term}</b>{" "}
                    <span className={ui.mono}>asked by {r.roles} of {total} roles ({Math.round(r.share * 100)}%)</span>
                  </p>
                  {phrases.length > 0 && <span className={ui.mono}>{phrases.join(" / ")}</span>}
                  {extra && <p className={ui.sub}>{extra}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
