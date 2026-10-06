import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { PineconeStore } from "@langchain/pinecone";
import { Document } from "@langchain/core/documents";
// import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PromptTemplate } from "@langchain/core/prompts";
import { TranscriptItem } from "./transcript";
import { accumulateTranscriptItems } from "./chunking";

// const namespace = process.env.PINECONE_NAMESPACE || "youtube-chatbot";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function getEmbeddingModel() {
  return new GoogleGenerativeAIEmbeddings({
    apiKey: env("GOOGLE_API_KEY"),
    model: "gemini-embedding-001",
    outputDimensionality: 600 
  });
}

function pinecone() {
  return new Pinecone({ apiKey: env("PINECONE_API_KEY") });
}

export async function vectorStore(videoId: string) {
  const pc = pinecone();

  const embeddingModel = getEmbeddingModel();
  const indexName = env("PINECONE_INDEX");

  // Clear the namespace data if someone processed the same video again
  // await pc.index(indexName).namespace(videoId).deleteAll();

  return PineconeStore.fromExistingIndex(embeddingModel, {
    pineconeIndex: pc.index(indexName),
    namespace: videoId,
  });
}

export async function indexTranscript(
  videoId: string,
  transcript: TranscriptItem[],
) {
  // merge transcript items
  const docs = accumulateTranscriptItems(transcript, videoId);

  // NOTE:  we are not splitting the documents here as we are using the custom function to accumulate the transcript items

  // const splitter = new RecursiveCharacterTextSplitter({
  //   chunkSize: 1000,
  //   chunkOverlap: 150,
  // });
  // const chunks = await splitter.splitDocuments(docs);
 
  const store = await vectorStore(videoId);
  await store.addDocuments(docs);

  return docs.length;
}

export async function retrieve(videoId: string, question: string, k = 6) {
  const store = await vectorStore(videoId);
  return store.similaritySearch(question, k);
  // return store.similaritySearch(question, k, { videoId });
}

function promptTemplate() {
  return new PromptTemplate({
    template: `You are a YouTube video assistant. Answer the user's question using ONLY the provided transcript context. If the answer is not present, say you cannot find it in the video. Do not invent facts. Be concise but useful.\n\nTranscript context:\n{context}\n\nQuestion: {question}`,
    inputVariables: ["context", "question"],
  });
}

export async function streamAnswer(question: string, docs: Document[]) {
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-3.5-flash-lite",
    apiKey: env("GOOGLE_API_KEY"),
  });
  const context = docs
    .map((d, i) => `[Source ${i + 1}] ${d.pageContent}`)
    .join("\n\n");
  const prompt = await promptTemplate().invoke({ context, question });

  return model.stream(prompt);
}
