#!/usr/bin/liquidsoap
# XHCDMX Radio – radio.liq

set("log.level", 3)
set("log.file", true)
set("log.file.path", "/home/radioadmin/radiostation-fixed/logs/liquidsoap.log")

# ─── Fuentes ───────────────────────────────────────────────────────────────────

backup = mksafe(playlist(
  id="backup",
  mode="random",
  reload=30,
  "/home/radioadmin/radiostation-fixed/backup"
))

scheduled = mksafe(playlist(
  id="scheduled",
  mode="normal",
  reload=5,
  "/tmp/radio_playlist.m3u"
))

# ─── Lógica de prioridad: show programado > backup ────────────────────────────

radio = fallback(
  id="main_fallback",
  track_sensitive=false,
  [scheduled, backup]
)

# ─── Salida USB (dispositivo plughw:1,0) ──────────────────────────────────────
# Siempre desde radio_active para escuchar tanto show como backup

output.alsa(
  id="usb_out",
  device="plughw:1,0",
  radio
)

# ─── Salida Icecast ────────────────────────────────────────────────────────────

output.icecast(
  %mp3(bitrate=128),
  id="icecast_stream",
  host="localhost",
  port=8000,
  password="oL3ydtHXmWg2OVbsmuMhX6zjyCkzTp4J",
  mount="/stream",
  name="XHCDMX Radio",
  description="RadioStation XHCDMX",
  url="https://stream.xhcdmx.org",
  radio
)
