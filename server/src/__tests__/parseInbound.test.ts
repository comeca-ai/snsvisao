import { describe, expect, it } from 'vitest';
import { EvolutionProvider } from '../messaging/evolution.js';

const provider = new EvolutionProvider({
  apiUrl: 'http://localhost:8080',
  apiKey: 'key',
  instance: 'fio'
});

function payload(message: unknown, overrides: Record<string, unknown> = {}) {
  return {
    event: 'messages.upsert',
    instance: 'fio',
    data: {
      key: {
        remoteJid: '5583999999999@s.whatsapp.net',
        fromMe: false,
        id: 'ABCD123'
      },
      pushName: 'Maria',
      message,
      messageTimestamp: 1750000000,
      ...overrides
    }
  };
}

describe('EvolutionProvider.parseInbound', () => {
  it('aceita conversation', () => {
    const msg = provider.parseInbound(payload({ conversation: 'oi' }));
    expect(msg).not.toBeNull();
    expect(msg?.text).toBe('oi');
    expect(msg?.phone).toBe('5583999999999');
    expect(msg?.pushName).toBe('Maria');
    expect(msg?.providerMsgId).toBe('ABCD123');
    expect(msg?.fromMe).toBe(false);
    expect(msg?.timestamp).toEqual(new Date(1750000000 * 1000));
  });

  it('aceita extendedTextMessage.text', () => {
    const msg = provider.parseInbound(
      payload({ extendedTextMessage: { text: 'quero vender mais' } })
    );
    expect(msg?.text).toBe('quero vender mais');
  });

  it('aceita texto dentro de ephemeralMessage', () => {
    const msg = provider.parseInbound(
      payload({ ephemeralMessage: { message: { conversation: 'ephemeral oi' } } })
    );
    expect(msg?.text).toBe('ephemeral oi');
  });

  it('ignora fromMe', () => {
    const body = payload({ conversation: 'oi' });
    body.data.key.fromMe = true;
    expect(provider.parseInbound(body)).toBeNull();
  });

  it('ignora grupo (@g.us)', () => {
    const body = payload({ conversation: 'oi' });
    body.data.key.remoteJid = '120363000000@g.us';
    expect(provider.parseInbound(body)).toBeNull();
  });

  it('ignora status@broadcast', () => {
    const body = payload({ conversation: 'oi' });
    body.data.key.remoteJid = 'status@broadcast';
    expect(provider.parseInbound(body)).toBeNull();
  });

  it('ignora mensagem sem texto', () => {
    expect(provider.parseInbound(payload({ imageMessage: {} }))).toBeNull();
    expect(provider.parseInbound(payload({ conversation: '   ' }))).toBeNull();
    expect(provider.parseInbound(payload(undefined))).toBeNull();
  });

  it('ignora payload sem data/key', () => {
    expect(provider.parseInbound({})).toBeNull();
    expect(provider.parseInbound(null)).toBeNull();
    expect(provider.parseInbound('lixo')).toBeNull();
  });
});
