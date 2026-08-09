# Fio — agente comercial conversacional no WhatsApp

> Nome do produto: **Fio** ("não perde o fio da conversa"; a memória chama
> **Caderninho**). Pendente: INPI classes 35/42 + domínio (candidatos:
> fio.chat, ofio.com.br, meufio.com.br, puxaofio.com.br). O repo mantém o
> codinome `snsvisao`.

Agente de IA que conversa com pequenos empresários pelo WhatsApp, entende o
negócio deles a partir da própria conversa e os ajuda a **vender mais** —
entregando valor dentro do canal, sem formulário, sem dashboard obrigatório,
sem "me passa seu email e marcamos 15 minutos".

## A tese

1. **O CRM/grafo se preenche sozinho.** O usuário descreve o negócio em
   linguagem natural; o agente extrai fatos estruturados (objetivos, ofertas,
   necessidades, próximos passos) silenciosamente, a cada mensagem.
2. **A primeira unidade de valor chega em menos de 2 minutos, no chat.**
   Nada de adiar valor pra email/call. A conversa É o produto.
3. **O canal do pequeno é o WhatsApp.** Alertas, follow-ups e resumos chegam
   como mensagem — o dashboard é secundário.

Referência competitiva: Boardy (boardy.ai) provou a mecânica (agente
conversacional em WhatsApp oficial que constrói grafo a partir de conversa),
mas recusa profundidade no canal e não atende quem diz "quero vender mais".
Esse é o gap.

## Arquitetura

```
WhatsApp ──► Evolution API ──► POST /webhook/evolution
                                  │
                          MessagingProvider          ◄─ camada plugável:
                          (evento normalizado)          EvolutionProvider (agora)
                                  │                     CloudAPIProvider (pós-homologação)
                                  ▼
                            Orchestrator
                    ┌─────────┼──────────────┐
                    ▼         ▼              ▼
              memória     LLM (reply)   LLM (extração
            (Postgres)   estruturada)   estruturada)
                    │         │              │
                    ▼         ▼              ▼
                 facts    sendText       facts/followups
```

- **`server/`** — Node 20+, TypeScript, Express (ESM). Webhook de ingest,
  orquestrador do agente, providers de mensageria.
- **`db/migrations/`** — schema Postgres (tenants, contacts, messages,
  facts, followups, connections).
- **Transporte plugável** — a interface `MessagingProvider` isola o resto do
  sistema do canal. Migrar Evolution → Cloud API oficial = trocar um adapter.

## Decisões de produto (registradas)

- Evolution API primeiro; homologação da Cloud API oficial corre em paralelo.
- Público: pequeno empresário BR que quer vender mais. Horizontal, mas o
  onboarding gera configuração por tenant (JSONB), então cada negócio tem um
  agente calibrado pro seu contexto.
- Anti-spam por design: sem disparo em massa, throttle de envio, número
  dedicado. Isso não é ferramenta de broadcast.
- **Tudo self-hosted**: Postgres em Docker na mesma VPS. Sem dependência de
  serviço gerenciado.

## Setup (VPS dedicada Ubuntu 24.04)

```bash
curl -fsSL https://raw.githubusercontent.com/comeca-ai/snsvisao/main/scripts/setup-vps.sh | sudo bash
# ou, após clonar:
sudo bash scripts/setup-vps.sh
```

O script instala Docker, sobe a stack (Evolution API + Postgres + server) e
mostra o QR code para conectar o número. Detalhes em `docs/OPERACAO.md`.

## Setup (desenvolvimento local)

```
cd server
npm install
cp .env.example .env   # preencher; nunca commitar segredos
npm run dev
```

Aplicar migrations em `db/migrations/`, em ordem (ou `docker compose up db`
+ `npm run migrate`).

## Features fundidas (merge da linha remota)

- **Setup da Evolution via navegador** — `GET /dev/evolution/setup?token=<ADMIN_TOKEN>`
  serve uma página com o QR atual, estado da conexão e auto-refresh a cada
  10s (instruções PT-BR: WhatsApp → Aparelhos conectados → escanear).
- **Provider CloudAPI (stub p/ homologação)** — `server/src/messaging/cloudapi.ts`
  já implementa `parseInbound`/`sendText` no formato oficial da Meta. Ative
  com `MESSAGING_PROVIDER=cloudapi` + `CLOUDAPI_TOKEN`/`CLOUDAPI_PHONE_ID`
  (sem essas vars, o factory lança "não configurado").
- **`deploy/evolution/`** — stack standalone da Evolution API (compose +
  passo a passo) para rodar o canal WhatsApp numa máquina separada
  (alternativa ao serviço `evolution` do docker-compose all-in-one da raiz
  e ao Supabase). Mantida da linha remota, junto com `supabase/migrations/`
  (legado/referência — o schema canônico é `db/migrations/`).

## Canal web

O Fio também conversa pelo navegador: `web/` é uma interface de chat
(template Vercel ai-chatbot adaptado, PT-BR) que sobe em `:3001` e fala com
o mesmo cérebro do WhatsApp via `POST /webchat/message` (server-to-server) —
mesma persona, mesma memória (Caderninho), mesmo gate LGPD e throttle. O
browser nunca chama o server direto: a rota de API do Next.js repassa a
mensagem com o `WEBHOOK_TOKEN`. Deploy e operação em `docs/OPERACAO.md`.

### Evolution API

Aponte o webhook da instância para `POST {BASE_URL}/webhook/evolution` com o
header `x-webhook-token: $WEBHOOK_TOKEN`, evento `messages.upsert`.
(O `scripts/setup-vps.sh` já faz isso automaticamente.)

## Validação antes de commitar

```
cd server && npm run typecheck && npm test
```

## Roadmap curto

- Fundação: webhook, provider Evolution, agente com memória, extração ✅
- LGPD: consentimento explícito antes de memorizar (gate no orquestrador) ✅
- Onboarding conversacional → gera `business_profile` do tenant
- **Análise de presença digital no chat**: agente com web fetch analisa o
  site/Instagram da pessoa e devolve diagnóstico comercial na hora
  (validado no benchmark: é o momento de maior valor percebido)
- **Motor de conexões**: cruzar `facts` kind=ask ↔ kind=offer entre
  contatos e propor apresentações double opt-in (tabela `connections`)
- Worker de follow-ups (cron: varre `followups` vencidos e avisa o dono)
- Enriquecimento prévio do contato (chegar sabendo quem é)
- `CloudAPIProvider` (pós-homologação Meta)
- Painel mínimo (kanban + timeline) — só depois do loop de conversa provado
