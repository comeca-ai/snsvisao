import type { InboundMessage, MessagingProvider } from './types.js';

export interface EvolutionConfig {
  baseUrl: string;
  apiKey: string;
  instance: string;
}

interface EvolutionWebhookBody {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    pushName?: string;
    messageTimestamp?: number;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
    };
  };
}

const MIN_SEND_INTERVAL_MS = 1500;

export class EvolutionProvider implements MessagingProvider {
  readonly name = 'evolution' as const;
  private sendChain: Promise<void> = Promise.resolve();
  private lastSentAt = 0;

  constructor(private readonly config: EvolutionConfig) {}

  parseWebhook(body: unknown): InboundMessage | null {
    const payload = body as EvolutionWebhookBody;
    if (payload?.event !== 'messages.upsert') return null;

    const data = payload.data;
    const remoteJid = data?.key?.remoteJid;
    if (!data || !remoteJid) return null;

    const text =
      data.message?.conversation ?? data.message?.extendedTextMessage?.text ?? '';
    if (!text.trim()) return null;

    return {
      provider: 'evolution',
      accountId: payload.instance ?? this.config.instance,
      providerMessageId: data.key?.id ?? '',
      chatId: remoteJid,
      senderName: data.pushName,
      text: text.trim(),
      fromMe: data.key?.fromMe ?? false,
      isGroup: remoteJid.endsWith('@g.us'),
      timestamp: (data.messageTimestamp ?? Math.floor(Date.now() / 1000)) * 1000,
    };
  }

  /**
   * Envio serializado com throttle — proteção anti-ban e anti-spam por
   * design. Nunca remover o intervalo mínimo entre envios.
   */
  async sendText(chatId: string, text: string): Promise<void> {
    this.sendChain = this.sendChain.then(async () => {
      const wait = this.lastSentAt + MIN_SEND_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));

      const url = `${this.config.baseUrl}/message/sendText/${this.config.instance}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: this.config.apiKey,
        },
        body: JSON.stringify({ number: chatId.replace(/@.*$/, ''), text }),
      });
      this.lastSentAt = Date.now();
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Evolution sendText falhou (${response.status}): ${detail}`);
      }
    });
    return this.sendChain;
  }
}
