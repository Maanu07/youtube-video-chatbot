import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

// Expensive: transcript + embeddings + Pinecone writes
export const processRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"), // 5 requests per hour
  prefix: "ratelimit:process",
  analytics: true,
});

// Cheaper: retrieval + one LLM call
export const chatRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(15, "1 h"), // 15 questions per hour
  prefix: "ratelimit:chat",
  analytics: true,
});

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;

  return "anonymous";
}