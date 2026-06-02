set("log.level", 3)
set("log.file", true)
set("log.file.path", "/home/radioadmin/radiostation-fixed/logs/liquidsoap.log")

radio = mksafe(playlist(id="radio", mode="normal", reload=10, "/tmp/radio_playlist.m3u"))

output.icecast(%mp3(bitrate=64),
  host="192.168.100.143", port=8000,
  password="oL3ydtHXmWg2OVbsmuMhX6zjyCkzTp4J",
  mount="/stream", name="XHCDMX Radio",
  radio)
