import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

/** Pool singleton a partir de DATABASE_URL. */
export const pool: pg.Pool = new Pool({
  connectionString: config.DATABASE_URL
});
