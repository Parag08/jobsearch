export function publicCompanyName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return /^(?=.{1,160}$)(?=.*\p{L})[\p{L}\p{M}\p{N} .&'’()+,-]+$/u.test(name) && !/\d{4,}/.test(name) ? name : null;
}
