import type { InboundMessage, MessagingProvider } from '../providers/types.js';
import { generateReply, extractFromConversation, type ConversationTurn } from './claude.js';
import type { AgentContext } from './prompt.js';
import {
  getTenantByInstance,
  upsertContact,
  insertMessage,
  getRecentMessages,
  getFacts,
  recordConsent,
  saveExtraction,
} from '../db/repo.js';

/**
 * Loop central: mensagem normalizada entra → memória carrega → agente
 * responde no canal → extração estruturada roda depois do envio.
 *
 * LGPD: fatos só são persistidos após consentimento explícito do contato
 * (contacts.lgpd_consent_at). Antes disso o agente conversa e se apresenta,
 * mas nada vira memória de longo prazo.
 */
export async function handleInbound(
  provider: MessagingProvider,
  raw: unknown,
): Promise<void> {
  const msg = provider.parseWebhook(raw);
  if (!msg || msg.fromMe || msg.isGroup) return;

  const tenant = await getTenantByInstance(msg.accountId);
  if (!tenant) {
    console.warn(`Webhook de instância desconhecida: ${msg.accountId}`);
    return;
  }

  const contact = await upsertContact(tenant.id, msg.chatId, msg.senderName);
  await insertMessage({
    tenantId: tenant.id,
    contactId: contact.id,
    direction: 'inbound',
    provider: provider.name,
    providerMessageId: msg.providerMessageId,
    body: msg.text,
    raw,
  });

  const hasConsent = contact.lgpd_consent_at !== null;
  const facts = hasConsent ? await getFacts(contact.id) : [];
  const recent = await getRecentMessages(contact.id);

  const ctx: AgentContext = {
    businessProfile: tenant.business_profile ?? {},
    contactName: contact.name ?? msg.senderName,
    facts,
  };
  const history: ConversationTurn[] = recent.map((m) => ({
    role: m.direction === 'inbound' ? 'user' : 'assistant',
    content: m.body,
  }));
  if (history.length === 0 || history[0]?.role !== 'user') {
    history.unshift({ role: 'user', content: msg.text });
  }

  const reply = await generateReply(ctx, history);
  await provider.sendText(msg.chatId, reply);
  await insertMessage({
    tenantId: tenant.id,
    contactId: contact.id,
    direction: 'outbound',
    provider: provider.name,
    body: reply,
  });

  // Extração roda depois do envio — falha aqui não pode derrubar a conversa.
  try {
    const extraction = await extractFromConversation(ctx, [
      ...history,
      { role: 'assistant', content: reply },
    ]);
    if (!hasConsent && extraction.consent_given) {
      await recordConsent(contact.id);
    }
    if (hasConsent || extraction.consent_given) {
      await saveExtraction(tenant.id, contact.id, extraction);
    }
  } catch (err) {
    console.error('Extração falhou (conversa segue normal):', err);
  }
}
