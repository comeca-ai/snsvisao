import { Router } from 'express';
import type { AppConfig } from '../config.js';

/**
 * Setup da Evolution API pelo navegador (portado da linha remota, adaptado
 * para a nossa arquitetura de rotas/config). Abra:
 *   GET /dev/evolution/setup?token=<ADMIN_TOKEN>
 * (ou header `x-admin-token`, mesmo padrão de /admin/qrcode)
 * A página mostra o QR atual da instância, o estado da conexão e se
 * auto-recarrega a cada 10s até o WhatsApp conectar.
 */

interface EvolutionFetchResult {
  ok: boolean;
  status: number;
  body: unknown;
}

async function evo(
  cfg: AppConfig,
  path: string,
  method: 'GET' | 'POST' = 'GET'
): Promise<EvolutionFetchResult> {
  const base = cfg.EVOLUTION_API_URL.replace(/\/$/, '');
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { apikey: cfg.EVOLUTION_API_KEY }
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

function extractQr(body: unknown): string | null {
  const data = body as {
    qrcode?: { base64?: string };
    base64?: string;
  } | null;
  return data?.qrcode?.base64 ?? data?.base64 ?? null;
}

function page(title: string, inner: string, refreshSeconds?: number): string {
  const refresh = refreshSeconds
    ? `<script>setTimeout(function(){location.reload()},${refreshSeconds * 1000})</script>`
    : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>body{background:#0b141a;color:#e9edef;font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:grid;place-items:center;min-height:100dvh;margin:0;text-align:center}
.card{background:#111b21;border:1px solid #2a3942;border-radius:14px;padding:32px;max-width:420px}
img{background:#fff;border-radius:10px;padding:10px;width:280px;height:280px}
h1{font-size:18px;margin:0 0 6px}p{color:#8696a0;font-size:14px;line-height:1.5}
.ok{color:#00c298;font-weight:600}</style></head>
<body><div class="card">${inner}</div>${refresh}</body></html>`;
}

export function createDevEvolutionRouter(cfg: AppConfig): Router {
  const router = Router();

  router.get('/dev/evolution/setup', async (req, res) => {
    // Auth no padrão de routes/admin.ts (header x-admin-token); o query
    // param ?token= é aceito como conveniência para abrir no navegador.
    if (
      req.header('x-admin-token') !== cfg.ADMIN_TOKEN &&
      req.query.token !== cfg.ADMIN_TOKEN
    ) {
      res.status(401).send('unauthorized');
      return;
    }

    const instance = cfg.EVOLUTION_INSTANCE;
    try {
      // Estado atual da conexão (open = WhatsApp já conectado)
      const state = await evo(cfg, `/instance/connectionState/${instance}`);
      const connection = (
        state.body as { instance?: { state?: string } } | null
      )?.instance?.state;

      if (connection === 'open') {
        res.send(
          page(
            'Fio — conectado',
            `<h1 class="ok">✓ WhatsApp conectado</h1>
             <p>A instância <b>${instance}</b> está ativa. Pode mandar mensagem no número que o Fio responde.</p>`
          )
        );
        return;
      }

      // QR fresco (mesma lógica do /admin/qrcode)
      const connect = await evo(cfg, `/instance/connect/${instance}`);
      const qr = extractQr(connect.body);

      if (qr) {
        const src = qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
        res.send(
          page(
            'Fio — escaneie o QR',
            `<h1>Conecte o WhatsApp do Fio</h1>
             <p>No celular: <b>WhatsApp → Aparelhos conectados → Conectar aparelho</b> e escaneie o QR abaixo.</p>
             <img src="${src}" alt="QR code">
             <p>A página se atualiza sozinha a cada 10s enquanto não conectar.</p>`,
            10
          )
        );
        return;
      }

      res.status(502).send(
        page(
          'Fio — aguardando QR',
          `<h1>QR ainda não disponível</h1>
           <p>Estado atual da instância <b>${instance}</b>: ${connection ?? 'iniciando'}.</p>
           <p>Aguarde — a página recarrega sozinha a cada 10s. Se persistir, crie a instância na Evolution API.</p>`,
          10
        )
      );
    } catch (err) {
      console.error('[devEvolution] falha ao consultar Evolution:', err);
      res.status(502).send(
        page(
          'Fio — Evolution indisponível',
          `<h1>Não consegui falar com a Evolution API</h1>
           <p>Confira se o serviço está no ar e se EVOLUTION_API_URL/EVOLUTION_API_KEY estão corretas, depois recarregue.</p>`
        )
      );
    }
  });

  return router;
}
