import type pg from 'pg';
import { pool as defaultPool } from './pool.js';
import type { NewFact, NewFollowup } from '../agent/extract.js';

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  businessProfile: Record<string, unknown>;
  createdAt: Date;
}

export interface Contact {
  id: string;
  tenantId: string;
  phone: string;
  pushName: string | null;
  consent: boolean;
  consentAt: Date | null;
  createdAt: Date;
  lastSeenAt: Date;
}

export type MessageDirection = 'in' | 'out';

export interface Message {
  id: string;
  contactId: string;
  direction: MessageDirection;
  body: string;
  providerMsgId: string | null;
  createdAt: Date;
}

export type FactKind = 'goal' | 'offer' | 'ask' | 'context' | 'next_step';

export interface Fact {
  id: string;
  contactId: string;
  kind: FactKind;
  content: string;
  confidence: number;
  active: boolean;
  createdAt: Date;
}

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  business_profile: Record<string, unknown>;
  created_at: Date;
}

interface ContactRow {
  id: string;
  tenant_id: string;
  phone: string;
  push_name: string | null;
  consent: boolean;
  consent_at: Date | null;
  created_at: Date;
  last_seen_at: Date;
}

interface MessageRow {
  id: string;
  contact_id: string;
  direction: MessageDirection;
  body: string;
  provider_msg_id: string | null;
  created_at: Date;
}

interface FactRow {
  id: string;
  contact_id: string;
  kind: FactKind;
  content: string;
  confidence: number;
  active: boolean;
  created_at: Date;
}

function toTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    businessProfile: row.business_profile,
    createdAt: row.created_at
  };
}

function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    phone: row.phone,
    pushName: row.push_name,
    consent: row.consent,
    consentAt: row.consent_at,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    contactId: row.contact_id,
    direction: row.direction,
    body: row.body,
    providerMsgId: row.provider_msg_id,
    createdAt: row.created_at
  };
}

function toFact(row: FactRow): Fact {
  return {
    id: row.id,
    contactId: row.contact_id,
    kind: row.kind,
    content: row.content,
    confidence: row.confidence,
    active: row.active,
    createdAt: row.created_at
  };
}

export async function ensureTenant(slug: string): Promise<Tenant> {
  const result = await defaultPool.query<TenantRow>(
    `INSERT INTO tenants (slug) VALUES ($1)
     ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
     RETURNING *`,
    [slug]
  );
  return toTenant(result.rows[0]);
}

export async function upsertContact(
  tenantId: string,
  phone: string,
  pushName: string | null
): Promise<Contact> {
  const result = await defaultPool.query<ContactRow>(
    `INSERT INTO contacts (tenant_id, phone, push_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (tenant_id, phone) DO UPDATE SET
       last_seen_at = now(),
       push_name = COALESCE(EXCLUDED.push_name, contacts.push_name)
     RETURNING *`,
    [tenantId, phone, pushName]
  );
  return toContact(result.rows[0]);
}

export async function recordMessage(
  contactId: string,
  direction: 'in' | 'out',
  body: string,
  providerMsgId: string | null
): Promise<void> {
  await defaultPool.query(
    `INSERT INTO messages (contact_id, direction, body, provider_msg_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (contact_id, provider_msg_id) DO NOTHING`,
    [contactId, direction, body, providerMsgId]
  );
}

export async function getRecentMessages(
  contactId: string,
  limit: number
): Promise<Message[]> {
  const result = await defaultPool.query<MessageRow>(
    `SELECT * FROM messages
     WHERE contact_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [contactId, limit]
  );
  // ordem cronológica
  return result.rows.reverse().map(toMessage);
}

export async function getActiveFacts(contactId: string): Promise<Fact[]> {
  const result = await defaultPool.query<FactRow>(
    `SELECT * FROM facts
     WHERE contact_id = $1 AND active = true
     ORDER BY created_at ASC`,
    [contactId]
  );
  return result.rows.map(toFact);
}

export async function setConsent(contactId: string): Promise<void> {
  await defaultPool.query(
    `UPDATE contacts SET consent = true, consent_at = now() WHERE id = $1`,
    [contactId]
  );
}

function normalizeContent(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function insertFacts(
  contactId: string,
  facts: NewFact[]
): Promise<void> {
  if (facts.length === 0) return;
  const existing = await defaultPool.query<{ kind: string; content: string }>(
    `SELECT kind, content FROM facts WHERE contact_id = $1 AND active = true`,
    [contactId]
  );
  const seen = new Set(
    existing.rows.map((r) => `${r.kind}::${normalizeContent(r.content)}`)
  );
  for (const fact of facts) {
    const key = `${fact.kind}::${normalizeContent(fact.content)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await defaultPool.query(
      `INSERT INTO facts (contact_id, kind, content, confidence)
       VALUES ($1, $2, $3, $4)`,
      [contactId, fact.kind, fact.content, fact.confidence ?? 0.8]
    );
  }
}

export async function insertFollowups(
  contactId: string,
  fups: NewFollowup[]
): Promise<void> {
  for (const fup of fups) {
    await defaultPool.query(
      `INSERT INTO followups (contact_id, note, due_at)
       VALUES ($1, $2, now() + ($3 || ' hours')::interval)`,
      [contactId, fup.note, String(fup.dueInHours)]
    );
  }
}

export async function getLastOutboundAt(
  contactId: string
): Promise<Date | null> {
  const result = await defaultPool.query<{ last: Date | null }>(
    `SELECT max(created_at) AS last FROM messages
     WHERE contact_id = $1 AND direction = 'out'`,
    [contactId]
  );
  return result.rows[0]?.last ?? null;
}

/** Tipo auxiliar para quem precisa injetar pool (ex.: testes futuros). */
export type PoolLike = Pick<pg.Pool, 'query'>;
