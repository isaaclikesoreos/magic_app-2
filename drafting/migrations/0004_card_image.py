# Generated by Django 5.1.3 on 2024-11-18 01:44

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('drafting', '0003_alter_customuser_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='card',
            name='image',
            field=models.URLField(blank=True, max_length=500, null=True),
        ),
    ]
