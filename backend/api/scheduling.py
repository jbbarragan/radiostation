"""Recurrences, shared series content and a single deterministic playout policy."""
import calendar
from datetime import timedelta
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from .models import Show, ShowItem


def active_show(now=None):
    now = now or timezone.now()
    # Manual Go Live retains its existing override. Scheduled overlaps use the
    # most recently scheduled/moved show, not the first start_time in the DB.
    return (Show.objects.filter(cancelled=False, end_time__gt=now)
            .filter(Q(is_live=True) | Q(start_time__lte=now))
            .order_by('-is_live', '-priority_at', '-start_time', '-id').first())


def copy_content(source, targets):
    tracks = list(source.show_items.order_by('position', 'id').values_list('track_id', flat=True))
    ids = list(targets.values_list('id', flat=True))
    ShowItem.objects.filter(show_id__in=ids).delete()
    ShowItem.objects.bulk_create([ShowItem(show_id=s, track_id=t, position=i)
                                 for s in ids for i, t in enumerate(tracks)], batch_size=500)


def sync_content(show):
    root_id = show.parent_show_id or show.id
    root = Show.objects.get(pk=root_id)
    if show.id != root.id:
        copy_content(show, Show.objects.filter(pk=root.id))
    targets = Show.objects.filter(parent_show_id=root.id, cancelled=False).exclude(pk=show.id)
    targets = targets.filter(end_time__gt=timezone.now())
    copy_content(root, targets)


def occurrence_times(root, first, last):
    anchor = timezone.localtime(root.recurrence_time or root.start_time)
    first = timezone.localtime(first)
    last = timezone.localtime(last)
    if root.repeat_until:
        last = min(last, anchor.replace(year=root.repeat_until.year, month=root.repeat_until.month,
                                        day=root.repeat_until.day, hour=23, minute=59, second=59))
    if root.repeat == 'monthly':
        n = max(1, (first.year-anchor.year)*12 + first.month-anchor.month)
        while True:
            y, m = divmod(anchor.year*12 + anchor.month-1+n, 12)
            current = anchor.replace(year=y, month=m+1, day=min(anchor.day, calendar.monthrange(y,m+1)[1]))
            if current > last:
                break
            if current >= first:
                yield current
            n += 1
    elif root.repeat in ('daily', 'weekly', 'custom_days'):
        step = 7 if root.repeat == 'weekly' else 1
        n = max(1, (first.date()-anchor.date()).days // step)
        current = anchor + timedelta(days=n*step)
        while current <= last:
            # Browser weekday convention: Sunday=0.
            if current >= first and (root.repeat != 'custom_days' or (current.weekday()+1)%7 in root.repeat_days):
                yield current
            current += timedelta(days=step)


def ensure_occurrences(first=None, last=None):
    first = first or timezone.now()-timedelta(days=1)
    last = last or timezone.now()+timedelta(days=90)
    # Row lock serializes generators and edits on PostgreSQL; SQLite serializes writes.
    for root_id in Show.objects.filter(parent_show=None).exclude(repeat='none').values_list('id', flat=True):
        with transaction.atomic():
            root = Show.objects.select_for_update().filter(pk=root_id).first()
            if root is None:
                continue
            duration = root.end_time-root.start_time
            for start in occurrence_times(root, first-duration, last):
                obj, created = Show.objects.get_or_create(parent_show=root, recurrence_time=start, defaults={
                    'title': root.title, 'color': root.color, 'start_time': start, 'end_time': start+duration,
                    'created_by': root.created_by, 'priority_at': root.priority_at,
                })
                if created:
                    copy_content(root, Show.objects.filter(pk=obj.id))
