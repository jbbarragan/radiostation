#!/usr/bin/env python3
import os, sys, time, django, logging, random, socket, hashlib
from datetime import datetime, timezone as tz
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "radiostation.settings")
django.setup()

from api.models import Show

PLAYLIST_FILE = "/tmp/radio_playlist.m3u"
STATE_FILE    = "/tmp/radio_state"
BACKUP_DIR    = "/home/radioadmin/radiostation-fixed/backup"
MEDIA_ROOT    = str(BASE_DIR / "media")
TELNET_HOST   = "127.0.0.1"
TELNET_PORT   = 1234

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [scheduler] %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("/home/radioadmin/radiostation-fixed/logs/scheduler.log"),
    ]
)
log = logging.getLogger(__name__)

# Estado previo
last_state    = None
last_playlist_hash = None


def playlist_hash():
    """Hash del contenido actual de la playlist para detectar cambios."""
    try:
        return hashlib.md5(open(PLAYLIST_FILE, "rb").read()).hexdigest()
    except:
        return None


def write_state(state: str):
    try:
        with open(STATE_FILE, "w") as f:
            f.write(state)
    except Exception as e:
        log.error(f"No se pudo escribir radio_state: {e}")


def liquidsoap_cmd(cmd: str):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(3)
        s.connect((TELNET_HOST, TELNET_PORT))
        s.send(f"{cmd}\n".encode())
        time.sleep(0.3)
        resp = s.recv(1024).decode("utf-8", errors="ignore").strip()
        s.send(b"quit\n")
        s.close()
        log.info(f"Liquidsoap [{cmd}] → {resp.splitlines()[0] if resp else 'ok'}")
        return resp
    except Exception as e:
        log.warning(f"Telnet error ({cmd}): {e}")
        return None


def force_reload_and_skip():
    """Vacía la cola de Liquidsoap, recarga la playlist y salta al nuevo contenido."""
    log.info("Aplicando reload + skip...")
    liquidsoap_cmd("scheduled.reload")
    time.sleep(1.5)
    liquidsoap_cmd("icecast_stream.skip")
    time.sleep(0.5)
    liquidsoap_cmd("icecast_stream.skip")  # segundo skip para limpiar buffer precargado


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


def build_show_playlist(show):
    tracks = show.show_items.select_related("track").order_by("position")
    lines = ["#EXTM3U"]
    for item in tracks:
        path = os.path.join(MEDIA_ROOT, str(item.track.file))
        if os.path.exists(path):
            lines.append(f"#EXTINF:{int(item.track.duration)},{item.track.artist} - {item.track.title}")
            lines.append(path)
    return "\n".join(lines) + "\n"


def build_backup_playlist():
    files = list(Path(BACKUP_DIR).glob("*.mp3"))
    if not files:
        return "#EXTM3U\n"
    random.shuffle(files)
    lines = ["#EXTM3U"]
    for f in files:
        lines.append(f"#EXTINF:-1,{f.stem}")
        lines.append(str(f))
    return "\n".join(lines) + "\n"


def write_playlist(content: str):
    with open(PLAYLIST_FILE, "w") as f:
        f.write(content)


# ── Arranque ──────────────────────────────────────────────────────────────────
Path("/home/radioadmin/radiostation-fixed/logs").mkdir(parents=True, exist_ok=True)
log.info("Scheduler iniciado")
write_playlist(build_backup_playlist())
write_state("backup")
last_playlist_hash = playlist_hash()

while True:
    try:
        show, mode = get_active_show()
        state = "show" if show else "backup"

        if state == "show":
            new_content = build_show_playlist(show)
        else:
            # Para backup solo regeneramos si ya estábamos en backup (no sobreescribir innecesariamente)
            if last_state != "backup":
                new_content = build_backup_playlist()
            else:
                new_content = None  # sin cambios

        changed = False

        if new_content is not None:
            new_hash = hashlib.md5(new_content.encode()).hexdigest()
            if new_hash != last_playlist_hash:
                write_playlist(new_content)
                write_state(state)
                log.info(f"Playlist actualizada → estado={state}" +
                         (f" show='{show.title}'" if show else ""))
                force_reload_and_skip()
                last_playlist_hash = new_hash
                last_state = state
                changed = True

        if not changed and state != last_state:
            # Estado cambió pero el contenido era el mismo — aún así hacer skip
            write_state(state)
            force_reload_and_skip()
            log.info(f"Estado → {state}")
            last_state = state

        if show:
            log.info(f"Playlist show '{show.title}': {show.show_items.count()} tracks")

    except Exception as e:
        log.error(f"Error en loop: {e}", exc_info=True)

    time.sleep(10)
