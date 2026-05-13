"""
Migrate puzzle states from embedded card data to card ID references.

This script:
1. Reads existing puzzle states with embedded card data
2. Maps card names to database IDs
3. Replaces embedded data with card_id + instance_id
4. Updates PuzzleState.required_cards many-to-many relationship
"""
from django.core.management.base import BaseCommand
from puzzles.models import Puzzle, PuzzleState
from cards.models import Card, Token
import json


class Command(BaseCommand):
    help = 'Migrate puzzle states to use card IDs instead of embedded card data'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be changed without actually changing it'
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        # Build name -> ID mappings
        card_name_to_id = {card.name: card.id for card in Card.objects.all()}
        token_name_to_id = {token.name: token.id for token in Token.objects.all()}

        self.stdout.write(f"Loaded {len(card_name_to_id)} cards and {len(token_name_to_id)} tokens from database\n")

        # Process each puzzle
        puzzles = Puzzle.objects.all()
        for puzzle in puzzles:
            self.stdout.write(f"\n{'='*60}")
            self.stdout.write(f"Processing: {puzzle.title}")
            self.stdout.write('='*60)

            if not hasattr(puzzle, 'game_state'):
                self.stdout.write(self.style.WARNING("  No game state found, skipping"))
                continue

            puzzle_state = puzzle.game_state
            state_json = puzzle_state.state_json

            # Track required cards/tokens for this puzzle
            required_cards = set()
            required_tokens = set()

            # Transform the state
            new_state = self.transform_state(
                state_json,
                card_name_to_id,
                token_name_to_id,
                required_cards,
                required_tokens
            )

            # Show changes
            self.stdout.write(f"\n  Required cards: {len(required_cards)}")
            self.stdout.write(f"  Required tokens: {len(required_tokens)}")

            if not dry_run:
                # Update the state
                puzzle_state.state_json = new_state
                puzzle_state.save()

                # Update M2M relationships
                puzzle_state.required_cards.set(list(required_cards))
                puzzle_state.required_tokens.set(list(required_tokens))

                self.stdout.write(self.style.SUCCESS("  ✓ Updated"))
            else:
                self.stdout.write("  [DRY RUN - no changes made]")

        if dry_run:
            self.stdout.write(self.style.WARNING("\n\nDRY RUN - No changes were made"))
        else:
            self.stdout.write(self.style.SUCCESS(f"\n\n✅ Migrated {puzzles.count()} puzzles"))

    def transform_state(self, state, card_map, token_map, required_cards, required_tokens):
        """
        Recursively transform state to use card IDs instead of embedded data
        """
        if isinstance(state, dict):
            # Check if this looks like a card object
            if 'name' in state and ('card_id' in state or 'mana_cost' in state or 'type_line' in state):
                return self.transform_card_instance(state, card_map, token_map, required_cards, required_tokens)

            # Otherwise recurse into dict
            return {key: self.transform_state(val, card_map, token_map, required_cards, required_tokens)
                    for key, val in state.items()}

        elif isinstance(state, list):
            return [self.transform_state(item, card_map, token_map, required_cards, required_tokens)
                    for item in state]

        else:
            # Primitive value, return as-is
            return state

    def transform_card_instance(self, card_obj, card_map, token_map, required_cards, required_tokens):
        """
        Transform a single card instance from embedded data to ID reference
        """
        card_name = card_obj.get('name')
        old_instance_id = card_obj.get('card_id', 'unknown')

        # Look up database ID
        db_id = None
        is_token = False

        if card_name in card_map:
            db_id = card_map[card_name]
            required_cards.add(db_id)
        elif card_name in token_map:
            db_id = token_map[card_name]
            is_token = True
            required_tokens.add(db_id)
        else:
            self.stdout.write(self.style.ERROR(f"    ⚠️  Card/Token not found in database: {card_name}"))
            # Keep original data if not found
            return card_obj

        # Build new instance object with only instance state
        new_instance = {
            'card_id': db_id,
            'instance_id': old_instance_id,
            'is_token': is_token,
        }

        # Copy instance-specific state (not card definition)
        instance_fields = [
            'tapped', 'summoning_sick', 'damage', 'counters',
            'marked_damage', 'attached_to', 'equipped_to',
            'enchanting', 'blocking', 'blocked_by'
        ]

        for field in instance_fields:
            if field in card_obj:
                new_instance[field] = card_obj[field]

        # Special handling for certain fields
        if 'isChannel' in card_obj:
            new_instance['isChannel'] = card_obj['isChannel']

        return new_instance
