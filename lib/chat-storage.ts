export type StoredSource = {
  text: string;
  startTime?: number;
  endTime?: number;
  videoId: string;
};

export type StoredChatMessage = {
  id: string;
  question: string;
  answer: string;
  sources: StoredSource[];
};

const prefix = "youtube-chatbot:chat:";

function storageKey(videoId: string) {
  return `${prefix}${videoId}`;
}

export function loadChatHistory(videoId: string): StoredChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(videoId));
    if (!raw) return [];
    return JSON.parse(raw) as StoredChatMessage[];
  } catch {
    return [];
  }
}

export function saveChatHistory(videoId: string, messages: StoredChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(videoId), JSON.stringify(messages));
  } catch {
    // quota exceeded — ignore or trim old messages
  }
}

export function clearChatHistory(videoId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(storageKey(videoId));
}