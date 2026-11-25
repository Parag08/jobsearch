import { parseCompanyFile } from "@/lib/companies/import-file";
import type { ImportSheet } from "@/lib/companies/import-review";

export type WorkerResult = { sheets: ImportSheet[] } | { error: string };

self.onmessage = ({ data }: MessageEvent<File>) => {
  void data.arrayBuffer().then((buffer) => {
    const result: WorkerResult = { sheets: parseCompanyFile(data.name, new Uint8Array(buffer)) };
    self.postMessage(result);
  }).catch((error: unknown) => {
    const result: WorkerResult = { error: error instanceof Error ? error.message : "The file could not be read. Try exporting it again." };
    self.postMessage(result);
  });
};
