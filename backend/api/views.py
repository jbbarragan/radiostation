from rest_framework import viewsets, status, generics
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.utils import timezone
from django.db.models import Q
from datetime import datetime, timedelta
import mutagen
import mutagen.wave
import os
import wave

RADIO_STATE_FILE = "/tmp/radio_state"
ICECAST_HARBOR_PASSWORD = "LiveSource2024!"
ICECAST_SOURCE_PASSWORD = "oL3ydtHXmWg2OVbsmuMhX6zjyCkzTp4J"

from .models import Track, TrackFolder, Playlist, PlaylistTrack, Show, ShowItem, Settings, SHOW_COLORS
from .serializers import (
    TrackSerializer, TrackFolderSerializer, PlaylistSerializer, PlaylistTrackSerializer,
    ShowSerializer, ShowItemSerializer, SettingsSerializer, UserSerializer
)


def _get_audio_duration(file_obj):
    """
    Obtiene la duración de un archivo de audio.
    Maneja correctamente WAV, MP3, OGG, FLAC, etc.
    Retorna duración en segundos (float) o 0 si falla.
    """
    duration = 0
    filename = getattr(file_obj, 'name', '')
    ext = os.path.splitext(filename)[1].lower() if filename else ''

    # Estrategia 1: Para WAV intentar con el módulo 'wave' de stdlib primero
    # (mutagen a veces no lee correctamente WAVs con chunks no estándar)
    if ext == '.wav':
        try:
            file_obj.seek(0)
            import io
            raw = file_obj.read()
            file_obj.seek(0)
            with wave.open(io.BytesIO(raw)) as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                if rate > 0:
                    duration = frames / float(rate)
                    if duration > 0:
                        return duration
        except Exception:
            pass

    # Estrategia 2: mutagen genérico
    try:
        file_obj.seek(0)
        audio = mutagen.File(file_obj)
        if audio and hasattr(audio, 'info') and audio.info.length > 0:
            duration = audio.info.length
            file_obj.seek(0)
            return duration
    except Exception:
        pass

    # Estrategia 3: mutagen.wave explícito
    if ext == '.wav':
        try:
            file_obj.seek(0)
            audio = mutagen.wave.WAVE(file_obj)
            if audio and hasattr(audio, 'info') and audio.info.length > 0:
                duration = audio.info.length
                file_obj.seek(0)
                return duration
        except Exception:
            pass

    file_obj.seek(0)
    return duration


@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    username = request.data.get('username')
    password = request.data.get('password')
    user = authenticate(username=username, password=password)
    if user:
        refresh = RefreshToken.for_user(user)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data
        })
    return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['GET'])
def me_view(request):
    return Response(UserSerializer(request.user).data)


class TrackFolderViewSet(viewsets.ModelViewSet):
    queryset = TrackFolder.objects.all()
    serializer_class = TrackFolderSerializer
    permission_classes = [IsAuthenticated]


