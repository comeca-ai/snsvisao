import { Router } from 'express';
import type { AppConfig } from '../config.js';

export function createAdminRouter(cfg: AppConfig): Router {
  const router = Router();

  router.get('/admin/qrcode', async (req, res) => {
    if (req.header('x-admin-token') !== cfg.ADMIN_TOKEN) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    try {
      const base = cfg.EVOLUTION_API_URL.replace(/\/$/, '');
      const response = await fetch(
        `${base}/instance/connect/${cfg.EVOLUTION_INSTANCE}`,
        { headers: { apikey: cfg.EVOLUTION_API_KEY } }
      );
      if (!response.ok) {
        res.status(502).json({
          error: `Evolution respondeu ${response.status}`
        });
        return;
      }
      const data = (await response.json()) as Record<string, unknown>;
      if (typeof data.base64 === 'string' && data.base64 !== '') {
        res.status(200).json({ base64: data.base64 });
        return;
      }
      res.status(200).json({ connected: true });
    } catch (err) {
      console.error('[admin] erro ao buscar QR na Evolution:', err);
      res.status(502).json({ error: 'falha ao consultar Evolution' });
    }
  });

  return router;
}
