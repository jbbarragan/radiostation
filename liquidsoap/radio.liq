#!/usr/bin/liquidsoap
# XHCDMX Radio – radio.liq  (compatible Liquidsoap 1.4.x)

set("log.level", 3)
set("log.file", true)
set("log.file.path", "/home/radioadmin/radiostation-fixed/logs/liquidsoap.log")

backup = playlist(
  id="backup",
  mode="random",
  reload=30,
  "/home/radioadmin/radiostation-fixed/backup"
)
backup = mksafe(backup)

scheduled = playlist(
  id="scheduled",
  mode="normal",
  reload=5,
  "/tmp/scheduled_playlist.m3u"
)
scheduled = mksafe(scheduled)

live_input = input.harbor(
  id="live_harbor",
  "/live",
  port=8005,
  password="LiveSource2024!"
)

silence_src = blank(id="silence", duration=0.)

def get_state() =
  state = get_process_output("cat /tmp/radio_state 2>/dev/null || echo off")
  string.sub(state, start=0, length=string.length(state) - 1)
end

radio_active = fallback(
  id="radio_active",
  track_sensitive=false,
  [live_input, scheduled, backup]
)

radio = switch(
  id="main_switch",
  track_sensitive=false,
  [
    ({ get_state() != "off" }, radio_active),
    ({ true }, silence_src)
  ]
)

# USB: solo cuando hay audio real (sin silencio forzado)
# radio_active ya tiene fallback: live > scheduled > backup > silencio(mksafe)
# Sin switch - siempre transmite lo que haya

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

output.icecast(
  %mp3(bitrate=128),
  id="icecast_tab",
  host="localhost",
  port=8000,
  password="oL3ydtHXmWg2OVbsmuMhX6zjyCkzTp4J",
  mount="/icecast",
  name="XHCDMX Radio",
  description="RadioStation XHCDMX",
  url="https://stream.xhcdmx.org",
  radio
)
