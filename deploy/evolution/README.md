# Evolution API na DigitalOcean — passo a passo

O cérebro do Fio continua no Railway; esta stack roda só o canal WhatsApp
(Evolution v2 + Postgres + Redis) na sua máquina.

## 1. Subir a stack

```bash
# na máquina DO (precisa de Docker + Docker Compose plugin)
mkdir -p ~/fio-evolution && cd ~/fio-evolution
# copie docker-compose.yml e .env.example desta pasta do repo
cp .env.example .env    # e preencha os 3 valores
docker compose up -d
docker compose logs -f evolution   # aguardar "HTTP - ON: 8080"
```

Firewall (recomendado): libere a porta 8080 apenas se necessário
(`ufw allow 8080/tcp`) — a chave `AUTHENTICATION_API_KEY` protege a API,
mas se tiver domínio, prefira colocar um Caddy/Nginx com HTTPS na frente.

## 2. Criar a instância e conectar o chip de teste

```bash
# criar instância "principal"
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: $AUTHENTICATION_API_KEY" \
  -H "content-type: application/json" \
  -d '{"instanceName": "principal", "integration": "WHATSAPP-BAILEYS", "qrcode": true}'
```

A resposta traz o QR code (base64). Alternativa visual: abrir o manager em
`http://SEU_IP:8080/manager` e escanear por lá. **Use um chip dedicado de
teste, nunca número pessoal.**

## 3. Apontar o webhook para o cérebro (Railway)

```bash
curl -X POST http://localhost:8080/webhook/set/principal \
  -H "apikey: $AUTHENTICATION_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "webhook": {
      "enabled": true,
      "url": "https://server-production-d1a1.up.railway.app/webhook/evolution",
      "headers": { "x-webhook-token": "VALOR_DO_WEBHOOK_TOKEN_DO_RAILWAY" },
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

## 4. Fechar o circuito no Railway

No serviço `server` do Railway, preencher:

- `EVOLUTION_API_URL` = `http://SEU_IP:8080` (ou o domínio com HTTPS)
- `EVOLUTION_API_KEY` = o `AUTHENTICATION_API_KEY` do passo 1
- `EVOLUTION_INSTANCE` = `principal`

Pronto: mensagem no chip de teste → webhook → Fio responde.

## Manutenção

- Atualizar: `docker compose pull && docker compose up -d`
- Backup do que importa: volumes `evolution_pg` e `evolution_instances`
  (a memória do produto — Caderninho — vive no Supabase, não aqui;
  perder esta máquina significa reconectar o número, não perder dados).
