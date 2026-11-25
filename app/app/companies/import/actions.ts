"use server";

import { revalidatePath } from "next/cache";
import { getWorkspace } from "@/lib/db";
import { commitCompanyImport, undoCompanyImport, unpackImportPayload } from "@/lib/repos/company-import";
import { listSourcingCompanies } from "@/lib/repos/sourcing";
import type { ImportCompany } from "@/lib/companies/import-review";
import type { CompanyImportRow } from "@/lib/repos/rows";

type ImportActionResult =
  | { receipt: CompanyImportRow; error?: never; companies?: never }
  | { error: string; receipt?: never; companies?: ImportCompany[] };

function refreshTargets() {
  revalidatePath("/app/companies");
  revalidatePath("/app/watchlist");
}

export async function saveCompanyImport(id: string, plan: unknown, skipped: number): Promise<ImportActionResult> {
  const w = await getWorkspace();
  const fallback = { error: "We couldn’t confirm the save. Your preview is still here; retry to check the result." };
  if (!w) return { error: "Sign in again before confirming this import." };
  try {
    const receipt = await commitCompanyImport(w.db, w.userId, id, unpackImportPayload(plan), skipped);
    if (receipt) {
      refreshTargets();
      return { receipt };
    }
    const companies: ImportCompany[] = (await listSourcingCompanies(w.db, w.userId)).map(({ id, name, identity, website, active }) =>
      ({ id, name, identity, website, active }));
    return { error: "The list could not be confirmed as reviewed. Check the updated company matches and try again.", companies };
  } catch {
    return fallback;
  }
}

export async function removeCompanyImport(id: string): Promise<ImportActionResult> {
  const w = await getWorkspace();
  if (!w) return { error: "Sign in again before undoing the import." };
  try {
    const receipt = await undoCompanyImport(w.db, w.userId, id);
    if (!receipt) return { error: "Undo is only available for your most recent import." };
    refreshTargets();
    return { receipt };
  } catch {
    return { error: "The import could not be undone. Try again." };
  }
}
