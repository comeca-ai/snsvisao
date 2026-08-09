import type { AppConfig } from '../config.js';
import { EvolutionProvider } from './evolution.js';
import type { MessagingProvider } from './types.js';

export type { InboundMessage, MessagingProvider } from './types.js';
export { EvolutionProvider } from './evolution.js';

/** Factory: hoje só Evolution API v2. */
export function createMessagingProvider(cfg: AppConfig): MessagingProvider {
  return new EvolutionProvider({
    apiUrl: cfg.EVOLUTION_API_URL,
    apiKey: cfg.EVOLUTION_API_KEY,
    instance: cfg.EVOLUTION_INSTANCE
  });
}
