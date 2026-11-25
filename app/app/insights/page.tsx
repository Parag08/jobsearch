import { redirect } from "next/navigation";

export default async function LegacyInsights({ searchParams }: {
  searchParams: Promise<{ family?: string; title?: string }>;
}) {
  const { family, title } = await searchParams;
  const query = new URLSearchParams({ view: "insights", ...(family ? { family } : {}), ...(title ? { title } : {}) });
  redirect("/app?" + query.toString());
}
