import type { LLMClient, LLMMessage } from '../llm/types.js';
import type { Contact, Fact, Message } from '../db/repo.js';
import { PERSONA_SYSTEM_PROMPT } from './persona.js';

const MAX_REPLY_CHARS = 600;
const MAX_BUBBLES = 3;

export interface ReplyInput {
  contact: Contact;
  history: Message[];
  facts: Fact[];
}

function buildContextSystem(contact: Contact, facts: Fact[]): string {
  const lines: string[] = [];
  if (contact.pushName) lines.push(`Nome do contato: ${contact.pushName}.`);
  if (facts.length > 0) {
    lines.push('O que você já sabe sobre essa pessoa:');
    for (const fact of facts) lines.push(`- ${fact.content}`);
  }
  return lines.join('\n');
}

/**
 * Gera a resposta da persona (máx ~600 chars, quebrável em até 3 balões
 * separados por \n\n).
 */
export async function reply(llm: LLMClient, input: ReplyInput): Promise<string> {
  const context = buildContextSystem(input.contact, input.facts);

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: context
        ? `${PERSONA_SYSTEM_PROMPT}\n\nCONTEXTO DESTA CONVERSA:\n${context}`
        : PERSONA_SYSTEM_PROMPT
    }
  ];
  for (const m of input.history) {
    messages.push({
      role: m.direction === 'in' ? 'user' : 'assistant',
      content: m.body
    });
  }

  const raw = await llm.complete(messages, { maxTokens: 400 });
  return clampReply(raw);
}

function clampReply(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_REPLY_CHARS) return trimmed;
  // Corta no fim da última frase completa antes do limite, se possível.
  const cut = trimmed.slice(0, MAX_REPLY_CHARS);
  const lastStop = Math.max(
    cut.lastIndexOf('.'),
    cut.lastIndexOf('!'),
    cut.lastIndexOf('?'),
    cut.lastIndexOf('\n')
  );
  return (lastStop > MAX_REPLY_CHARS / 2 ? cut.slice(0, lastStop + 1) : cut).trim();
}

/** Quebra a resposta em até 3 balões (separados por \n\n) para envio. */
export function splitIntoBubbles(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .slice(0, MAX_BUBBLES);
}
