import express from 'express';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { createLLMClient } from './llm/index.js';
import { createMessagingProvider } from './messaging/index.js';
import { createAdminRouter } from './routes/admin.js';
import { createHealthRouter } from './routes/health.js';
import { createWebhookRouter } from './routes/webhook.js';

async function bootstrap(): Promise<void> {
  const llm = createLLMClient(config);
  const provider = createMessagingProvider(config);
  const deps = { pool, provider, llm, cfg: config };

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(createHealthRouter());
  app.use(createWebhookRouter(deps));
  app.use(createAdminRouter(config));

  app.listen(config.PORT, () => {
    console.log(`Fio server ouvindo na porta ${config.PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Falha no bootstrap:', err);
  process.exit(1);
});
