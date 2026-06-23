import type { Metadata } from "next";
import { DocsContent } from "@/components/DocsContent";

export const metadata: Metadata = {
  title: "Docs — Telegram Search Engine",
  description:
    "How the Telegram Search Engine works: architecture, pipeline, search, graph, scoring, API, and self-hosting.",
};

export default function DocsPage() {
  return <DocsContent />;
}
