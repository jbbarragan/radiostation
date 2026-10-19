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

scheduled = playlist(
  id="scheduled",
  mode="normal",
  reload=0,
  reload_mode="never",
  "/tmp/radio_playlist.m3u"
)

# Decoder metadata gives the scheduler the actual current entry.
current_item = ref("")
def remember_item(m)
  current_item := m["rs_item"]
end
scheduled = on_metadata(remember_item, scheduled)
server.register(namespace="radio", description="Current scheduled entry", "current", fun (_) -> !current_item)

# ─── Lógica de prioridad: show programado > backup ────────────────────────────
radio = fallback(
  id="main_fallback",
  track_sensitive=false,
  [scheduled, backup]
)

# Continuous smoothstep envelope. Fade-in is armed before skip and starts
# on the next real track mark, rather than while the decoder is loading.
transition_start = ref(-1000.)
transition_duration = ref(2.)
transition_from = ref(1.)
transition_to = ref(1.)
fade_in_pending = ref(false)
fade_in_duration = ref(1.5)
def smooth_progress(x)
  v = if x < 0. then 0. elsif x > 1. then 1. else x end
  v * v * (3. - 2. * v)
end
def transition_gain()
  elapsed = time() - !transition_start
  if !transition_to == 0. and elapsed > !transition_duration + 8. then
    # Watchdog restores smoothly if the scheduler/decoder stops responding.
    smooth_progress((elapsed - !transition_duration - 8.) / 1.5)
  else
    !transition_from + (!transition_to - !transition_from) * smooth_progress(elapsed / !transition_duration)
  end
end
def ramp(target, seconds)
  level = transition_gain()
  transition_from := level
  transition_to := target
  transition_duration := if seconds > 0.05 then seconds else 0.05 end
  transition_start := time()
end
def incoming_track(_)
  if !fade_in_pending then
    fade_in_pending := false
    ramp(1., !fade_in_duration)
  end
end
radio = on_track(incoming_track, radio)
radio = amplify(transition_gain, radio)
server.register(namespace="radio", description="Smooth outgoing fade", "fade", fun (arg) -> begin
  fade_in_pending := false
  ramp(0., float_of_string(default=2., arg))
  "OK"
end)
server.register(namespace="radio", description="Arm fade-in for next decoded track", "arm_in", fun (arg) -> begin
  fade_in_duration := float_of_string(default=1.5, arg)
  transition_from := 0.
  transition_to := 0.
  transition_start := time()
  transition_duration := 0.05
  fade_in_pending := true
  "OK"
end)
server.register(namespace="radio", description="Smooth recovery after cancellation/error", "restore", fun (_) -> begin
  fade_in_pending := false
  ramp(1., 0.5)
  "OK"
end)

# Optional direct USB output of exactly the same source as Icecast.
# Enable RADIO_USB_DEVICE only after stopping independent USB players.
usb_device = getenv("RADIO_USB_DEVICE")
if usb_device != "" then
  ignore(output.alsa(id="usb_shared", device=usb_device, bufferize=true, clock_safe=false, radio))
end

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
