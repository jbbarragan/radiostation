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
import os

from .models import Track, Playlist, PlaylistTrack, Show, ShowItem, Settings, SHOW_COLORS
from .serializers import (
    TrackSerializer, PlaylistSerializer, PlaylistTrackSerializer,
    ShowSerializer, ShowItemSerializer, SettingsSerializer, UserSerializer
)


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


class TrackViewSet(viewsets.ModelViewSet):
    queryset = Track.objects.all()
    serializer_class = TrackSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        file = self.request.FILES.get('file')
        duration = 0
        if file:
            try:
                audio = mutagen.File(file)
                if audio and hasattr(audio, 'info'):
                    duration = audio.info.length
            except Exception:
                pass
            file.seek(0)
        serializer.save(uploaded_by=self.request.user, duration=duration)

    def get_queryset(self):
        qs = Track.objects.all()
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(title__icontains=search) |
                Q(artist__icontains=search) |
                Q(album__icontains=search)
            )
        return qs


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
        # Reorder
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

        # Create recurring occurrences
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
        # If updating parent, also update children titles/colors
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
            from .models import Playlist
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
        # Turn off any other live show
        Show.objects.exclude(id=show.id).update(is_live=False)
        show.is_live = not show.is_live
        show.save()
        return Response(ShowSerializer(show).data)

    @action(detail=False, methods=['get'])
    def current_live(self, request):
        # Return any show marked as live, regardless of scheduled time
        show = Show.objects.filter(is_live=True).first()
        if show:
            return Response(ShowSerializer(show).data)
        return Response(None)


@api_view(['GET', 'POST'])
def settings_view(request):
    if request.method == 'GET':
        settings_dict = {s.key: s.value for s in Settings.objects.all()}
        # Defaults
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
def analytics_view(request):
    now = timezone.now()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)

    total_tracks = Track.objects.count()
    total_playlists = Playlist.objects.count()
    total_shows = Show.objects.count()
    shows_this_week = Show.objects.filter(start_time__gte=week_ago).count()
    shows_this_month = Show.objects.filter(start_time__gte=month_ago).count()

    # Shows per day last 7 days
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

    # Top tracks by usage in shows
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
