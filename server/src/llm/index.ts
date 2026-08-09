import type { AppConfig } from '../config.js';
import { createAnthropicClient } from './anthropic.js';
import {
  createOpenAiCompatibleClient,
  KIMI_DEFAULT_BASE_URL,
  KIMI_DEFAULT_MODEL,
  OPENAI_DEFAULT_BASE_URL,
  OPENAI_DEFAULT_MODEL
} from './kimi.js';
import type { LLMClient } from './types.js';

export type { LLMClient, LLMMessage } from './types.js';

/** Factory: escolhe o provider conforme LLM_PROVIDER, com defaults por provider. */
export function createLLMClient(cfg: AppConfig): LLMClient {
  switch (cfg.LLM_PROVIDER) {
    case 'anthropic':
      return createAnthropicClient({
        apiKey: cfg.LLM_API_KEY,
        model: cfg.LLM_MODEL,
        baseUrl: cfg.LLM_BASE_URL
      });
    case 'kimi':
      return createOpenAiCompatibleClient({
        apiKey: cfg.LLM_API_KEY,
        model: cfg.LLM_MODEL ?? KIMI_DEFAULT_MODEL,
        baseUrl: cfg.LLM_BASE_URL ?? KIMI_DEFAULT_BASE_URL
      });
    case 'openai':
      return createOpenAiCompatibleClient({
        apiKey: cfg.LLM_API_KEY,
        model: cfg.LLM_MODEL ?? OPENAI_DEFAULT_MODEL,
        baseUrl: cfg.LLM_BASE_URL ?? OPENAI_DEFAULT_BASE_URL
      });
  }
}
