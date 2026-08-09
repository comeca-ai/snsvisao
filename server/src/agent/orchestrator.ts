import type { Pool } from 'pg';
import type { AppConfig } from '../config.js';
import type { InboundMessage, MessagingProvider } from '../messaging/types.js';
import type { LLMClient } from '../llm/types.js';
import {
  ensureTenant,
  getActiveFacts,
  getLastOutboundAt,
  getRecentMessages,
  insertFacts,
  insertFollowups,
  recordMessage,
  setConsent,
  upsertContact
} from '../db/repo.js';
import { extract } from './extract.js';
import { reply, splitIntoBubbles } from './reply.js';

export interface OrchestratorDeps {
  pool: Pool;
  provider: MessagingProvider;
  llm: LLMClient;
  cfg: AppConfig;
}

const CONSENT_REGEX = /\b(sim|ok|pode|aceito|topo|bora|quero)\b/i;
const CONSENT_MAX_CHARS = 20;

const CONSENT_ASK_MESSAGE =
  'Opa, prazer! Sou o Fio, parceiro comercial do seu negócio. ' +
  'Antes de a gente seguir: posso guardar o que a gente conversar por aqui ' +
  'pra te ajudar melhor? Se topar, é só responder "pode".';

const GOODBYE_MESSAGE =
  'Fechado! Parei por aqui. Quando quiser voltar a conversar sobre o negócio, é só me chamar. Sucesso nas vendas!';

/** Classifica via LLM se a mensagem é um consentimento. */
async function llmSaysConsent(llm: LLMClient, text: string): Promise<boolean> {
  const answer = await llm.complete(
    [
      {
        role: 'system',
        content:
          'Você decide se a mensagem de um cliente dá permissão para guardarmos ' +
          'o que conversamos no WhatsApp para ajudá-lo melhor. ' +
          'Responda APENAS com "sim" ou "não".'
      },
      { role: 'user', content: text }
    ],
    { maxTokens: 8 }
  );
  return answer.trim().toLowerCase().startsWith('sim');
}

async function isConsentMessage(llm: LLMClient, text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (trimmed.length <= CONSENT_MAX_CHARS && CONSENT_REGEX.test(trimmed)) {
    return true;
  }
  try {
    return await llmSaysConsent(llm, text);
  } catch (err) {
    console.error('[orchestrator] falha ao classificar consentimento:', err);
    return false;
  }
}

/**
 * Fluxo principal do Fio (SPEC 4.5).
 */
export async function handleInbound(
  msg: InboundMessage,
  deps: OrchestratorDeps
): Promise<void> {
  const { pool, provider, llm, cfg } = deps;

  // 1. tenant -> contato -> registra a entrada
  const tenant = await ensureTenant(cfg.DEFAULT_TENANT_SLUG);
  const contact = await upsertContact(tenant.id, msg.phone, msg.pushName);
  await recordMessage(contact.id, 'in', msg.text, msg.providerMsgId);

  // 2. LGPD gate
  if (!contact.consent) {
    const consented = await isConsentMessage(llm, msg.text);
    if (!consented) {
      // Responde UMA vez pedindo permissão: se já existe qualquer mensagem
      // nossa para esse contato, não insistimos.
      const lastOutbound = await getLastOutboundAt(contact.id);
      if (!lastOutbound) {
        await provider.sendText(msg.phone, CONSENT_ASK_MESSAGE);
        await recordMessage(contact.id, 'out', CONSENT_ASK_MESSAGE, null);
      }
      return;
    }
    await setConsent(contact.id);
    contact.consent = true;
  }

  // 3. memória recente + fatos ativos
  const [history, facts] = await Promise.all([
    getRecentMessages(contact.id, 20),
    getActiveFacts(contact.id)
  ]);

  // 4. resposta da persona
  const replyText = await reply(llm, { contact, history, facts });
  const bubbles = splitIntoBubbles(replyText);

  // 6. (início) extração em paralelo ao envio; erros não quebram a resposta
  const extractionPromise = (async () => {
    try {
      const extraction = await extract(llm, history, msg.text);
      if (contact.consent) {
        await insertFacts(contact.id, extraction.facts);
        await insertFollowups(contact.id, extraction.followups);
      }
      return extraction;
    } catch (err) {
      console.error('[orchestrator] falha na extração (ignorada):', err);
      return null;
    }
  })();

  // 5. throttle anti-spam + envio balão a balão
  const lastOutboundAt = await getLastOutboundAt(contact.id);
  const elapsed = lastOutboundAt
    ? Date.now() - lastOutboundAt.getTime()
    : Number.POSITIVE_INFINITY;
  if (elapsed < cfg.SEND_MIN_INTERVAL_MS) {
    console.warn(
      `[orchestrator] throttle: último envio há ${elapsed}ms ` +
        `(< ${cfg.SEND_MIN_INTERVAL_MS}ms); resposta não enviada p/ ${msg.phone}`
    );
  } else {
    for (const bubble of bubbles) {
      await provider.sendText(msg.phone, bubble);
      await recordMessage(contact.id, 'out', bubble, null);
    }
  }

  const extraction = await extractionPromise;

  // 7. wantsToStop -> revoga consent + despedida curta
  if (extraction?.wantsToStop) {
    await pool.query(
      'UPDATE contacts SET consent = false, consent_at = NULL WHERE id = $1',
      [contact.id]
    );
    await provider.sendText(msg.phone, GOODBYE_MESSAGE);
    await recordMessage(contact.id, 'out', GOODBYE_MESSAGE, null);
  }
}
