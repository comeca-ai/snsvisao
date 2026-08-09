# SPEC.md — Fio (snsvisao) — FONTE ÚNICA DA VERDADE

Implementação fiel a este documento. Nada de mudanças unilaterais de
interface. Stack: Node 20+, TypeScript (strict, ESM), Express 4, Postgres 16,
Evolution API v2 (atendai/evolution-api), Docker Compose.

## 0. Persona do agente (regra de produto inviolável)

O agente é um **parceiro comercial** do pequeno empresário brasileiro.
- Tom: positivo, propositivo, direto, energia de quem quer ver o cara vender.
  Estilo Boardy: informal-profissional, frases curtas, sem corporatês.
- **Vocabulário PROIBIDO em qualquer fala do agente**: "CRM", "automação",
  "disparo", "funil de vendas" (usar "caminho da venda"), jargão de marketing
  digital. O agente fala de **vender mais, clientes, oportunidades, negócio**.
- Nunca promete o que não entrega. Nunca empurra formulário/call/email.
- Primeira unidade de valor em <2 min dentro da conversa.
- System prompt vive em `server/src/agent/persona.ts` exportando
  `PERSONA_SYSTEM_PROMPT: string` e `EXTRACTION_SYSTEM_PROMPT: string`.

## 1. Estrutura de diretórios

```
snsvisao/
├── README.md                  # já existe
├── SPEC.md                    # este arquivo
├── docker-compose.yml         # ESTÁGIO 2
├── .env.example               # ESTÁGIO 2 (na raiz, referenciado pelo compose)
├── db/
│   └── migrations/
│       ├── 0001_init.sql      # ESTÁGIO 1
│       └── 0002_connections.sql
├── scripts/
│   ├── setup-vps.sh           # ESTÁGIO 2
│   ├── show-qrcode.sh         # ESTÁGIO 2
│   └── lib-evolution.sh       # ESTÁGIO 2 (helpers curl p/ API da Evolution)
├── docs/
│   └── OPERACAO.md            # ESTÁGIO 2
└── server/
    ├── package.json           # ESTÁGIO 1
    ├── tsconfig.json          # strict, module NodeNext, outDir dist
    ├── vitest.config.ts
    ├── Dockerfile             # ESTÁGIO 2 (multi-stage node:20-alpine)
    ├── .env.example           # ESTÁGIO 1 (espelho das vars da seção 2)
    └── src/
        ├── index.ts           # bootstrap: carrega env, sobe Express
        ├── config.ts          # lê/valida env (zod), exporta `config`
        ├── db/
        │   ├── pool.ts        # pg Pool singleton a partir de DATABASE_URL
        │   ├── migrate.ts     # runner: aplica db/migrations em ordem, tabela _migrations
        │   └── repo.ts        # funções de acesso (seção 4)
        ├── llm/
        │   ├── types.ts       # interface LLMClient
        │   ├── anthropic.ts   # provider Anthropic-compatible
        │   ├── kimi.ts        # provider Kimi/Moonshot (OpenAI-compatible)
        │   └── index.ts       # factory createLLMClient(config)
        ├── messaging/
        │   ├── types.ts       # MessagingProvider + InboundMessage
        │   ├── evolution.ts   # EvolutionProvider
        │   └── index.ts       # factory
        ├── agent/
        │   ├── persona.ts     # prompts (seção 0)
        │   ├── extract.ts     # extração estruturada de facts/followups
        │   ├── reply.ts       # geração de resposta
        │   └── orchestrator.ts# fluxo principal (seção 5)
        ├── routes/
        │   ├── webhook.ts     # POST /webhook/evolution
        │   ├── health.ts      # GET /health → {ok:true}
        │   └── admin.ts       # GET /admin/qrcode (auth ADMIN_TOKEN)
        └── __tests__/         # vitest; mocks de LLM e provider
```

## 2. Variáveis de ambiente (contrato entre Estágio 1 e 2)

