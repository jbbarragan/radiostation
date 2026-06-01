from django.core.management.base import BaseCommand
from django.contrib.auth.models import User


class Command(BaseCommand):
    help = 'Creates the default admin user'

    def handle(self, *args, **options):
        if not User.objects.filter(username='admin').exists():
            User.objects.create_superuser('admin', 'admin@radiostation.local', 'admin')
            self.stdout.write(self.style.SUCCESS('Created admin user (admin/admin)'))
        else:
            self.stdout.write('Admin user already exists')
