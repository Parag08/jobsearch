import type { FakeDb } from "../repos/fake-db";
import type { ImportedWorkspace } from "../import/cvbuilder";
import {
  applicationCvRow,
  applicationRow,
  bulletRow,
  masterCvRow,
  profileRow,
  projectRow,
  sectorRow,
} from "../repos/rows";

/**
 * Load an imported workspace into a FakeDb, preserving the import's ids so
 * every cross-reference resolves. This is the demo workspace: the app runs on
 * it whenever Supabase is not configured, and it is the in-memory twin of
 * what supabase/seed.sql writes to the live database.
 */
export function seedFakeDb(db: FakeDb, ws: ImportedWorkspace): void {
  const userId = ws.profile.userId;
  db.seed("profiles", [profileRow(ws.profile)]);
  db.seed("sectors", ws.sectors.map((s) => ({ id: s.id, ...sectorRow(userId, s) })));
  db.seed("projects", ws.projects.map((p) => ({ id: p.id, ...projectRow(userId, p) })));
  db.seed(
    "bullets",
    ws.projects.flatMap((p) => p.bullets.map((b) => ({ id: b.id, ...bulletRow(userId, p.id, b) }))),
  );
  db.seed("master_cvs", ws.masterCvs.map((m) => ({ id: m.id, ...masterCvRow(userId, m) })));
  db.seed(
    "application_cvs",
    ws.applications.filter((a) => a.cv).map((a) => ({ id: a.cv!.id, ...applicationCvRow(userId, a.cv!) })),
  );
  db.seed(
    "applications",
    ws.applications.map((a) => ({ id: a.application.id, ...applicationRow(userId, a.application, a.jdRaw) })),
  );
}
