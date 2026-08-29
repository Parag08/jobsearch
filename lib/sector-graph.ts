import { norm, type JdExtract, type SectorNode } from "./types";

function pathKey(path: string[]): string {
  return path.map(norm).join(">");
}

/** Find the node matching `path` (case-insensitive) or create and append it. */
export function findOrCreateNode(nodes: SectorNode[], path: string[]): SectorNode {
  const key = pathKey(path);
  const existing = nodes.find((n) => pathKey(n.path) === key);
  if (existing) return existing;
  const node: SectorNode = {
    id: path.map(norm).join("-").replace(/[^a-z0-9-]+/g, ""),
    path: [...path],
    skills: {},
    companies: [],
    titles: [],
    jdCount: 0,
    summary: "",
  };
  nodes.push(node);
  return node;
}

/** Merge one parsed JD into a sector node: the auto-update loop (M1). Mutates the node. */
export function mergeJdExtract(node: SectorNode, jd: JdExtract): SectorNode {
  node.jdCount += 1;
  for (const s of jd.skills) {
    const k = norm(s);
    node.skills[k] = (node.skills[k] ?? 0) + 1;
  }
  if (jd.company && !node.companies.includes(jd.company)) node.companies.push(jd.company);
  if (jd.role && !node.titles.includes(jd.role)) node.titles.push(jd.role);
  return node;
}

/** The n most demanded skills in this node, most frequent first (ties alphabetical). */
export function topSkills(node: SectorNode, n: number): string[] {
  return Object.keys(node.skills)
    .sort((a, b) => node.skills[b] - node.skills[a] || a.localeCompare(b))
    .slice(0, n);
}

/** Sector demand vs the user's evidenced skills: what to emphasise, what's missing. */
export function gapAnalysis(
  node: SectorNode,
  evidencedSkills: string[],
): { emphasise: string[]; missing: string[] } {
  const evidenced = new Set(evidencedSkills.map(norm));
  const demanded = topSkills(node, Object.keys(node.skills).length);
  return {
    emphasise: demanded.filter((s) => evidenced.has(s)),
    missing: demanded.filter((s) => !evidenced.has(s)),
  };
}
