#!/bin/bash
tee /tmp/audio_test.wav | \
PULSE_SERVER=unix:/run/user/1000/pulse/native \
paplay --device=alsa_output.usb-GeneralPlus_USB_Audio_Device-00.analog-stereo
