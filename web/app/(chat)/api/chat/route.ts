import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { auth } from "@/app/(auth)/auth";
import {
  deleteChatById,
  getChatById,
  saveChat,
  saveMessages,
  updateChatTitleById,
} from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import { generateUUID, getTextFromMessage } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

// O "cérebro" do Fio mora no server Express (ver SPEC §9.1). A interface web
// NUNCA chama provedor de IA diretamente: repassa a mensagem do visitante para
// POST {FIO_SERVER_URL}/webchat/message e devolve os baloes (replies) no
// protocolo de UI Message Stream que o useChat (AI SDK) consome.
const FIO_SERVER_URL = process.env.FIO_SERVER_URL ?? "http://localhost:3000";
const FIO_WEBHOOK_TOKEN = process.env.FIO_WEBHOOK_TOKEN ?? "";
const BRAIN_TIMEOUT_MS = 30_000;

// Mensagem amigavel quando o cerebro falha — nunca quebra o stream.
const FIO_FALLBACK_MESSAGE =
  "Opa, o Fio deu uma escorregada por aqui. Tenta de novo?";

type WebchatBrainResponse = {
  replies?: unknown;
  contactId?: string;
};

async function askFioBrain({
  sessionId,
  text,
}: {
  sessionId: string;
  text: string;
}): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BRAIN_TIMEOUT_MS);

  try {
    const response = await fetch(`${FIO_SERVER_URL}/webchat/message`, {
      body: JSON.stringify({ sessionId, text }),
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "x-webhook-token": FIO_WEBHOOK_TOKEN,
      },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Fio brain respondeu HTTP ${response.status}`);
    }

    const data = (await response.json()) as WebchatBrainResponse;
    const replies = Array.isArray(data.replies)
      ? data.replies.filter(
          (reply): reply is string =>
            typeof reply === "string" && reply.trim().length > 0
        )
      : [];

    if (replies.length === 0) {
      throw new Error("Fio brain respondeu sem replies");
    }

    return replies;
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  try {
    const { id, message, selectedVisibilityType } = requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatbotError("unauthorized:chat").toResponse();
    }

    // Sem tools no canal web: so existe fluxo de mensagem nova do usuario.
    if (!message || message.role !== "user") {
      return new ChatbotError("bad_request:api").toResponse();
    }

    const chat = await getChatById({ id });
    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatbotError("forbidden:chat").toResponse();
      }
    } else {
      await saveChat({
        id,
        title: "Nova conversa",
        userId: session.user.id,
        visibility: selectedVisibilityType,
      });
      titlePromise = generateTitleFromUserMessage({ message });
    }

    await saveMessages({
      messages: [
        {
          attachments: [],
          chatId: id,
          createdAt: new Date(),
          id: message.id,
          parts: message.parts,
          role: "user",
        },
      ],
    });

    const userText = getTextFromMessage(message as ChatMessage);

    const stream = createUIMessageStream<ChatMessage>({
      execute: async ({ writer: dataStream }) => {
        if (titlePromise) {
          try {
            const title = await titlePromise;
            dataStream.write({ data: title, type: "data-chat-title" });
            updateChatTitleById({ chatId: id, title });
          } catch {
            /* titulo e detalhe — nunca derruba a conversa */
          }
        }

        let replies: string[];
        try {
          replies = await askFioBrain({ sessionId: id, text: userText });
        } catch (error) {
          console.error("Fio brain indisponivel:", error);
          replies = [FIO_FALLBACK_MESSAGE];
        }

        // Cada reply vira um balao (part de texto) separado na mesma
        // mensagem do assistente, como o Fio faria no WhatsApp.
        for (const reply of replies) {
          const textId = generateUUID();
          dataStream.write({ id: textId, type: "text-start" });
          dataStream.write({ delta: reply, id: textId, type: "text-delta" });
          dataStream.write({ id: textId, type: "text-end" });
        }
      },
      generateId: generateUUID,
      onEnd: async ({ messages: finishedMessages }) => {
        if (finishedMessages.length > 0) {
          await saveMessages({
            messages: finishedMessages.map((currentMessage) => ({
              attachments: [],
              chatId: id,
              createdAt: new Date(),
              id: currentMessage.id,
              parts: currentMessage.parts,
              role: currentMessage.role,
            })),
          });
        }
      },
      onError: () => FIO_FALLBACK_MESSAGE,
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    if (error instanceof ChatbotError) {
      return error.toResponse();
    }

    console.error("Erro nao tratado na API de chat:", error);
    return new ChatbotError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatbotError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
