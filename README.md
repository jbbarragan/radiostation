# RadioStation

A lightweight broadcast management system — a modern, efficient alternative to LibreTime.

## Features

- **Calendar** — Day / Week / Month views with 30-min slots (configurable)
- **Schedule Shows** — Instantly or at a specific time; support for daily, weekly, monthly and custom repeat
- **Show Content** — Assign individual tracks or entire playlists to scheduled shows
- **Fill Meter** — Visual indicator of how much of a show's time is filled with content
- **Live Broadcasting** — Go Live button; listen from the web while audio plays on your Raspberry Pi
- **Tracks** — Upload and manage audio files with metadata detection
- **Playlists** — Organize tracks into reusable playlists
- **Analytics** — Show history, most-played tracks, and weekly charts
- **Settings** — Station name, timezone, slot size, stream URL

## Stack

- **Backend**: Django 4.2 + Django REST Framework + SQLite
- **Frontend**: React 18 + Zustand + React Query + Recharts
- **Real-time**: Django Channels (WebSocket)

---

## Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+

### One-command startup

```bash
chmod +x start.sh backend/start.sh frontend/start.sh
./start.sh
```

Then open http://localhost:3000 and log in with **admin / admin**.

---

### Manual startup (two terminals)

**Terminal 1 — Backend:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py create_admin
python manage.py runserver
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm install
npm start
```

---

## Raspberry Pi / Icecast Setup

RadioStation is designed to work with Icecast2 + Liquidsoap on a Raspberry Pi for actual audio streaming.

```bash
# On Raspberry Pi
sudo apt update
sudo apt install icecast2 liquidsoap

# Configure /etc/icecast2/icecast.xml with your passwords
# Then point Liquidsoap at your schedule API endpoint
```

In Settings, set:
- **Stream URL** — the public Icecast URL (e.g. `http://your-pi:8000/stream`)
- **Stream Output URL** — source password URL for Liquidsoap push

---

## Project Structure

```
radiostation/
├── backend/
│   ├── radiostation/       Django project settings
│   ├── api/                Models, views, serializers, URLs
│   ├── manage.py
│   ├── requirements.txt
│   └── start.sh
├── frontend/
│   ├── src/
│   │   ├── api/            Axios client
│   │   ├── components/     Layout, modals
│   │   ├── pages/          Calendar, Tracks, Playlists, Settings, Analytics
│   │   └── store/          Zustand auth store
│   ├── public/
│   ├── package.json
│   └── start.sh
├── start.sh                Launches both services
└── README.md
```

---

## Default Credentials

| Username | Password |
|----------|----------|
| admin    | admin    |

Change the password in Django admin at `http://localhost:8000/admin`.
