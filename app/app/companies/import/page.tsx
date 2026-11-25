import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/db";
import { latestCompanyImport } from "@/lib/repos/company-import";
import { listSourcingCompanies } from "@/lib/repos/sourcing";
import { ImportWizard } from "./wizard";

export default async function ImportCompanies({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const w = await getWorkspace();
  if (!w) redirect("/signin");
  const params = await searchParams;
  const [catalog, receipt] = await Promise.all([
    listSourcingCompanies(w.db, w.userId),
    params.result === "1" ? latestCompanyImport(w.db, w.userId) : null,
  ]);
  const companies = catalog.map(({ id, name, identity, website, active }) => ({ id, name, identity, website, active }));
  return <ImportWizard key={receipt?.id ?? "new"} companies={companies} initialReceipt={receipt} />;
}
