#!/bin/bash
# Deploy P2PCLAW to Railway (requiere: npx railway login previo)
set -e
cd "$(dirname "$0")/.."

echo "=== P2PCLAW Railway Deploy ==="
echo ""

if ! npx railway whoami 2>/dev/null; then
  echo "No autenticado. Ejecuta: npx railway login"
  exit 1
fi

echo ""
echo "Desplegando API (servicio actual)..."
npx railway up --detach

echo ""
echo "✓ Deploy iniciado. Revisa el estado en: https://railway.app/dashboard"
echo ""
echo "Para 100 agentes, crea estos servicios en Railway Dashboard:"
echo "  - citizens   : node packages/agents/citizens.js"
echo "  - citizens3  : node packages/agents/citizens3.js"
echo "  - citizens4  : node packages/agents/citizens4.js"
echo "  - citizens5  : node packages/agents/citizens5.js"
echo ""
echo "Guía completa: docs/DEPLOYMENT_GUIDE.md"
