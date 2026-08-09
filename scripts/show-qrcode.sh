#!/usr/bin/env bash
# =============================================================
# show-qrcode.sh — exibe o QR code para conectar o WhatsApp
#
# Rode na VPS (como root ou usuario com acesso ao docker):
#   bash scripts/show-qrcode.sh
#
# Comportamento:
#   - Se o numero JA estiver conectado: avisa e sai.
#   - Se houver QR pendente: salva o PNG em /tmp/fio-qrcode.png e
#     tenta exibir no terminal (qrencode, se instalado). Caso
#     contrario, instrui como abrir o PNG ou usar /admin/qrcode.
# =============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

if [ -f .env ]; then
  set -a; source .env; set +a
fi
# shellcheck source=lib-evolution.sh
source "${SCRIPT_DIR}/scripts/lib-evolution.sh"

INSTANCE="${EVOLUTION_INSTANCE:-fio}"
QR_PNG="/tmp/fio-qrcode.png"

echo "==> Consultando a instancia '${INSTANCE}' na Evolution API..."

state="$(evo_connection_state || true)"
if [ "$state" = "open" ]; then
  echo ""
  echo "Numero conectado! A instancia '${INSTANCE}' ja esta ativa no WhatsApp."
  echo "Nao e preciso escanear QR code."
  exit 0
fi

resp="$(evo_get_qrcode)"
base64_data="$(printf '%s' "$resp" | evo_extract_base64 || true)"
pairing_code="$(printf '%s' "$resp" | evo_extract_pairing_code || true)"

if [ -z "$base64_data" ] && [ -z "$pairing_code" ]; then
  echo ""
  echo "Nao veio QR code da Evolution API (estado atual: ${state:-desconhecido})."
  echo "Possiveis causas: instancia recem-criada ainda inicializando, ou ja conectada."
  echo "Tente de novo em alguns segundos: bash scripts/show-qrcode.sh"
  exit 1
fi

if [ -n "$base64_data" ]; then
  # Remove o prefixo "data:image/png;base64," e grava o PNG
  printf '%s' "$base64_data" | sed 's/^data:image\/png;base64,//' | base64 -d > "$QR_PNG"
  echo ""
  echo "QR code salvo em: ${QR_PNG}"
fi

if [ -n "$pairing_code" ]; then
  echo "Codigo de pareamento (8 digitos): ${pairing_code}"
fi

echo ""
if command -v qrencode > /dev/null 2>&1 && [ -n "$pairing_code" ]; then
  echo "QR no terminal (se nao renderizar bem, use o PNG):"
  qrencode -t ANSIUTF8 "$pairing_code"
elif command -v qrencode > /dev/null 2>&1 && [ -n "$base64_data" ]; then
  # Sem pairing code: desenha um QR auxiliar com o caminho do PNG nao ajuda;
  # neste caso instruimos a abrir o arquivo mesmo.
  echo "Dica: instale/leia o PNG abaixo — o qrencode nao renderiza imagens prontas."
fi

cat <<EOF

Como escanear:
  1. No celular do numero DEDICADO: WhatsApp > Aparelhos conectados >
     Conectar aparelho.
  2. Aponte a camera para o QR code.

Se o QR nao apareceu no terminal, voce tem duas opcoes:

  a) Trazer o PNG para o seu computador e abrir:
       scp root@IP_DA_VPS:${QR_PNG} .

  b) Via navegador, com port-forward SSH:
       ssh -L 3000:localhost:3000 root@IP_DA_VPS
     e entao, no seu computador:
       curl -s -H "x-admin-token: \${ADMIN_TOKEN:-SEU_ADMIN_TOKEN}" \\
         http://localhost:3000/admin/qrcode
     (o ADMIN_TOKEN esta em ${SCRIPT_DIR}/.env)

Dica: para desenhar o QR no terminal na proxima vez:
       apt-get install -y qrencode
EOF
