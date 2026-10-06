export function extractVideoId(input: string): string {
  const value = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
  const url = new URL(value);
  if (url.hostname === "youtu.be") return url.pathname.slice(1).split("/")[0];
  if (url.hostname.endsWith("youtube.com")) {
    const id = url.searchParams.get("v");
    if (id) return id;
    const parts = url.pathname.split("/").filter(Boolean);
    const index = parts.findIndex(p => ["shorts", "embed", "live"].includes(p));
    if (index >= 0 && parts[index + 1]) return parts[index + 1];
  }
  throw new Error("Invalid YouTube URL or video ID.");
}