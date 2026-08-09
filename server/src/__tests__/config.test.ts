import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';

const validEnv = {
  DATABASE_URL: 'postgres://fio:x@localhost:5432/fio',
  WEBHOOK_TOKEN: 'w',
  ADMIN_TOKEN: 'a',
  LLM_API_KEY: 'k',
  EVOLUTION_API_URL: 'http://localhost:8080',
  EVOLUTION_API_KEY: 'e'
};

describe('config', () => {
  it('falha rápido com env incompleto', () => {
    expect(() => loadConfig({})).toThrow(/Configuração inválida/);
    expect(() =>
      loadConfig({ DATABASE_URL: 'postgres://x' })
    ).toThrow(/WEBHOOK_TOKEN/);
  });

  it('valida env completo e aplica defaults', () => {
    const cfg = loadConfig(validEnv);
    expect(cfg.PORT).toBe(3000);
    expect(cfg.DEFAULT_TENANT_SLUG).toBe('default');
    expect(cfg.LLM_PROVIDER).toBe('anthropic');
    expect(cfg.EVOLUTION_INSTANCE).toBe('fio');
    expect(cfg.SEND_MIN_INTERVAL_MS).toBe(1200);
  });

  it('rejeita LLM_PROVIDER inválido', () => {
    expect(() =>
      loadConfig({ ...validEnv, LLM_PROVIDER: 'gemini' })
    ).toThrow(/Configuração inválida/);
  });
});
