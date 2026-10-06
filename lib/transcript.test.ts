import { describe, it, expect, vi } from "vitest";

vi.mock("youtube-transcript", () => ({
  fetchTranscript: vi.fn().mockResolvedValue([
    { text: "Hello", offset: 1000, duration: 2000, lang: "en" },
  ]),
}));

import { fetchTranscript } from "./transcript";

describe("fetchTranscript", () => {
  it("converts ms to seconds", async () => {
    const items = await fetchTranscript("dQw4w9WgXcQ");
    expect(items[0]).toEqual({ text: "Hello", start: 1, duration: 2 });
  });
});