```bash
# server
PORT=3000
DATABASE_URL=postgres://fio:CHANGE_ME@db:5432/fio
WEBHOOK_TOKEN=CHANGE_ME            # header x-webhook-token
ADMIN_TOKEN=CHANGE_ME              # header x-admin-token p/ /admin/*
DEFAULT_TENANT_SLUG=default        # tenant único nesta fase

# LLM (plugável)
LLM_PROVIDER=anthropic             # anthropic | kimi | openai
LLM_MODEL=claude-opus-4-5          # livre; default por provider no factory
LLM_API_KEY=CHANGE_ME
LLM_BASE_URL=                      # opcional; kimi default https://api.moonshot.cn/v1

# Evolution API (consumido pelo provider)
EVOLUTION_API_URL=http://evolution:8080
EVOLUTION_API_KEY=CHANGE_ME        # AUTHENTICATION_API_KEY da Evolution
EVOLUTION_INSTANCE=fio

# Throttle anti-spam
SEND_MIN_INTERVAL_MS=1200          # intervalo mínimo entre envios ao mesmo contato
```

`config.ts` valida com zod e falha rápido com mensagem clara se faltar algo.

## 3. Schema Postgres (`db/migrations/0001_init.sql`)

```sql
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
```

`0002_connections.sql` (stub do roadmap — tabela vazia de intenção):

```sql
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
```

Obs: Postgres 16 tem `gen_random_uuid()` nativo — não usar extensões.

## 4. Contratos TypeScript

### 4.1 messaging/types.ts
```ts
export interface InboundMessage {
  providerName: 'evolution' | 'cloudapi';
  providerMsgId: string;
  phone: string;          // E.164 sem '+'
  pushName: string | null;
  text: string;
  fromMe: boolean;
  timestamp: Date;
}

export interface MessagingProvider {
  readonly name: string;
  parseInbound(rawBody: unknown): InboundMessage | null; // null = ignorar (grupo, status, fromMe, vazio)
  sendText(phone: string, text: string): Promise<void>;
}
```

