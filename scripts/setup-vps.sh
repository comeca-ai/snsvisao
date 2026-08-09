#!/usr/bin/env bash
# =============================================================
# setup-vps.sh — provisiona uma VPS Ubuntu 24.04 limpa com o Fio
#
# Rode como ROOT, de dentro do clone do repositorio:
#   sudo bash scripts/setup-vps.sh
#
# O que ele faz:
#   1. Instala Docker + plugin docker compose (apt, repos do Ubuntu)
#   2. Cria /opt/fio e copia o repositorio para la
#   3. Gera /opt/fio/.env a partir do .env.example com segredos aleatorios
#   4. Pergunta interativamente o provedor/chave/modelo de LLM
#   5. Sobe a stack: docker compose up -d --build
#   6. Espera a Evolution API ficar saudavel
#   7. Cria a instancia do WhatsApp com o webhook configurado
#   8. Imprime as instrucoes finais (QR code, logs)
#
# IDEMPOTENTE: rodar de novo nao quebra nada. Se /opt/fio/.env ja
# existir, os segredos NAO sao regenerados (mudar POSTGRES_PASSWORD
# com o volume pgdata ja populado quebraria a autenticacao do banco).
# =============================================================
set -euo pipefail

FIO_DIR="/opt/fio"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log()  { echo ""; echo "==> $*"; }
ok()   { echo "    [OK] $*"; }
warn() { echo "    [ATENCAO] $*"; }

# ---------- 0. Pre-requisitos ----------
if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: rode como root (ex.: sudo bash scripts/setup-vps.sh)." >&2
  exit 1
fi

log "1/7 Instalando Docker e plugin docker compose..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl openssl tar docker.io docker-compose-v2 > /dev/null
systemctl enable --now docker > /dev/null
ok "Docker instalado: $(docker --version)"
ok "Compose: $(docker compose version)"

# ---------- 2. /opt/fio ----------
log "2/7 Preparando ${FIO_DIR}..."
mkdir -p "$FIO_DIR"
if [ "$SCRIPT_DIR" != "$FIO_DIR" ]; then
  # Copia o repo sem o .git e sem um eventual .env local (segredos nao viajam)
  tar -C "$SCRIPT_DIR" --exclude=.git --exclude=.env --exclude=node_modules --exclude=dist -cf - . | tar -C "$FIO_DIR" -xf -
  ok "Repositorio copiado de ${SCRIPT_DIR} para ${FIO_DIR}"
else
  ok "Script ja esta rodando de dentro de ${FIO_DIR}; nada a copiar"
fi
cd "$FIO_DIR"

# ---------- 3. .env ----------
log "3/7 Configurando ${FIO_DIR}/.env..."
gen_secret() { openssl rand -hex 24; }

if [ -f .env ]; then
  ok ".env ja existe — segredos preservados (idempotente)"
else
  POSTGRES_PASSWORD="$(gen_secret)"
  WEBHOOK_TOKEN="$(gen_secret)"
  ADMIN_TOKEN="$(gen_secret)"
  EVOLUTION_API_KEY="$(gen_secret)"
  sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" \
      -e "s|^DATABASE_URL=.*|DATABASE_URL=postgres://fio:${POSTGRES_PASSWORD}@db:5432/fio|" \
      -e "s|^WEBHOOK_TOKEN=.*|WEBHOOK_TOKEN=${WEBHOOK_TOKEN}|" \
      -e "s|^ADMIN_TOKEN=.*|ADMIN_TOKEN=${ADMIN_TOKEN}|" \
      -e "s|^EVOLUTION_API_KEY=.*|EVOLUTION_API_KEY=${EVOLUTION_API_KEY}|" \
      .env.example > .env
  chmod 600 .env
  ok ".env gerado com senhas e tokens aleatorios (openssl rand -hex 24)"
fi

# ---------- 4. LLM (interativo) ----------
log "4/7 Configurando o provedor de IA (LLM)..."
if grep -q '^LLM_API_KEY=CHANGE_ME' .env; then
  if [ -t 0 ]; then
    read -rp "    Provedor de LLM (anthropic | kimi | openai) [anthropic]: " llm_provider
    llm_provider="${llm_provider:-anthropic}"
    read -rp "    Modelo [claude-opus-4-5]: " llm_model
    llm_model="${llm_model:-claude-opus-4-5}"
    read -rp "    Chave de API do LLM: " llm_key
    if [ -z "$llm_key" ]; then
      warn "Chave vazia — edite LLM_API_KEY em ${FIO_DIR}/.env antes de usar."
    else
      sed -i -e "s|^LLM_PROVIDER=.*|LLM_PROVIDER=${llm_provider}|" \
             -e "s|^LLM_MODEL=.*|LLM_MODEL=${llm_model}|" \
             -e "s|^LLM_API_KEY=.*|LLM_API_KEY=${llm_key}|" .env
      ok "LLM configurado: provider=${llm_provider} model=${llm_model}"
    fi
  else
    warn "Sem terminal interativo: edite LLM_PROVIDER/LLM_API_KEY/LLM_MODEL em ${FIO_DIR}/.env"
  fi
else
  ok "LLM_API_KEY ja configurada no .env"
fi

# ---------- 5. Sobe a stack ----------
log "5/7 Subindo a stack (docker compose up -d --build)..."
docker compose up -d --build
ok "Containers iniciados:"
docker compose ps

# ---------- 6. Espera a Evolution ficar saudavel ----------
log "6/7 Aguardando a Evolution API ficar saudavel..."
attempts=0
max_attempts=60   # ~3 min (60 x 3s)
while true; do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' fio-evolution 2>/dev/null || true)"
  if [ "$status" = "healthy" ]; then
    ok "Evolution API saudavel"
    break
  fi
  attempts=$((attempts + 1))
  if [ "$attempts" -ge "$max_attempts" ]; then
    echo "ERRO: Evolution API nao ficou saudavel a tempo. Veja: docker compose logs evolution" >&2
    exit 1
  fi
  echo "    ... status atual: ${status:-iniciando} (${attempts}/${max_attempts})"
  sleep 3
done

# ---------- 7. Cria a instancia com webhook ----------
log "7/7 Criando/configurando a instancia do WhatsApp..."
set -a; source .env; set +a
# shellcheck source=lib-evolution.sh
source "${FIO_DIR}/scripts/lib-evolution.sh"
evo_create_instance

# ---------- Instrucoes finais ----------
cat <<EOF

=============================================================
  Fio instalado com sucesso!
=============================================================

Proximo passo: conectar o numero de WhatsApp dedicado.

  bash ${FIO_DIR}/scripts/show-qrcode.sh

Depois escaneie o QR code no celular do numero dedicado:
  WhatsApp > Aparelhos conectados > Conectar aparelho

Comandos uteis:
  cd ${FIO_DIR}
  docker compose ps                  # status dos servicos
  docker compose logs -f server      # logs do agente
  docker compose logs -f evolution   # logs do WhatsApp
  bash scripts/show-qrcode.sh        # reexibir QR / status da conexao

Seu ADMIN_TOKEN (guarde com cuidado) esta em ${FIO_DIR}/.env
EOF
