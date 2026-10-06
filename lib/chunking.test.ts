import { describe, it, expect } from "vitest";
import { accumulateTranscriptItems } from "./chunking"; // or "./rag"

describe("accumulateTranscriptItems", () => {
  it("merges small caption lines into chunks", () => {
    const transcript = [
      { text: "Hello world.", start: 0, duration: 2 },
      { text: "Another line.", start: 2, duration: 2 },
    ];

    const chunks = accumulateTranscriptItems(transcript, "video123");

    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageContent).toContain("Hello world.");
    expect(chunks[0].metadata.startTime).toBe(0);
    expect(chunks[0].metadata.videoId).toBe("video123");
  });

  it("creates multiple chunks when text exceeds 1000 chars", () => {
    const longLine = "a".repeat(600);
    const transcript = [
      { text: longLine, start: 0, duration: 5 },
      { text: longLine, start: 5, duration: 5 },
    ];

    const chunks = accumulateTranscriptItems(transcript, "video123");
    expect(chunks.length).toBeGreaterThan(1);
  });
});