### 4.2 llm/types.ts
```ts
export interface LLMMessage { role: 'system'|'user'|'assistant'; content: string; }
export interface LLMClient {
  complete(messages: LLMMessage[], opts?: { json?: boolean; maxTokens?: number }): Promise<string>;
}
```
- `anthropic.ts`: POST {LLM_BASE_URL||https://api.anthropic.com}/v1/messages,
  header `x-api-key`, `anthropic-version: 2023-06-01`. System vai em campo
  `system` separado. Model default `claude-opus-4-5`.
- `kimi.ts`: OpenAI-compatible chat/completions, model default `kimi-k2`,
  base `https://api.moonshot.cn/v1`.
- `openai`: tratar como caso de kimi com base `https://api.openai.com/v1` e
  model `gpt-4o`. Pode ser o mesmo arquivo com parâmetros.
- `opts.json=true` → instruir resposta JSON estrita e fazer `JSON.parse` com
  uma tentativa de reparo (extrair bloco {...} via regex) antes de falhar.

### 4.3 db/repo.ts (assinaturas exatas)
```ts
ensureTenant(slug: string): Promise<Tenant>
upsertContact(tenantId: string, phone: string, pushName: string|null): Promise<Contact>
recordMessage(contactId: string, direction: 'in'|'out', body: string, providerMsgId: string|null): Promise<void>
getRecentMessages(contactId: string, limit: number): Promise<Message[]>   // ordem cronológica
getActiveFacts(contactId: string): Promise<Fact[]>
setConsent(contactId: string): Promise<void>
insertFacts(contactId: string, facts: NewFact[]): Promise<void>           // dedup por (kind, content normalizado)
insertFollowups(contactId: string, fups: NewFollowup[]): Promise<void>
getLastOutboundAt(contactId: string): Promise<Date|null>
```

### 4.4 agent/extract.ts
```ts
export interface NewFact { kind: 'goal'|'offer'|'ask'|'context'|'next_step'; content: string; confidence?: number }
export interface NewFollowup { note: string; dueInHours: number }  // converte p/ due_at = now()+hours
export interface Extraction { facts: NewFact[]; followups: NewFollowup[]; wantsToStop?: boolean }
export async function extract(llm: LLMClient, history: Message[], latest: string): Promise<Extraction>
```
Chamada única ao LLM com `json:true`, extração silenciosa (nunca mencionada
ao usuário na resposta).

### 4.5 agent/orchestrator.ts
```ts
export async function handleInbound(msg: InboundMessage, deps: {
  pool: Pool; provider: MessagingProvider; llm: LLMClient; cfg: AppConfig;
}): Promise<void>
```
Fluxo OBRIGATÓRIO:
1. `ensureTenant(cfg.DEFAULT_TENANT_SLUG)` → `upsertContact` → `recordMessage('in')`.
2. **LGPD gate**: se `contact.consent === false` → checar se a mensagem é
   consentimento (regex `/\b(sim|ok|pode|aceito|topo|bora|quero)\b/i` curto,
   OU LLM classifica). Se não: responder UMA vez pedindo permissão pra
   "guardar o que a gente conversar e te ajudar melhor" (tom da persona) e sair.
   Se sim: `setConsent` e seguir.
3. Carregar `getRecentMessages(20)` + `getActiveFacts`.
4. `reply()` → resposta da persona (máx ~600 chars, quebrar em até 3 balões
   separados por `\n\n` → enviar como mensagens separadas).
5. **Throttle**: respeitar `SEND_MIN_INTERVAL_MS` vs `getLastOutboundAt`;
   registrar cada envio via `recordMessage('out')`.
6. Em paralelo ao envio: `extract()` → se consent: `insertFacts`,
   `insertFollowups`. Erros de extração NÃO podem quebrar a resposta
   (try/catch com log).
7. `wantsToStop` (ex.: "para", "sair") → marcar contato inativo via
   `consent=false` e responder despedida curta.

## 5. Rotas Express

- `GET /health` → `200 {ok:true}` (sem auth).
- `POST /webhook/evolution` → auth: header `x-webhook-token === WEBHOOK_TOKEN`
  senão 401. Body = payload Evolution. `provider.parseInbound` → null: 200
  `{ignored:true}`. Senão: 200 imediato e `handleInbound` assíncrono
  (fire-and-forget com catch+log).
- `GET /admin/qrcode` → auth: header `x-admin-token === ADMIN_TOKEN`. Faz
  proxy para Evolution `GET /instance/connect/{EVOLUTION_INSTANCE}` e retorna
  `{ base64 }` do QR ou `{ connected: true }`.

Payload Evolution v2 (messages.upsert) — `parseInbound` deve tolerar ambos:
```json
{ "event": "messages.upsert", "instance": "fio",
  "data": { "key": { "remoteJid": "5583...@s.whatsapp.net", "fromMe": false, "id": "ABCD" },
            "pushName": "Maria",
            "message": { "conversation": "oi" },
            "messageTimestamp": 1750000000 } }
```
- Ignorar: `fromMe=true`, `remoteJid` terminando em `@g.us` ou `status@broadcast`,
  sem texto (`conversation` | `extendedTextMessage.text` | `ephemeralMessage...`).
- Envio Evolution: `POST {EVOLUTION_API_URL}/message/sendText/{instance}`
  header `apikey: EVOLUTION_API_KEY`, body `{number, text}`.

## 6. Docker Compose (Estágio 2 — contrato)

Serviços: `db` (postgres:16-alpine, volume `pgdata`, healthcheck pg_isready),
`evolution` (atendai/evolution-api:v2.3.7, env AUTHENTICATION_API_KEY,
DATABASE_PROVIDER=postgresql apontando p/ db, porta interna 8080),
`server` (build ./server, depends_on healthy db+evolution, porta 3000 publicada
só em 127.0.0.1 se houver Caddy; caso contrário 3000).
Healthcheck do server: wget /health.

## 7. Testes (Estágio 1 — vitest, sem rede nem banco real)

- `parseInbound`: aceita conversation e extendedText; ignora fromMe, grupo,
  broadcast, vazio.
- `orchestrator`: com repo/LLM mockados — (a) sem consent pede permissão e não
  persiste facts; (b) com consent responde + persiste facts/followups;
  (c) throttle respeitado; (d) falha de extração não quebra reply;
  (e) wantsToStop revoga consent.
- `extract`: parse de JSON válido; reparo de JSON com texto em volta.
- `config`: falha com env incompleto.
- Runner de migrations: idempotente (teste com pg-mem OU documentar skip
  sem DATABASE_URL de teste — escolher o mais simples que passe).

## 8. Critérios de aceite

1. `cd server && npm ci && npm run typecheck && npm test` → verde.
2. `docker compose config` válido; `docker compose build` ok.
3. Nenhum segredo commitado; `.env*` (exceto `.env.example`) no `.gitignore`.
4. Persona: grep por termos proibidos nos prompts → zero ocorrências fora da
   lista-negra do próprio prompt.
5. README + docs/OPERACAO.md permitem a um não-dev subir a VPS e escanear o QR.
