import { NextResponse } from "next/server";
import { getWorkspace } from "@/lib/db";
import { exportCv, exportLetter, type ExportFormat } from "@/lib/services/export-cv";
import { parseLetterBank } from "@/lib/cover-letter";
import letterBank from "@/data/cvbuilder/letter-bank.json";

/**
 * GET /api/export/<applicationId>?format=pdf|docx[&doc=letter]
 * Download the application's tailored CV, or with doc=letter its cover letter. In live mode a copy is kept in the
 * private per-user bucket and its path recorded on the CV (DESIGN §2 "Export").
 */
export async function GET(req: Request, ctx: { params: Promise<{ applicationId: string }> }): Promise<Response> {
  const w = await getWorkspace();
  if (!w) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { applicationId } = await ctx.params;
  const params = new URL(req.url).searchParams;
  const format = params.get("format");
  const isLetter = params.get("doc") === "letter";
  if (format !== "pdf" && format !== "docx") {
    return NextResponse.json({ error: "format must be pdf or docx" }, { status: 400 });
  }

  try {
    const deps = { db: w.db, files: w.files };
    const out = isLetter
      ? await exportLetter({ ...deps, bank: parseLetterBank(letterBank) }, w.userId, applicationId, format as ExportFormat)
      : await exportCv(deps, w.userId, applicationId, format as ExportFormat);
    if (out.storageError) console.warn(`exportCv: file not stored - ${out.storageError}`);
    return new Response(Buffer.from(out.bytes), {
      headers: {
        "content-type": out.contentType,
        "content-disposition": `attachment; filename="${out.fileName}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "export failed" }, { status: 422 });
  }
}
