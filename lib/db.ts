import { neon } from "@neondatabase/serverless";

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured.");
  return url;
}

export function sql<T = Record<string, unknown>>() {
  return neon(getDatabaseUrl()) as ReturnType<typeof neon>;
}