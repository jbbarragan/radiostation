from django.contrib import admin
from .models import Track, Playlist, PlaylistTrack, Show, ShowItem, Settings

admin.site.register(Track)
admin.site.register(Playlist)
admin.site.register(PlaylistTrack)
admin.site.register(Show)
admin.site.register(ShowItem)
admin.site.register(Settings)
