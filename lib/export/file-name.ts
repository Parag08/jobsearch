/** Download name: "<Name>-CV-<Company>.<ext>", letters, digits and dashes only. */
export function exportFileName(name: string, company: string, ext: "pdf" | "docx"): string {
  const slug = (s: string) => s.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return [slug(name), "CV", slug(company)].filter(Boolean).join("-") + `.${ext}`;
}
