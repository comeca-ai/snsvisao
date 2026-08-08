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
            (Supabase)   Claude Opus 5   estruturada)
                    │         │              │
                    ▼         ▼              ▼
                 facts    sendText       facts/followups
```

- **`server/`** — Node 20+, TypeScript, Express (ESM). Webhook de ingest,
  orquestrador do agente, providers de mensageria.
- **`supabase/migrations/`** — schema Postgres (tenants, contacts, messages,
  facts, followups).
- **Transporte plugável** — a interface `MessagingProvider` isola o resto do
  sistema do canal. Migrar Evolution → Cloud API oficial = trocar um adapter.

## Decisões de produto (registradas)

- Evolution API primeiro; homologação da Cloud API oficial corre em paralelo.
- Público: pequeno empresário BR que quer vender mais. Horizontal, mas o
  onboarding gera configuração por tenant (JSONB), então cada negócio tem um
  agente calibrado pro seu contexto.
- Anti-spam por design: sem disparo em massa, throttle de envio, número
  dedicado. Isso não é ferramenta de broadcast.

## Setup

```bash
cd server
npm install
cp ../.env.example .env   # preencher no painel, nunca commitar segredos
npm run dev
```

Aplicar migrations no Supabase (SQL editor ou CLI) a partir de
`supabase/migrations/`, em ordem.

### Evolution API

Aponte o webhook da instância para `POST {BASE_URL}/webhook/evolution` com o
header `x-webhook-token: $WEBHOOK_TOKEN`, evento `messages.upsert`.

## Validação antes de commitar

```bash
cd server && npm run typecheck && npm test
```

## Roadmap curto

- [x] Fundação: webhook, provider Evolution, agente com memória, extração
- [x] LGPD: consentimento explícito antes de memorizar (gate no orquestrador)
- [ ] Onboarding conversacional → gera `business_profile` do tenant
- [ ] **Análise de presença digital no chat**: agente com web fetch analisa o
      site/Instagram da pessoa e devolve diagnóstico comercial na hora
      (validado no benchmark: é o momento de maior valor percebido)
- [ ] **Motor de conexões**: cruzar `facts` kind=ask ↔ kind=offer entre
      contatos e propor apresentações double opt-in (tabela `connections`)
- [ ] Worker de follow-ups (cron: varre `followups` vencidos e avisa o dono)
- [ ] Enriquecimento prévio do contato (chegar sabendo quem é)
- [ ] `CloudAPIProvider` (pós-homologação Meta)
- [ ] Painel mínimo (kanban + timeline) — só depois do loop de conversa provado
