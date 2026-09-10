import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/db";
import { tailorCv } from "@/lib/services/tailor-cv";

/**
 * POST /api/cv-diff  { applicationId: string }
 * Tailor a CV as a diff from the role-family master. No LLM in this path:
 * lexical scoring against the stored extract, honesty rule in buildDiff.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const w = await getWorkspace();
  if (!w) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { applicationId?: unknown } | null;
  const applicationId = typeof body?.applicationId === "string" ? body.applicationId : "";
  if (!applicationId) return NextResponse.json({ error: "Send { applicationId: string }." }, { status: 400 });

  try {
    const result = await tailorCv({ db: w.db }, w.userId, applicationId, new Date().toISOString().slice(0, 10));
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "tailorCv failed" }, { status: 422 });
  }
}
