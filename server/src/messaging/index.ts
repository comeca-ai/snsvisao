import type { AppConfig } from '../config.js';
import { CloudAPIProvider } from './cloudapi.js';
import { EvolutionProvider } from './evolution.js';
import type { MessagingProvider } from './types.js';

export type { InboundMessage, MessagingProvider } from './types.js';
export { CloudAPIProvider } from './cloudapi.js';
export { EvolutionProvider } from './evolution.js';
export { WebChatProvider } from './webchat.js';

/** Factory: Evolution API v2 hoje; Cloud API oficial (Meta) pós-homologação. */
export function createMessagingProvider(cfg: AppConfig): MessagingProvider {
  switch (cfg.MESSAGING_PROVIDER) {
    case 'cloudapi':
      if (!cfg.CLOUDAPI_TOKEN || !cfg.CLOUDAPI_PHONE_ID) {
        throw new Error(
          'CloudAPI não configurado: defina CLOUDAPI_TOKEN e CLOUDAPI_PHONE_ID (stub em homologação)'
        );
      }
      return new CloudAPIProvider({
        token: cfg.CLOUDAPI_TOKEN,
        phoneId: cfg.CLOUDAPI_PHONE_ID
      });
    case 'evolution':
      return new EvolutionProvider({
        apiUrl: cfg.EVOLUTION_API_URL,
        apiKey: cfg.EVOLUTION_API_KEY,
        instance: cfg.EVOLUTION_INSTANCE
      });
  }
}
