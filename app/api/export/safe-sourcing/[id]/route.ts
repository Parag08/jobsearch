import { getWorkspace } from "@/lib/db";
import { getUsableSourcingKit } from "@/lib/services/sourcing-kits";
import { EVIDENCE_TEXT } from "@/lib/watchlist/safe-kit";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspace = await getWorkspace();
  if (!workspace) return new Response(null, { status: 401 });
  const kit = await getUsableSourcingKit(workspace.db, workspace.userId, (await params).id);
  if (!kit?.value.evidence.length) return new Response(null, { status: 404 });
  return new Response(kit.value.evidence.map((code) => "- " + EVIDENCE_TEXT[code]).join("\n") + "\n", {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="safe-cv-content.txt"',
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
