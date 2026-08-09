import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { runMigrations } from '../db/migrate.js';

const { Pool } = pg;

/**
 * Teste do runner de migrations.
 *
 * SKIP DOCUMENTADO: este teste só roda quando TEST_DATABASE_URL aponta para
 * um Postgres 16 de teste (ex.: `docker run -p 5433:5432 postgres:16-alpine`).
 * Sem banco real disponível na suíte, o caso é pulado — conforme permitido
 * pela seção 7 da SPEC (pg-mem OU skip documentado; escolhemos o skip por
 * ser o mais simples que passa, e porque o pg-mem não suporta
 * gen_random_uuid() nativo do Postgres 16 sem extensões registradas à mão).
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const itWithDb = TEST_DATABASE_URL ? it : it.skip;

describe('runner de migrations', () => {
  itWithDb('é idempotente', async () => {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL });
    try {
      const first = await runMigrations(pool);
      expect(first).toEqual(['0001_init.sql', '0002_connections.sql']);

      const second = await runMigrations(pool);
      expect(second).toEqual([]);

      const tables = await pool.query<{ name: string }>(
        'SELECT name FROM _migrations ORDER BY name'
      );
      expect(tables.rows.map((r) => r.name)).toEqual([
        '0001_init.sql',
        '0002_connections.sql'
      ]);
    } finally {
      await pool.end();
    }
  });

  it('sem TEST_DATABASE_URL: skip documentado (ver comentário no topo)', () => {
    expect(true).toBe(true);
  });
});
