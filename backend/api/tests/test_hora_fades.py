from datetime import timedelta, datetime
from unittest.mock import patch
from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APIClient
from api.models import Show, ShowItem, Playlist, PlaylistTrack, Track
from api.scheduling import ensure_occurrences, active_show, occurrence_times
from scripts.radio_scheduler import Scheduler, next_change


class HoraFadesTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('tester', password='test')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.now = timezone.localtime(timezone.now()).replace(hour=12, minute=0, second=0, microsecond=0)
        self.track1 = Track.objects.create(title='A', duration=30, file='tracks/a.mp3')
        self.track2 = Track.objects.create(title='B', duration=40, file='tracks/b.mp3')

    def create_show(self, **kwargs):
        values = dict(title='Show', start_time=self.now+timedelta(hours=1), end_time=self.now+timedelta(hours=2), repeat='daily')
        values.update(kwargs)
        return Show.objects.create(**values)

    @patch('scripts.radio_scheduler.atomic_write')
    @patch('scripts.radio_scheduler.liquidsoap_cmd',return_value='OK\nEND')
    @patch('scripts.radio_scheduler.build_show_playlist',return_value='#EXTM3U\n/same.mp3\n')
    @patch('scripts.radio_scheduler.FADE_SECONDS', 2.)
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
        self.assertEqual(command.call_args_list[-1].args[0],'icecast_stream.skip')
        self.assertIn('radio.arm_in 1.500', [c.args[0] for c in command.call_args_list])

    @patch('scripts.radio_scheduler.atomic_write')
    @patch('scripts.radio_scheduler.liquidsoap_cmd',return_value='OK\nEND')
    @patch('scripts.radio_scheduler.build_show_playlist',return_value='#EXTM3U\n/same.mp3\n')
    @patch('scripts.radio_scheduler.FADE_SECONDS', 2.)
    def test_cancel_overlay_during_fade_restores_gain(self,build,command,write):
        self.create_show(repeat='none',start_time=self.now-timedelta(minutes=2),end_time=self.now+timedelta(hours=1))
        new=self.create_show(repeat='none',start_time=self.now+timedelta(seconds=2),end_time=self.now+timedelta(minutes=30))
        scheduler=Scheduler();scheduler.next_recurrences=float('inf');scheduler.tick(self.now-timedelta(seconds=1))
        scheduler.tick(self.now);new.cancelled=True;new.save();command.reset_mock()
        scheduler.tick(self.now+timedelta(seconds=1))
        self.assertEqual(command.call_args.args[0],'radio.restore')
        self.assertIsNone(scheduler.fade_target)

    @patch('scripts.radio_scheduler.os.path.exists', return_value=True)
    def test_late_entry_seeks_and_keeps_fractional_duration(self, exists):
        from scripts.radio_scheduler import build_show_playlist
        show = self.create_show(repeat='none')
        self.track1.duration = 30.25; self.track1.save()
        ShowItem.objects.create(show=show, track=self.track1, position=0)
        second = ShowItem.objects.create(show=show, track=self.track2, position=1)
        result = build_show_playlist(show, elapsed=35.5)
        self.assertNotIn('a.mp3', result)
        self.assertIn('liq_cue_in="5.250000"', result)
        self.assertIn('#EXTINF:34.750000', result)
        self.assertIn(f'rs_item="{second.id}"', result)

    @patch('scripts.radio_scheduler.os.path.exists', return_value=True)
    def test_live_edit_reloads_tail_without_skipping_current(self, exists):
        show = self.create_show(repeat='none', start_time=self.now, end_time=self.now+timedelta(hours=1))
        first = ShowItem.objects.create(show=show, track=self.track1, position=0)
        scheduler = Scheduler(); scheduler.next_recurrences = float('inf')
        with patch('scripts.radio_scheduler.atomic_write') as write, patch('scripts.radio_scheduler.liquidsoap_cmd', return_value=f'{first.id}\nEND') as command:
            scheduler.tick(self.now)
            command.reset_mock(); write.reset_mock()
            ShowItem.objects.create(show=show, track=self.track2, position=1)
            scheduler.next_content_check = 0
            scheduler.tick(self.now+timedelta(seconds=4))
            self.assertNotIn('icecast_stream.skip', [c.args[0] for c in command.call_args_list])
            self.assertIn('b.mp3', write.call_args.args[1])
            self.assertNotIn('a.mp3', write.call_args.args[1])

    @patch('scripts.radio_scheduler.atomic_write')
    @patch('scripts.radio_scheduler.liquidsoap_cmd', return_value='OK\nEND')
    @patch('scripts.radio_scheduler.build_show_playlist', return_value='#EXTM3U\n')
    def test_missed_boundary_fades_before_switch_instead_of_hard_cut(self, build, command, write):
        self.create_show(repeat='none', start_time=self.now-timedelta(minutes=1), end_time=self.now+timedelta(hours=1))
        target = self.create_show(repeat='none', start_time=self.now+timedelta(seconds=10), end_time=self.now+timedelta(minutes=20))
        scheduler=Scheduler(); scheduler.next_recurrences=float('inf'); scheduler.tick(self.now)
        scheduler.tick(self.now+timedelta(seconds=11))
        self.assertNotEqual(scheduler.current_key, str(target.id))
        self.assertTrue(command.call_args.args[0].startswith('radio.fade'))
        scheduler.tick(self.now+timedelta(seconds=13))
        self.assertEqual(scheduler.current_key, str(target.id))

    @patch('scripts.radio_scheduler.os.path.exists', return_value=True)
    def test_return_from_overlay_seeks_original_clock_position(self, exists):
        original = self.create_show(repeat='none', start_time=self.now, end_time=self.now+timedelta(minutes=5))
        ShowItem.objects.create(show=original, track=self.track1, position=0)
        ShowItem.objects.create(show=original, track=self.track2, position=1)
        overlay = self.create_show(repeat='none', start_time=self.now+timedelta(seconds=10), end_time=self.now+timedelta(seconds=45))
        ShowItem.objects.create(show=overlay, track=self.track2, position=0)
        scheduler=Scheduler(); scheduler.next_recurrences=float('inf')
        with patch('scripts.radio_scheduler.atomic_write') as write, patch('scripts.radio_scheduler.liquidsoap_cmd', return_value='OK\nEND'):
            for second in (0,8,10,43,45):
                scheduler.tick(self.now+timedelta(seconds=second))
            self.assertEqual(scheduler.current_key, str(original.id))
            playlist = [c.args[1] for c in write.call_args_list if c.args[1].startswith('#EXTM3U')][-1]
            self.assertNotIn('a.mp3',playlist)
            self.assertIn('b.mp3',playlist)
            self.assertIn('liq_cue_in="15.000000"',playlist)

    @patch('scripts.radio_scheduler.os.path.exists', return_value=True)
    def test_repeated_append_keeps_decoder_and_all_pending_tracks(self, exists):
        show=self.create_show(repeat='none', start_time=self.now, end_time=self.now+timedelta(minutes=5))
        first=ShowItem.objects.create(show=show,track=self.track1,position=0)
        scheduler=Scheduler();scheduler.next_recurrences=float('inf')
        with patch('scripts.radio_scheduler.atomic_write') as write, patch('scripts.radio_scheduler.liquidsoap_cmd',return_value=f'{first.id}\nEND') as cmd:
            scheduler.tick(self.now);cmd.reset_mock();write.reset_mock()
            for position in (1,2):
                ShowItem.objects.create(show=show,track=self.track2,position=position)
                scheduler.next_content_check=0
                scheduler.tick(self.now+timedelta(seconds=position))
            self.assertEqual([c.args[0] for c in cmd.call_args_list],['radio.current','scheduled.reload']*2)
            self.assertEqual(write.call_args.args[1].count('b.mp3'),2)
            self.assertNotIn('a.mp3',write.call_args.args[1])

    @patch('scripts.radio_scheduler.os.path.exists', return_value=True)
    def test_deleted_on_air_entry_keeps_anchor_during_multiple_edits(self, exists):
        show=self.create_show(repeat='none', start_time=self.now, end_time=self.now+timedelta(minutes=5))
        first=ShowItem.objects.create(show=show,track=self.track1,position=0)
        ShowItem.objects.create(show=show,track=self.track2,position=1)
        scheduler=Scheduler();scheduler.next_recurrences=float('inf')
        marker=str(first.id)
        with patch('scripts.radio_scheduler.atomic_write') as write, patch('scripts.radio_scheduler.liquidsoap_cmd',return_value=f'{marker}\nEND'):
            scheduler.tick(self.now)
            first.delete()
            for position in (2,3):
                ShowItem.objects.create(show=show,track=self.track2,position=position)
                scheduler.next_content_check=0
                scheduler.tick(self.now+timedelta(seconds=position))
                self.assertIn('liq_cue_in="0.000000"',write.call_args.args[1])
                self.assertNotIn(f'liq_cue_in="{position:.6f}"',write.call_args.args[1])
