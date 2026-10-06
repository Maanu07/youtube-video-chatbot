import { sql } from "./db";

export const INDEX_VERSION = "v1-gemini-embedding-001-1000-150";

export type IndexedVideo = {
  video_id: string;
  chunk_count: number;
  index_version: string;
  indexed_at: string;
};

export async function getIndexedVideo(videoId: string): Promise<IndexedVideo | null> {
  const db = sql();
  const rows = await db`
    SELECT video_id, chunk_count, index_version, indexed_at
    FROM indexed_videos
    WHERE video_id = ${videoId}
    LIMIT 1
  `;
  return (rows[0] as IndexedVideo | undefined) ?? null;
}

export async function isVideoIndexed(videoId: string): Promise<boolean> {
  const record = await getIndexedVideo(videoId);
  return record?.index_version === INDEX_VERSION;
}

export async function markVideoIndexed(videoId: string, chunkCount: number) {
  const db = sql();
  await db`
    INSERT INTO indexed_videos (video_id, chunk_count, index_version)
    VALUES (${videoId}, ${chunkCount}, ${INDEX_VERSION})
    ON CONFLICT (video_id) DO UPDATE
    SET chunk_count = EXCLUDED.chunk_count,
        index_version = EXCLUDED.index_version,
        indexed_at = now()
  `;
}