#!/bin/bash
# ─── RadioStation Backend - start.sh ─────────────────────────────────────────
echo "=== RadioStation Backend ==="
cd "$(dirname "$0")"

# Crear venv si no existe
if [ ! -d "venv" ]; then
    echo "[1/5] Creando entorno virtual..."
    python3 -m venv venv
fi

source venv/bin/activate

echo "[2/5] Instalando dependencias..."
pip install -r requirements.txt -q

echo "[3/5] Aplicando migraciones..."
python manage.py makemigrations --run-syncdb 2>/dev/null
python manage.py migrate --run-syncdb 2>/dev/null

echo "[4/5] Creando usuario admin..."
python manage.py create_admin 2>/dev/null

echo "[5/5] Creando directorio de media..."
mkdir -p media/tracks

echo ""
echo "=== Iniciando servidor en puerto 8001 ==="
# Usamos daphne para soportar HTTP + WebSockets via ASGI
# El túnel de Cloudflare apunta a localhost:8001
exec daphne -b 0.0.0.0 -p 8001 radiostation.asgi:application
