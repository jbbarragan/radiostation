#!/usr/bin/env python3
"""Scheduled playout with shared priority rules, rolling recurrences and fades."""
import os
import sys
import time
import django
import logging
import random
import socket
import hashlib
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'radiostation.settings')
django.setup()
from django.conf import settings
from django.utils import timezone
from api.models import Show
from api.scheduling import active_show, ensure_occurrences

PLAYLIST_FILE = os.environ.get('RADIO_PLAYLIST_FILE', '/tmp/radio_playlist.m3u')
STATE_FILE = os.environ.get('RADIO_STATE_FILE', '/tmp/radio_state')
BACKUP_DIR = os.environ.get('RADIO_BACKUP_DIR', str(BASE_DIR.parent / 'backup'))
MEDIA_ROOT = str(settings.MEDIA_ROOT)
TELNET_HOST = '127.0.0.1'
TELNET_PORT = int(os.environ.get('RADIO_TELNET_PORT', '1234'))
FADE_SECONDS = max(0.05, float(os.environ.get('RADIO_FADE_SECONDS', '2')))
POLL_SECONDS = 0.25
log = logging.getLogger('radio_scheduler')


def atomic_write(path, content):
    target = Path(path)
    temp = target.with_name(target.name + '.scheduler-tmp')
    temp.write_text(content, encoding='utf-8')
    os.replace(temp, target)


def write_state(state):
    atomic_write(STATE_FILE, state)


def liquidsoap_cmd(cmd):
    # Read the complete protocol frame; no sleeps or duplicate skip commands.
    with socket.create_connection((TELNET_HOST, TELNET_PORT), timeout=3) as sock:
        sock.settimeout(3)
        sock.sendall((cmd + '\n').encode())
        response = b''
        while b'END' not in response.splitlines():
            block = sock.recv(8192)
            if not block:
                raise ConnectionError('Liquidsoap closed before END')
            response += block
        text = response.decode(errors='replace')
        if 'ERROR' in text.upper() or 'UNKNOWN COMMAND' in text.upper():
            raise RuntimeError(f'{cmd}: {text.strip()}')
        return text


def build_show_playlist(show):
    lines = ['#EXTM3U']
    for item in show.show_items.select_related('track').order_by('position', 'id'):
        path = os.path.join(MEDIA_ROOT, str(item.track.file))
        if os.path.exists(path):
            label = f'{item.track.artist} - {item.track.title}'.replace('\n', ' ').replace('\r', ' ')
            lines.extend([f'#EXTINF:{int(item.track.duration)},{label}', path])
        else:
            log.warning('Missing audio file: %s', path)
    return '\n'.join(lines) + '\n'


def build_backup_playlist():
    files = list(Path(BACKUP_DIR).glob('*.mp3'))
    random.shuffle(files)
    return '#EXTM3U\n' + ''.join(f'#EXTINF:-1,{f.stem}\n{f}\n' for f in files)


def show_key(show):
    return str(show.id) if show else 'backup'


def next_change(now, current):
    # Look ahead only as far as needed for the fade. Boundaries can be starts
    # or ends (including a higher priority overlay ending over a longer show).
    horizon = now + timedelta(seconds=FADE_SECONDS+POLL_SECONDS)
    qs = Show.objects.filter(cancelled=False)
    starts = qs.filter(start_time__gt=now, start_time__lte=horizon).values_list('start_time', flat=True)
    ends = qs.filter(end_time__gt=now, end_time__lte=horizon).values_list('end_time', flat=True)
    for boundary in sorted(set(starts) | set(ends)):
        target = active_show(boundary)
        if show_key(target) != show_key(current):
            return boundary, target
    return None


class Scheduler:
    def __init__(self):
        self.current_key = None
        self.content_hash = None
        self.fade_target = None
        self.fade_deadline = None
        self.next_recurrences = 0
        self.backup = None
        self.started = False

    def restore(self):
        liquidsoap_cmd('radio.restore')
        self.fade_target = None
        self.fade_deadline = None

    def start_fade(self, key, deadline):
        seconds = max(0.05, (deadline-timezone.now()).total_seconds())
        liquidsoap_cmd(f'radio.fade {seconds:.3f}')
        self.fade_target = key
        self.fade_deadline = deadline

    def apply(self, show, content, digest):
        # Reload clears Liquidsoap's prefetch queue. A SINGLE skip starts track
        # one; the former double-skip could discard the first new track.
        atomic_write(PLAYLIST_FILE, content)
        liquidsoap_cmd('scheduled.reload')
        liquidsoap_cmd('icecast_stream.skip')
        self.restore()
        write_state('show' if show else 'backup')
        self.current_key = show_key(show)
        self.content_hash = digest
        self.started = True
        log.info('Playing %s', show.title if show else 'backup')

    def tick(self, now=None):
        now = now or timezone.now()
        if time.monotonic() >= self.next_recurrences:
            ensure_occurrences()
            Show.objects.filter(is_live=True, end_time__lte=now).update(is_live=False)
            self.next_recurrences = time.monotonic()+3600
        show = active_show(now)
        key = show_key(show)
        if show:
            content = build_show_playlist(show)
        else:
            if self.backup is None or self.current_key not in (None, 'backup'):
                self.backup = build_backup_playlist()
            content = self.backup
        digest = hashlib.sha256(content.encode()).hexdigest()
        changed = key != self.current_key or digest != self.content_hash
        if not self.started:
            self.apply(show, content, digest)
            return
        if changed:
            if self.fade_target != key:
                # Unplanned edit / manual activation: fade from the current sound.
                self.start_fade(key, now+timedelta(seconds=FADE_SECONDS))
            if now >= self.fade_deadline:
                self.apply(show, content, digest)
            return
        upcoming = next_change(now, show)
        if upcoming:
            boundary, target = upcoming
            if self.fade_target != show_key(target) or self.fade_deadline != boundary:
                self.start_fade(show_key(target), boundary)
        elif self.fade_target is not None:
            self.restore()  # A show was moved/deleted during the lookahead window.


def main():
    log_dir = BASE_DIR.parent / 'logs'
    log_dir.mkdir(exist_ok=True)
    logging.basicConfig(level=logging.INFO, format='%(asctime)s [scheduler] %(message)s',
                        handlers=[logging.StreamHandler(), logging.FileHandler(log_dir/'scheduler.log')])
    # Prevent two scheduler processes from fighting over the playlist.
    import fcntl
    lock = open(PLAYLIST_FILE+'.lock', 'w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    if not Path(PLAYLIST_FILE).exists():
        atomic_write(PLAYLIST_FILE, build_backup_playlist())
    scheduler = Scheduler()
    log.info('Scheduler started; fade %.2fs, polling %.2fs', FADE_SECONDS, POLL_SECONDS)
    while True:
        try:
            scheduler.tick()
        except Exception:
            log.exception('Playout update failed; retrying, previous audio graph remains active')
            # Recover volume after errors; Liquidsoap also has an 8-second watchdog.
            try:
                scheduler.restore()
            except Exception:
                pass
        time.sleep(POLL_SECONDS)


if __name__ == '__main__':
    main()
