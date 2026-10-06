import { it, expect, vi } from "vitest";

const mockSql = vi.fn();
vi.mock("./db", () => ({ sql: () => mockSql }));

import { isVideoIndexed, INDEX_VERSION } from "./indexed-video";

it("returns true when index_version matches", async () => {
  mockSql.mockResolvedValue([{
    video_id: "abc",
    chunk_count: 10,
    index_version: INDEX_VERSION,
    indexed_at: "2026-01-01",
  }]);

  expect(await isVideoIndexed("abc")).toBe(true);
});