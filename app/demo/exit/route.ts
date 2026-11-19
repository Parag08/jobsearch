import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE } from "@/lib/demo/visitors";

/** POST /demo/exit - leave the demo (form on the demo banner), back to the landing page. */
export function POST(req: NextRequest): NextResponse {
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.delete(DEMO_COOKIE);
  return res;
}
