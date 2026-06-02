#!/usr/bin/env python3
"""
usb_player.py - Reproduce backup en USB cuando no hay show activo.
Corre independiente de liquidsoap.
"""
import os, sys, time, glob, random, subprocess, signal, django
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(BASE_DIR))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "radiostation.settings")
django.setup()

from api.models import Show
from datetime import datetime, timezone as tz

BACKUP_DIR = "/home/radioadmin/radiostation-fixed/backup"
ALSA_DEVICE = "plughw:1,0"

current_proc = None

def get_tracks():
    tracks = glob.glob(f"{BACKUP_DIR}/*.mp3")
    random.shuffle(tracks)
    return tracks

def has_active_show():
    now = datetime.now(tz.utc)
    return Show.objects.filter(is_live=True).exists() or \
           Show.objects.filter(start_time__lte=now, end_time__gte=now).exists()

def play(track):
    global current_proc
    current_proc = subprocess.Popen(
        ["ffmpeg", "-i", track, "-f", "alsa", ALSA_DEVICE, "-loglevel", "quiet"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    return current_proc

def stop():
    global current_proc
    if current_proc and current_proc.poll() is None:
        current_proc.terminate()
        current_proc.wait()
    current_proc = None

print("USB Player iniciado")
tracks = get_tracks()
idx = 0

while True:
    try:
        if has_active_show():
            stop()
            time.sleep(5)
            continue

        if not tracks:
            tracks = get_tracks()
            idx = 0

        track = tracks[idx % len(tracks)]
        idx += 1
        print(f"Reproduciendo: {os.path.basename(track)}")
        proc = play(track)

        # Espera a que termine, revisando cada 5s si hay show
        while proc.poll() is None:
            if has_active_show():
                stop()
                break
            time.sleep(5)

    except Exception as e:
        print(f"Error: {e}")
        stop()
        time.sleep(5)
