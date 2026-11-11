import { z } from "zod";
import { oneOrNull, one, type DbClient } from "./db";

/**
 * The application's cover letter (applications.cover_letter, migration 0007).
 * Kept on the application rather than the CV row so re-tailoring the CV does
 * not lose it. Generated text, so it is already a record: once the application
 * is sent the services refuse to change it (frozen with the CV).
 */
export const StoredCoverLetterSchema = z.object({
  recipient: z.string(),
  teamName: z.string(),
  firmDetail: z.string(),
  date: z.string(),
  paragraphs: z.array(z.string()),
  issues: z.array(z.object({ kind: z.string(), detail: z.string() })),
  model: z.string().nullable(),
  generatedAt: z.string(),
  edited: z.boolean(),
});
export type StoredCoverLetter = z.infer<typeof StoredCoverLetterSchema>;

export async function getCoverLetter(db: DbClient, userId: string, applicationId: string): Promise<StoredCoverLetter | null> {
  const row = await oneOrNull(
    db.from("applications").select().eq("user_id", userId).eq("id", applicationId).maybeSingle(),
    "applications",
    "getCoverLetter",
  );
  const parsed = StoredCoverLetterSchema.safeParse(row?.cover_letter);
  return parsed.success ? parsed.data : null;
}

export async function saveCoverLetter(
  db: DbClient,
  userId: string,
  applicationId: string,
  letter: StoredCoverLetter,
): Promise<StoredCoverLetter> {
  await one(
    db
      .from("applications")
      .update({ cover_letter: StoredCoverLetterSchema.parse(letter) })
      .eq("user_id", userId)
      .eq("id", applicationId)
      .select()
      .single(),
    "applications",
    "saveCoverLetter",
  );
  return letter;
}
