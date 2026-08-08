import { describe, it, expect } from 'vitest';
import { EvolutionProvider } from '../src/providers/evolution.js';

const provider = new EvolutionProvider({
  baseUrl: 'http://localhost:8080',
  apiKey: 'test',
  instance: 'principal',
});

function payload(overrides: Record<string, unknown> = {}) {
  return {
    event: 'messages.upsert',
    instance: 'principal',
    data: {
      key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'ABC123' },
      pushName: 'Maria',
      messageTimestamp: 1754600000,
      message: { conversation: 'Quero vender mais' },
      ...overrides,
    },
  };
}

describe('EvolutionProvider.parseWebhook', () => {
  it('normaliza mensagem de texto simples', () => {
    const msg = provider.parseWebhook(payload());
    expect(msg).not.toBeNull();
    expect(msg!.text).toBe('Quero vender mais');
    expect(msg!.chatId).toBe('5511999999999@s.whatsapp.net');
    expect(msg!.senderName).toBe('Maria');
    expect(msg!.accountId).toBe('principal');
    expect(msg!.fromMe).toBe(false);
    expect(msg!.isGroup).toBe(false);
  });

  it('normaliza extendedTextMessage', () => {
    const msg = provider.parseWebhook(
      payload({ message: { extendedTextMessage: { text: 'Oi!' } } }),
    );
    expect(msg!.text).toBe('Oi!');
  });

  it('marca fromMe (orquestrador ignora)', () => {
    const msg = provider.parseWebhook(
      payload({ key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: true, id: 'X' } }),
    );
    expect(msg!.fromMe).toBe(true);
  });

  it('marca grupos (orquestrador ignora)', () => {
    const msg = provider.parseWebhook(
      payload({ key: { remoteJid: '123456789@g.us', fromMe: false, id: 'X' } }),
    );
    expect(msg!.isGroup).toBe(true);
  });

  it('retorna null para eventos que não são messages.upsert', () => {
    expect(provider.parseWebhook({ event: 'connection.update' })).toBeNull();
  });

  it('retorna null para mensagens sem texto (áudio, mídia)', () => {
    expect(provider.parseWebhook(payload({ message: { audioMessage: {} } }))).toBeNull();
  });

  it('retorna null para corpo malformado', () => {
    expect(provider.parseWebhook(null)).toBeNull();
    expect(provider.parseWebhook({})).toBeNull();
  });
});
