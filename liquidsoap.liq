#!/usr/bin/liquidsoap

set("log.level", 3)

# Un solo track en loop hasta que haya más
single = single("/home/radioadmin/radiostation-fixed/backend/media/tracks/01.01._Weia_Waga_Woge_Du_Wellen_Hehe_Ihr_Nicker_Lugt_Schwestern_Interlude.mp3")

# Playlist de la carpeta (detecta nuevos archivos cada 60s)
carpeta = playlist(
  mode="randomize",
  reload=60,
  "/home/radioadmin/radiostation-fixed/backend/media/tracks"
)

# Fallback: carpeta → single en loop → silencio
radio = fallback(track_sensitive=false, [carpeta, single, blank()])

output.icecast(
  %mp3(bitrate=128),
  host="localhost",
  port=8000,
  password="oL3ydtHXmWg2OVbsmuMhX6zjyCkzTp4J",
  mount="/stream",
  name="XHCDMX Radio",
  description="RadioStation XHCDMX",
  url="https://stream.xhcdmx.org",
  radio
)
