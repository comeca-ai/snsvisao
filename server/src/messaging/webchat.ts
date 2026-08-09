import type { InboundMessage, MessagingProvider } from './types.js';

/**
 * Provider do canal web (SPEC 9.1). Em vez de chamar a Evolution API,
 * acumula os balões num buffer que a rota /webchat/message devolve
 * na resposta HTTP.
 */
export class WebChatProvider implements MessagingProvider {
  readonly name = 'webchat';

  /** Balões de resposta acumulados nesta requisição. */
  readonly replies: string[] = [];

  async sendText(_phone: string, text: string): Promise<void> {
    this.replies.push(text);
  }

  /**
   * Não usado no canal web: não existe webhook de entrada — a rota
   * /webchat/message recebe o texto direto no body e monta o
   * InboundMessage ela mesma. Retorna null por contrato.
   */
  parseInbound(_rawBody: unknown): InboundMessage | null {
    return null;
  }
}
