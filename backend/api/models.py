from django.db import models
from django.contrib.auth.models import User
import uuid


class Track(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    artist = models.CharField(max_length=255, blank=True)
    album = models.CharField(max_length=255, blank=True)
    genre = models.CharField(max_length=100, blank=True)
    duration = models.FloatField(default=0)  # seconds
    file = models.FileField(upload_to='tracks/')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)

    class Meta:
        ordering = ['title']

    def __str__(self):
        return f"{self.artist} - {self.title}"


class Playlist(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class PlaylistTrack(models.Model):
    playlist = models.ForeignKey(Playlist, related_name='playlist_tracks', on_delete=models.CASCADE)
    track = models.ForeignKey(Track, on_delete=models.CASCADE)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['position']
        unique_together = ['playlist', 'position']


SHOW_COLORS = [
    '#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C',
    '#3498DB', '#9B59B6', '#E91E63', '#FF5722', '#00BCD4',
    '#8BC34A', '#FF9800', '#795548', '#607D8B', '#F06292',
]

REPEAT_CHOICES = [
    ('none', 'No repeat'),
    ('daily', 'Every day'),
    ('weekly', 'Weekly'),
    ('monthly', 'Monthly'),
    ('custom_days', 'Specific days of week'),
    ('custom_hours', 'Specific hours'),
]


class Show(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    color = models.CharField(max_length=7, default='#3498DB')
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    repeat = models.CharField(max_length=20, choices=REPEAT_CHOICES, default='none')
    repeat_days = models.JSONField(default=list, blank=True)  # [0,1,2,3,4,5,6] for days of week
    repeat_until = models.DateField(null=True, blank=True)
    parent_show = models.ForeignKey('self', null=True, blank=True, on_delete=models.CASCADE, related_name='occurrences')
    is_live = models.BooleanField(default=False)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['start_time']

    def __str__(self):
        return f"{self.title} ({self.start_time})"

    @property
    def duration_seconds(self):
        return (self.end_time - self.start_time).total_seconds()

    @property
    def content_duration(self):
        total = sum(
            item.track.duration for item in self.show_items.all()
        )
        return total


class ShowItem(models.Model):
    show = models.ForeignKey(Show, related_name='show_items', on_delete=models.CASCADE)
    track = models.ForeignKey(Track, on_delete=models.CASCADE)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['position']


class Settings(models.Model):
    key = models.CharField(max_length=100, unique=True)
    value = models.JSONField()

    @classmethod
    def get(cls, key, default=None):
        try:
            return cls.objects.get(key=key).value
        except cls.DoesNotExist:
            return default

    @classmethod
    def set(cls, key, value):
        obj, _ = cls.objects.get_or_create(key=key)
        obj.value = value
        obj.save()
        return obj
