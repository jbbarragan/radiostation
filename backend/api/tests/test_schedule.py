from datetime import timedelta, datetime
from unittest.mock import patch
from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from api.models import Show, ShowItem, Playlist, PlaylistTrack, Track
from api.scheduling import ensure_occurrences, active_show, occurrence_times
from scripts.radio_scheduler import Scheduler, next_change


class RadioTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('tester', password='test')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.now = timezone.now().replace(microsecond=0)
        self.track1 = Track.objects.create(title='A', duration=30, file='tracks/a.mp3')
        self.track2 = Track.objects.create(title='B', duration=40, file='tracks/b.mp3')

    def create_show(self, **kwargs):
        values = dict(title='Show', start_time=self.now+timedelta(hours=1), end_time=self.now+timedelta(hours=2), repeat='daily')
        values.update(kwargs)
        return Show.objects.create(**values)

    def add(self, show, **data):
        response = self.client.post(f'/api/shows/{show.pk}/add_item/', data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_content_added_after_occurrences_is_copied_and_edit_from_child_syncs(self):
        root = self.create_show()
        ensure_occurrences(self.now, self.now+timedelta(days=3,hours=2))
        children = list(root.occurrences.all())
        self.assertEqual(len(children), 3)
        self.add(root, track_id=str(self.track1.id))
        for child in children:
            self.assertEqual(child.show_items.get().track, self.track1)
        data = self.add(children[0], track_id=str(self.track2.id), position=0)
        self.assertEqual([i['track']['title'] for i in data['show_items']], ['B', 'A'])
        self.assertEqual(list(root.show_items.values_list('track__title', flat=True)), ['B', 'A'])
        ensure_occurrences(self.now+timedelta(days=700), self.now+timedelta(days=704))
        self.assertTrue(root.occurrences.filter(start_time__gt=self.now+timedelta(days=700)).exists())
        newest = root.occurrences.order_by('-start_time').first()
        self.assertEqual(list(newest.show_items.values_list('track__title',flat=True)), ['B','A'])

    def test_delete_series_from_child_never_regenerates(self):
        root = self.create_show()
        ensure_occurrences(self.now, self.now+timedelta(days=2,hours=2))
        child = root.occurrences.first()
        response = self.client.delete(f'/api/shows/{child.pk}/?scope=series')
        self.assertEqual(response.status_code,204)
        ensure_occurrences()
        self.assertEqual(Show.objects.count(),0)

    def test_cancel_one_including_root_keeps_series_and_tombstone(self):
        root = self.create_show()
        ensure_occurrences(self.now, self.now+timedelta(days=2,hours=2))
        child = root.occurrences.first()
        for show in (root,child):
            self.assertEqual(self.client.delete(f'/api/shows/{show.pk}/').status_code,204)
        ensure_occurrences(self.now,self.now+timedelta(days=2,hours=2))
        self.assertEqual(root.occurrences.filter(recurrence_time=child.recurrence_time).count(),1)
        root.refresh_from_db();child.refresh_from_db()
        self.assertTrue(root.cancelled and child.cancelled)
        self.assertEqual(root.occurrences.filter(cancelled=False).count(),1)

    def test_move_child_retains_content_and_does_not_duplicate_original_slot(self):
        root=self.create_show(); ensure_occurrences(self.now,self.now+timedelta(days=2,hours=2))
        child=root.occurrences.first(); self.add(root,track_id=str(self.track1.id))
        original=child.recurrence_time
        response=self.client.patch(f'/api/shows/{child.pk}/',{'start_time':child.start_time+timedelta(hours=3),'end_time':child.end_time+timedelta(hours=3)},format='json')
        self.assertEqual(response.status_code,200,response.data)
        ensure_occurrences(self.now,self.now+timedelta(days=2,hours=2))
        self.assertEqual(root.occurrences.filter(recurrence_time=original).count(),1)
        child.refresh_from_db(); self.assertEqual(child.show_items.count(),1)
        self.assertEqual(child.start_time,original+timedelta(hours=3))

    def test_weekday_sunday_and_month_end_anchor(self):
        root=self.create_show(start_time=datetime(2026,1,31,18,tzinfo=timezone.utc),end_time=datetime(2026,1,31,19,tzinfo=timezone.utc),repeat='monthly')
        values=list(occurrence_times(root,root.start_time,datetime(2026,4,1,tzinfo=timezone.utc)))
        self.assertEqual([(v.month,v.day) for v in values],[(2,28),(3,31)])
        root.repeat='custom_days'; root.repeat_days=[0]
        values=list(occurrence_times(root,root.start_time,root.start_time+timedelta(days=15)))
        self.assertTrue(values);self.assertTrue(all(v.weekday()==6 for v in values))

    def test_until_and_idempotent_generation(self):
        root=self.create_show(repeat_until=(self.now+timedelta(days=2,hours=2)).date())
        for _ in range(2): ensure_occurrences(self.now,self.now+timedelta(days=10))
        self.assertLessEqual(root.occurrences.count(),2)
        self.assertFalse(root.occurrences.filter(start_time__date__gt=root.repeat_until).exists())

    def test_priority_new_overlay_same_start_and_end_boundaries(self):
        old=self.create_show(repeat='none',start_time=self.now-timedelta(minutes=10),end_time=self.now+timedelta(hours=1))
        new=self.create_show(repeat='none',start_time=self.now,end_time=self.now+timedelta(minutes=10))
        self.assertEqual(active_show(self.now),new)
        self.assertEqual(active_show(new.end_time),old)
        old.is_live=True;old.save();self.assertEqual(active_show(self.now),old)
        old.is_live=False;old.save();new.cancelled=True;new.save();self.assertEqual(active_show(self.now),old)

    def test_reorder_duplicate_tracks_and_reject_stale_order_atomically(self):
        pl=Playlist.objects.create(name='Mix')
        response=self.client.post(f'/api/playlists/{pl.id}/add_track/',{'track_ids':[str(self.track1.id),str(self.track2.id),str(self.track1.id)]},format='json')
        self.assertEqual(response.status_code,200,response.data)
        ids=list(pl.playlist_tracks.values_list('id',flat=True))
        reversed_ids=list(reversed(ids))
        response=self.client.post(f'/api/playlists/{pl.id}/reorder/',{'order':reversed_ids},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(list(pl.playlist_tracks.values_list('id',flat=True)),reversed_ids)
        response=self.client.post(f'/api/playlists/{pl.id}/reorder/',{'order':[ids[0],ids[0]]},format='json')
        self.assertEqual(response.status_code,400)
        self.assertEqual(list(pl.playlist_tracks.values_list('id',flat=True)),reversed_ids)
        response=self.client.post(f'/api/playlists/{pl.id}/remove_track/',{'item_id':ids[1]},format='json')
        self.assertEqual(response.status_code,200)
        self.assertEqual(list(pl.playlist_tracks.values_list('position',flat=True)),[0,1])

    def test_show_reorder_and_remove_propagates_to_future(self):
        root=self.create_show();ensure_occurrences(self.now,self.now+timedelta(days=2,hours=2))
        data=self.add(root,track_ids=[str(self.track1.id),str(self.track2.id)])
        order=[x['id'] for x in reversed(data['show_items'])]
        res=self.client.post(f'/api/shows/{root.id}/reorder/',{'order':order},format='json')
        self.assertEqual(res.status_code,200)
        for child in root.occurrences.all():
            self.assertEqual(list(child.show_items.values_list('track__title',flat=True)),['B','A'])
        res=self.client.post(f'/api/shows/{root.id}/remove_item/',{'item_id':order[0]},format='json')
        self.assertEqual(res.status_code,200)
        for child in root.occurrences.all():self.assertEqual(child.show_items.get().track,self.track1)

    def test_api_create_then_add_and_far_calendar_generation(self):
        res=self.client.post('/api/shows/',{'title':'Series','start_time':self.now+timedelta(hours=1),'end_time':self.now+timedelta(hours=2),'repeat':'daily'},format='json')
        self.assertEqual(res.status_code,201,res.data)
        root=Show.objects.get(pk=res.data['id']);self.add(root,track_id=str(self.track1.id))
        start=self.now+timedelta(days=1000)
        res=self.client.get('/api/shows/',{'start':start.isoformat(),'end':(start+timedelta(days=5)).isoformat()})
        self.assertEqual(res.status_code,200,res.data)
        self.assertTrue(res.data)
        self.assertTrue(all(x['content_duration']==30 for x in res.data))

    @patch('scripts.radio_scheduler.atomic_write')
    @patch('scripts.radio_scheduler.liquidsoap_cmd',return_value='OK\nEND')
    @patch('scripts.radio_scheduler.build_show_playlist',return_value='#EXTM3U\n/same.mp3\n')
    def test_fade_at_boundary_and_single_skip_even_same_content(self,build,command,write):
        old=self.create_show(repeat='none',start_time=self.now-timedelta(minutes=2),end_time=self.now+timedelta(hours=1))
        new=self.create_show(repeat='none',start_time=self.now+timedelta(seconds=2),end_time=self.now+timedelta(minutes=30))
        scheduler=Scheduler();scheduler.next_recurrences=float('inf')
        scheduler.tick(self.now-timedelta(seconds=1));command.reset_mock()
        scheduler.tick(self.now)
        self.assertEqual(command.call_count,1)
        self.assertTrue(command.call_args.args[0].startswith('radio.fade'))
        scheduler.tick(self.now+timedelta(seconds=2))
        self.assertEqual(scheduler.current_key,str(new.id))
        self.assertEqual([c.args[0] for c in command.call_args_list].count('icecast_stream.skip'),1)
        self.assertEqual(command.call_args_list[-1].args[0],'radio.restore')

    @patch('scripts.radio_scheduler.atomic_write')
    @patch('scripts.radio_scheduler.liquidsoap_cmd',return_value='OK\nEND')
    @patch('scripts.radio_scheduler.build_show_playlist',return_value='#EXTM3U\n/same.mp3\n')
    def test_cancel_overlay_during_fade_restores_gain(self,build,command,write):
        self.create_show(repeat='none',start_time=self.now-timedelta(minutes=2),end_time=self.now+timedelta(hours=1))
        new=self.create_show(repeat='none',start_time=self.now+timedelta(seconds=2),end_time=self.now+timedelta(minutes=30))
        scheduler=Scheduler();scheduler.next_recurrences=float('inf');scheduler.tick(self.now-timedelta(seconds=1))
        scheduler.tick(self.now);new.cancelled=True;new.save();command.reset_mock()
        scheduler.tick(self.now+timedelta(seconds=1))
        self.assertEqual(command.call_args.args[0],'radio.restore')
        self.assertIsNone(scheduler.fade_target)
