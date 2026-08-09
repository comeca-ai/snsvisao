export interface InboundMessage {
  providerName: 'evolution' | 'cloudapi' | 'webchat';
  providerMsgId: string;
  phone: string; // E.164 sem '+'
  pushName: string | null;
  text: string;
  fromMe: boolean;
  timestamp: Date;
}

export interface MessagingProvider {
  readonly name: string;
  /** null = ignorar (grupo, status, fromMe, vazio) */
  parseInbound(rawBody: unknown): InboundMessage | null;
  sendText(phone: string, text: string): Promise<void>;
}
