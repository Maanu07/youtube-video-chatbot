import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("fetchTranscript", () => {
  beforeEach(() => {
    vi.stubEnv("SUPADATA_API_KEY", "test-key");
    vi.stubEnv("TRANSCRIPT_PROVIDER", "supadata");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("converts ms to seconds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ text: "Hello", offset: 1000, duration: 2000, lang: "en" }],
        }),
      }),
    );

    const { fetchTranscript } = await import("./transcript");
    const items = await fetchTranscript("dQw4w9WgXcQ");

    expect(items[0]).toEqual({ text: "Hello", start: 1, duration: 2 });
  });
});