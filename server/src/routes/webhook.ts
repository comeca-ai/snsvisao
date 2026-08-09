import { Router } from 'express';
import { handleInbound, type OrchestratorDeps } from '../agent/orchestrator.js';

export function createWebhookRouter(deps: OrchestratorDeps): Router {
  const router = Router();

  router.post('/webhook/evolution', (req, res) => {
    if (req.header('x-webhook-token') !== deps.cfg.WEBHOOK_TOKEN) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const inbound = deps.provider.parseInbound(req.body);
    if (!inbound) {
      res.status(200).json({ ignored: true });
      return;
    }

    // 200 imediato; processamento assíncrono (fire-and-forget com catch+log)
    res.status(200).json({ ok: true });
    void handleInbound(inbound, deps).catch((err) => {
      console.error('[webhook] erro no handleInbound:', err);
    });
  });

  return router;
}
