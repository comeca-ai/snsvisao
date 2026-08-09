#!/usr/bin/env bash
# =============================================================
# show-qrcode.sh — exibe o QR code para conectar o WhatsApp
#
# Rode na VPS (como root ou usuario com acesso ao docker):
#   bash scripts/show-qrcode.sh
#
# Comportamento:
#   - Se o numero JA estiver conectado: avisa e sai.
#   - Se houver QR (base64) pendente: salva o PNG em /tmp/fio-qrcode.png
#     e instrui como abrir o PNG ou usar /admin/qrcode.
#   - Se houver APENAS codigo de pareamento (8 digitos): exibe o codigo
#     em texto e instrui o fluxo "Conectar com numero de telefone".
#     (O codigo NAO e um QR escaneavel — nao adianta desenha-lo.)
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

  cat <<EOF

Como escanear:
  1. No celular do numero DEDICADO: WhatsApp > Aparelhos conectados >
     Conectar aparelho.
  2. Aponte a camera para o QR code.

Como o QR nao cabe no terminal, voce tem duas opcoes:

  a) Trazer o PNG para o seu computador e abrir:
       scp root@IP_DA_VPS:${QR_PNG} .

  b) Via navegador, com port-forward SSH:
       ssh -L 3000:localhost:3000 root@IP_DA_VPS
     e entao, no seu computador:
       curl -s -H "x-admin-token: \${ADMIN_TOKEN:-SEU_ADMIN_TOKEN}" \\
         http://localhost:3000/admin/qrcode
     (o ADMIN_TOKEN esta em ${SCRIPT_DIR}/.env)
EOF
elif [ -n "$pairing_code" ]; then
  # SEM base64: NAO desenhar QR ASCII do codigo — o pairing code nao e
  # um QR escaneavel; ele se DIGITA no WhatsApp.
  cat <<EOF

=============================================================
  Codigo de pareamento:  ${pairing_code}
=============================================================

Como conectar usando o codigo (sem QR code):
  1. No celular do numero DEDICADO: WhatsApp > Aparelhos conectados >
     Conectar aparelho.
  2. Toque em "Conectar com numero de telefone" (abaixo do QR code).
  3. Digite o codigo de 8 digitos acima.
EOF
fi
