"""
Django management command to validate card abilities.
"""

from django.core.management.base import BaseCommand
from django.db.models import Q
from cards.models import Card, Token
from cards.abilities import validate_card_abilities, get_ability_summary


class Command(BaseCommand):
    help = 'Validate card abilities against the schema'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Attempt to auto-fix validation issues'
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Show detailed validation results for each card'
        )
        parser.add_argument(
            '--errors-only',
            action='store_true',
            help='Only show cards with errors (skip warnings)'
        )
        parser.add_argument(
            '--card',
            type=str,
            help='Validate a specific card by name'
        )

    def handle(self, *args, **options):
        # Get cards to validate
        if options['card']:
            cards = Card.objects.filter(name__iexact=options['card'])
            if not cards.exists():
                self.stdout.write(self.style.ERROR(f"Card '{options['card']}' not found"))
                return
        else:
            # Only validate cards that have abilities
            cards = Card.objects.filter(
                Q(card_data__abilities__isnull=False) |
                Q(card_data__triggered_abilities__isnull=False) |
                Q(card_data__activated_abilities__isnull=False) |
                Q(card_data__keywords__isnull=False)
            )

        total_cards = cards.count()
        cards_with_errors = 0
        cards_with_warnings = 0
        total_errors = 0
        total_warnings = 0

        self.stdout.write(f"\nValidating {total_cards} cards...\n")

        for card in cards:
            # Validate card abilities
            result = validate_card_abilities(card.card_data)

            # Skip cards with only warnings if --errors-only is set
            if options['errors_only'] and result.is_valid:
                continue

            # Track stats
            if not result.is_valid:
                cards_with_errors += 1
                total_errors += len(result.errors)

            if result.has_warnings:
                cards_with_warnings += 1
                total_warnings += len(result.warnings)

            # Print results
            if not result.is_valid or result.has_warnings or options['verbose']:
                # Card header
                status_icon = '❌' if not result.is_valid else '⚠️ ' if result.has_warnings else '✅'
                self.stdout.write(
                    f"\n{status_icon} {self.style.WARNING(card.name)} (ID: {card.id})"
                )

                # Show ability summary
                summary = get_ability_summary(card.card_data)
                self.stdout.write(f"   {summary}")

                # Show errors
                if result.errors:
                    self.stdout.write(self.style.ERROR(f"\n   Errors:"))
                    for error in result.errors:
                        self.stdout.write(f"     • {error.path}: {error.message}")

                # Show warnings
                if result.warnings:
                    self.stdout.write(self.style.WARNING(f"\n   Warnings:"))
                    for warning in result.warnings:
                        self.stdout.write(f"     • {warning.path}: {warning.message}")

                # Show raw data if very verbose
                if options['verbose']:
                    self.stdout.write(f"\n   Raw abilities:")
                    abilities = card.card_data.get('abilities', card.card_data)
                    import json
                    self.stdout.write(f"   {json.dumps(abilities, indent=2)}")

        # Summary
        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(self.style.SUCCESS(f"\n✅ Valid cards: {total_cards - cards_with_errors}"))

        if cards_with_errors > 0:
            self.stdout.write(
                self.style.ERROR(f"❌ Cards with errors: {cards_with_errors} ({total_errors} total errors)")
            )

        if cards_with_warnings > 0:
            self.stdout.write(
                self.style.WARNING(f"⚠️  Cards with warnings: {cards_with_warnings} ({total_warnings} total warnings)")
            )

        self.stdout.write("")  # Empty line at end

        # Exit with error code if there are errors
        if cards_with_errors > 0:
            import sys
            sys.exit(1)
