import { NextResponse } from "next/server";

/**
 * POST /api/jd - JD intake. The orchestration is done and tested:
 * lib/services/process-jd.ts. This shell returns 503 until Supabase
 * (auth'd user_id + DbClient) and a real LlmProvider are connected.
 */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "Not wired yet: connect Supabase + an LlmProvider, then call processJd (lib/services/process-jd.ts)." },
    { status: 503 },
  );
}
