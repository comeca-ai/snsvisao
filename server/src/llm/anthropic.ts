import { ensureJsonText } from './types.js';
import type { LLMClient, LLMMessage } from './types.js';

export interface AnthropicClientOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-4-5';
export const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com';

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}

/** Provider Anthropic-compatible (POST /v1/messages). */
export function createAnthropicClient(opts: AnthropicClientOptions): LLMClient {
  const model = opts.model ?? ANTHROPIC_DEFAULT_MODEL;
  const baseUrl = (opts.baseUrl ?? ANTHROPIC_DEFAULT_BASE_URL).replace(/\/$/, '');

  return {
    async complete(messages, callOpts) {
      const systemParts = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content);
      if (callOpts?.json) {
        systemParts.push('Responda APENAS com JSON válido, sem texto antes ou depois.');
      }
      const chatMessages = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: callOpts?.maxTokens ?? 1024,
          ...(systemParts.length > 0 ? { system: systemParts.join('\n\n') } : {}),
          messages: chatMessages
        })
      });
      if (!res.ok) {
        throw new Error(`Anthropic API respondeu ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as AnthropicResponse;
      const text = (data.content ?? [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('')
        .trim();
      if (!text) throw new Error('Anthropic API retornou resposta vazia');
      return callOpts?.json ? ensureJsonText(text) : text;
    }
  };
}
