import { describe, it, expect, vi } from "vitest";
import { FakeBoardFetcher, HttpBoardFetcher, type FetchLike } from "./fetcher";
import type { WatchlistEntry } from "./types";

function entry(over: Partial<WatchlistEntry> = {}): WatchlistEntry {
  return {
    id: "w1",
    company: "Acme Corp",
    careersUrl: "https://boards.greenhouse.io/acmecorp",
    ats: "greenhouse",
    token: "acmecorp",
    active: true,
    addedAt: "2026-09-10",
    ...over,
  };
}

describe("FakeBoardFetcher", () => {
  it("returns the stubbed payload per entry id and rejects when told to fail", async () => {
    const fake = new FakeBoardFetcher({ w1: { jobs: [{ id: 1, title: "PM" }] } }, { w2: "boom" });
    await expect(fake.fetchBoard(entry())).resolves.toEqual({ jobs: [{ id: 1, title: "PM" }] });
    await expect(fake.fetchBoard(entry({ id: "w2" }))).rejects.toThrow("boom");
    expect(fake.calls.map((e) => e.id)).toEqual(["w1", "w2"]);
  });

  it("returns an empty board for an entry it knows nothing about", async () => {
    await expect(new FakeBoardFetcher({}).fetchBoard(entry({ id: "zzz" }))).resolves.toEqual({ jobs: [] });
  });
});

describe("HttpBoardFetcher", () => {
  function mockFetch(status: number, body: unknown): FetchLike & ReturnType<typeof vi.fn> {
    return vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }));
  }

  it("issues a keyless GET to the ATS public endpoint derived from ats + token", async () => {
    const fetch = mockFetch(200, { jobs: [] });
    const out = await new HttpBoardFetcher(fetch).fetchBoard(entry());
    expect(out).toEqual({ jobs: [] });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://boards-api.greenhouse.io/v1/boards/acmecorp/jobs?content=true");
    expect((init.method ?? "GET").toUpperCase()).toBe("GET");
    expect(JSON.stringify(init.headers ?? {})).not.toMatch(/authorization|api-key/i);
  });

  it("uses the token as-is for Lever / Ashby / SmartRecruiters endpoints", async () => {
    const fetch = mockFetch(200, []);
    const f = new HttpBoardFetcher(fetch);
    await f.fetchBoard(entry({ ats: "lever", token: "acme-labs" }));
    await f.fetchBoard(entry({ ats: "ashby", token: "AcmeRobotics" }));
    await f.fetchBoard(entry({ ats: "smartrecruiters", token: "AcmeGroup" }));
    const urls = fetch.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(urls).toEqual([
      "https://api.lever.co/v0/postings/acme-labs?mode=json",
      "https://api.ashbyhq.com/posting-api/job-board/AcmeRobotics",
      "https://api.smartrecruiters.com/v1/companies/AcmeGroup/postings",
    ]);
  });

  it("rejects an unknown ATS or missing token without touching the network", async () => {
    const fetch = mockFetch(200, {});
    const f = new HttpBoardFetcher(fetch);
    await expect(f.fetchBoard(entry({ ats: "unknown", token: null }))).rejects.toThrow(/manual/i);
    await expect(f.fetchBoard(entry({ token: null }))).rejects.toThrow(/token/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects on a non-2xx response with the status in the message", async () => {
    const f = new HttpBoardFetcher(mockFetch(404, { error: "not found" }));
    await expect(f.fetchBoard(entry())).rejects.toThrow(/404/);
  });
});
