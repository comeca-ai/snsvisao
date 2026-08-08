import express from 'express';
import { getConfig } from './config.js';
import { EvolutionProvider } from './providers/evolution.js';
import { handleInbound } from './agent/orchestrator.js';
import { devChatHandler } from './dev.js';

const config = getConfig();
const provider = new EvolutionProvider(config.evolution);

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'snsvisao-server' });
});

app.post('/webhook/evolution', (req, res) => {
  if (req.get('x-webhook-token') !== config.webhookToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  // Responde imediatamente (Evolution re-tenta em timeout) e processa async.
  res.status(200).json({ received: true });
  handleInbound(provider, req.body).catch((err) => {
    console.error('handleInbound falhou:', err);
  });
});

app.post('/dev/chat', (req, res) => {
  if (req.get('x-webhook-token') !== config.webhookToken) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  void devChatHandler(req, res);
});

app.listen(config.port, () => {
  console.log(`snsvisao-server ouvindo na porta ${config.port}`);
});
