# Generated by Django 5.1.3 on 2024-11-25 02:06

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('drafting', '0008_alter_draft_id'),
    ]

    operations = [
        migrations.AlterField(
            model_name='draft',
            name='player_count',
            field=models.IntegerField(),
        ),
    ]
