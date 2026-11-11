import { snapshotCv } from "../freeze";
import { applicationGaps } from "../editorial";
import {
  assembleLetter,
  buildCoverLetterPrompt,
  buildLetterBrief,
  checkLetter,
  letterDate,
  type LetterBank,
  type LetterIssue,
} from "../cover-letter";
import type { Application, Bullet } from "../types";
import type { DbClient } from "../repos/db";
import { getApplication } from "../repos/applications";
import { getApplicationCv } from "../repos/cvs";
import { listContacts } from "../repos/contacts";
import { getCoverLetter, saveCoverLetter, type StoredCoverLetter } from "../repos/cover-letters";
import { getProfile } from "../repos/profiles";
import { listProjects } from "../repos/projects";

export interface CoverLetterInputs {
  /** The firm's inconvenient detail, from the user's own research. Required. */
  firmDetail: string;
  /** A named individual, when one is known. */
  recipient: string;
  /** Salutation fallback when no individual is known. */
  teamName: string;
}

export interface DraftCoverLetterDeps {
  db: DbClient;
  /** One premium-tier completion (token rule #5); the caller logs it to the ledger. */
  write: (prompt: string) => Promise<string>;
  bank: LetterBank;
  /** Recorded on the letter; null when unknown. */
  model?: string | null;
}

export type DraftCoverLetterResult = { needs: ["firmDetail"] } | { letter: StoredCoverLetter; text: string };

function assertNotSent(app: Application): void {
  if (app.appliedAt) throw new Error("This application was sent - its cover letter is frozen with the CV.");
}

/**
 * Draft the cover letter from the honest gaps (ROADMAP Now #4): gaps from the
 * whole bank, the tailored page's bullets, people actually spoken with, and the
 * user's firm detail -> one premium call for the three paragraphs -> voice and
 * number checks -> stored on the application with any issues listed.
 */
export async function draftCoverLetter(
  { db, write, bank, model = null }: DraftCoverLetterDeps,
  userId: string,
  applicationId: string,
  inputs: CoverLetterInputs,
  today: string,
): Promise<DraftCoverLetterResult> {
  const app = await getApplication(db, userId, applicationId);
  if (!app) throw new Error(`draftCoverLetter: application ${applicationId} not found`);
  assertNotSent(app);
  const jd = app.jdExtract;
  if (!jd) throw new Error("draftCoverLetter: this application has no JD extract yet");

  const [projects, contacts, profile] = await Promise.all([
    listProjects(db, userId),
    listContacts(db, userId),
    getProfile(db, userId),
  ]);
  const allBullets = projects.flatMap((p) => p.bullets);
  const bankById: Record<string, Bullet> = Object.fromEntries(allBullets.map((b) => [b.id, b]));
  const cv = app.cvVersionId ? await getApplicationCv(db, userId, app.cvVersionId) : null;
  const cvBullets = cv
    ? (cv.sentSnapshot ?? snapshotCv(cv, bankById)).bullets.flatMap((b) => (b.text ? [b.text] : []))
    : [];

  const applicantName = profile?.displayName ?? "";
  const brief = buildLetterBrief({
    jd,
    gaps: applicationGaps(jd, allBullets).gaps,
    cvBullets,
    contacts,
    firmDetail: inputs.firmDetail,
    bank,
    applicantName,
  });
  if ("needs" in brief) return brief;

  const raw = await write(buildCoverLetterPrompt(brief));
  const { paragraphs, issues } = checkLetter(raw, {
    allowedText: `${bank.logistics} ${inputs.firmDetail}`,
    wordRange: bank.wordRange,
  });

  const letter: StoredCoverLetter = {
    recipient: inputs.recipient.trim(),
    teamName: inputs.teamName.trim() || `${jd.company} Recruitment Team`,
    firmDetail: inputs.firmDetail.trim(),
    date: letterDate(today),
    paragraphs,
    issues,
    model,
    generatedAt: today,
    edited: false,
  };
  await saveCoverLetter(db, userId, applicationId, letter);
  return { letter, text: letterText(letter, bank, applicantName) };
}

/** Save the user's own edit of the body (paragraphs separated by blank lines) and re-check it. */
export async function editCoverLetter(
  { db, bank }: { db: DbClient; bank: LetterBank },
  userId: string,
  applicationId: string,
  body: string,
): Promise<{ paragraphs: string[]; issues: LetterIssue[] }> {
  const app = await getApplication(db, userId, applicationId);
  if (!app) throw new Error(`editCoverLetter: application ${applicationId} not found`);
  assertNotSent(app);
  const current = await getCoverLetter(db, userId, applicationId);
  if (!current) throw new Error("editCoverLetter: draft a letter first");
  const checked = checkLetter(body, {
    allowedText: `${bank.logistics} ${current.firmDetail}`,
    wordRange: bank.wordRange,
  });
  await saveCoverLetter(db, userId, applicationId, { ...current, ...checked, edited: true });
  return checked;
}

/** The full letter as sent: date, salutation, body, close. */
export function letterText(letter: StoredCoverLetter, bank: LetterBank, applicantName: string): string {
  return assembleLetter({
    date: letter.date,
    recipient: letter.recipient,
    teamName: letter.teamName,
    paragraphs: letter.paragraphs,
    bank,
    applicantName,
  });
}
