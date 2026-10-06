# Architecture

This document describes how the YouTube Video Chatbot is structured, how data flows through the system, and the main design decisions behind the implementation.

## High-level overview

```
┌─────────────┐     POST /api/process      ┌──────────────────────────────────────┐
│   Browser   │ ─────────────────────────► │  Extract videoId                     │
│  (ChatApp)  │                            │  Check Neon cache → return if hit    │
└─────────────┘                            │  Rate limit (Upstash, per IP)        │
      │                                    │  Fetch transcript (youtube-transcript)│
      │                                    │  Chunk + embed → Pinecone (namespace)│
      │                                    │  Record in Neon                      │
      │                                    └──────────────────────────────────────┘
      │
      │     POST /api/chat (SSE)
      └──────────────────────────► ┌──────────────────────────────────────┐
                                   │  Rate limit (Upstash, per IP)        │
                                   │  Embed question → Pinecone search    │
                                   │  Build prompt with retrieved chunks  │
                                   │  Stream Gemini response → client     │
                                   └──────────────────────────────────────┘
```

The app has two main paths:

1. **Ingestion** — fetch transcript, chunk it, embed it, store vectors in Pinecone, record the video in Neon.
2. **Chat** — rate-limit the request, retrieve relevant chunks for a question, generate a grounded answer, stream it to the UI.

## Components

### Frontend — `components/ChatApp.tsx`

Single-page client component that handles:

- Video URL submission and processing status
- Multi-turn chat UI (question / answer / sources per turn)
- Question input and suggested questions
- SSE consumption via `fetch` + `ReadableStream` reader
- Streaming token updates into the active message by `messageId`
- Auto-scroll to latest message
- 429 rate-limit error messages from the API

**UI layout (top to bottom):**

1. URL input + process button
2. Suggested questions (after video is ready)
3. Chat message history (scrollable)
4. Ask input (always visible once video is processed)

The client parses SSE events (`sources`, `token`, `done`, `error`) and updates React state incrementally.

### Chat history — `lib/chat-storage.ts`

Client-side persistence using `localStorage`:

| Key | Value |
|---|---|
| `youtube-chatbot:chat:{videoId}` | JSON array of `{ id, question, answer, sources }` |

- **Load:** when `videoId` changes, `loadChatHistory(videoId)` hydrates the message list
- **Save:** whenever `messages` changes, `saveChatHistory(videoId, messages)` writes to storage
- **Scope:** per video — switching videos loads that video's history

No server round-trip for chat history. Suitable for a portfolio demo; cross-device sync would require a DB + auth.

### API — `app/api/process/route.ts`

Ingestion endpoint. Flow:

1. Parse `url` (and optional `force`) from request body.
2. Extract `videoId` via `lib/youtube.ts`.
3. If not forced, check Neon (`isVideoIndexed`) — return cached response if found (**no rate limit**).
4. Apply `processRateLimit` (5/hour per IP) for new indexings only.
5. Fetch transcript via `lib/transcript.ts`.
6. Chunk and embed via `indexTranscript()` in `lib/rag.ts`.
7. Save record to Neon via `markVideoIndexed()`.

### API — `app/api/chat/route.ts`

Chat endpoint. Flow:

1. Apply `chatRateLimit` (15/hour per IP).
2. Accept `question` and `videoId`.
3. Retrieve top-k similar chunks from Pinecone (`retrieve()`).
4. Send sources to the client immediately as the first SSE event.
5. Stream Gemini tokens as subsequent SSE events.
6. Close stream with a `done` event.

### Rate limiting — `lib/rate-limit.ts`

Uses `@upstash/ratelimit` with `@upstash/redis` for serverless-compatible, shared counters across Vercel instances.

| Limiter | Prefix | Limit | Applied to |
|---|---|---|---|
| `processRateLimit` | `ratelimit:process` | 5 / hour (sliding) | New video indexings |
| `chatRateLimit` | `ratelimit:chat` | 15 / hour (sliding) | Every chat request |

**Identifier:** client IP from `getClientIp(req)`:

1. `x-forwarded-for` (first IP in the list — set by Vercel)
2. `x-real-ip` (fallback)
3. `"anonymous"` (local dev without proxy headers)

**Redis key shape** (managed by Upstash, not written manually):

```
ratelimit:process:{ip}:{timeWindow}  →  counter
ratelimit:chat:{ip}:{timeWindow}     →  counter
```

On limit exceeded, routes return **429** with `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

### Transcript — `lib/transcript.ts`

Thin wrapper around the `youtube-transcript` package. Converts the package's millisecond `offset`/`duration` values to seconds for metadata and UI timestamps.

Transcript fetching is isolated here so the provider can be swapped without touching the RAG pipeline.

### Video ID — `lib/youtube.ts`

Extracts an 11-character YouTube video ID from:

- Raw video ID strings
- `youtube.com/watch?v=...`
- `youtu.be/...`
- `/shorts/`, `/embed/`, `/live/` paths

### Chunking — `lib/chunking.ts`

YouTube captions arrive as short segments (one line each). Individual lines are too small for good semantic search, so adjacent segments are merged into ~1000-character windows with ~150-character overlap between consecutive chunks.

Overlap is implemented at the **caption segment level** (not raw character slicing) so timestamps stay accurate:

```
Chunk 1: [line1 line2 line3 line4 line5]   start=10s  end=45s
Chunk 2:           [line4 line5 line6 line7]  start=38s  end=62s
                              ^^^^^ overlap
