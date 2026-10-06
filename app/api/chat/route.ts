import { retrieve, streamAnswer } from "@/lib/rag";
import { getClientIp, chatRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const { success, limit, remaining, reset } =
      await chatRateLimit.limit(ip);

    if (!success) {
      return Response.json(
        { error: "Too many questions asked. Please try again later." },
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
    const { question, videoId } = await req.json();
    if (!question?.trim() || !videoId) throw new Error("question and videoId are required.");

    const docs = await retrieve(videoId, question, 6);

    const sourcePayload = docs.map(d => ({
      text: d.pageContent,
      videoId: d.metadata.videoId,
      startTime: d.metadata.startTime,
      endTime: d.metadata.endTime
    }));

    const modelStream = await streamAnswer(question, docs);
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        send({ type: "sources", sources: sourcePayload });
        try {
          for await (const chunk of modelStream) {
            const text = typeof chunk.content === "string" ? chunk.content : chunk.text;
            if (text) send({ type: "token", text });
          }
          send({ type: "done" });
        } catch (error) {
          send({ type: "error", message: error instanceof Error ? error.message : "Generation failed." });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Chat failed." }, { status: 400 });
  }
}