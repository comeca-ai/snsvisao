import { describe, expect, it } from 'vitest';
import { CloudAPIProvider } from '../messaging/cloudapi.js';
import { createMessagingProvider } from '../messaging/index.js';
import { loadConfig } from '../config.js';

const provider = new CloudAPIProvider({
  token: 'EAAGfake',
  phoneId: '1234567890'
});

/** Payload realista de webhook da Meta Cloud API (mensagem de texto). */
function metaPayload(overrides: Record<string, unknown> = {}) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '102290129340398',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '15550001111',
                phone_number_id: '1234567890'
              },
              contacts: [
                {
                  profile: { name: 'Maria Silva' },
                  wa_id: '5583999999999'
                }
              ],
              messages: [
                {
                  from: '5583999999999',
                  id: 'wamid.HBgNNTU4Mzk5OTk5OTk5ORUCABIYFjNFQjA5M0I2QzE2',
                  timestamp: '1750000000',
                  type: 'text',
                  text: { body: 'quero vender mais' },
                  ...overrides
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

describe('CloudAPIProvider.parseInbound', () => {
  it('extrai texto, telefone e nome de payload Meta realista', () => {
    const msg = provider.parseInbound(metaPayload());
    expect(msg).not.toBeNull();
    expect(msg?.providerName).toBe('cloudapi');
    expect(msg?.text).toBe('quero vender mais');
    expect(msg?.phone).toBe('5583999999999');
    expect(msg?.pushName).toBe('Maria Silva');
    expect(msg?.providerMsgId).toBe(
      'wamid.HBgNNTU4Mzk5OTk5OTk5ORUCABIYFjNFQjA5M0I2QzE2'
    );
    expect(msg?.fromMe).toBe(false);
    expect(msg?.timestamp).toEqual(new Date(1750000000 * 1000));
  });

  it('ignora callbacks de status (array statuses)', () => {
    const statusPayload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '102290129340398',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: '1234567890' },
                statuses: [
                  {
                    id: 'wamid.XYZ',
                    status: 'delivered',
                    timestamp: '1750000001',
                    recipient_id: '5583999999999'
                  }
                ]
              }
            }
          ]
        }
      ]
    };
    expect(provider.parseInbound(statusPayload)).toBeNull();
  });

  it('ignora mensagens não-texto e sem texto', () => {
    expect(
      provider.parseInbound(metaPayload({ type: 'image', text: undefined }))
    ).toBeNull();
    expect(
      provider.parseInbound(metaPayload({ text: { body: '   ' } }))
    ).toBeNull();
  });

  it('ignora payload malformado', () => {
    expect(provider.parseInbound({})).toBeNull();
    expect(provider.parseInbound(null)).toBeNull();
    expect(provider.parseInbound('lixo')).toBeNull();
  });
});

describe('factory createMessagingProvider (cloudapi)', () => {
  const baseEnv = {
    DATABASE_URL: 'postgres://fio:x@localhost:5432/fio',
    WEBHOOK_TOKEN: 'w',
    ADMIN_TOKEN: 'a',
    LLM_API_KEY: 'k',
    EVOLUTION_API_URL: 'http://localhost:8080',
    EVOLUTION_API_KEY: 'e'
  };

  it('lança "não configurado" com MESSAGING_PROVIDER=cloudapi sem env', () => {
    const cfg = loadConfig({ ...baseEnv, MESSAGING_PROVIDER: 'cloudapi' });
    expect(() => createMessagingProvider(cfg)).toThrow(/não configurado/);
  });

  it('instancia CloudAPIProvider com env completo', () => {
    const cfg = loadConfig({
      ...baseEnv,
      MESSAGING_PROVIDER: 'cloudapi',
      CLOUDAPI_TOKEN: 'EAAGfake',
      CLOUDAPI_PHONE_ID: '1234567890'
    });
    const created = createMessagingProvider(cfg);
    expect(created.name).toBe('cloudapi');
  });

  it('default continua Evolution', () => {
    const cfg = loadConfig(baseEnv);
    expect(createMessagingProvider(cfg).name).toBe('evolution');
  });
});
