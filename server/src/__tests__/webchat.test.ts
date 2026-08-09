import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { Pool } from 'pg';
import type { Contact } from '../db/repo.js';
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

const { createWebchatRouter } = await import('../routes/webchat.js');

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
    phone: 'web_sessao-de-teste-01',
    pushName: null,
    consent: true,
    consentAt: new Date(),
    createdAt: new Date(),
    lastSeenAt: new Date(),
    ...overrides
  };
}

interface LlmBehavior {
  replyText?: string;
  classifyConsent?: string;
  extractionJson?: string;
}

function makeLlm(behavior: LlmBehavior): LLMClient {
  return {
    complete: vi.fn(async (messages, opts) => {
      if (opts?.json) {
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

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const pool = { query: vi.fn(async () => ({ rows: [] })) } as unknown as Pool;
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(
    createWebchatRouter({
      pool,
      provider: {
        name: 'evolution',
        parseInbound: () => null,
        sendText: async () => {}
      },
      // Delega para o LLM configurado em cada teste (trocável em beforeEach).
      llm: {
        complete: (messages, opts) => currentLlm.complete(messages, opts)
      },
      cfg
    })
  );
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (typeof address === 'object' && address) {
    baseUrl = `http://127.0.0.1:${address.port}`;
  }
});

// O LLM é trocável por teste: a closure do router referencia esta variável.
let currentLlm: LLMClient = makeLlm({});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  currentLlm = makeLlm({});
  repoMocks.ensureTenant.mockResolvedValue({
    id: 'tenant-1',
    slug: 'default',
    name: '',
    businessProfile: {},
    createdAt: new Date()
  });
  repoMocks.upsertContact.mockResolvedValue(makeContact());
  repoMocks.recordMessage.mockResolvedValue(undefined);
  repoMocks.getRecentMessages.mockResolvedValue([]);
  repoMocks.getActiveFacts.mockResolvedValue([]);
  repoMocks.setConsent.mockResolvedValue(undefined);
  repoMocks.insertFacts.mockResolvedValue(undefined);
  repoMocks.insertFollowups.mockResolvedValue(undefined);
  repoMocks.getLastOutboundAt.mockResolvedValue(null);
});

async function postMessage(
  body: unknown,
  token: string | null = 'w'
): Promise<{ status: number; json: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    'content-type': 'application/json'
  };
  if (token !== null) headers['x-webhook-token'] = token;
  const res = await fetch(`${baseUrl}/webchat/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  return {
    status: res.status,
    json: (await res.json()) as Record<string, unknown>
  };
}

describe('POST /webchat/message (SPEC 9.1)', () => {
  it('(a) 401 sem o header x-webhook-token', async () => {
    const res = await postMessage(
      { sessionId: 'sessao-de-teste-01', text: 'oi' },
      null
    );

    expect(res.status).toBe(401);
    expect(repoMocks.ensureTenant).not.toHaveBeenCalled();
  });

  it('(a2) 401 com token errado', async () => {
    const res = await postMessage(
      { sessionId: 'sessao-de-teste-01', text: 'oi' },
      'token-errado'
    );

    expect(res.status).toBe(401);
    expect(repoMocks.ensureTenant).not.toHaveBeenCalled();
  });

  it('(b) 400 com body inválido (sessionId curto e text vazio)', async () => {
    const curto = await postMessage({ sessionId: 'curto', text: 'oi' });
    expect(curto.status).toBe(400);

    const vazio = await postMessage({
      sessionId: 'sessao-de-teste-01',
      text: ''
    });
    expect(vazio.status).toBe(400);

    expect(repoMocks.ensureTenant).not.toHaveBeenCalled();
  });

  it('(c) 200 devolve replies da persona e contactId', async () => {
    currentLlm = makeLlm({
      replyText: 'Boa, bolo de pote vende demais!\n\nQual sabor sai mais?'
    });

    const res = await postMessage({
      sessionId: 'sessao-de-teste-01',
      text: 'vendo bolo de pote'
    });

    expect(res.status).toBe(200);
    expect(res.json).toEqual({
      replies: ['Boa, bolo de pote vende demais!', 'Qual sabor sai mais?'],
      contactId: 'contact-1'
    });
    // a rota faz o upsert com phone "web_" + sessionId e pushName null
    expect(repoMocks.upsertContact).toHaveBeenCalledWith(
      'tenant-1',
      'web_sessao-de-teste-01',
      null
    );
  });

  it('(d) LGPD gate: primeira mensagem pede consentimento e não persiste facts', async () => {
    repoMocks.upsertContact.mockResolvedValue(
      makeContact({ consent: false, consentAt: null })
    );
    currentLlm = makeLlm({ classifyConsent: 'não' });

    const res = await postMessage({
      sessionId: 'sessao-de-teste-01',
      text: 'oi, tudo bem?'
    });

    expect(res.status).toBe(200);
    const replies = res.json['replies'] as string[];
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain('guardar o que a gente conversar');
    expect(repoMocks.insertFacts).not.toHaveBeenCalled();
    expect(repoMocks.insertFollowups).not.toHaveBeenCalled();
    expect(repoMocks.setConsent).not.toHaveBeenCalled();
  });

  it('(e) wantsToStop revoga consent também no canal web', async () => {
    currentLlm = makeLlm({
      extractionJson: JSON.stringify({
        facts: [],
        followups: [],
        wantsToStop: true
      })
    });

    const res = await postMessage({
      sessionId: 'sessao-de-teste-01',
      text: 'para, não quero mais'
    });

    expect(res.status).toBe(200);
    const replies = res.json['replies'] as string[];
    expect(replies.some((t) => t.includes('Parei por aqui'))).toBe(true);
  });
});
