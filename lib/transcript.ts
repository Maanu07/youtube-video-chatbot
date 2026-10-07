export type TranscriptItem = { text: string; start: number; duration: number };

type SupadataSegment = {
  text: string;
  offset: number;
  duration: number;
  lang?: string;
};

type SupadataResponse = {
  content?: SupadataSegment[] | string;
  lang?: string;
  jobId?: string;
};

function getProvider(): "supadata" | "youtube-transcript" {
  const override = process.env.TRANSCRIPT_PROVIDER;
  if (override === "supadata" || override === "youtube-transcript") {
    return override;
  }
  // Default: Supadata in prod, youtube-transcript locally
  return process.env.NODE_ENV === "production" ? "supadata" : "youtube-transcript";
}

async function fetchFromYoutubeTranscript(videoId: string): Promise<TranscriptItem[]> {
  const { fetchTranscript } = await import("youtube-transcript");
  const items = await fetchTranscript(videoId, { lang: "en" });
  return items.map((item) => ({
    text: item.text,
    start: item.offset / 1000,
    duration: item.duration / 1000,
  }));
}


async function fetchFromSupadata(videoId: string): Promise<TranscriptItem[]> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    throw new Error("SUPADATA_API_KEY is not configured.");
  }

  const url = new URL("https://api.supadata.ai/v1/transcript");
  url.searchParams.set("url", `https://www.youtube.com/watch?v=${videoId}`);
  url.searchParams.set("lang", "en");
  url.searchParams.set("text", "false");
  url.searchParams.set("mode", "auto");

  const res = await fetch(url.toString(), {
    headers: { "x-api-key": apiKey },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supadata transcript failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as SupadataResponse;

  if (data.jobId) {
    throw new Error("Transcript is still processing. Try again in a moment.");
  }

  if (!Array.isArray(data.content) || !data.content.length) {
    throw new Error("No transcript found for this video.");
  }

  return data.content.map((item) => ({
    text: item.text,
    start: item.offset / 1000,
    duration: item.duration / 1000,
  }));
}

export async function fetchTranscript(videoId: string): Promise<TranscriptItem[]> {
  const provider = getProvider(); 
  return provider === "supadata"
    ? fetchFromSupadata(videoId)
    : fetchFromYoutubeTranscript(videoId);
}