import { getDb } from './client.js';
import type { Extraction } from '../agent/extract.js';

export interface Tenant {
  id: string;
  name: string;
  evolution_instance: string | null;
  business_profile: Record<string, unknown>;
}

export interface Contact {
  id: string;
  tenant_id: string;
  wa_id: string;
  name: string | null;
  lgpd_consent_at: string | null;
}

export interface StoredFact {
  kind: string;
  content: string;
}

export interface StoredMessage {
  direction: 'inbound' | 'outbound';
  body: string;
}

export async function getTenantByInstance(instance: string): Promise<Tenant | null> {
  const { data, error } = await getDb()
    .from('tenants')
    .select('id, name, evolution_instance, business_profile')
    .eq('evolution_instance', instance)
    .maybeSingle();
  if (error) throw new Error(`getTenantByInstance: ${error.message}`);
  return data as Tenant | null;
}

export async function upsertContact(
  tenantId: string,
  waId: string,
  name?: string,
): Promise<Contact> {
  const db = getDb();
  const { data, error } = await db
    .from('contacts')
    .upsert(
      { tenant_id: tenantId, wa_id: waId, ...(name ? { name } : {}) },
      { onConflict: 'tenant_id,wa_id' },
    )
    .select('id, tenant_id, wa_id, name, lgpd_consent_at')
    .single();
  if (error) throw new Error(`upsertContact: ${error.message}`);
  return data as Contact;
}

export async function insertMessage(params: {
  tenantId: string;
  contactId: string;
  direction: 'inbound' | 'outbound';
  provider: string;
  providerMessageId?: string;
  body: string;
  raw?: unknown;
}): Promise<void> {
  const { error } = await getDb().from('messages').insert({
    tenant_id: params.tenantId,
    contact_id: params.contactId,
    direction: params.direction,
    provider: params.provider,
    provider_message_id: params.providerMessageId ?? null,
    body: params.body,
    raw: params.raw ?? null,
  });
  if (error) throw new Error(`insertMessage: ${error.message}`);
}

export async function getRecentMessages(
  contactId: string,
  limit = 30,
): Promise<StoredMessage[]> {
  const { data, error } = await getDb()
    .from('messages')
    .select('direction, body')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getRecentMessages: ${error.message}`);
  return (data as StoredMessage[]).reverse();
}

export async function getFacts(contactId: string): Promise<StoredFact[]> {
  const { data, error } = await getDb()
    .from('facts')
    .select('kind, content')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw new Error(`getFacts: ${error.message}`);
  return data as StoredFact[];
}

export async function recordConsent(contactId: string): Promise<void> {
  const { error } = await getDb()
    .from('contacts')
    .update({ lgpd_consent_at: new Date().toISOString() })
    .eq('id', contactId)
    .is('lgpd_consent_at', null);
  if (error) throw new Error(`recordConsent: ${error.message}`);
}

export async function saveExtraction(
  tenantId: string,
  contactId: string,
  extraction: Extraction,
): Promise<void> {
  const db = getDb();
  if (extraction.facts.length > 0) {
    const rows = extraction.facts.map((f) => ({
      tenant_id: tenantId,
      contact_id: contactId,
      kind: f.kind,
      content: f.content,
      confidence: f.confidence,
    }));
    const { error } = await db.from('facts').insert(rows);
    if (error) throw new Error(`saveExtraction(facts): ${error.message}`);
  }
  if (extraction.followup) {
    const dueAt = new Date(
      Date.now() + extraction.followup.due_in_hours * 3600 * 1000,
    ).toISOString();
    const { error } = await db.from('followups').insert({
      tenant_id: tenantId,
      contact_id: contactId,
      due_at: dueAt,
      reason: extraction.followup.reason,
    });
    if (error) throw new Error(`saveExtraction(followup): ${error.message}`);
  }
}
