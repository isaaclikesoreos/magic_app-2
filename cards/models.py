from django.db import models
from django.core.validators import MinValueValidator


class Card(models.Model):
    """
    Central card model - single source of truth for all card data.
    Used by both drafting and puzzle systems.
    """

    # === BASIC IDENTIFICATION ===
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255, db_index=True)

    # Scryfall integration (for importing basic data)
    scryfall_id = models.UUIDField(null=True, blank=True, unique=True)

    # === CARD CHARACTERISTICS (from Scryfall) ===
    mana_cost = models.CharField(max_length=50, blank=True, default='')
    cmc = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Converted Mana Cost"
    )
    type_line = models.CharField(max_length=255, db_index=True, default='')
    oracle_text = models.TextField(blank=True, default='')

    # Colors (stored as string for easy filtering: "W", "WU", "WUB", etc.)
    colors = models.CharField(
        max_length=5,
        blank=True,
        default='',
        db_index=True,
        help_text="WUBRG color identity"
    )

    # Creature stats
    power = models.CharField(max_length=10, null=True, blank=True)
    toughness = models.CharField(max_length=10, null=True, blank=True)

    # === GAME DATA (Manually edited) ===
    card_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Game mechanics: abilities, keywords, special effects (edit manually)"
    )
    # Example card_data structure:
    # {
    #   "keywords": ["flying", "lifelink"],
    #   "triggered_abilities": [...],
    #   "activated_abilities": [...],
    #   "spell_effect": {...}  # For instants/sorceries
    # }

    # === METADATA ===
    rarity = models.CharField(
        max_length=20,
        choices=[
            ('common', 'Common'),
            ('uncommon', 'Uncommon'),
            ('rare', 'Rare'),
            ('mythic', 'Mythic Rare'),
        ],
        default='common',
        db_index=True
    )

    set_code = models.CharField(max_length=10, null=True, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['colors']),
            models.Index(fields=['cmc']),
        ]

    def __str__(self):
        return f"{self.name} ({self.mana_cost or 'no cost'})"

    def get_abilities(self):
        """Extract all abilities from card_data"""
        # Support both nested 'abilities' structure and flat structure
        abilities_data = self.card_data.get('abilities', self.card_data)

        return {
            'keywords': abilities_data.get('keywords', []),
            'triggered': abilities_data.get('triggered', abilities_data.get('triggered_abilities', [])),
            'activated': abilities_data.get('activated', abilities_data.get('activated_abilities', [])),
            'static': abilities_data.get('static', abilities_data.get('static_abilities', [])),
            'spell_effect': abilities_data.get('spell_effect'),
        }


class CardImage(models.Model):
    """
    Card images from Scryfall
    """
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name='images')
    image_url = models.URLField(max_length=500)
    image_type = models.CharField(
        max_length=20,
        choices=[
            ('small', 'Small'),
            ('normal', 'Normal'),
            ('large', 'Large'),
            ('png', 'PNG'),
            ('art_crop', 'Art Crop'),
        ],
        default='normal'
    )
    is_primary = models.BooleanField(default=False)

    class Meta:
        unique_together = ('card', 'image_type')

    def __str__(self):
        return f"{self.card.name} - {self.image_type}"


class Token(models.Model):
    """
    Token creatures/permanents created by card effects.
    Separate from regular cards since they're not in Scryfall.
    """
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255, db_index=True)

    # Token characteristics
    type_line = models.CharField(max_length=255, default='Token')
    colors = models.CharField(
        max_length=5,
        blank=True,
        default='',
        help_text="WUBRG color identity"
    )

    # Creature stats (most tokens are creatures)
    power = models.CharField(max_length=10, null=True, blank=True)
    toughness = models.CharField(max_length=10, null=True, blank=True)

    # Abilities (same structure as Card)
    token_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Abilities and keywords for this token"
    )

    # Documentation
    created_by = models.TextField(
        blank=True,
        default='',
        help_text="Which cards create this token (for reference)"
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        if self.power and self.toughness:
            return f"{self.name} ({self.power}/{self.toughness})"
        return self.name

    def get_abilities(self):
        """Extract all abilities from token_data (same structure as Card)"""
        abilities_data = self.token_data.get('abilities', self.token_data)

        return {
            'keywords': abilities_data.get('keywords', []),
            'triggered': abilities_data.get('triggered', abilities_data.get('triggered_abilities', [])),
            'activated': abilities_data.get('activated', abilities_data.get('activated_abilities', [])),
            'static': abilities_data.get('static', abilities_data.get('static_abilities', [])),
            'spell_effect': abilities_data.get('spell_effect'),
        }