class TrackViewSet(viewsets.ModelViewSet):
    queryset = Track.objects.all()
    serializer_class = TrackSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        file = self.request.FILES.get('file')
        duration = 0
        if file:
            duration = _get_audio_duration(file)
        folder_id = self.request.data.get('folder_id') or None
        folder = None
        if folder_id:
            try:
                folder = TrackFolder.objects.get(id=folder_id)
            except TrackFolder.DoesNotExist:
                pass
        serializer.save(uploaded_by=self.request.user, duration=duration, folder=folder)

    def get_queryset(self):
        qs = Track.objects.select_related('folder').all()
        search = self.request.query_params.get('search')
        folder_id = self.request.query_params.get('folder_id')
        no_folder = self.request.query_params.get('no_folder')

        if search:
            qs = qs.filter(
                Q(title__icontains=search) |
                Q(artist__icontains=search) |
                Q(album__icontains=search)
            )
        if folder_id:
            qs = qs.filter(folder_id=folder_id)
        elif no_folder == '1':
            qs = qs.filter(folder__isnull=True)
        return qs

    @action(detail=True, methods=['patch'])
    def move(self, request, pk=None):
        """Mover un track a una carpeta (o a raíz si folder_id=null)"""
        track = self.get_object()
        folder_id = request.data.get('folder_id')
        if folder_id:
            try:
                folder = TrackFolder.objects.get(id=folder_id)
                track.folder = folder
            except TrackFolder.DoesNotExist:
                return Response({'error': 'Folder not found'}, status=404)
        else:
            track.folder = None
        track.save()
        return Response(TrackSerializer(track).data)

    @action(detail=False, methods=['post'])
    def batch_upload(self, request):
        """
        Sube múltiples archivos de audio en una sola petición.
        Acepta: files[] (multipart), folder_id (opcional)
        Retorna: { uploaded: [...tracks], errors: [...] }
        """
        files = request.FILES.getlist('files')
        if not files:
            return Response({'error': 'No files provided'}, status=400)

        folder_id = request.data.get('folder_id') or None
        folder = None
        if folder_id:
            try:
                folder = TrackFolder.objects.get(id=folder_id)
            except TrackFolder.DoesNotExist:
                pass

        uploaded = []
        errors = []

        for file in files:
            try:
                duration = _get_audio_duration(file)
                nameWithoutExt = os.path.splitext(file.name)[0]
                parts = nameWithoutExt.split(' - ', 1)
                if len(parts) >= 2:
                    artist = parts[0].strip()
                    title = parts[1].strip()
                else:
                    artist = ''
                    title = nameWithoutExt.strip()

                track = Track.objects.create(
                    title=title,
                    artist=artist,
                    duration=duration,
                    file=file,
                    uploaded_by=request.user,
                    folder=folder,
                )
                uploaded.append(TrackSerializer(track).data)
            except Exception as e:
                errors.append({'file': file.name, 'error': str(e)})

        return Response({
            'uploaded': uploaded,
            'errors': errors,
            'total': len(files),
            'success': len(uploaded),
        }, status=200)


class PlaylistViewSet(viewsets.ModelViewSet):
    queryset = Playlist.objects.prefetch_related('playlist_tracks__track').all()
    serializer_class = PlaylistSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def add_track(self, request, pk=None):
        playlist = self.get_object()
        track_id = request.data.get('track_id')
        position = playlist.playlist_tracks.count()
        try:
            track = Track.objects.get(id=track_id)
            PlaylistTrack.objects.create(playlist=playlist, track=track, position=position)
            return Response(PlaylistSerializer(playlist).data)
        except Track.DoesNotExist:
            return Response({'error': 'Track not found'}, status=404)

    @action(detail=True, methods=['post'])
    def remove_track(self, request, pk=None):
        playlist = self.get_object()
        item_id = request.data.get('item_id')
        PlaylistTrack.objects.filter(id=item_id, playlist=playlist).delete()
        for i, pt in enumerate(playlist.playlist_tracks.all()):
            pt.position = i
            pt.save()
        return Response(PlaylistSerializer(playlist).data)

    @action(detail=True, methods=['post'])
    def reorder(self, request, pk=None):
        playlist = self.get_object()
        order = request.data.get('order', [])
        for i, item_id in enumerate(order):
            PlaylistTrack.objects.filter(id=item_id, playlist=playlist).update(position=i)
        return Response(PlaylistSerializer(playlist).data)


def _get_next_color():
    used = Show.objects.values_list('color', flat=True).distinct()
    for color in SHOW_COLORS:
        if color not in used:
            return color
    import random
    return SHOW_COLORS[random.randint(0, len(SHOW_COLORS) - 1)]


