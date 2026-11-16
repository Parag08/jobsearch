import { companySlug } from "./company-questions";

/**
 * Which questions the behavioural tab shows (DESIGN.md section 8, 2026-11-16).
 *
 * The everyday bank comes first: it is what gets practised daily. Company questions and
 * your own questions are each one click away, never mixed into the default list.
 * The view is decided by the URL alone (`company`, `scope`, `q`), so every state is linkable.
 */
export interface ScopedQuestion {
  id: string;
  group: string;
  company?: string;
}

export type Scope = { kind: "general" } | { kind: "mine" } | { kind: "company"; slug: string };

export interface BehaviouralViewResult<Q extends ScopedQuestion> {
  scope: Scope;
  /** One entry per company with a live application, in pipeline order. */
  companies: { slug: string; name: string }[];
  questions: Q[];
  selectedId: string | null;
}

export function behaviouralView<Q extends ScopedQuestion>(
  all: { generic: Q[]; company: Q[]; custom: Q[] },
  params: { q?: string | null; company?: string | null; scope?: string | null },
  practised: ReadonlySet<string>,
): BehaviouralViewResult<Q> {
  const slugOf = (q: Q) => companySlug(q.company ?? "");
  const companies: { slug: string; name: string }[] = [];
  for (const q of all.company) {
    if (q.company && !companies.some((c) => c.slug === slugOf(q))) companies.push({ slug: slugOf(q), name: q.company });
  }

  // A linked question decides the view; otherwise the chooser does; otherwise the bank.
  const linkedCompany = all.company.find((q) => q.id === params.q);
  let scope: Scope = { kind: "general" };
  if (linkedCompany) scope = { kind: "company", slug: slugOf(linkedCompany) };
  else if (all.custom.some((q) => q.id === params.q)) scope = { kind: "mine" };
  else if (all.generic.some((q) => q.id === params.q)) scope = { kind: "general" };
  else if (params.scope === "mine") scope = { kind: "mine" };
  else if (params.company && companies.some((c) => c.slug === params.company)) scope = { kind: "company", slug: params.company };

  const questions =
    scope.kind === "general" ? all.generic : scope.kind === "mine" ? all.custom : all.company.filter((q) => slugOf(q) === scope.slug);

  // Open on what was asked for; otherwise on the first question not yet practised.
  const selected = questions.find((q) => q.id === params.q) ?? questions.find((q) => !practised.has(q.id)) ?? questions[0];
  return { scope, companies, questions, selectedId: selected?.id ?? null };
}
