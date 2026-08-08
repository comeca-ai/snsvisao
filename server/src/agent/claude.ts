import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getConfig } from '../config.js';
import { SYSTEM_PROMPT, buildDynamicContext, type AgentContext } from './prompt.js';
import {
  ExtractionSchema,
  EXTRACTION_INSTRUCTIONS,
  validateExtraction,
  type Extraction,
} from './extract.js';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

const REFUSAL_REPLY =
  'Essa eu vou ficar te devendo — não consigo ajudar com isso por aqui. Mas sobre o seu negócio, bora continuar?';

/**
 * Gera a resposta do agente. System prompt estável primeiro (com cache);
 * contexto dinâmico depois do breakpoint, para não invalidar o cache.
 * Fallback server-side habilitado: se o classificador recusar, a request
 * re-executa em claude-opus-4-8 na mesma chamada.
 */
export async function generateReply(
  ctx: AgentContext,
  history: ConversationTurn[],
): Promise<string> {
  const config = getConfig();
  const response = await getClient().beta.messages.create({
    model: config.agentModel,
    max_tokens: 4096,
    betas: ['server-side-fallback-2026-06-01'],
    fallbacks: [{ model: 'claude-opus-4-8' }],
    output_config: { effort: 'medium' },
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: buildDynamicContext(ctx) },
    ],
    messages: history.map((turn) => ({ role: turn.role, content: turn.content })),
  });

  if (response.stop_reason === 'refusal') return REFUSAL_REPLY;

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
  return text || REFUSAL_REPLY;
}

/**
 * Extração estruturada da conversa. Limites de contagem/faixa são validados
 * em código (validateExtraction) — a API rejeita minItems/maximum em schemas.
 */
export async function extractFromConversation(
  ctx: AgentContext,
  history: ConversationTurn[],
): Promise<Extraction> {
  const config = getConfig();
  const transcript = history
    .map((turn) => `${turn.role === 'user' ? 'PESSOA' : 'AGENTE'}: ${turn.content}`)
    .join('\n');
  const knownFacts = ctx.facts.map((f) => `- [${f.kind}] ${f.content}`).join('\n');

  const response = await getClient().messages.parse({
    model: config.agentModel,
    max_tokens: 2048,
    output_config: { format: zodOutputFormat(ExtractionSchema) },
    system: EXTRACTION_INSTRUCTIONS,
    messages: [
      {
        role: 'user',
        content: `Fatos já conhecidos (não repetir):\n${knownFacts || '(nenhum)'}\n\nConversa:\n${transcript}`,
      },
    ],
  });

  if (!response.parsed_output) return { facts: [], followup: null, consent_given: false };
  // Re-parse com zod para tipagem forte independente da versão do helper.
  return validateExtraction(ExtractionSchema.parse(response.parsed_output));
}
