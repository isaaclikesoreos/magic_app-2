import json
from django.contrib import admin
from .models import Puzzle, PuzzleState


class PuzzleStateInline(admin.StackedInline):
    model = PuzzleState
    extra = 0


@admin.register(Puzzle)
class PuzzleAdmin(admin.ModelAdmin):
    list_display = ['title', 'difficulty', 'is_published', 'card_names_display', 'created_by', 'created_at']
    list_filter = ['difficulty', 'is_published', 'created_at']
    search_fields = ['title', 'description']
    inlines = [PuzzleStateInline]

    def get_search_results(self, request, queryset, search_term):
        queryset, use_distinct = super().get_search_results(request, queryset, search_term)
        if search_term:
            # Also search inside game state JSON for card names
            json_matches = PuzzleState.objects.filter(
                state_json__icontains=search_term
            ).values_list('puzzle_id', flat=True)
            queryset = queryset | self.model.objects.filter(pk__in=json_matches)
            use_distinct = True
        return queryset, use_distinct

    def card_names_display(self, obj):
        """Show card names from the puzzle's game state."""
        try:
            state = obj.game_state.state_json
            names = set()
            for player_data in state.get('players', {}).values():
                for zone in ('hand', 'battlefield', 'graveyard', 'library'):
                    for card in player_data.get(zone, []):
                        if isinstance(card, dict) and 'name' in card:
                            name = card['name']
                            type_line = (card.get('type_line') or '').lower()
                            if 'land' not in type_line:
                                names.add(name)
            return ', '.join(sorted(names)[:8]) + ('...' if len(names) > 8 else '')
        except Exception:
            return '-'
    card_names_display.short_description = 'Cards'


@admin.register(PuzzleState)
class PuzzleStateAdmin(admin.ModelAdmin):
    list_display = ['puzzle', 'id', 'card_names_display']
    search_fields = ['puzzle__title']

    def get_search_results(self, request, queryset, search_term):
        queryset, use_distinct = super().get_search_results(request, queryset, search_term)
        if search_term:
            json_matches = queryset.model.objects.filter(
                state_json__icontains=search_term
            )
            queryset = queryset | json_matches
            use_distinct = True
        return queryset, use_distinct

    def card_names_display(self, obj):
        """Show card names from the game state."""
        try:
            state = obj.state_json
            names = set()
            for player_data in state.get('players', {}).values():
                for zone in ('hand', 'battlefield', 'graveyard', 'library'):
                    for card in player_data.get(zone, []):
                        if isinstance(card, dict) and 'name' in card:
                            name = card['name']
                            type_line = (card.get('type_line') or '').lower()
                            if 'land' not in type_line:
                                names.add(name)
            return ', '.join(sorted(names)[:8]) + ('...' if len(names) > 8 else '')
        except Exception:
            return '-'
    card_names_display.short_description = 'Cards'
