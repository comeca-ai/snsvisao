import type { Request, Response } from 'express';
import { getConfig } from './config.js';

/**
 * Provisiona a instância do Evolution e mostra o QR code no navegador.
 * Roda no servidor (Railway alcança Railway); protegido pelo WEBHOOK_TOKEN
 * via query string. Fluxo: cria instância (se não existir) → aponta webhook
 * pro nosso /webhook/evolution → devolve página com QR que se atualiza.
 */

interface EvolutionFetchResult {
  ok: boolean;
  status: number;
  body: unknown;
}

async function evo(
  path: string,
  method: 'GET' | 'POST',
  payload?: unknown,
): Promise<EvolutionFetchResult> {
  const { evolution } = getConfig();
  const response = await fetch(`${evolution.baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      apikey: evolution.apiKey,
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

function extractQr(body: unknown): string | null {
  const data = body as {
    qrcode?: { base64?: string };
    base64?: string;
    code?: string;
  };
  return data?.qrcode?.base64 ?? data?.base64 ?? null;
}

function page(title: string, inner: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>body{background:#0b141a;color:#e9edef;font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:grid;place-items:center;min-height:100dvh;margin:0;text-align:center}
.card{background:#111b21;border:1px solid #2a3942;border-radius:14px;padding:32px;max-width:420px}
img{background:#fff;border-radius:10px;padding:10px;width:280px;height:280px}
h1{font-size:18px;margin:0 0 6px}p{color:#8696a0;font-size:14px;line-height:1.5}
.ok{color:#00c298;font-weight:600}</style></head>
<body><div class="card">${inner}</div></body></html>`;
}

export async function evolutionSetupHandler(req: Request, res: Response): Promise<void> {
  const config = getConfig();
  if (req.query.token !== config.webhookToken) {
    res.status(401).send('unauthorized');
    return;
  }

  const instance = config.evolution.instance;
  try {
    // 1. Estado atual da instância (404 = ainda não existe)
    const state = await evo(`/instance/connectionState/${instance}`, 'GET');
    const connection = (state.body as { instance?: { state?: string } })?.instance?.state;

    if (connection === 'open') {
      res.send(
        page(
          'Fio — conectado',
          `<h1 class="ok">✓ WhatsApp conectado</h1>
           <p>A instância <b>${instance}</b> está ativa. Pode mandar mensagem no número que o Fio responde.</p>`,
        ),
      );
      return;
    }

    // 2. Cria a instância se não existir
    let qr: string | null = null;
    if (!state.ok) {
      const created = await evo('/instance/create', 'POST', {
        instanceName: instance,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
      });
      qr = extractQr(created.body);
    }

    // 3. Webhook apontando pro nosso ingest (idempotente)
    const publicDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
    if (publicDomain) {
      await evo(`/webhook/set/${instance}`, 'POST', {
        webhook: {
          enabled: true,
          url: `https://${publicDomain}/webhook/evolution`,
          headers: { 'x-webhook-token': config.webhookToken },
          events: ['MESSAGES_UPSERT'],
        },
      });
    }

    // 4. QR fresco (o QR expira; a página se recarrega sozinha)
    if (!qr) {
      const connect = await evo(`/instance/connect/${instance}`, 'GET');
      qr = extractQr(connect.body);
    }

    if (qr) {
      const src = qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`;
      res.send(
        page(
          'Fio — escaneie o QR',
          `<h1>Conecte o chip de teste</h1>
           <p>WhatsApp → Aparelhos conectados → Conectar aparelho</p>
           <img src="${src}" alt="QR code">
           <p>A página se atualiza sozinha a cada 30s enquanto não conectar.</p>
           <script>setTimeout(function(){location.reload()},30000)</script>`,
        ),
      );
      return;
    }

    res.status(502).send(
      page(
        'Fio — aguarde',
        `<h1>Instância criada, QR ainda não disponível</h1>
         <p>Estado atual: ${connection ?? 'iniciando'}. Recarregue em alguns segundos.</p>
         <script>setTimeout(function(){location.reload()},10000)</script>`,
      ),
    );
  } catch (err) {
    console.error('evolutionSetupHandler falhou:', err);
    res.status(502).send(
      page(
        'Fio — Evolution indisponível',
        `<h1>Não consegui falar com o Evolution</h1>
         <p>Confira se o serviço "evolution" está verde no Railway e recarregue.</p>`,
      ),
    );
  }
}
