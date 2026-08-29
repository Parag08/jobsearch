import { norm, type Bullet, type JdExtract, type Project } from "./types";

const SKILL_WEIGHT = 3;
const KEYWORD_WEIGHT = 1;
const ROLE_FAMILY_BOOST = 1.5;

/**
 * Relevance of one bullet to one JD extract. Zero-token matching (token rule #2):
 * plain lexical overlap, no LLM. Skills count via the bullet's skill tags;
 * keywords also match against the bullet text.
 */
export function scoreBullet(bullet: Bullet, jd: JdExtract): number {
  const bulletSkills = new Set(bullet.skills.map(norm));
  const text = norm(bullet.text);

  let score = 0;
  for (const s of jd.skills) {
    const k = norm(s);
    if (bulletSkills.has(k) || text.includes(k)) score += SKILL_WEIGHT;
  }
  for (const kw of jd.keywords) {
    const k = norm(kw);
    if (bulletSkills.has(k) || text.includes(k)) score += KEYWORD_WEIGHT;
  }
  if (score === 0) return 0;
  return bullet.roleFamily === jd.roleFamily ? score * ROLE_FAMILY_BOOST : score;
}

/** Top-k bullets across the whole repository for this JD, best first; zero scores excluded. */
export function selectBullets(projects: Project[], jd: JdExtract, k: number): Bullet[] {
  const scored: { b: Bullet; s: number }[] = [];
  for (const p of projects) {
    for (const b of p.bullets) {
      const s = scoreBullet(b, jd);
      if (s > 0) scored.push({ b, s });
    }
  }
  return scored
    .sort((x, y) => y.s - x.s || x.b.id.localeCompare(y.b.id))
    .slice(0, k)
    .map((x) => x.b);
}
