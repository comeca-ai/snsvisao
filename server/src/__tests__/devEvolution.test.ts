import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { loadConfig } from '../config.js';
import { createDevEvolutionRouter } from '../routes/devEvolution.js';

const cfg = loadConfig({
  DATABASE_URL: 'postgres://fio:x@localhost:5432/fio',
  WEBHOOK_TOKEN: 'w',
  ADMIN_TOKEN: 'a',
  LLM_API_KEY: 'k',
  EVOLUTION_API_URL: 'http://localhost:8080',
  EVOLUTION_API_KEY: 'e'
});

let server: Server;
let baseUrl: string;

// Guarda o fetch real para chamar o servidor local; o global é stubado
// para interceptar apenas as chamadas do router à Evolution API.
const realFetch = globalThis.fetch;
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function evoResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body
  } as unknown as Response;
}

beforeAll(async () => {
  const app = express();
  app.use(createDevEvolutionRouter(cfg));
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (typeof address === 'object' && address) {
    baseUrl = `http://127.0.0.1:${address.port}`;
  }
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  // Padrão: instância desconectada + QR disponível.
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/instance/connectionState/')) {
      return evoResponse({ instance: { state: 'close' } });
    }
    if (url.includes('/instance/connect/')) {
      return evoResponse({ base64: 'data:image/png;base64,QR_FAKE' });
    }
    return evoResponse({}, false, 404);
  });
});

describe('GET /dev/evolution/setup', () => {
  it('401 sem token', async () => {
    const res = await realFetch(`${baseUrl}/dev/evolution/setup`);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('401 com token errado', async () => {
    const res = await realFetch(`${baseUrl}/dev/evolution/setup?token=errado`);
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('200 com header x-admin-token (padrão routes/admin.ts)', async () => {
    const res = await realFetch(`${baseUrl}/dev/evolution/setup`, {
      headers: { 'x-admin-token': 'a' }
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data:image/png;base64,QR_FAKE');
  });

  it('200 com HTML contendo instruções e QR (mock da Evolution)', async () => {
    const res = await realFetch(`${baseUrl}/dev/evolution/setup?token=a`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<html');
    expect(html).toContain('Aparelhos conectados');
    expect(html).toContain('data:image/png;base64,QR_FAKE');
    expect(html).toContain('location.reload');
  });

  it('mostra estado conectado quando a instância está open', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/instance/connectionState/')) {
        return evoResponse({ instance: { state: 'open' } });
      }
      return evoResponse({}, false, 404);
    });

    const res = await realFetch(`${baseUrl}/dev/evolution/setup?token=a`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('WhatsApp conectado');
  });
});
