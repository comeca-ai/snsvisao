# CLAUDE.md — instruções para sessões de IA neste repo

## O que é

Agente comercial conversacional no WhatsApp para pequenos empresários BR
("quero vender mais"). Leia o `README.md` para tese e arquitetura.

## Regras

- **Transporte é plugável**: todo código de canal vive em
  `server/src/providers/` atrás da interface `MessagingProvider`. Nunca
  espalhar chamadas ao Evolution fora do provider.
- **O valor é entregue no chat**: o agente nunca deve adiar valor para
  email/call. Isso é decisão de produto, está no prompt
  (`server/src/agent/prompt.ts`) — não "otimizar" para funil.
- **Sem disparo em massa**: nada de features de broadcast/spam. Throttle de
  envio permanece.
- LLM: Anthropic SDK TypeScript, modelo via env `AGENT_LLM_MODEL` (default
  `claude-opus-5`). Extração usa structured outputs (`messages.parse` +
  `zodOutputFormat`); contagens/limites são validados em código, não no
  schema (Anthropic rejeita `minItems`/`maxItems`/`minimum`).
- Migrations numeradas sequencialmente em `supabase/migrations/`.
- Strings do agente em pt-BR.

## Validação antes de commitar

```bash
cd server && npm run typecheck && npm test
```

## Segredos

Nunca colar segredos em chat/commits. `.env` local + painéis (Supabase,
Railway). `.env.example` documenta as variáveis.
