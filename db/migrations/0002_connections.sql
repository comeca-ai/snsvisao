CREATE TABLE connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  contact_a uuid NOT NULL REFERENCES contacts(id),
  contact_b uuid NOT NULL REFERENCES contacts(id),
  rationale text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','accepted_a','accepted_b','introduced','declined')),
  created_at timestamptz NOT NULL DEFAULT now()
);
