import type { InboundMessage, MessagingProvider } from './types.js';

/**
 * WhatsApp Cloud API oficial (Meta) — stub pronto para homologação
 * (portado da linha remota, adaptado para a nossa interface
 * MessagingProvider). Contrato idêntico ao EvolutionProvider: parseInbound
 * normaliza o webhook da Cloud API e sendText chama a Graph API.
 */

export interface CloudAPIProviderOptions {
  token: string;
  phoneId: string;
  /** Versão da Graph API (default v21.0). */
  graphVersion?: string;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null
    ? (value as JsonRecord)
    : null;
}

function firstRecordArray(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is JsonRecord => asRecord(item) !== null);
}

export class CloudAPIProvider implements MessagingProvider {
  readonly name = 'cloudapi';
  private readonly token: string;
  private readonly phoneId: string;
  private readonly graphVersion: string;

  constructor(opts: CloudAPIProviderOptions) {
    this.token = opts.token;
    this.phoneId = opts.phoneId;
    this.graphVersion = opts.graphVersion ?? 'v21.0';
  }

  /**
   * Parse tolerante de webhook da Meta Cloud API:
   *   entry[].changes[].value.messages[] (texto) + contacts[0].profile.name
   * Retorna null para: callbacks de status (array `statuses`), mensagens
   * sem texto, tipos não-texto e payloads malformados.
   */
  parseInbound(rawBody: unknown): InboundMessage | null {
    const body = asRecord(rawBody);
    if (!body) return null;

    for (const entry of firstRecordArray(body.entry)) {
      for (const change of firstRecordArray(entry.changes)) {
        const value = asRecord(change.value);
        if (!value) continue;

        // Callback de status (sent/delivered/read) — não é mensagem recebida.
        if (Array.isArray(value.statuses) && !Array.isArray(value.messages)) {
          return null;
        }

        const messages = firstRecordArray(value.messages);
        const msg = messages[0];
        if (!msg) continue;

        const from = typeof msg.from === 'string' ? msg.from.trim() : '';
        const providerMsgId = typeof msg.id === 'string' ? msg.id : '';
        if (!from || !providerMsgId) return null;

        // Só texto neste stub; demais tipos ficam para a homologação.
        if (msg.type !== 'text') return null;
        const textField = asRecord(msg.text);
        const text =
          typeof textField?.body === 'string' ? textField.body.trim() : '';
        if (!text) return null;

        const contacts = firstRecordArray(value.contacts);
        const profile = asRecord(contacts[0]?.profile);
        const pushName =
          typeof profile?.name === 'string' && profile.name.trim() !== ''
            ? profile.name
            : null;

        const tsSeconds =
          typeof msg.timestamp === 'string'
            ? Number.parseInt(msg.timestamp, 10)
            : typeof msg.timestamp === 'number'
              ? msg.timestamp
              : Number.NaN;
        const timestamp = Number.isFinite(tsSeconds)
          ? new Date(tsSeconds * 1000)
          : new Date();

        return {
          providerName: 'cloudapi',
          providerMsgId,
          phone: from.replace(/\D/g, ''),
          pushName,
          text,
          fromMe: false,
          timestamp
        };
      }
    }

    return null;
  }

  async sendText(phone: string, text: string): Promise<void> {
    const res = await fetch(
      `https://graph.facebook.com/${this.graphVersion}/${this.phoneId}/messages`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.token}`
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'text',
          text: { body: text }
        })
      }
    );
    if (!res.ok) {
      throw new Error(
        `CloudAPI sendText falhou (${res.status}): ${await res.text()}`
      );
    }
  }
}
