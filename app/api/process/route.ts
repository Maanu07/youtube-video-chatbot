import { NextResponse } from "next/server";
import { extractVideoId } from "@/lib/youtube";
import { fetchTranscript } from "@/lib/transcript";
import { indexTranscript } from "@/lib/rag";
import {
  getIndexedVideo,
  isVideoIndexed,
  markVideoIndexed,
} from "@/lib/indexed-video";
import { getClientIp, processRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const { url, force = false } = await req.json();
    const videoId = extractVideoId(url);

    // skip indexing if video is already indexed
    if (!force && (await isVideoIndexed(videoId))) {
      const existing = await getIndexedVideo(videoId);
      return NextResponse.json({
        videoId,
        chunks: existing?.chunk_count ?? 0,
        cached: true,
      });
    }

    // rate limit only for actual indexing
    const { success, limit, remaining, reset } =
      await processRateLimit.limit(ip);

    if (!success) {
      return NextResponse.json(
        { error: "Too many videos processed. Please try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(limit),
            "X-RateLimit-Remaining": String(remaining),
            "X-RateLimit-Reset": String(reset),
          },
        },
      );
    }

    const transcript = await fetchTranscript(videoId);

    if (!transcript.length)
      throw new Error("No transcript found for this video.");

    const chunks = await indexTranscript(videoId, transcript);
    await markVideoIndexed(videoId, chunks);
    return NextResponse.json({ videoId, chunks });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Processing failed." },
      { status: 400 },
    );
  }
}