class ShowViewSet(viewsets.ModelViewSet):
    queryset = Show.objects.prefetch_related('show_items__track').all()
    serializer_class = ShowSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Show.objects.prefetch_related('show_items__track').all()
        start = self.request.query_params.get('start')
        end = self.request.query_params.get('end')
        if start:
            qs = qs.filter(end_time__gte=start)
        if end:
            qs = qs.filter(start_time__lte=end)
        return qs.order_by('start_time')

    def perform_create(self, serializer):
        data = self.request.data
        color = data.get('color') or _get_next_color()
        show = serializer.save(created_by=self.request.user, color=color)

        repeat = data.get('repeat', 'none')
        repeat_until = data.get('repeat_until')
        repeat_days = data.get('repeat_days', [])

        if repeat != 'none':
            self._create_occurrences(show, repeat, repeat_until, repeat_days)

    def _create_occurrences(self, parent, repeat, repeat_until_str, repeat_days):
        if repeat_until_str:
            try:
                until = datetime.fromisoformat(repeat_until_str).date()
            except (ValueError, TypeError):
                until = (parent.start_time + timedelta(days=365)).date()
        else:
            until = (parent.start_time + timedelta(days=365)).date()

        duration = parent.end_time - parent.start_time
        current = parent.start_time
        occurrences = []
        max_occurrences = 500

        while len(occurrences) < max_occurrences:
            if repeat == 'daily':
                current = current + timedelta(days=1)
            elif repeat == 'weekly':
                current = current + timedelta(weeks=1)
            elif repeat == 'monthly':
                month = current.month + 1
                year = current.year
                if month > 12:
                    month = 1
                    year += 1
                try:
                    current = current.replace(year=year, month=month)
                except ValueError:
                    current = current.replace(year=year, month=month, day=28)
            elif repeat == 'custom_days':
                current = current + timedelta(days=1)
                if current.date() > until:
                    break
                if current.weekday() not in [int(d) for d in repeat_days]:
                    continue
            else:
                break

            if current.date() > until:
                break

            end = current + duration
            overlap = Show.objects.filter(
                start_time__lt=end,
                end_time__gt=current
            ).exists()
            if not overlap:
                occurrences.append(Show(
                    title=parent.title,
                    color=parent.color,
                    start_time=current,
                    end_time=end,
                    repeat='none',
                    parent_show=parent,
                    created_by=parent.created_by
                ))

        Show.objects.bulk_create(occurrences)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        response = super().update(request, *args, **kwargs)
        if instance.parent_show is None:
            title = request.data.get('title')
            color = request.data.get('color')
            updates = {}
            if title:
                updates['title'] = title
            if color:
                updates['color'] = color
            if updates:
                Show.objects.filter(parent_show=instance).update(**updates)
        return response

    @action(detail=True, methods=['post'])
    def add_item(self, request, pk=None):
        show = self.get_object()
        track_id = request.data.get('track_id')
        playlist_id = request.data.get('playlist_id')

        if track_id:
            try:
                track = Track.objects.get(id=track_id)
                pos = show.show_items.count()
                ShowItem.objects.create(show=show, track=track, position=pos)
            except Track.DoesNotExist:
                return Response({'error': 'Track not found'}, status=404)

        elif playlist_id:
            try:
                playlist = Playlist.objects.get(id=playlist_id)
                pos = show.show_items.count()
                for pt in playlist.playlist_tracks.all():
                    ShowItem.objects.create(show=show, track=pt.track, position=pos)
                    pos += 1
            except Playlist.DoesNotExist:
                return Response({'error': 'Playlist not found'}, status=404)

        return Response(ShowSerializer(show).data)

    @action(detail=True, methods=['post'])
    def remove_item(self, request, pk=None):
        show = self.get_object()
        item_id = request.data.get('item_id')
        ShowItem.objects.filter(id=item_id, show=show).delete()
        for i, item in enumerate(show.show_items.all()):
            item.position = i
            item.save()
        return Response(ShowSerializer(show).data)

    @action(detail=True, methods=['post'])
    def go_live(self, request, pk=None):
        show = self.get_object()
        now = timezone.now()
        if not show.is_live and show.end_time < now:
            return Response(
                {'error': 'Este show ya terminó y no puede ponerse en vivo.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        Show.objects.exclude(id=show.id).update(is_live=False)
        show.is_live = not show.is_live
        show.save()
        return Response(ShowSerializer(show).data)

    @action(detail=False, methods=['get'])
    def current_live(self, request):
        now = timezone.now()
        show = Show.objects.filter(is_live=True, end_time__gte=now).first()
        if show:
            return Response(ShowSerializer(show).data)
        return Response(None)


@api_view(['GET', 'POST'])
def settings_view(request):
    if request.method == 'GET':
        settings_dict = {s.key: s.value for s in Settings.objects.all()}
        defaults = {
            'slot_minutes': 30,
            'station_name': 'My Radio Station',
            'stream_url': '',
            'timezone': 'UTC',
        }
        defaults.update(settings_dict)
        return Response(defaults)
    elif request.method == 'POST':
        for key, value in request.data.items():
            Settings.set(key, value)
        return Response({'status': 'saved'})


@api_view(['GET'])
@permission_classes([AllowAny])
def radio_status_view(request):
    try:
        with open(RADIO_STATE_FILE, "r") as f:
            state = f.read().strip()
    except Exception:
        state = "off"

    show_data = None
    if state in ("show",):
        now = timezone.now()
        show = Show.objects.filter(is_live=True, end_time__gte=now).first()
        if not show:
            show = Show.objects.filter(start_time__lte=now, end_time__gte=now).first()
        if show:
            show_data = ShowSerializer(show).data

    return Response({"state": state, "show": show_data})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def broadcast_token_view(request):
    return Response({
        "harbor_host": request.get_host().split(":")[0],
        "harbor_port": 8005,
        "harbor_password": ICECAST_HARBOR_PASSWORD,
        "mount": "/live",
        "bitrate": 128,
    })


@api_view(['GET'])
def analytics_view(request):
    now = timezone.now()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    total_tracks = Track.objects.count()
    total_playlists = Playlist.objects.count()
    total_shows = Show.objects.count()
    shows_this_week = Show.objects.filter(start_time__gte=week_ago).count()
    shows_this_month = Show.objects.filter(start_time__gte=month_ago).count()

    shows_by_day = []
    for i in range(7):
        day = now - timedelta(days=6 - i)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day.replace(hour=23, minute=59, second=59)
        count = Show.objects.filter(start_time__range=[day_start, day_end]).count()
        shows_by_day.append({
            'date': day_start.strftime('%Y-%m-%d'),
            'count': count
        })

    from django.db.models import Count
    top_tracks = (
        ShowItem.objects
        .values('track__title', 'track__artist')
        .annotate(count=Count('id'))
        .order_by('-count')[:10]
    )

    return Response({
        'total_tracks': total_tracks,
        'total_playlists': total_playlists,
        'total_shows': total_shows,
        'shows_this_week': shows_this_week,
        'shows_this_month': shows_this_month,
        'shows_by_day': shows_by_day,
        'top_tracks': list(top_tracks),
    })


# ── Broadcast chunk relay ─────────────────────────────────────────
from django.views.decorators.csrf import csrf_exempt
from django.http import HttpResponse
from .broadcast_relay import _get_harbor_conn, close_harbor

@csrf_exempt
@api_view(['POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def broadcast_chunk_view(request):
    if request.method == 'DELETE':
        close_harbor()
        return Response({"status": "closed"})

    data = request.body
    if not data:
        return Response({"status": "empty"}, status=400)

    conn = _get_harbor_conn()
    if conn is None:
        return Response({"error": "No se pudo conectar al harbor"}, status=503)

    try:
        conn.send(data)
        return Response({"status": "ok", "bytes": len(data)})
    except Exception as e:
        close_harbor()
        return Response({"error": str(e)}, status=503)
