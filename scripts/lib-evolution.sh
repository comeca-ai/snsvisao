#!/usr/bin/env bash
# =============================================================
# lib-evolution.sh — helpers curl para a Evolution API v2 (Fio)
#
# Uso:
#   set -a; source .env; set +a
#   source scripts/lib-evolution.sh
#
# Variaveis esperadas (do .env da raiz):
#   EVOLUTION_API_KEY   chave mestra (AUTHENTICATION_API_KEY)
#   EVOLUTION_INSTANCE  nome da instancia (default: fio)
#   WEBHOOK_TOKEN       token enviado no header x-webhook-token
#
# A Evolution NAO publica porta no host (so rede interna do compose).
# Por isso evo_api tenta, nesta ordem:
#   1. curl local em http://localhost:8080 (port-forward ou bind local);
#   2. container descartavel (curlimages/curl) na rede interna do compose.
# =============================================================

EVO_LOCAL_URL="${EVO_LOCAL_URL:-http://localhost:8080}"
EVO_INTERNAL_URL="${EVO_INTERNAL_URL:-http://evolution:8080}"
EVO_CURL_IMAGE="${EVO_CURL_IMAGE:-curlimages/curl:8.10.1}"
EVO_WEBHOOK_URL="${EVO_WEBHOOK_URL:-http://server:3000/webhook/evolution}"

# Descobre a rede docker onde o container da Evolution esta ligado.
_evo_detect_network() {
  local cid net
  cid="$(docker ps -q --filter name=fio-evolution 2>/dev/null | head -n1)"
  if [ -z "$cid" ]; then
    cid="$(docker ps -aq --filter name=fio-evolution 2>/dev/null | head -n1)"
  fi
  if [ -n "$cid" ]; then
    net="$(docker inspect -f '{{range $k, $_ := .NetworkSettings.Networks}}{{println $k}}{{end}}' "$cid" 2>/dev/null | head -n1)"
  fi
  printf '%s' "$net"
}

# evo_api <METODO> <PATH> [JSON_BODY]
# Faz uma chamada autenticada na Evolution API e imprime o corpo da resposta.
evo_api() {
  local method="$1" path="$2" body="${3:-}"
  : "${EVOLUTION_API_KEY:?EVOLUTION_API_KEY nao definida (carregue o .env)}"

  if curl -fsS -m 2 -o /dev/null "${EVO_LOCAL_URL}/" 2>/dev/null; then
    # Acesso direto (porta local disponivel: port-forward ou bind 127.0.0.1)
    if [ -n "$body" ]; then
      curl -fsS -X "$method" \
        -H "apikey: ${EVOLUTION_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "$body" \
        "${EVO_LOCAL_URL}${path}"
    else
      curl -fsS -X "$method" \
        -H "apikey: ${EVOLUTION_API_KEY}" \
        "${EVO_LOCAL_URL}${path}"
    fi
  else
    # Sem porta local: usa container descartavel na rede interna do compose
    local net
    net="$(_evo_detect_network)"
    if [ -z "$net" ]; then
      echo "ERRO: Evolution inalcancavel (sem porta local e container fio-evolution nao encontrado)." >&2
      return 1
    fi
    docker run --rm --network "$net" \
      -e EVO_METHOD="$method" \
      -e EVO_APIKEY="$EVOLUTION_API_KEY" \
      -e EVO_URL="${EVO_INTERNAL_URL}${path}" \
      -e EVO_BODY="$body" \
      "$EVO_CURL_IMAGE" \
      sh -c 'if [ -n "$EVO_BODY" ]; then
               curl -fsS -X "$EVO_METHOD" -H "apikey: $EVO_APIKEY" -H "Content-Type: application/json" -d "$EVO_BODY" "$EVO_URL";
             else
               curl -fsS -X "$EVO_METHOD" -H "apikey: $EVO_APIKEY" "$EVO_URL";
             fi'
  fi
}

# evo_create_instance
# Cria a instancia do WhatsApp (idempotente) e garante o webhook apontando
# para o server com o header x-webhook-token e o evento MESSAGES_UPSERT.
evo_create_instance() {
  local instance="${EVOLUTION_INSTANCE:-fio}"
  : "${WEBHOOK_TOKEN:?WEBHOOK_TOKEN nao definido (carregue o .env)}"

  if evo_api GET "/instance/fetchInstances" | grep -q "\"instanceName\"[[:space:]]*:[[:space:]]*\"${instance}\""; then
    echo "Instancia '${instance}' ja existe — reconfigurando apenas o webhook."
  else
    echo "Criando instancia '${instance}'..."
    evo_api POST "/instance/create" "{
      \"instanceName\": \"${instance}\",
      \"integration\": \"WHATSAPP-BAILEYS\",
      \"qrcode\": true
    }" > /dev/null
  fi

  echo "Configurando webhook -> ${EVO_WEBHOOK_URL} (evento MESSAGES_UPSERT)..."
  evo_api POST "/webhook/set/${instance}" "{
    \"enabled\": true,
    \"url\": \"${EVO_WEBHOOK_URL}\",
    \"webhookByEvents\": false,
    \"webhookBase64\": false,
    \"headers\": { \"x-webhook-token\": \"${WEBHOOK_TOKEN}\" },
    \"events\": [\"MESSAGES_UPSERT\"]
  }" > /dev/null
  echo "Webhook configurado com sucesso."
}

# evo_get_qrcode
# Imprime o JSON bruto de GET /instance/connect/{instance}.
# Use evo_extract_base64 / evo_extract_pairing_code para extrair campos.
evo_get_qrcode() {
  local instance="${EVOLUTION_INSTANCE:-fio}"
  evo_api GET "/instance/connect/${instance}"
}

# Extrai um campo string simples de um JSON (sem depender de jq).
_evo_json_field() {
  sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n1
}

# evo_extract_base64 — le o JSON do connect na stdin, imprime o base64 (ou nada).
evo_extract_base64() { _evo_json_field "base64"; }

# evo_extract_pairing_code — idem para o pairingCode (ou nada).
evo_extract_pairing_code() { _evo_json_field "pairingCode"; }

# evo_connection_state
# Imprime o estado da conexao da instancia: open | close | connecting.
evo_connection_state() {
  local instance="${EVOLUTION_INSTANCE:-fio}"
  evo_api GET "/instance/connectionState/${instance}" | _evo_json_field "state"
}
