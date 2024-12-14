# Generated by Django 5.1.3 on 2024-11-15 05:53

import django.contrib.auth.models
import django.contrib.auth.validators
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
    ]

    operations = [
        migrations.CreateModel(
            name='Card',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('mana_cost', models.CharField(blank=True, max_length=50, null=True)),
                ('color', models.CharField(blank=True, max_length=50, null=True)),
                ('type_line', models.CharField(blank=True, max_length=255, null=True)),
            ],
        ),
        migrations.CreateModel(
            name='CustomUser',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('password', models.CharField(max_length=128, verbose_name='password')),
                ('last_login', models.DateTimeField(blank=True, null=True, verbose_name='last login')),
                ('is_superuser', models.BooleanField(default=False, help_text='Designates that this user has all permissions without explicitly assigning them.', verbose_name='superuser status')),
                ('username', models.CharField(error_messages={'unique': 'A user with that username already exists.'}, help_text='Required. 150 characters or fewer. Letters, digits and @/./+/-/_ only.', max_length=150, unique=True, validators=[django.contrib.auth.validators.UnicodeUsernameValidator()], verbose_name='username')),
                ('first_name', models.CharField(blank=True, max_length=150, verbose_name='first name')),
                ('last_name', models.CharField(blank=True, max_length=150, verbose_name='last name')),
                ('is_staff', models.BooleanField(default=False, help_text='Designates whether the user can log into this admin site.', verbose_name='staff status')),
                ('is_active', models.BooleanField(default=True, help_text='Designates whether this user should be treated as active. Unselect this instead of deleting accounts.', verbose_name='active')),
                ('date_joined', models.DateTimeField(default=django.utils.timezone.now, verbose_name='date joined')),
                ('email', models.EmailField(max_length=254, unique=True)),
                ('display_name', models.CharField(blank=True, max_length=255, null=True)),
                ('display_img', models.CharField(blank=True, max_length=255, null=True)),
                ('groups', models.ManyToManyField(blank=True, help_text='The groups this user belongs to. A user will get all permissions granted to each of their groups.', related_name='user_set', related_query_name='user', to='auth.group', verbose_name='groups')),
                ('user_permissions', models.ManyToManyField(blank=True, help_text='Specific permissions for this user.', related_name='user_set', related_query_name='user', to='auth.permission', verbose_name='user permissions')),
            ],
            options={
                'verbose_name': 'user',
                'verbose_name_plural': 'users',
                'abstract': False,
            },
            managers=[
                ('objects', django.contrib.auth.models.UserManager()),
            ],
        ),
        migrations.CreateModel(
            name='Cube',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=255)),
                ('card_count', models.IntegerField(default=0)),
                ('draft_count', models.IntegerField(default=0)),
                ('power_level', models.CharField(blank=True, choices=[('vintage', 'Vintage'), ('legacy', 'Legacy'), ('modern', 'Modern'), ('pioneer', 'Pioneer'), ('pauper', 'Pauper')], max_length=20, null=True)),
                ('tags', models.CharField(blank=True, max_length=255, null=True)),
                ('description', models.TextField(blank=True, null=True)),
                ('creator', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='created_cubes', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='Draft',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('pack_count', models.IntegerField(default=3)),
                ('cards_per_pack', models.IntegerField(default=15)),
                ('player_count', models.IntegerField(default=8)),
                ('active', models.BooleanField(default=True)),
                ('player_list', models.JSONField()),
                ('card_list', models.JSONField()),
                ('cube', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='drafts', to='drafting.cube')),
            ],
        ),
        migrations.CreateModel(
            name='CubeCard',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('card', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='in_cubes', to='drafting.card')),
                ('cube', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cube_cards', to='drafting.cube')),
            ],
            options={
                'unique_together': {('cube', 'card')},
            },
        ),
        migrations.CreateModel(
            name='DeckList',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('card', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='selected_in_decks', to='drafting.card')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='deck_lists', to=settings.AUTH_USER_MODEL)),
                ('draft', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='deck_lists2', to='drafting.draft')),
            ],
            options={
                'unique_together': {('user', 'draft', 'card')},
            },
        ),
        migrations.CreateModel(
            name='DraftPlayer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(blank=True, max_length=50, null=True)),
                ('draft', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='players', to='drafting.draft')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='drafts_participated', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'unique_together': {('draft', 'user')},
            },
        ),
    ]