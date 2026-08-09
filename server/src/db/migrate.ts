import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const here = path.dirname(fileURLToPath(import.meta.url));
// Resolucao que funciona nos dois cenarios:
//  - producao (Docker): /app/dist/db/migrate.js -> /app/db/migrations (2 niveis)
//  - dev (repo): server/src/db/migrate.ts -> <raiz do repo>/db/migrations (3 niveis)
const MIGRATIONS_DIR_CANDIDATES = [
  path.resolve(here, '..', '..', 'db', 'migrations'),
  path.resolve(here, '..', '..', '..', 'db', 'migrations')
];
const MIGRATIONS_DIR =
  MIGRATIONS_DIR_CANDIDATES.find((dir) => existsSync(dir)) ??
  MIGRATIONS_DIR_CANDIDATES[0];

/**
 * Runner idempotente de migrations: aplica arquivos .sql de db/migrations
 * em ordem alfabética, registrando as já aplicadas na tabela `_migrations`.
 */
export async function runMigrations(pool: pg.Pool): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const appliedRows = await pool.query<{ name: string }>(
    'SELECT name FROM _migrations'
  );
  const applied = new Set(appliedRows.rows.map((r) => r.name));

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const justApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      justApplied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  return justApplied;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL não definida; nada a migrar.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const applied = await runMigrations(pool);
    if (applied.length === 0) {
      console.log('Migrations em dia; nada a aplicar.');
    } else {
      console.log(`Migrations aplicadas: ${applied.join(', ')}`);
    }
  } finally {
    await pool.end();
  }
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  main().catch((err) => {
    console.error('Falha ao rodar migrations:', err);
    process.exit(1);
  });
}
