# Generated by Django 5.1.3 on 2024-11-19 04:12

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('drafting', '0004_card_image'),
    ]

    operations = [
        migrations.AddField(
            model_name='cube',
            name='cube_image',
            field=models.URLField(blank=True, max_length=500, null=True),
        ),
    ]
