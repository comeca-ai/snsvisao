import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    // Env mínimo para que `src/config.ts` (que valida em import) possa ser
    // carregado nos testes. Os testes de config usam `loadConfig(env)` direto.
    env: {
      DATABASE_URL: 'postgres://fio:test@localhost:5432/fio_test',
      WEBHOOK_TOKEN: 'test-webhook-token',
      ADMIN_TOKEN: 'test-admin-token',
      LLM_API_KEY: 'test-llm-key',
      EVOLUTION_API_URL: 'http://localhost:8080',
      EVOLUTION_API_KEY: 'test-evolution-key'
    }
  }
});
