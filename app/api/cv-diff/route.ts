import { NextResponse } from "next/server";

/**
 * POST /api/cv-diff - tailor a CV for an application. The orchestration is
 * done and tested: lib/services/tailor-cv.ts. This shell returns 503 until
 * Supabase (auth'd user_id + DbClient) is connected.
 */
export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "Not wired yet: connect Supabase, then call tailorCv (lib/services/tailor-cv.ts)." },
    { status: 503 },
  );
}
