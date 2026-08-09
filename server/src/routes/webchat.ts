import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { handleInbound, type OrchestratorDeps } from '../agent/orchestrator.js';
import { ensureTenant, upsertContact } from '../db/repo.js';
import { WebChatProvider } from '../messaging/webchat.js';

// Contrato exato do SPEC 9.1 — o front Next.js consome via rota de API
// server-to-server; o browser NUNCA chama este endpoint direto, por isso
// NÃO abrimos CORS aqui (o token WEBHOOK_TOKEN também jamais sai do servidor).
const bodySchema = z.object({
  sessionId: z.string().min(8).max(128),
  text: z.string().min(1).max(4000)
});

export function createWebchatRouter(deps: OrchestratorDeps): Router {
  const router = Router();

  router.post('/webchat/message', async (req, res) => {
    if (req.header('x-webhook-token') !== deps.cfg.WEBHOOK_TOKEN) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body' });
      return;
    }

    const { sessionId, text } = parsed.data;
    const phone = `web_${sessionId}`;

    try {
      // Upsert ANTES do handleInbound para obter o contactId do contrato
      // (handleInbound não o expõe; internamente ele refaz o mesmo upsert
      // idempotente com phone/pushName).
      const tenant = await ensureTenant(deps.cfg.DEFAULT_TENANT_SLUG);
      const contact = await upsertContact(tenant.id, phone, null);

      // Mesma persona, memória, throttle e LGPD gate: só o provider muda —
      // os balões que iriam pro WhatsApp acumulam no buffer `replies`.
      const webchat = new WebChatProvider();
      await handleInbound(
        {
          providerName: 'webchat',
          providerMsgId: `web_${randomUUID()}`,
          phone,
          pushName: null,
          text,
          fromMe: false,
          timestamp: new Date()
        },
        { ...deps, provider: webchat }
      );

      // Contrato v1.1: replies vazio NÃO é erro. Informamos o motivo para o
      // front exibir balão amigável em vez da mensagem genérica de falha:
      // - 'consent_pending': contato ainda não consentiu (LGPD gate já pediu
      //   permissão uma vez; não insistimos — ver orchestrator passo 2);
      // - 'throttled': resposta gerada, mas segurada pelo anti-spam.
      if (webchat.replies.length === 0) {
        const reason = contact.consent ? 'throttled' : 'consent_pending';
        res.status(200).json({ replies: [], contactId: contact.id, reason });
        return;
      }

      res.status(200).json({ replies: webchat.replies, contactId: contact.id });
    } catch (err) {
      console.error('[webchat] erro no handleInbound:', err);
      res.status(500).json({ error: 'internal_error' });
    }
  });

  return router;
}
