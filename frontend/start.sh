#!/bin/bash
# ─── RadioStation Frontend - start.sh ────────────────────────────────────────
echo "=== RadioStation Frontend ==="
cd "$(dirname "$0")"

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js no está instalado."
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "Instalando dependencias npm (primera vez, puede tardar)..."
    npm install
fi

echo ""
echo "=== Iniciando frontend en puerto 3000 ==="
echo "    Acceso local:  http://localhost:3000"
echo "    Acceso red:    http://192.168.100.143:3000"
echo "    Producción:    https://xhcdmx.org"
echo ""
npm start
