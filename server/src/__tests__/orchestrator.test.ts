import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { Contact, Message } from '../db/repo.js';
import type { InboundMessage, MessagingProvider } from '../messaging/types.js';
import type { LLMClient } from '../llm/types.js';
import { loadConfig } from '../config.js';

const repoMocks = {
  ensureTenant: vi.fn(),
  upsertContact: vi.fn(),
  recordMessage: vi.fn(),
  getRecentMessages: vi.fn(),
  getActiveFacts: vi.fn(),
  setConsent: vi.fn(),
  insertFacts: vi.fn(),
  insertFollowups: vi.fn(),
  getLastOutboundAt: vi.fn()
};

vi.mock('../db/repo.js', () => repoMocks);

const { handleInbound } = await import('../agent/orchestrator.js');

const cfg = loadConfig({
  DATABASE_URL: 'postgres://fio:x@localhost:5432/fio',
  WEBHOOK_TOKEN: 'w',
  ADMIN_TOKEN: 'a',
  LLM_API_KEY: 'k',
  EVOLUTION_API_URL: 'http://localhost:8080',
  EVOLUTION_API_KEY: 'e',
  SEND_MIN_INTERVAL_MS: '1200'
});

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'contact-1',
    tenantId: 'tenant-1',
    phone: '5583999999999',
    pushName: 'Maria',
    consent: true,
    consentAt: new Date(),
    createdAt: new Date(),
    lastSeenAt: new Date(),
    ...overrides
  };
}

function makeInbound(text: string): InboundMessage {
  return {
    providerName: 'evolution',
    providerMsgId: `id-${Math.random()}`,
    phone: '5583999999999',
    pushName: 'Maria',
    text,
    fromMe: false,
    timestamp: new Date()
  };
}

const sampleHistory: Message[] = [
  {
    id: 'm1',
    contactId: 'contact-1',
    direction: 'in',
    body: 'quero vender mais bolo',
    providerMsgId: 'p1',
    createdAt: new Date()
  }
];

interface LlmBehavior {
  replyText?: string;
  classifyConsent?: string;
  extractionJson?: string;
  extractionError?: Error;
}

function makeLlm(behavior: LlmBehavior): LLMClient {
  return {
    complete: vi.fn(async (messages, opts) => {
      if (opts?.json) {
        if (behavior.extractionError) throw behavior.extractionError;
        return behavior.extractionJson ?? '{"facts":[],"followups":[]}';
      }
      const sys = String(messages[0]?.content ?? '');
      if (sys.includes('"sim" ou "não"')) {
        return behavior.classifyConsent ?? 'não';
      }
      return behavior.replyText ?? 'Bora! Me conta o que você vende hoje.';
    })
  };
}

function makeDeps(llm: LLMClient) {
  const provider: MessagingProvider = {
    name: 'evolution',
    parseInbound: () => null,
    sendText: vi.fn(async () => {})
  };
  const pool = { query: vi.fn(async () => ({ rows: [] })) } as unknown as Pool;
  return { deps: { pool, provider, llm, cfg }, provider, pool };
}

beforeEach(() => {
  vi.clearAllMocks();
  repoMocks.ensureTenant.mockResolvedValue({
    id: 'tenant-1',
    slug: 'default',
    name: '',
    businessProfile: {},
    createdAt: new Date()
  });
  repoMocks.recordMessage.mockResolvedValue(undefined);
  repoMocks.getRecentMessages.mockResolvedValue(sampleHistory);
  repoMocks.getActiveFacts.mockResolvedValue([]);
  repoMocks.setConsent.mockResolvedValue(undefined);
  repoMocks.insertFacts.mockResolvedValue(undefined);
  repoMocks.insertFollowups.mockResolvedValue(undefined);
  repoMocks.getLastOutboundAt.mockResolvedValue(null);
});

