from django.contrib import admin
from django.utils.html import format_html
from .models import Card, CardImage, Token


class CardImageInline(admin.TabularInline):
    model = CardImage
    extra = 0
    fields = ('image_url', 'image_type', 'is_primary')


@admin.register(Card)
class CardAdmin(admin.ModelAdmin):
    list_display = ('name', 'mana_cost', 'type_line', 'colors', 'power_toughness', 'rarity', 'has_abilities')
    list_filter = ('rarity', 'colors', 'cmc')
    search_fields = ('name', 'oracle_text', 'type_line')
    readonly_fields = ('created_at', 'updated_at', 'scryfall_id')
    inlines = [CardImageInline]

    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'mana_cost', 'cmc', 'type_line', 'colors', 'rarity', 'set_code')
        }),
        ('Stats', {
            'fields': ('power', 'toughness', 'oracle_text')
        }),
        ('Game Data (Manual)', {
            'fields': ('card_data',),
            'description': 'Edit abilities, keywords, and special effects manually using JSON format'
        }),
        ('Scryfall Data', {
            'fields': ('scryfall_id',),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def power_toughness(self, obj):
        """Display P/T for creatures"""
        if obj.power and obj.toughness:
            return f"{obj.power}/{obj.toughness}"
        return "-"
    power_toughness.short_description = "P/T"

    def has_abilities(self, obj):
        """Show if card has abilities defined"""
        abilities = obj.get_abilities()
        count = sum([
            len(abilities.get('keywords', [])),
            len(abilities.get('triggered', [])),
            len(abilities.get('activated', [])),
            len(abilities.get('static', [])),
            1 if abilities.get('spell_effect') else 0
        ])
        if count > 0:
            return format_html('<span style="color: green;">✓ ({})</span>', count)
        return '-'
    has_abilities.short_description = "Abilities"


@admin.register(CardImage)
class CardImageAdmin(admin.ModelAdmin):
    list_display = ('card', 'image_type', 'is_primary', 'thumbnail')
    list_filter = ('image_type', 'is_primary')
    search_fields = ('card__name',)

    def thumbnail(self, obj):
        if obj.image_url:
            return format_html('<img src="{}" width="100" />', obj.image_url)
        return "-"
    thumbnail.short_description = "Preview"


@admin.register(Token)
class TokenAdmin(admin.ModelAdmin):
    list_display = ('name', 'type_line', 'power_toughness', 'colors', 'has_abilities', 'created_by_summary')
    list_filter = ('colors',)
    search_fields = ('name', 'type_line', 'created_by')
    readonly_fields = ('created_at', 'updated_at')

    fieldsets = (
        ('Basic Information', {
            'fields': ('name', 'type_line', 'colors')
        }),
        ('Stats', {
            'fields': ('power', 'toughness')
        }),
        ('Abilities', {
            'fields': ('token_data',),
            'description': 'Edit abilities and keywords manually using JSON format'
        }),
        ('Documentation', {
            'fields': ('created_by',),
            'description': 'List which cards create this token (for reference)'
        }),
        ('Metadata', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def power_toughness(self, obj):
        """Display P/T for creature tokens"""
        if obj.power and obj.toughness:
            return f"{obj.power}/{obj.toughness}"
        return "-"
    power_toughness.short_description = "P/T"

    def has_abilities(self, obj):
        """Show if token has abilities defined"""
        abilities = obj.get_abilities()
        count = sum([
            len(abilities.get('keywords', [])),
            len(abilities.get('triggered', [])),
            len(abilities.get('activated', [])),
            len(abilities.get('static', [])),
        ])
        if count > 0:
            return format_html('<span style="color: green;">✓ ({})</span>', count)
        return '-'
    has_abilities.short_description = "Abilities"

    def created_by_summary(self, obj):
        """Show abbreviated created_by text"""
        if obj.created_by:
            lines = obj.created_by.split('\n')
            return lines[0][:50] + '...' if len(lines[0]) > 50 else lines[0]
        return '-'
    created_by_summary.short_description = "Created By"
