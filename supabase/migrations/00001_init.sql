-- snsvisao — schema inicial
-- tenants: donos de negócio atendidos pelo agente (1 por número conectado)
-- contacts: pessoas que conversam com o agente (com consentimento LGPD)
-- messages: histórico bruto da conversa
-- facts: memória estruturada extraída da conversa (o "CRM que se preenche sozinho")
-- followups: compromissos de retomada de contato
-- connections: grafo de apresentações de negócio (double opt-in)

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp_number text unique,
  evolution_instance text unique,
  business_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  wa_id text not null,
  name text,
  -- LGPD: consentimento explícito para memorização de dados. NULL = sem
  -- consentimento; nada vira memória de longo prazo antes disso.
  lgpd_consent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, wa_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  provider text not null default 'evolution',
  provider_message_id text,
  body text not null,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index messages_contact_created_idx on messages (contact_id, created_at);

create table facts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  kind text not null check (kind in ('fact', 'goal', 'ask', 'offer', 'next_step')),
  content text not null,
  confidence numeric not null default 0.8,
  created_at timestamptz not null default now()
);
create index facts_contact_kind_idx on facts (contact_id, kind);
-- ask/offer alimentam o motor de conexões: quem procura X ↔ quem oferece X.
create index facts_tenant_kind_idx on facts (tenant_id, kind);

create table followups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  due_at timestamptz not null,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'done', 'cancelled')),
  created_at timestamptz not null default now()
);
create index followups_due_idx on followups (status, due_at);

-- Grafo de apresentações. Uma conexão só vira apresentação real depois que
-- os DOIS lados aceitam (double opt-in) — regra de produto e de LGPD.
create table connections (
  id uuid primary key default gen_random_uuid(),
  contact_a uuid not null references contacts(id) on delete cascade,
  contact_b uuid not null references contacts(id) on delete cascade,
  rationale text not null,
  status text not null default 'suggested'
    check (status in ('suggested', 'proposed', 'accepted_by_a', 'accepted_by_b',
                      'connected', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (contact_a <> contact_b)
);
create index connections_status_idx on connections (status);

-- RLS: deny-all por padrão. O servidor usa service role (bypassa RLS);
-- qualquer acesso client-side futuro exigirá policies explícitas.
alter table tenants enable row level security;
alter table contacts enable row level security;
alter table messages enable row level security;
alter table facts enable row level security;
alter table followups enable row level security;
alter table connections enable row level security;