describe('orchestrator handleInbound', () => {
  it('(a) sem consent: pede permissão uma vez e não persiste facts', async () => {
    repoMocks.upsertContact.mockResolvedValue(
      makeContact({ consent: false, consentAt: null })
    );
    const llm = makeLlm({ classifyConsent: 'não' });
    const { deps, provider } = makeDeps(llm);

    await handleInbound(makeInbound('oi, tudo bem?'), deps);

    expect(repoMocks.recordMessage).toHaveBeenCalledWith(
      'contact-1',
      'in',
      'oi, tudo bem?',
      expect.any(String)
    );
    expect(provider.sendText).toHaveBeenCalledTimes(1);
    const askText = vi.mocked(provider.sendText).mock.calls[0][1];
    expect(askText).toContain('guardar o que a gente conversar');
    expect(repoMocks.insertFacts).not.toHaveBeenCalled();
    expect(repoMocks.insertFollowups).not.toHaveBeenCalled();
    expect(repoMocks.setConsent).not.toHaveBeenCalled();
  });

  it('(a2) sem consent mas mensagem é consentimento curto: setConsent e segue', async () => {
    repoMocks.upsertContact.mockResolvedValue(
      makeContact({ consent: false, consentAt: null })
    );
    const llm = makeLlm({});
    const { deps, provider } = makeDeps(llm);

    await handleInbound(makeInbound('pode'), deps);

    expect(repoMocks.setConsent).toHaveBeenCalledWith('contact-1');
    expect(provider.sendText).toHaveBeenCalled();
  });

  it('(b) com consent: responde e persiste facts/followups', async () => {
    repoMocks.upsertContact.mockResolvedValue(makeContact());
    const llm = makeLlm({
      replyText: 'Boa, bolo de pote vende demais!\n\nQual sabor sai mais?',
      extractionJson: JSON.stringify({
        facts: [{ kind: 'offer', content: 'vende bolo de pote' }],
        followups: [{ note: 'perguntar sabores', dueInHours: 24 }],
        wantsToStop: false
      })
    });
    const { deps, provider } = makeDeps(llm);

    await handleInbound(makeInbound('vendo bolo de pote'), deps);

    expect(vi.mocked(provider.sendText).mock.calls.map((c) => c[1])).toEqual([
      'Boa, bolo de pote vende demais!',
      'Qual sabor sai mais?'
    ]);
    expect(repoMocks.recordMessage).toHaveBeenCalledWith(
      'contact-1',
      'out',
      'Boa, bolo de pote vende demais!',
      null
    );
    expect(repoMocks.insertFacts).toHaveBeenCalledWith('contact-1', [
      { kind: 'offer', content: 'vende bolo de pote' }
    ]);
    expect(repoMocks.insertFollowups).toHaveBeenCalledWith('contact-1', [
      { note: 'perguntar sabores', dueInHours: 24 }
    ]);
  });

  it('(c) throttle: último envio recente bloqueia nova resposta', async () => {
    repoMocks.upsertContact.mockResolvedValue(makeContact());
    repoMocks.getLastOutboundAt.mockResolvedValue(new Date()); // agora
    const llm = makeLlm({});
    const { deps, provider } = makeDeps(llm);

    await handleInbound(makeInbound('e aí?'), deps);

    expect(provider.sendText).not.toHaveBeenCalled();
    // mas a entrada foi registrada e a extração rodou sem quebrar
    expect(repoMocks.recordMessage).toHaveBeenCalledWith(
      'contact-1',
      'in',
      'e aí?',
      expect.any(String)
    );
  });

  it('(d) falha de extração não quebra o reply', async () => {
    repoMocks.upsertContact.mockResolvedValue(makeContact());
    const llm = makeLlm({ extractionError: new Error('LLM fora do ar') });
    const { deps, provider } = makeDeps(llm);

    await expect(
      handleInbound(makeInbound('quero vender mais'), deps)
    ).resolves.toBeUndefined();

    expect(provider.sendText).toHaveBeenCalled();
    expect(repoMocks.insertFacts).not.toHaveBeenCalled();
  });

  it('(e) wantsToStop revoga consent e manda despedida curta', async () => {
    repoMocks.upsertContact.mockResolvedValue(makeContact());
    const llm = makeLlm({
      extractionJson: JSON.stringify({
        facts: [],
        followups: [],
        wantsToStop: true
      })
    });
    const { deps, provider, pool } = makeDeps(llm);

    await handleInbound(makeInbound('para, não quero mais'), deps);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('consent = false'),
      ['contact-1']
    );
    const sentTexts = vi.mocked(provider.sendText).mock.calls.map((c) => c[1]);
    expect(sentTexts.some((t) => t.includes('Parei por aqui'))).toBe(true);
  });
});
