import { fetchTranscript as fetchYoutubeTranscript } from "youtube-transcript";

export type TranscriptItem = { text: string; start: number; duration: number };

export async function fetchTranscript(videoId: string): Promise<TranscriptItem[]> {
  const items = await fetchYoutubeTranscript(videoId, {
   lang: 'en'
  });

  return items.map((item) => ({
    text: item.text,
    start: item.offset / 1000,
    duration: item.duration / 1000
  }));
}
