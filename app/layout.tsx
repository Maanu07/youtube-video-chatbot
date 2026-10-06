import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "YouTube Video Chatbot",
  description: "Ask questions about a YouTube video using RAG."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}