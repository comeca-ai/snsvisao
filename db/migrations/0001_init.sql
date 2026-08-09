CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL DEFAULT '',
  business_profile jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  phone text NOT NULL,                    -- E.164 sem '+', ex: 5583999999999
  push_name text,                          -- nome do WhatsApp
  consent boolean NOT NULL DEFAULT false,  -- LGPD gate
  consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  body text NOT NULL,
  provider_msg_id text,                    -- id da Evolution p/ idempotência
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, provider_msg_id)
);

CREATE TABLE facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  kind text NOT NULL CHECK (kind IN ('goal','offer','ask','context','next_step')),
  content text NOT NULL,
  confidence real NOT NULL DEFAULT 0.8,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  note text NOT NULL,                      -- o que fazer, em linguagem natural
  due_at timestamptz NOT NULL,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
