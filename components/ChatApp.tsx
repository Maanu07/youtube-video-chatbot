"use client";

import { loadChatHistory, saveChatHistory } from "@/lib/chat-storage";
import { useEffect, useMemo, useRef, useState } from "react";

type Source = {
  text: string;
  startTime?: number;
  endTime?: number;
  videoId: string;
};

type ChatMessage = {
  id: string;
  question: string;
  answer: string;
  sources: Source[];
};

const defaultQuestions = [
  "What is this video about?",
  "What are the key takeaways?",
  "Summarize the main points of this video.",
  "What examples are discussed in the video?",
  "What are the most important concepts I should remember?",
];

type ProcessResponse = {
  videoId: string;
  chunks: number;
  cached?: boolean;
  error?: string;
};

function timestamp(seconds?: number) {
  if (seconds == null) return "";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

export default function ChatApp() {
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState("");
  const [status, setStatus] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const questionInputRef = useRef<HTMLInputElement>(null);

  const questions = useMemo(() => defaultQuestions, []);

  // When videoId is set (after process or on mount if you persist videoId too)
  useEffect(() => {
    if (!videoId) return;
    setMessages(loadChatHistory(videoId));
  }, [videoId]);

  // save chat history when messages changes
  useEffect(() => {
    if (!videoId || messages.length === 0) return;
    saveChatHistory(videoId, messages);
  }, [videoId, messages]);

  // scroll to the bottom of the chat messages when messages change
  useEffect(() => {
    if (questionInputRef.current) {
      questionInputRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  async function processVideo() {
    setBusy(true);
    setError("");
    setStatus("Fetching transcript and indexing video...");
    try {
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || "Rate limit exceeded. Please try again later.",
        );
      }

      const data: ProcessResponse = await res.json();

      if (!res.ok) throw new Error(data.error || "Could not process video.");

      setVideoId(data.videoId);
      setStatus(
        data.cached
          ? `Ready. Loaded ${data.chunks} cached transcript chunks.`
          : `Ready. Indexed ${data.chunks} transcript chunks.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function ask(q = question) {
    if (!q.trim() || !videoId) return;

    const messageId = crypto.randomUUID();
    setQuestion("");
    setBusy(true);
    setError("");
    setStatus("Retrieving relevant sections...");

    // Append placeholder message
    setMessages((prev) => [
      ...prev,
      { id: messageId, question: q, answer: "", sources: [] },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, videoId }),
      });

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error || "Rate limit exceeded. Please try again later.",
        );
      }

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Chat request failed.");
      }
      setStatus("Generating answer...");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;

          const payload = JSON.parse(line.slice(6));
          if (payload.type === "token") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId
                  ? { ...m, answer: m.answer + payload.text }
                  : m,
              ),
            );
          }
          if (payload.type === "sources") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId ? { ...m, sources: payload.sources } : m,
              ),
            );
          }
          if (payload.type === "error") throw new Error(payload.message);
          if (payload.type === "done") setStatus("");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("");
      // Optional: remove failed placeholder
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <div className="container">
        <header className="header">
          <div className="eyebrow">RAG · Gemini · Pinecone</div>
          <h1>YouTube Video Chatbot</h1>
          <p className="subtitle">
            Paste a YouTube URL, index its transcript, then ask grounded
            questions and get a streaming answer with timestamped sources.
          </p>
        </header>

        <section className="card">
          <div className="urlRow">
            <input
              className="input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            <button
              className="primary"
              disabled={!url.trim() || busy}
              onClick={processVideo}
            >
              {busy ? "Working..." : "Process video"}
            </button>
          </div>
          {status && <div className="status">{status}</div>}
          {error && <div className="error">{error}</div>}
        </section>

        {videoId && (
          <section className="card chatInput">
            <div className="sectionTitle">Suggested questions</div>
            <div className="questions">
              {questions.map((q) => (
                <button
                  key={q}
                  className="question"
                  disabled={busy}
                  onClick={() => ask(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </section>
        )}
        {videoId && (
          <section className="card chat">
            {messages.length > 0 && (
              <div className="chatMessages">
                {messages.map((msg) => (
                  <div key={msg.id} className="chatTurn">
                    <div className="sectionTitle">Question</div>
                    <div className="userBubble">{msg.question}</div>

                    <div className="sectionTitle">Answer</div>
                    <div className="answer">
                      {msg.answer || (busy ? "Thinking..." : "")}
                    </div>

                    {msg.sources.length > 0 && (
                      <>
                        <div className="sectionTitle">Sources</div>
                        <div className="sources">
                          {msg.sources.map((s, i) => {
                            const start = timestamp(s.startTime);
                            const href = `https://www.youtube.com/watch?v=${s.videoId}${
                              s.startTime
                                ? `&t=${Math.floor(s.startTime)}s`
                                : ""
                            }`;
                            return (
                              <a
                                className="source"
                                href={href}
                                target="_blank"
                                rel="noreferrer"
                                key={s.videoId + s.startTime + s.endTime}
                              >
                                [{start || "source"}] {s.text.slice(0, 180)}
                                {s.text.length > 180 ? "…" : ""}
                              </a>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                <div ref={questionInputRef} />
              </div>
            )}

            <div className="sectionTitle">Ask a question</div>
            <div className="urlRow">
              <input
                className="input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ask()}
                placeholder="What would you like to know?"
              />
              <button
                className="primary"
                disabled={!question.trim() || busy}
                onClick={() => ask()}
              >
                Ask
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

// https://www.youtube.com/watch?v=b2QkhmQ0sT0

// https://www.youtube.com/watch?v=OegbxfKXfZ4

// https://www.youtube.com/watch?v=6MuAOFfJk2w