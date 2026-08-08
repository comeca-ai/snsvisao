export interface InboundMessage {
  provider: 'evolution' | 'cloudapi';
  /** Identificador da conta/instância que recebeu a mensagem (multi-tenant). */
  accountId: string;
  providerMessageId: string;
  /** JID do chat, ex.: 5511999999999@s.whatsapp.net */
  chatId: string;
  senderName?: string;
  text: string;
  fromMe: boolean;
  isGroup: boolean;
  timestamp: number;
}

/**
 * Camada de transporte plugável. O resto do sistema só conhece esta
 * interface — EvolutionProvider hoje, CloudAPIProvider pós-homologação.
 */
export interface MessagingProvider {
  readonly name: 'evolution' | 'cloudapi';
  /** Normaliza o corpo do webhook; retorna null para eventos irrelevantes. */
  parseWebhook(body: unknown): InboundMessage | null;
  sendText(chatId: string, text: string): Promise<void>;
}
