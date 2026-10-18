from django.db import migrations, models
import django.utils.timezone


def backfill(apps, schema_editor):
    Show = apps.get_model('api', 'Show')
    Item = apps.get_model('api', 'ShowItem')
    for show in Show.objects.all().iterator():
        root = Show.objects.get(pk=show.parent_show_id) if show.parent_show_id else show
        Show.objects.filter(pk=show.pk).update(recurrence_time=show.start_time, priority_at=root.created_at)
        # Preserve occurrences with their own existing content; repair empty ones.
        if show.parent_show_id and not Item.objects.filter(show=show).exists():
            Item.objects.bulk_create([Item(show=show, track_id=t.track_id, position=t.position)
                                     for t in Item.objects.filter(show=root)])


class Migration(migrations.Migration):
    dependencies = [('api', '0002_trackfolder')]
    operations = [
        migrations.AddField(model_name='show', name='cancelled', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='show', name='recurrence_time', field=models.DateTimeField(null=True, blank=True)),
        migrations.AddField(model_name='show', name='priority_at', field=models.DateTimeField(default=django.utils.timezone.now)),
        migrations.RunPython(backfill, migrations.RunPython.noop),
        migrations.AddConstraint(model_name='show', constraint=models.UniqueConstraint(fields=('parent_show','recurrence_time'), name='unique_show_occurrence')),
    ]
