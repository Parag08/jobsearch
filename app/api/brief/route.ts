import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/db";
import { generateBrief } from "@/lib/services/daily-brief";

/**
 * GET /api/brief - today's brief: due follow-ups, stale applications, top new
 * sourced jobs. Composed without an LLM; one row per (user, date).
 */
export async function GET(): Promise<NextResponse> {
  const w = await getWorkspace();
  if (!w) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const brief = await generateBrief({ db: w.db }, w.userId, new Date().toISOString().slice(0, 10));
  return NextResponse.json(brief);
}
