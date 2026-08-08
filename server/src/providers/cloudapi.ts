import type { InboundMessage, MessagingProvider } from './types.js';

/**
 * WhatsApp Cloud API oficial (Meta) — entra em cena quando a homologação
 * sair. O contrato é idêntico ao EvolutionProvider: implementar parseWebhook
 * (formato de webhook da Cloud API) e sendText (Graph API /messages), e a
 * troca no index.ts é de uma linha.
 */
export class CloudAPIProvider implements MessagingProvider {
  readonly name = 'cloudapi' as const;

  parseWebhook(_body: unknown): InboundMessage | null {
    throw new Error('CloudAPIProvider ainda não implementado (aguardando homologação Meta)');
  }

  async sendText(_chatId: string, _text: string): Promise<void> {
    throw new Error('CloudAPIProvider ainda não implementado (aguardando homologação Meta)');
  }
}