```

Each chunk is stored as a LangChain `Document` with metadata:

- `videoId`
- `startTime` — start of the first caption in the window
- `endTime` — end of the last caption in the window

### RAG pipeline — `lib/rag.ts`

Core retrieval and generation logic. Delegates chunking to `lib/chunking.ts`.

#### Embeddings — `getEmbeddingModel()`

Uses `gemini-embedding-001` with `outputDimensionality: 600`. The Pinecone index must be created with matching dimensions.

#### Vector storage — `vectorStore(videoId)`

Each video gets its own Pinecone **namespace** (the `videoId`). This provides:

- Physical isolation between videos
- Faster retrieval (search only within one video's vectors)
- Simple cleanup (delete namespace to remove a video's data)

#### Indexing — `indexTranscript()`

Chunks transcript → embeds → upserts into Pinecone under the video's namespace.

#### Retrieval — `retrieve()`

Embeds the user's question and runs similarity search against the video's namespace. Returns top 6 chunks by default.

#### Generation — `streamAnswer()`

Uses `gemini-3.5-flash-lite` via LangChain's `ChatGoogleGenerativeAI`. Builds a prompt with retrieved chunks as numbered sources, instructs Gemini to answer only from context, and returns a streaming response.

## Data stores

### Pinecone

- **Purpose:** Vector storage and similarity search
- **Keying:** One namespace per `videoId`
- **Contents:** Embedded transcript chunks with timestamp metadata

### Neon Postgres

- **Purpose:** Ingestion registry (which videos are indexed)
- **Table:** `indexed_videos`
- **Why not Pinecone-only?** Faster cache lookups, metadata (chunk count, version, timestamp) without querying vectors, and version-based invalidation

### Upstash Redis

- **Purpose:** Rate-limit counters (sliding window per IP)
- **Keying:** `{prefix}:{ip}:{timeWindow}` (managed by `@upstash/ratelimit`)
- **Why Redis?** Serverless functions don't share memory; Redis provides a global counter store

### Browser localStorage

- **Purpose:** Chat history (questions, answers, sources) per video
- **Keying:** `youtube-chatbot:chat:{videoId}`
- **Why client-side?** No auth required; instant restore on refresh; zero server cost for a demo app

## Streaming protocol

The chat route uses Server-Sent Events over a `ReadableStream`:

```
data: {"type":"sources","sources":[...]}

data: {"type":"token","text":"The video"}

data: {"type":"token","text":" is about..."}

data: {"type":"done"}

```

The client buffers incoming bytes, splits on `\n\n` event boundaries, parses JSON payloads, and updates the active message in the `messages` array per event type.

## Testing

Unit tests use **Vitest** with the `node` environment. Config: `vitest.config.ts`.

| Module | Test file | Strategy |
|---|---|---|
| `lib/youtube.ts` | `youtube.test.ts` | Pure function tests, no mocks |
| `lib/chunking.ts` | `chunking.test.ts` | Pure function tests, no mocks |
| `lib/transcript.ts` | `transcript.test.ts` | Mock `youtube-transcript` package |
| `lib/indexed-video.ts` | `indexed-video.test.ts` | Mock Neon `sql` client |

External APIs (Gemini, Pinecone, Upstash, Neon) are not called in unit tests. Route handlers and RAG integration are candidates for future integration tests.

```bash
npm test          # watch mode
npm run test:run  # CI single run
```

## Design decisions

| Decision | Rationale |
|---|---|
| Namespace = `videoId` | Isolates vectors per video; no cross-video contamination in search |
| Neon ingestion cache | Skips expensive transcript fetch + embedding on repeat URLs |
| Rate limit after cache check | Cached index hits are free; limits target costly new indexings |
| IP-based rate limiting | Simple protection for a public demo without auth infrastructure |
| Upstash Redis | Serverless-safe shared state for counters across Vercel instances |
| localStorage chat history | Multi-turn UX without auth or server DB; keyed per video |
| Custom segment chunking | Caption lines are too small; generic text splitters lose timestamp accuracy |
| Segment-level overlap | Preserves meaningful boundaries and correct `startTime`/`endTime` |
| `INDEX_VERSION` | Allows safe re-indexing when embedding model or chunk config changes |
| SSE over WebSockets | Simpler for unidirectional server→client streaming in Next.js Route Handlers |
| Transcript provider boundary | `lib/transcript.ts` is swappable without touching RAG logic |
| Chunking in separate module | Pure logic testable without loading Pinecone/Gemini dependencies |

## File map

```
lib/
  youtube.ts           → extractVideoId()
  transcript.ts        → fetchTranscript() — youtube-transcript wrapper
  chunking.ts          → accumulateTranscriptItems() — segment merge + overlap
  rag.ts               → embeddings, Pinecone, retrieval, generation
  indexed-video.ts     → isVideoIndexed(), markVideoIndexed(), getIndexedVideo()
  chat-storage.ts      → loadChatHistory(), saveChatHistory(), clearChatHistory()
  rate-limit.ts        → processRateLimit, chatRateLimit, getClientIp()
  db.ts                → Neon SQL client
  *.test.ts            → unit tests

app/api/
  process/route.ts     → ingestion orchestration + rate limit
  chat/route.ts        → retrieval + SSE streaming + rate limit

components/
  ChatApp.tsx          → UI + SSE client + chat history

vitest.config.ts       → test runner config
```

## Future improvements

- Authentication and per-user quotas (beyond IP rate limiting)
- Server-side chat history (Neon) for cross-device sync
- Force re-index button in the UI
- Stale cache recovery (re-index if Pinecone namespace is empty but Neon says indexed)
- Retrieval evaluation and prompt-injection defenses
- TTL-based re-indexing for videos whose captions may have changed
- Integration tests for API routes
