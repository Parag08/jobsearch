import type { DbClient } from "../repos/db";
import { getApplication } from "../repos/applications";
import { getApplicationCv, setApplicationCvFilePath } from "../repos/cvs";
import { getProfile } from "../repos/profiles";
import { listProjects } from "../repos/projects";
import { renderDocx } from "../export/docx";
import { exportFileName } from "../export/file-name";
import type { FileStore } from "../export/file-store";
import { renderPdf } from "../export/pdf";
import { resolveCv } from "../export/resolve-cv";
import { renderLetterDocx, renderLetterPdf } from "../export/letter";
import type { LetterBank } from "../cover-letter";
import { getCoverLetter } from "../repos/cover-letters";
import { letterText } from "./cover-letter";

export type ExportFormat = "pdf" | "docx";

export const CONTENT_TYPES: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export interface ExportCvDeps {
  db: DbClient;
  /** null in demo mode, or when no bucket is configured: the file is returned but not kept. */
  files: FileStore | null;
}

export interface ExportCvResult {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
  /** Storage path written to application_cvs.file_path, or null when not stored. */
  filePath: string | null;
  storageError?: string;
}

/**
 * Export the application's tailored CV (DESIGN §2 "Export - decided"): resolve
 * once (frozen text if sent), render PDF or DOCX from that one structure, keep
 * a copy at <userId>/<applicationId>/<cvId>.<ext> and record the path. The
 * download never fails because storage did.
 */
export async function exportCv(
  { db, files }: ExportCvDeps,
  userId: string,
  applicationId: string,
  format: ExportFormat,
): Promise<ExportCvResult> {
  const app = await getApplication(db, userId, applicationId);
  if (!app) throw new Error(`exportCv: application ${applicationId} not found`);
  const cv = app.cvVersionId ? await getApplicationCv(db, userId, app.cvVersionId) : null;
  if (!cv) throw new Error("exportCv: no tailored CV yet - tailor one from the master first");

  const [projects, profile] = await Promise.all([listProjects(db, userId), getProfile(db, userId)]);
  if (!profile) throw new Error("exportCv: no profile for this user");

  const resolved = resolveCv(cv, projects, profile);
  const bytes = format === "pdf" ? await renderPdf(resolved) : await renderDocx(resolved);
  const contentType = CONTENT_TYPES[format];
  const fileName = exportFileName(profile.displayName, app.company, format);

  let filePath: string | null = null;
  let storageError: string | undefined;
  if (files) {
    const path = `${userId}/${applicationId}/${cv.id}.${format}`;
    try {
      await files.upload(path, bytes, contentType);
      await setApplicationCvFilePath(db, userId, cv.id, path);
      filePath = path;
    } catch (e) {
      storageError = e instanceof Error ? e.message : String(e);
    }
  }
  return { bytes, fileName, contentType, filePath, ...(storageError ? { storageError } : {}) };
}

/**
 * Export the application's cover letter. Kept alongside the CV at
 * <userId>/<applicationId>/cover-letter.<ext>; storage failure never blocks the download.
 */
export async function exportLetter(
  { db, files, bank }: ExportCvDeps & { bank: LetterBank },
  userId: string,
  applicationId: string,
  format: ExportFormat,
): Promise<ExportCvResult> {
  const app = await getApplication(db, userId, applicationId);
  if (!app) throw new Error(`exportLetter: application ${applicationId} not found`);
  const letter = await getCoverLetter(db, userId, applicationId);
  if (!letter) throw new Error("exportLetter: no cover letter yet - draft one first");
  const profile = await getProfile(db, userId);
  const name = profile?.displayName ?? "";
  const text = letterText(letter, bank, name);
  const bytes = format === "pdf" ? await renderLetterPdf(text, name) : await renderLetterDocx(text, name);
  const contentType = CONTENT_TYPES[format];
  const fileName = exportFileName(name, app.company, format).replace("-CV", "-Cover-Letter");

  let filePath: string | null = null;
  let storageError: string | undefined;
  if (files) {
    const path = `${userId}/${applicationId}/cover-letter.${format}`;
    try {
      await files.upload(path, bytes, contentType);
      filePath = path;
    } catch (e) {
      storageError = e instanceof Error ? e.message : String(e);
    }
  }
  return { bytes, fileName, contentType, filePath, ...(storageError ? { storageError } : {}) };
}
