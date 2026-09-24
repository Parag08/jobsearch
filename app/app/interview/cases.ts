import "server-only";
import raw from "@/data/interview/cases.json";
import { parseCaseLibrary, type CaseLibrary } from "@/lib/interview/case-sheet";

/**
 * The case library, parsed once per server instance. The data lives in
 * data/interview/cases.json (rule 4); a test fails the build if it stops parsing.
 */
export const caseLibrary: CaseLibrary = parseCaseLibrary(raw);

export const findCase = (id: string) => caseLibrary.cases.find((c) => c.id === id);
