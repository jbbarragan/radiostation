#!/bin/bash
# RadioStation - Start both backend and frontend

echo "╔══════════════════════════════════════╗"
echo "║         RadioStation v1.0            ║"
echo "║   Lightweight Broadcast Manager      ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Kill background jobs on exit
trap 'kill $(jobs -p) 2>/dev/null' EXIT

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Start backend
echo "[1/2] Starting Django backend..."
cd "$ROOT_DIR/backend"

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt -q
python manage.py makemigrations --run-syncdb 2>/dev/null
python manage.py migrate --run-syncdb 2>/dev/null
python manage.py create_admin 2>/dev/null
mkdir -p media/tracks
python manage.py runserver 0.0.0.0:8000 &
BACKEND_PID=$!

# Wait for backend to be ready
echo "Waiting for backend..."
for i in $(seq 1 20); do
    if curl -s http://localhost:8000/api/auth/login/ -o /dev/null 2>&1; then
        break
    fi
    sleep 1
done

# Start frontend
echo "[2/2] Starting React frontend..."
cd "$ROOT_DIR/frontend"

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Install from https://nodejs.org"
    kill $BACKEND_PID
    exit 1
fi

if [ ! -d "node_modules" ]; then
    echo "Installing npm packages (first run, may take a minute)..."
    npm install
fi

npm start &
FRONTEND_PID=$!

echo ""
echo "═══════════════════════════════════════"
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:3000"
echo "  Login:    admin / admin"
echo "═══════════════════════════════════════"
echo "Press Ctrl+C to stop all services"
echo ""

wait
