#!/usr/bin/liquidsoap
# XHCDMX Radio – radio.liq
set("log.level", 3)
set("log.file", true)
set("log.file.path", "/home/radioadmin/radiostation-fixed/logs/liquidsoap.log")

# Telnet para control remoto (skip, reload, etc.)
set("server.telnet", true)
set("server.telnet.bind_addr", "127.0.0.1")
set("server.telnet.port", 1234)

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
  reload=3600,
  reload_mode="watch",
  "/tmp/radio_playlist.m3u"
))

# ─── Lógica de prioridad: show programado > backup ────────────────────────────
radio = fallback(
  id="main_fallback",
  track_sensitive=false,
  [scheduled, backup]
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
