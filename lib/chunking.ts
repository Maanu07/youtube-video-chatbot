import { Document } from "@langchain/core/documents";
import  type { TranscriptItem } from "./transcript";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

export function getChunkSize() {
  return CHUNK_SIZE;
}

export function getChunkOverlap() {
  return CHUNK_OVERLAP;
}

export function createDoc(items: TranscriptItem[], videoId: string): Document {
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) {
    throw new Error("Cannot create document from empty transcript window.");
  }

  return new Document({
    pageContent: items.map((i) => i.text).join(" "),
    metadata: {
      videoId,
      startTime: first.start,
      endTime: last.start + last.duration,
    },
  });
}

export function takeTailForOverlap(items: TranscriptItem[], overlapChars: number): TranscriptItem[] {
  const tail: TranscriptItem[] = [];
  let length = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    tail.unshift(items[i]);
    length += items[i].text.length + 1;
    if (length >= overlapChars) break;
  }
  return tail;
}

// accumulate transcript items 
export function accumulateTranscriptItems(transcript: TranscriptItem[], videoId: string) {
  const chunks: Document[] = [];
  let window: TranscriptItem[] = [];
  let currentText = "";
  for (const item of transcript) {
    window.push(item);
    currentText += `${item.text} `;
    if (currentText.length >= CHUNK_SIZE) {
      chunks.push(createDoc(window, videoId));
      window = takeTailForOverlap(window, CHUNK_OVERLAP);
      currentText = window.map((i) => i.text).join(" ") + " ";
    }
  }
  if (currentText.trim()) {
    chunks.push(createDoc(window, videoId));
  }
  return chunks;
}
