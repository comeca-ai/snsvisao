import { type InferUITool, tool, type UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/chat/artifact";
import type { Suggestion } from "./db/schema";

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

// O canal web do Fio nao executa tools (o cerebro e o server Express).
// Os stubs abaixo existem SOMENTE para tipar partes de tool herdadas do
// template que podem aparecer em conversas antigas — nunca sao executados.
const getWeatherStub = tool({
  inputSchema: z.object({ latitude: z.number(), longitude: z.number() }),
  outputSchema: z.any(),
});

const createDocumentStub = tool({
  inputSchema: z.object({ kind: z.string(), title: z.string() }),
  outputSchema: z.any(),
});

const updateDocumentStub = tool({
  inputSchema: z.object({ description: z.string(), id: z.string() }),
  outputSchema: z.any(),
});

const requestSuggestionsStub = tool({
  inputSchema: z.object({ documentId: z.string() }),
  outputSchema: z.any(),
});

export type ChatTools = {
  getWeather: InferUITool<typeof getWeatherStub>;
  createDocument: InferUITool<typeof createDocumentStub>;
  updateDocument: InferUITool<typeof updateDocumentStub>;
  requestSuggestions: InferUITool<typeof requestSuggestionsStub>;
};

export type WaitingStatusData = {
  phase: "waiting" | "still-waiting" | "health" | "thinking";
  message: string;
  modelId: string;
  modelName: string;
};

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  "chat-title": string;
  "waiting-status": WaitingStatusData;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
