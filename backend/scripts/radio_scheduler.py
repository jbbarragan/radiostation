#!/usr/bin/env python3
"""
radio_scheduler.py – Daemon que corre junto al backend Django.
Cada 10 segundos revisa si hay un show programado activo en la BD.
- Si hay show activo: escribe state="show", genera playlist m3u
- Si no hay show y hay archivos backup: escribe state="backup"
- Si no hay nada: escribe state="off"

Corre en la raspi como: python3 radio_scheduler.py
"""
import os
import sys
import time
import django
import logging
from datetime import datetime, timezone as tz
from pathlib import Path

# ── Configurar Django ──────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "radiostation.settings")
django.setup()

from api.models import Show

# ── Rutas ──────────────────────────────────────────────────────────
STATE_FILE   = "/tmp/radio_state"
PLAYLIST_FILE= "/tmp/scheduled_playlist.m3u"
BACKUP_DIR   = "/home/radioadmin/radiostation-fixed/backup"
MEDIA_ROOT   = str(BASE_DIR / "media")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [scheduler] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("/home/radioadmin/radiostation-fixed/logs/scheduler.log"),
    ]
)
log = logging.getLogger(__name__)

last_state = None

def write_state(state: str):
    global last_state
    with open(STATE_FILE, "w") as f:
        f.write(state)
    if state != last_state:
        log.info(f"Estado → {state}")
        last_state = state

def has_backup_files() -> bool:
    bd = Path(BACKUP_DIR)
    if not bd.exists():
        return False
    return any(bd.glob("*.mp3")) or any(bd.glob("*.ogg")) or any(bd.glob("*.flac"))

def expire_stale_live_shows():
    """Apaga is_live en shows cuyo end_time ya pasó."""
    now = datetime.now(tz.utc)
    stale = Show.objects.filter(is_live=True, end_time__lt=now)
    count = stale.count()
    if count:
        stale.update(is_live=False)
        log.info(f"Auto-apagado is_live en {count} show(s) expirado(s)")


def get_active_show():
    """Devuelve el show activo ahora mismo (por tiempo o marcado is_live)."""
    now = datetime.now(tz.utc)
    # Primero expira shows viejos marcados como live
    expire_stale_live_shows()
    # Busca show marcado manualmente como live Y dentro de su horario
    show = Show.objects.filter(is_live=True, end_time__gte=now).first()
    if show:
        return show, "live"
    # Luego busca show programado por tiempo
    show = Show.objects.filter(
        start_time__lte=now,
        end_time__gte=now
    ).first()
    if show:
        return show, "scheduled"
    return None, None

def write_playlist(show):
    """Genera un archivo .m3u con los tracks del show."""
    tracks = show.show_items.select_related("track").order_by("position")
    lines = ["#EXTM3U"]
    for item in tracks:
        track = item.track
        path = os.path.join(MEDIA_ROOT, str(track.file))
        if os.path.exists(path):
            lines.append(f"#EXTINF:{int(track.duration)},{track.artist} - {track.title}")
            lines.append(path)
    with open(PLAYLIST_FILE, "w") as f:
        f.write("\n".join(lines) + "\n")
    log.info(f"Playlist generada: {len(lines)//2} tracks para show '{show.title}'")

def create_empty_playlist():
    """Crea playlist vacía (liquidsoap la manejará con mksafe → silencio)."""
    with open(PLAYLIST_FILE, "w") as f:
        f.write("#EXTM3U\n")

# ── Crear directorios necesarios ───────────────────────────────────
Path("/home/radioadmin/radiostation-fixed/logs").mkdir(parents=True, exist_ok=True)
Path(BACKUP_DIR).mkdir(parents=True, exist_ok=True)

log.info("Radio Scheduler iniciado")

while True:
    try:
        show, mode = get_active_show()
        if show:
            write_playlist(show)
            write_state("show")
        elif has_backup_files():
            create_empty_playlist()
            write_state("backup")
        else:
            create_empty_playlist()
            write_state("off")
    except Exception as e:
        log.error(f"Error en scheduler: {e}")

    time.sleep(10)
