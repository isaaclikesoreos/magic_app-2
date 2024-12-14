from django.db import models
from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.contrib.auth.models import BaseUserManager
import random


class CustomUserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("The Email field must be set")
        email = self.normalize_email(email)
        if not extra_fields.get("username"):
            extra_fields["username"] = self.generate_random_username()
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if not extra_fields.get("username"):
            extra_fields["username"] = self.generate_random_username()
        return self.create_user(email, password, **extra_fields)

    @staticmethod
    def generate_random_username():
        return str(random.randint(10000000, 99999999))  # Random 8-digit number


class CustomUser(AbstractUser):
    id = models.AutoField(primary_key=True)  # Add auto-incrementing primary key
    email = models.EmailField(unique=True)
    display_name = models.CharField(max_length=255, blank=True, null=True)
    display_img = models.CharField(max_length=255, blank=True, null=True)

    USERNAME_FIELD = 'email'  # Use email to log in
    REQUIRED_FIELDS = []  # Remove username from required fields

    objects = CustomUserManager()

    def save(self, *args, **kwargs):
        if not self.display_name:
            self.display_name = self.username
        super().save(*args, **kwargs)

    def __str__(self):
        return self.email



class Cube(models.Model):
    POWER_LEVEL_CHOICES = [
        ('vintage', 'Vintage'),
        ('legacy', 'Legacy'),
        ('modern', 'Modern'),
        ('pioneer', 'Pioneer'),
        ('pauper', 'Pauper'),
    ]

    name = models.CharField(max_length=255)
    creator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='created_cubes')
    card_count = models.IntegerField(default=0)
    draft_count = models.IntegerField(default=0)
    power_level = models.CharField(max_length=20, choices=POWER_LEVEL_CHOICES, null=True, blank=True)
    tags = models.CharField(max_length=255, null=True, blank=True)
    description = models.TextField(null=True, blank=True)

    def __str__(self):
        return self.name

class Card(models.Model):
    name = models.CharField(max_length=255)
    mana_cost = models.CharField(max_length=50, null=True, blank=True)
    color = models.CharField(max_length=50, null=True, blank=True)
    type_line = models.CharField(max_length=255, null=True, blank=True)

    def __str__(self):
        return self.name


class Draft(models.Model):
    id = models.AutoField(primary_key=True)
    cube = models.ForeignKey(Cube, on_delete=models.CASCADE, related_name='drafts')
    pack_count = models.IntegerField(default=3)
    cards_per_pack = models.IntegerField(default=15)
    player_count = models.IntegerField()
    active = models.BooleanField(default=True)
  # Stores the list of cards in this draft as JSON

    def __str__(self):
        return f"Draft for {self.cube.name}"


class CubeCard(models.Model):
    cube = models.ForeignKey(Cube, on_delete=models.CASCADE, related_name='cube_cards')
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name='in_cubes')

    class Meta:
        unique_together = ('cube', 'card')  # Ensures no duplicate card entries in the same cube

    def __str__(self):
        return f"{self.card.name} in {self.cube.name}"


class DraftPlayer(models.Model):
    draft = models.ForeignKey(Draft, on_delete=models.CASCADE, related_name='players')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='drafts_participated')
    role = models.CharField(max_length=50, null=True, blank=True)

    class Meta:
        unique_together = ('draft', 'user')  # Ensures each player is unique in a draft

    def __str__(self):
        return f"{self.user.email} in {self.draft.cube.name} draft"


class DeckList(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='deck_lists')
    draft = models.ForeignKey(Draft, on_delete=models.CASCADE, related_name='deck_lists2')
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name='selected_in_decks')

    class Meta:
        unique_together = ('user', 'draft', 'card')  # Ensures each card entry is unique per draft for each user

    def __str__(self):
        return f"{self.card.name} selected by {self.user.email} in {self.draft.cube.name} draft"


class CardImage(models.Model):
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name="images")
    image_url = models.URLField(max_length=500)  # URL for the card image
    is_primary = models.BooleanField(default=False)  # Mark the primary image

    def __str__(self):
        return f"Image for {self.card.name} ({'Primary' if self.is_primary else 'Secondary'})"


class CubeImage(models.Model):
    cube = models.ForeignKey(Cube, on_delete=models.CASCADE, related_name="images")
    image_url = models.URLField(max_length=500)  # URL for the cube image
    is_primary = models.BooleanField(default=False)  # Mark the primary image

    def __str__(self):
        return f"Image for Cube: {self.cube.name} ({'Primary' if self.is_primary else 'Secondary'})"

