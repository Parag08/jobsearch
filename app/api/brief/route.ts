import { NextResponse } from "next/server";

/**
 * GET /api/brief - today's brief. The orchestration is done and tested:
 * lib/services/daily-brief.ts. This shell returns 503 until Supabase
 * (auth'd user_id + DbClient) is connected.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "Not wired yet: connect Supabase, then call generateBrief (lib/services/daily-brief.ts)." },
    { status: 503 },
  );
}
