"""
Registra en la base de datos los archivos de audio que ya estan en
backend/media/tracks (copiados por scp) para que aparezcan en la interfaz.

Instalar en:  backend/api/management/commands/import_tracks.py

Uso (desde backend/, con el venv activado):
    python manage.py import_tracks --dry-run     # solo muestra que haria
    python manage.py import_tracks               # importa
    python manage.py import_tracks --folders     # crea una carpeta por subdirectorio
"""
import os

import mutagen
from django.conf import settings
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from api.models import Track, TrackFolder

AUDIO_EXTS = {'.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.opus', '.wma'}


def _tag(audio, key):
    try:
        val = audio.get(key)
        if val:
            return str(val[0]).strip()
    except Exception:
        pass
    return ''


class Command(BaseCommand):
    help = 'Importa a la BD los audios que ya estan en MEDIA_ROOT/tracks'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Solo mostrar lo que se importaria')
        parser.add_argument('--folders', action='store_true',
                            help='Crear una TrackFolder por cada subdirectorio')

    def handle(self, *args, **opts):
        base = os.path.join(settings.MEDIA_ROOT, 'tracks')
        if not os.path.isdir(base):
            self.stderr.write(f'No existe {base}')
            return

        existing = set(Track.objects.values_list('file', flat=True))
        user = User.objects.filter(is_superuser=True).first()
        created = skipped = failed = 0

        for root, _dirs, files in os.walk(base):
            for fname in sorted(files):
                if os.path.splitext(fname)[1].lower() not in AUDIO_EXTS:
                    continue

                full = os.path.join(root, fname)
                rel = os.path.relpath(full, settings.MEDIA_ROOT).replace(os.sep, '/')

                if rel in existing:
                    skipped += 1
                    continue

                title = os.path.splitext(fname)[0].strip()
                artist = album = genre = ''
                duration = 0.0
                try:
                    easy = mutagen.File(full, easy=True)
                    if easy is not None:
                        if getattr(easy, 'info', None):
                            duration = float(easy.info.length or 0)
                        title = _tag(easy, 'title') or title
                        artist = _tag(easy, 'artist')
                        album = _tag(easy, 'album')
                        genre = _tag(easy, 'genre')
                except Exception as e:
                    self.stderr.write(f'  aviso: sin metadatos en {fname}: {e}')

                # Si no hay tag de artista, usar "Artista - Titulo" del nombre
                if not artist and ' - ' in title:
                    artist, title = [p.strip() for p in title.split(' - ', 1)]

                folder = None
                if opts['folders'] and os.path.abspath(root) != os.path.abspath(base):
                    folder_name = os.path.basename(root)
                    if not opts['dry_run']:
                        folder, _ = TrackFolder.objects.get_or_create(name=folder_name)

                self.stdout.write(f'+ {rel}  ({duration:.0f}s)  {artist} - {title}')

                if opts['dry_run']:
                    created += 1
                    continue

                try:
                    Track.objects.create(
                        title=title[:255], artist=artist[:255], album=album[:255],
                        genre=genre[:100], duration=duration,
                        file=rel, uploaded_by=user, folder=folder,
                    )
                    created += 1
                except Exception as e:
                    failed += 1
                    self.stderr.write(f'  error en {fname}: {e}')

        verb = 'Se importarian' if opts['dry_run'] else 'Importados'
        self.stdout.write(self.style.SUCCESS(
            f'{verb}: {created} | ya existian: {skipped} | errores: {failed}'))
