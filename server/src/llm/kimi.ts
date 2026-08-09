import { ensureJsonText } from './types.js';
import type { LLMClient, LLMMessage } from './types.js';

export interface OpenAiCompatibleClientOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export const KIMI_DEFAULT_MODEL = 'kimi-k2';
export const KIMI_DEFAULT_BASE_URL = 'https://api.moonshot.cn/v1';
export const OPENAI_DEFAULT_MODEL = 'gpt-4o';
export const OPENAI_DEFAULT_BASE_URL = 'https://api.openai.com/v1';

interface OpenAiChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * Provider OpenAI-compatible (POST /chat/completions).
 * Usado tanto para Kimi/Moonshot quanto para OpenAI (só mudam base e model).
 */
export function createOpenAiCompatibleClient(
  opts: OpenAiCompatibleClientOptions
): LLMClient {
  const model = opts.model ?? KIMI_DEFAULT_MODEL;
  const baseUrl = (opts.baseUrl ?? KIMI_DEFAULT_BASE_URL).replace(/\/$/, '');

  return {
    async complete(messages, callOpts) {
      const finalMessages: LLMMessage[] = [...messages];
      if (callOpts?.json) {
        // JSON mode exige que alguma mensagem mencione "JSON".
        finalMessages.unshift({
          role: 'system',
          content: 'Responda APENAS com JSON válido, sem texto antes ou depois.'
        });
      }

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${opts.apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: finalMessages,
          ...(callOpts?.maxTokens ? { max_tokens: callOpts.maxTokens } : {}),
          ...(callOpts?.json ? { response_format: { type: 'json_object' } } : {})
        })
      });
      if (!res.ok) {
        throw new Error(`LLM API respondeu ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as OpenAiChatResponse;
      const text = data.choices?.[0]?.message?.content?.trim() ?? '';
      if (!text) throw new Error('LLM API retornou resposta vazia');
      return callOpts?.json ? ensureJsonText(text) : text;
    }
  };
}
