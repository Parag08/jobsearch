/**
 * Where exported CVs are kept (DESIGN §2 "Export - decided": a per-user
 * Supabase storage bucket). An interface so the service stays pure-testable;
 * the Supabase implementation lives in lib/db (the only place that knows it).
 */
export interface FileStore {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
}

/** In-memory double for tests. */
export class FakeFileStore implements FileStore {
  readonly files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  constructor(private readonly failWith?: string) {}
  async upload(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    if (this.failWith) throw new Error(this.failWith);
    this.files.set(path, { bytes, contentType });
  }
}
