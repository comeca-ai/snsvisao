import type { InboundMessage, MessagingProvider } from './types.js';

export interface EvolutionProviderOptions {
  apiUrl: string;
  apiKey: string;
  instance: string;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null
    ? (value as JsonRecord)
    : null;
}

/** Extrai texto tolerando os formatos conhecidos da Evolution v2. */
function extractText(message: unknown): string | null {
  const msg = asRecord(message);
  if (!msg) return null;
  if (typeof msg.conversation === 'string') return msg.conversation;

  const extended = asRecord(msg.extendedTextMessage);
  if (extended && typeof extended.text === 'string') return extended.text;

  const ephemeral = asRecord(msg.ephemeralMessage);
  if (ephemeral) {
    const inner = extractText(ephemeral.message);
    if (inner) return inner;
  }

  const viewOnce = asRecord(msg.viewOnceMessage);
  if (viewOnce) {
    const inner = extractText(viewOnce.message);
    if (inner) return inner;
  }

  return null;
}

export class EvolutionProvider implements MessagingProvider {
  readonly name = 'evolution';
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly instance: string;

  constructor(opts: EvolutionProviderOptions) {
    this.apiUrl = opts.apiUrl.replace(/\/$/, '');
    this.apiKey = opts.apiKey;
    this.instance = opts.instance;
  }

  /**
   * Parse tolerante de payload messages.upsert da Evolution v2.
   * Retorna null para: fromMe, grupos (@g.us), status@broadcast e mensagens
   * sem texto.
   */
  parseInbound(rawBody: unknown): InboundMessage | null {
    const body = asRecord(rawBody);
    const data = asRecord(body?.data);
    if (!data) return null;

    const key = asRecord(data.key);
    if (!key) return null;
    const remoteJid = typeof key.remoteJid === 'string' ? key.remoteJid : '';
    const fromMe = key.fromMe === true;
    const providerMsgId = typeof key.id === 'string' ? key.id : '';

    if (fromMe) return null;
    if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') {
      return null;
    }
    if (!remoteJid || !providerMsgId) return null;

    const text = extractText(data.message)?.trim();
    if (!text) return null;

    const phone = remoteJid.split('@')[0].replace(/\D/g, '');
    if (!phone) return null;

    const pushName =
      typeof data.pushName === 'string' && data.pushName.trim() !== ''
        ? data.pushName
        : null;

    const rawTs = data.messageTimestamp;
    const tsSeconds =
      typeof rawTs === 'number'
        ? rawTs
        : typeof rawTs === 'string'
          ? Number.parseInt(rawTs, 10)
          : Number.NaN;
    const timestamp = Number.isFinite(tsSeconds)
      ? new Date(tsSeconds * 1000)
      : new Date();

    return {
      providerName: 'evolution',
      providerMsgId,
      phone,
      pushName,
      text,
      fromMe,
      timestamp
    };
  }

  async sendText(phone: string, text: string): Promise<void> {
    const res = await fetch(
      `${this.apiUrl}/message/sendText/${this.instance}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: this.apiKey
        },
        body: JSON.stringify({ number: phone, text })
      }
    );
    if (!res.ok) {
      throw new Error(
        `Evolution sendText falhou (${res.status}): ${await res.text()}`
      );
    }
  }
}
