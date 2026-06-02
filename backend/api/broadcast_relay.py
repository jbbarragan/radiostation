#!/usr/bin/env python3
"""
broadcast_relay.py  –  Relay de audio del browser → Liquidsoap harbor
Se importa como vista de Django en urls.py

El browser envía chunks de WebM/Opus vía POST.
Este relay los acumula y los envía a Liquidsoap como stream HTTP.

Como Liquidsoap input.harbor escucha en puerto 8005,
simplemente hacemos proxy de los chunks con un socket TCP.
"""
import socket
import threading
import logging

log = logging.getLogger(__name__)

# Conexión persistente al harbor de Liquidsoap
_harbor_conn = None
_harbor_lock = threading.Lock()
HARBOR_HOST = "127.0.0.1"
HARBOR_PORT = 8005
HARBOR_PASSWORD = "LiveSource2024!"
HARBOR_MOUNT = "/live"

def _get_harbor_conn():
    global _harbor_conn
    with _harbor_lock:
        if _harbor_conn is not None:
            try:
                _harbor_conn.send(b"")  # ping
                return _harbor_conn
            except Exception:
                _harbor_conn = None

        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.connect((HARBOR_HOST, HARBOR_PORT))
            # HTTP Source protocol (Icecast source)
            handshake = (
                f"SOURCE {HARBOR_MOUNT} HTTP/1.0\r\n"
                f"Authorization: Basic {_b64(f'source:{HARBOR_PASSWORD}')}\r\n"
                f"Content-Type: audio/webm\r\n"
                f"User-Agent: RadioStation-Relay/1.0\r\n"
                f"\r\n"
            )
            s.send(handshake.encode())
            resp = s.recv(1024).decode("utf-8", errors="ignore")
            if "200" not in resp and "OK" not in resp:
                log.warning(f"Harbor handshake response: {resp[:80]}")
            _harbor_conn = s
            log.info("Conectado al harbor de Liquidsoap")
            return _harbor_conn
        except Exception as e:
            log.error(f"No se pudo conectar al harbor: {e}")
            return None


def _b64(s):
    import base64
    return base64.b64encode(s.encode()).decode()


def close_harbor():
    global _harbor_conn
    with _harbor_lock:
        if _harbor_conn:
            try: _harbor_conn.close()
            except: pass
            _harbor_conn = None
            log.info("Conexión al harbor cerrada")
