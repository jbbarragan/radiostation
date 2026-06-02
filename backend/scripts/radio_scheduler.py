#!/usr/bin/env python3
import os, sys, time, django, logging, random
from datetime import datetime, timezone as tz
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "radiostation.settings")
django.setup()

from api.models import Show

PLAYLIST_FILE = "/tmp/radio_playlist.m3u"
BACKUP_DIR    = "/home/radioadmin/radiostation-fixed/backup"
MEDIA_ROOT    = str(BASE_DIR / "media")

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

def expire_stale():
    now = datetime.now(tz.utc)
    stale = Show.objects.filter(is_live=True, end_time__lt=now)
    if stale.count():
        stale.update(is_live=False)
        log.info(f"Auto-apagado {stale.count()} show(s) expirado(s)")

def get_active_show():
    now = datetime.now(tz.utc)
    expire_stale()
    show = Show.objects.filter(is_live=True, end_time__gte=now).first()
    if show: return show, "live"
    show = Show.objects.filter(start_time__lte=now, end_time__gte=now).first()
    if show: return show, "scheduled"
    return None, None

def write_show_playlist(show):
    tracks = show.show_items.select_related("track").order_by("position")
    lines = ["#EXTM3U"]
    for item in tracks:
        path = os.path.join(MEDIA_ROOT, str(item.track.file))
        if os.path.exists(path):
            lines.append(f"#EXTINF:{int(item.track.duration)},{item.track.artist} - {item.track.title}")
            lines.append(path)
    with open(PLAYLIST_FILE, "w") as f:
        f.write("\n".join(lines) + "\n")
    log.info(f"Playlist show '{show.title}': {len(lines)//2} tracks")

def write_backup_playlist():
    files = list(Path(BACKUP_DIR).glob("*.mp3"))
    if not files:
        with open(PLAYLIST_FILE, "w") as f: f.write("#EXTM3U\n")
        return
    random.shuffle(files)
    lines = ["#EXTM3U"]
    for f in files:
        lines.append(f"#EXTINF:-1,{f.stem}")
        lines.append(str(f))
    with open(PLAYLIST_FILE, "w") as f:
        f.write("\n".join(lines) + "\n")
    log.info(f"Playlist backup: {len(files)} tracks")

Path("/home/radioadmin/radiostation-fixed/logs").mkdir(parents=True, exist_ok=True)
log.info("Scheduler iniciado")
write_backup_playlist()

while True:
    try:
        show, mode = get_active_show()
        state = "show" if show else "backup"
        if state != last_state:
            if show:
                write_show_playlist(show)
            else:
                write_backup_playlist()
            log.info(f"Estado → {state}")
            last_state = state
        elif show:
            # Actualizar playlist del show por si cambiaron los tracks
            write_show_playlist(show)
    except Exception as e:
        log.error(f"Error: {e}")
    time.sleep(10)
