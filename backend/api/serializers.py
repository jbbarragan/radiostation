from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Track, Playlist, PlaylistTrack, Show, ShowItem, Settings


class TrackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Track
        fields = ['id', 'title', 'artist', 'album', 'genre', 'duration', 'file', 'uploaded_at']
        read_only_fields = ['id', 'uploaded_at', 'duration']


class PlaylistTrackSerializer(serializers.ModelSerializer):
    track = TrackSerializer(read_only=True)
    track_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = PlaylistTrack
        fields = ['id', 'track', 'track_id', 'position']


class PlaylistSerializer(serializers.ModelSerializer):
    playlist_tracks = PlaylistTrackSerializer(many=True, read_only=True)
    total_duration = serializers.SerializerMethodField()
    track_count = serializers.SerializerMethodField()

    class Meta:
        model = Playlist
        fields = ['id', 'name', 'description', 'created_at', 'playlist_tracks', 'total_duration', 'track_count']
        read_only_fields = ['id', 'created_at']

    def get_total_duration(self, obj):
        return sum(pt.track.duration for pt in obj.playlist_tracks.all())

    def get_track_count(self, obj):
        return obj.playlist_tracks.count()


class ShowItemSerializer(serializers.ModelSerializer):
    track = TrackSerializer(read_only=True)
    track_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = ShowItem
        fields = ['id', 'track', 'track_id', 'position']


class ShowSerializer(serializers.ModelSerializer):
    show_items = ShowItemSerializer(many=True, read_only=True)
    content_duration = serializers.ReadOnlyField()
    duration_seconds = serializers.ReadOnlyField()
    fill_percentage = serializers.SerializerMethodField()

    class Meta:
        model = Show
        fields = [
            'id', 'title', 'color', 'start_time', 'end_time',
            'repeat', 'repeat_days', 'repeat_until',
            'parent_show', 'is_live', 'show_items',
            'content_duration', 'duration_seconds', 'fill_percentage',
            'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_fill_percentage(self, obj):
        total = obj.duration_seconds
        if total <= 0:
            return 0
        return min(100, (obj.content_duration / total) * 100)

    def validate(self, data):
        start = data.get('start_time', getattr(self.instance, 'start_time', None))
        end = data.get('end_time', getattr(self.instance, 'end_time', None))
        if start and end and start >= end:
            raise serializers.ValidationError("end_time must be after start_time")
        return data


class SettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = Settings
        fields = ['key', 'value']


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'is_staff']
