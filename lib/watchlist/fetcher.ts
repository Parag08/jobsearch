import { atsEndpoint } from "./ats";
import type { WatchlistEntry } from "./types";

/**
 * Board fetching is the ONLY I/O in the watchlist module, isolated behind
 * this interface (the LlmProvider / FakeLlm pattern). Payloads come back as
 * unknown - lib/watchlist/mappers.ts owns the shapes.
 */
export interface BoardFetcher {
  fetchBoard(entry: WatchlistEntry): Promise<unknown>;
}

/** Test double: stubbed payload per entry id; listed ids reject instead. */
export class FakeBoardFetcher implements BoardFetcher {
  readonly calls: WatchlistEntry[] = [];

  constructor(
    private readonly payloads: Record<string, unknown>,
    private readonly failures: Record<string, string> = {},
  ) {}

  async fetchBoard(entry: WatchlistEntry): Promise<unknown> {
    this.calls.push(entry);
    const failure = this.failures[entry.id];
    if (failure !== undefined) throw new Error(failure);
    return entry.id in this.payloads ? this.payloads[entry.id] : { jobs: [] };
  }
}

/** The subset of the WHATWG fetch contract we depend on (injected, never global). */
export type FetchLike = (
  url: string,
  init: RequestInit,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Real fetcher: keyless GET to the ATS public endpoint (rule 5, free-first).
 * Every supported ATS exposes its board as unauthenticated JSON, so there is
 * no credential to inject here by design.
 */
export class HttpBoardFetcher implements BoardFetcher {
  constructor(private readonly fetchFn: FetchLike) {}

  async fetchBoard(entry: WatchlistEntry): Promise<unknown> {
    if (entry.ats === "unknown") {
      throw new Error(`watchlist "${entry.company}": ATS unknown - set it manually before refreshing`);
    }
    if (!entry.token) {
      throw new Error(`watchlist "${entry.company}": no board token for ${entry.ats}`);
    }
    const url = atsEndpoint(entry.ats, entry.token);
    const res = await this.fetchFn(url, { method: "GET", headers: { accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`watchlist "${entry.company}": ${entry.ats} board returned HTTP ${res.status}`);
    }
    return res.json();
  }
}
