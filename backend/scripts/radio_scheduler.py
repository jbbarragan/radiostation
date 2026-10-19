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
import re
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
FADE_SECONDS = float(os.environ.get('RADIO_FADE_SECONDS', '2'))
if FADE_SECONDS <= 0:
    FADE_SECONDS = 2.  # Repair an old setting that disabled transitions.
FADE_IN_SECONDS = max(0.1, float(os.environ.get('RADIO_FADE_IN_SECONDS', '1.5')))
# Fade-out occupies the end of the outgoing slot; fade-in starts in the new slot.
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


def build_show_playlist(show, elapsed=0., after_item=None, previous_ids=()):
    """Build once per change; keep float durations and absolute schedule offsets.

    after_item updates the unplayed tail without interrupting the decoder.
    elapsed is used only on entry/re-entry/restart, never on each polling tick.
    Missing media consumes its slot instead of shifting subsequent audio early.
    """
    lines = ['#EXTM3U']
    items = list(show.show_items.select_related('track').order_by('position', 'id'))
    if after_item is not None:
        index = next((i for i, item in enumerate(items) if str(item.id) == str(after_item)), None)
        if index is not None:
            items = items[index+1:]
            elapsed = 0.
        elif str(after_item) in previous_ids:
            # The playing item may have been deleted, or series sync recreated IDs.
            old_index = previous_ids.index(str(after_item))
            successors = set(previous_ids[old_index+1:])
            next_index = next((i for i, item in enumerate(items) if str(item.id) in successors), None)
            if next_index is None:
                # If all IDs changed, use the previous ordinal; otherwise append-only edits.
                recreated = not any(str(item.id) in previous_ids for item in items)
                next_index = min(old_index+1 if recreated else old_index, len(items))
            items = items[next_index:]
            elapsed = 0.
    for item in items:
        duration = max(0., float(item.track.duration))
        if duration <= 0:
            log.warning('Unknown duration: track %s excluded from timed playout', item.track_id)
            continue
        if elapsed >= duration:
            elapsed -= duration
            continue
        path = os.path.join(MEDIA_ROOT, str(item.track.file))
        label = f'{item.track.artist} - {item.track.title}'.replace('\n', ' ').replace('\r', ' ')
        remaining = duration - elapsed
        if os.path.exists(path):
            # Metadata identifies the actual playing entry, including duplicate tracks.
            uri = f'annotate:rs_item="{item.id}",liq_cue_in="{elapsed:.6f}":{path}'
            lines.extend([f'#EXTINF:{remaining:.6f},{label}', uri])
        else:
            log.warning('Missing audio file; reserving %.3fs: %s', remaining, path)
            lines.extend([f'#EXTINF:{remaining:.6f},Missing audio', f'blank:duration={remaining:.6f}'])
        elapsed = 0.
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
        self.next_content_check = 0
        self.cached_content = None
        self.playout_start = None
        self.previous_ids = ()
        self.edit_anchor_id = None
        self.edit_anchor_ids = ()

    def restore(self):
        liquidsoap_cmd('radio.restore')
        self.fade_target = None
        self.fade_deadline = None

    def start_fade(self, key, deadline, now=None):
        seconds = max(0.05, (deadline-(now or timezone.now())).total_seconds())
        liquidsoap_cmd(f'radio.fade {seconds:.3f}')
        self.fade_target = key
        self.fade_deadline = deadline

    def apply(self, show, content, digest):
        # Reload clears Liquidsoap's prefetch queue. A SINGLE skip starts track
        # one; the former double-skip could discard the first new track.
        self.edit_anchor_id = None
        self.edit_anchor_ids = ()
        self.previous_ids = tuple(re.findall(r'rs_item="(\d+)"', content))
        if show:
            origin = self.apply_now if show.is_live and show.start_time > self.apply_now else show.start_time
            self.playout_start = origin
            elapsed = max(0., (self.apply_now - origin).total_seconds())
            content = build_show_playlist(show, elapsed=elapsed)
        atomic_write(PLAYLIST_FILE, content)
        liquidsoap_cmd('scheduled.reload')
        liquidsoap_cmd(f'radio.arm_in {FADE_IN_SECONDS:.3f}')
        liquidsoap_cmd('icecast_stream.skip')
        self.fade_target = None
        self.fade_deadline = None
        write_state('show' if show else 'backup')
        self.current_key = show_key(show)
        self.content_hash = digest
        self.started = True
        log.info('Playing %s', show.title if show else 'backup')

    def tick(self, now=None):
        now = now or timezone.now()
        self.apply_now = now
        if time.monotonic() >= self.next_recurrences:
            ensure_occurrences()
            Show.objects.filter(is_live=True, end_time__lte=now).update(is_live=False)
            self.next_recurrences = time.monotonic()+3600
        show = active_show(now)
        key = show_key(show)
        if show:
            # Filesystem probing/large playlist rebuilds happen at most once a second.
            if key != self.current_key or time.monotonic() >= self.next_content_check or self.cached_content is None:
                self.cached_content = build_show_playlist(show)
                self.next_content_check = time.monotonic() + 1.
            content = self.cached_content
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
            if key == self.current_key:
                # Never skip the current audio just because the editor changed.
                response = liquidsoap_cmd('radio.current')
                item_id = response.splitlines()[0].strip()
                # Preserve the on-air reference across several edits, even if
                # series synchronization recreates IDs or removes the current row.
                if item_id != self.edit_anchor_id:
                    self.edit_anchor_id = item_id
                    self.edit_anchor_ids = self.previous_ids
                elapsed = max(0., (now - (self.playout_start or show.start_time)).total_seconds()) if show else 0.
                tail = build_show_playlist(show, elapsed=elapsed, after_item=item_id, previous_ids=self.edit_anchor_ids) if show else content
                atomic_write(PLAYLIST_FILE, tail)
                liquidsoap_cmd('scheduled.reload')
                self.content_hash = digest
                self.previous_ids = tuple(re.findall(r'rs_item="(\d+)"', content))
                return
            # Scheduled handoffs have already faded before their boundary.
            # Manual changes / missed boundaries need an outgoing ramp first.
            if self.fade_target != key:
                self.start_fade(key, now+timedelta(seconds=FADE_SECONDS), now)
                return
            if now < self.fade_deadline:
                return
            self.apply(show, content, digest)
            return
        upcoming = next_change(now, show)
        if upcoming and FADE_SECONDS > 0:
            boundary, target = upcoming
            if self.fade_target != show_key(target) or self.fade_deadline != boundary:
                self.start_fade(show_key(target), boundary, now)
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
