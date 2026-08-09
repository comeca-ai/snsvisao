import type { LLMClient } from '../llm/types.js';
import type { Message } from '../db/repo.js';
import { EXTRACTION_SYSTEM_PROMPT } from './persona.js';

export interface NewFact {
  kind: 'goal' | 'offer' | 'ask' | 'context' | 'next_step';
  content: string;
  confidence?: number;
}

export interface NewFollowup {
  note: string;
  dueInHours: number; // converte p/ due_at = now()+hours
}

export interface Extraction {
  facts: NewFact[];
  followups: NewFollowup[];
  wantsToStop?: boolean;
}

const FACT_KINDS = new Set(['goal', 'offer', 'ask', 'context', 'next_step']);

/** Parse tolerante: aceita JSON puro ou JSON com texto em volta (reparo). */
function parseExtractionJson(raw: string): Extraction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = /\{[\s\S]*\}/.exec(raw);
    if (!match) throw new Error('Extração: resposta do LLM sem JSON');
    parsed = JSON.parse(match[0]);
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const facts: NewFact[] = [];
  if (Array.isArray(obj.facts)) {
    for (const f of obj.facts) {
      const rec = f as Record<string, unknown>;
      if (
        typeof rec?.kind === 'string' &&
        FACT_KINDS.has(rec.kind) &&
        typeof rec.content === 'string' &&
        rec.content.trim() !== ''
      ) {
        facts.push({
          kind: rec.kind as NewFact['kind'],
          content: rec.content.trim(),
          confidence:
            typeof rec.confidence === 'number' ? rec.confidence : undefined
        });
      }
    }
  }

  const followups: NewFollowup[] = [];
  if (Array.isArray(obj.followups)) {
    for (const f of obj.followups) {
      const rec = f as Record<string, unknown>;
      if (
        typeof rec?.note === 'string' &&
        rec.note.trim() !== '' &&
        typeof rec.dueInHours === 'number' &&
        Number.isFinite(rec.dueInHours)
      ) {
        followups.push({ note: rec.note.trim(), dueInHours: rec.dueInHours });
      }
    }
  }

  return {
    facts,
    followups,
    wantsToStop: obj.wantsToStop === true
  };
}

function formatHistory(history: Message[]): string {
  return history
    .map((m) => `${m.direction === 'in' ? 'Cliente' : 'Fio'}: ${m.body}`)
    .join('\n');
}

/**
 * Extração estruturada silenciosa (nunca mencionada ao usuário).
 * Chamada única ao LLM com json:true.
 */
export async function extract(
  llm: LLMClient,
  history: Message[],
  latest: string
): Promise<Extraction> {
  const transcript = formatHistory(history);
  const userContent = `Conversa até aqui:\n${transcript}\n\nMensagem mais recente do cliente: ${latest}`;

  const raw = await llm.complete(
    [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: userContent }
    ],
    { json: true, maxTokens: 800 }
  );
  return parseExtractionJson(raw);
}
