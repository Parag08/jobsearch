import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/db";
import { exportEvalSet } from "@/lib/services/interviewer-eval";

export const dynamic = "force-dynamic";

/**
 * GET /api/interview-eval - your interviewer eval set as a JSON download: one case per
 * interviewer decision in your finished full interviews, with your ratings. The input of
 * `npm run interview:eval` (docs/FULL-INTERVIEW.md). Your own interviews only; never cached.
 */
export async function GET(): Promise<NextResponse> {
  const w = await getWorkspace();
  if (!w) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const now = new Date().toISOString();
  const set = await exportEvalSet(w.db, w.userId, now);
  return new NextResponse(JSON.stringify(set, null, 1), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="interviewer-eval-set-${now.slice(0, 10)}.json"`,
      "cache-control": "no-store",
    },
  });
}
