import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { getSafeEvidence, getSourcingRecipe } from "@/lib/repos/sourcing";
import { EvidenceSettings, RecipeForm } from "../../sourcing-forms";
import ui from "../../ui.module.css";
import s from "../../sourcing.module.css";

export default async function SourcingSettings({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const [recipe, evidence, params] = await Promise.all([getSourcingRecipe(w.db, w.userId), getSafeEvidence(w.db, w.userId), searchParams]);
  return (
    <>
      <div className={ui.head}>
        <div className={ui.headText}>
          <Link href="/app/settings">‹ Settings</Link>
          <p className={s.eyebrow}>User settings</p>
          <h1>Sourcing preferences</h1>
          <p className={ui.sub}>Choose how many roles to see and where to look.</p>
        </div>
      </div>
      {params.saved && <p className={ui.panel} role="status">Preferences saved. <Link href="/app/watchlist">Back to Today</Link></p>}
      <section className={ui.panel}>
        <h2>Your daily sourcing recipe</h2>
        <RecipeForm recipe={recipe} />
        <p className={ui.sub}>Choose which employers to follow in <Link href="/app/companies">Companies</Link>.</p>
      </section>
      <section className={ui.panel}>
        <h2>Safe CV evidence</h2>
        <p className={ui.sub}>Select only statements you can verify. Your Claude can match these claims to roles without reading your personal CV through this flow.</p>
        <EvidenceSettings evidence={evidence} />
      </section>
    </>
  );
}
