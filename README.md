# YouTube Video Chatbot

A RAG (Retrieval-Augmented Generation) app that lets you chat with any YouTube video. Paste a URL, index its transcript, then ask questions and get streaming, grounded answers with timestamped source links.

Built with **Next.js**, **TypeScript**, **LangChain**, **Gemini**, **Pinecone**, **Neon Postgres**, and **Upstash Redis**.

## Live demo

<!-- Replace with your Vercel URL after deployment -->
`https://your-app.vercel.app`

## Features

- YouTube URL / video ID input (watch, youtu.be, shorts, embed)
- Dual transcript providers — [`youtube-transcript`](https://www.npmjs.com/package/youtube-transcript) locally, [Supadata](https://supadata.ai) on Vercel
- Custom transcript chunking with segment overlap (~1000 chars / 150 overlap)
- Gemini embeddings stored in Pinecone (one namespace per video)
- Neon Postgres ingestion cache — skip re-indexing for already-processed videos
- Semantic retrieval scoped to the current video
- Streaming answers over Server-Sent Events (SSE)
- Multi-turn chat history with `localStorage` persistence per video
- Suggested questions and clickable timestamped sources
- IP-based API rate limiting via Upstash Redis
- Unit tests for core logic (Vitest)

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript |
| API | Next.js Route Handlers |
| LLM / Embeddings | Google Gemini (`gemini-3.5-flash-lite`, `gemini-embedding-001`) |
| Orchestration | LangChain |
| Vector store | Pinecone (namespace = `videoId`) |
| Database | Neon Postgres (indexed video registry) |
| Rate limiting | Upstash Redis (`@upstash/ratelimit`) |
| Client storage | `localStorage` (chat history per video) |
| Transcripts (local) | `youtube-transcript` |
| Transcripts (production) | [Supadata API](https://supadata.ai) |
| Testing | Vitest |

## Prerequisites

- Node.js 20+
- [Google AI Studio](https://aistudio.google.com/) API key
- [Pinecone](https://www.pinecone.io/) account with a serverless index
- [Neon](https://neon.tech/) Postgres database
- [Upstash](https://upstash.com/) Redis database (for rate limiting)
- [Supadata](https://supadata.ai) API key (production / Vercel only — local dev uses `youtube-transcript` by default)

### Pinecone index setup

Create a serverless index with:

- **Dimensions:** `600` (matches `gemini-embedding-001` with `outputDimensionality: 600`)
- **Metric:** cosine

## Setup

1. Clone the repo and install dependencies:

```bash
npm install
```

2. Copy the environment file:

```bash
cp .env.example .env.local
```

3. Fill in `.env.local`:

| Variable | Description |
|---|---|
| `GOOGLE_API_KEY` | Google AI / Gemini API key |
| `PINECONE_API_KEY` | Pinecone API key |
| `PINECONE_INDEX` | Pinecone index name |
| `DATABASE_URL` | Neon Postgres connection string |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |
| `SUPADATA_API_KEY` | Supadata API key — **required on Vercel**; optional locally |
| `TRANSCRIPT_PROVIDER` | Optional override: `youtube-transcript` or `supadata` |

**Local dev:** leave `SUPADATA_API_KEY` empty and the app uses `youtube-transcript` automatically.

**Production (Vercel):** set `SUPADATA_API_KEY`. YouTube blocks cloud/datacenter IPs, so direct scraping fails on serverless hosts — Supadata fetches captions reliably from production.

4. Create the database table in Neon (SQL Editor):

```sql
CREATE TABLE indexed_videos (
  video_id TEXT PRIMARY KEY,
  chunk_count INTEGER NOT NULL,
  index_version TEXT NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

5. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Paste a YouTube URL and click **Process video**.
2. Wait for transcript indexing (or instant load if the video was already indexed).
3. Ask a question via the input or pick a suggested one.
4. Read the streaming answer and click source links to jump to relevant timestamps.
5. Ask follow-up questions — history stays visible for the session and survives page refresh (`localStorage`, keyed by `videoId`).

To force re-indexing a video, send `{ "url": "...", "force": true }` to `POST /api/process`.

## Chat history

Questions, answers, and sources are stored in the browser per video:

- **In-session:** all Q&A turns render in a scrollable message list
- **Persistent:** saved to `localStorage` under `youtube-chatbot:chat:{videoId}`
- **Reload:** processing a video loads its prior chat history automatically

Chat history is client-side only (no server DB). Clearing browser storage removes it.

## Testing

Unit tests cover pure logic modules with Vitest:

```bash
npm test          # watch mode
npm run test:run  # single run (CI)
```

| Test file | Covers |
|---|---|
| `lib/youtube.test.ts` | Video ID extraction from URLs |
| `lib/chunking.test.ts` | Transcript chunking and overlap |
| `lib/transcript.test.ts` | Supadata path: ms → seconds conversion (mocked `fetch`) |
| `lib/indexed-video.test.ts` | Ingestion cache version checks (mocked Neon) |

External services (Gemini, Pinecone, Neon, Upstash) are not hit during unit tests — they are mocked at module boundaries.

## Project structure

```
app/
  api/
    process/route.ts   # Ingest transcript + embed into Pinecone
    chat/route.ts      # Retrieve + stream grounded answer (SSE)
  page.tsx             # Renders ChatApp
components/
  ChatApp.tsx          # Main UI + chat history
lib/
  youtube.ts           # Video ID extraction
  transcript.ts        # Transcript fetching (youtube-transcript / Supadata)
  chunking.ts          # Transcript chunking with overlap
  rag.ts               # Embeddings, Pinecone, retrieval, generation
  indexed-video.ts     # Neon ingestion registry
  chat-storage.ts      # localStorage chat history helpers
  rate-limit.ts        # Upstash rate limiters + IP extraction
  db.ts                # Neon client
  *.test.ts            # Unit tests
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for data flow, rate limiting, design decisions, and API details.

## API routes

### `POST /api/process`

Index a YouTube video.

**Request**

```json
{ "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "force": false }
```

**Response**

```json
{ "videoId": "dQw4w9WgXcQ", "chunks": 42, "cached": false }
```

**Rate limit:** 5 new indexings per hour per IP. Cached hits (already indexed videos) skip the rate limit.

**429 response**

```json
{ "error": "Too many videos processed. Please try again later." }
```

Includes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

### `POST /api/chat`

Ask a question about an indexed video. Returns an SSE stream.

**Request**

```json
{ "question": "What is this video about?", "videoId": "dQw4w9WgXcQ" }
```

**SSE events**

| Event | Payload |
|---|---|
| `sources` | `{ type: "sources", sources: [...] }` |
| `token` | `{ type: "token", text: "..." }` |
| `done` | `{ type: "done" }` |
| `error` | `{ type: "error", message: "..." }` |

**Rate limit:** 15 questions per hour per IP.

**429 response**

```json
{ "error": "Too many questions asked. Please try again later." }
```

## Rate limiting

Rate limits are enforced per client IP using [Upstash Redis](https://upstash.com/) with sliding windows:

| Route | Limit | When applied |
|---|---|---|
| `/api/process` | 5 / hour | Only when actually indexing (not cached) |
| `/api/chat` | 15 / hour | Every question |

IP is read from `x-forwarded-for` (set by Vercel in production) or `x-real-ip`. In local dev without proxy headers, all requests share the `"anonymous"` bucket.

## Deployment

Works well on [Vercel](https://vercel.com). Add all env vars from `.env.example` in your project settings — including `SUPADATA_API_KEY` for transcript fetching in production.

Keep API keys server-side only — they are used exclusively in Route Handlers under `app/api/`.

### Transcript providers

| Environment | Default provider | Why |
|---|---|---|
| Local (`npm run dev`) | `youtube-transcript` | Free, no API usage |
| Vercel (production) | Supadata | YouTube often blocks cloud IPs; Supadata works from serverless |

Override anytime with `TRANSCRIPT_PROVIDER=supadata` or `TRANSCRIPT_PROVIDER=youtube-transcript` in `.env.local`.

### Deploy checklist

1. Push repo to GitHub
2. Import project on Vercel
3. Add all 7 environment variables (including `SUPADATA_API_KEY`)
4. Confirm Neon `indexed_videos` table exists
5. Confirm Pinecone index uses **600 dimensions**
6. Deploy and smoke-test: process video → ask question → refresh page (history should persist)

Recommended CI step:

```bash
npm run test:run && npm run build
```

After deploying, update the **Live demo** URL at the top of this README.

## Production considerations

- Rate limiting is enabled for public deployment; adjust limits in `lib/rate-limit.ts` as needed.
- Add authentication before scaling to many users (IP limits are a baseline, not full access control).
- Bump `INDEX_VERSION` in `lib/indexed-video.ts` when changing embedding model or chunk settings to trigger re-indexing.
- **Local dev** uses `youtube-transcript` (unofficial YouTube API; captions must be enabled on the video).
- **Production** uses Supadata — set `SUPADATA_API_KEY` on Vercel. Without it, transcript fetching fails in production.
- Supadata free tier has monthly request limits; cached videos (Neon) skip re-fetching.
- Chat history is stored in the user's browser only — not suitable for cross-device sync without server-side storage.
- Consider prompt-injection defenses and retrieval evaluation for production use.

## License

MIT
