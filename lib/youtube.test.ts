import { describe, it, expect } from "vitest";
import { extractVideoId } from "./youtube";

describe("extractVideoId", () => {
  it("accepts a raw 11-char video id", () => {
    expect(extractVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("parses youtube.com/watch URLs", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("parses youtu.be URLs", () => {
    expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("parses shorts URLs", () => {
    expect(extractVideoId("https://www.youtube.com/shorts/abc123XYZ01")).toBe("abc123XYZ01");
  });

  it("throws on invalid input", () => {
    expect(() => extractVideoId("not-a-url")).toThrow("Invalid URL");
  });
});