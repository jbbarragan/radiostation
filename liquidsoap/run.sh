#!/bin/bash
while true; do
    pkill -9 liquidsoap 2>/dev/null
    sleep 5
    /usr/bin/liquidsoap /home/radioadmin/radiostation-fixed/liquidsoap/radio.liq
    echo "$(date): liquidsoap terminó, reiniciando en 10s..." >> /home/radioadmin/radiostation-fixed/logs/liquidsoap.log
    sleep 10
done
