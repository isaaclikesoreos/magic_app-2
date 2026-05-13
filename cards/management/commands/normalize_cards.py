"""
Django management command to normalize card abilities to standard format.
"""

from django.core.management.base import BaseCommand
from django.db.models import Q
from cards.models import Card
from cards.abilities import normalize_card_abilities, validate_card_abilities
import json


class Command(BaseCommand):
    help = 'Normalize card abilities to standardized format'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be changed without actually saving'
        )
        parser.add_argument(
            '--card',
            type=str,
            help='Normalize a specific card by name'
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Show before/after for each card'
        )

    def handle(self, *args, **options):
        # Get cards to normalize
        if options['card']:
            cards = Card.objects.filter(name__iexact=options['card'])
            if not cards.exists():
                self.stdout.write(self.style.ERROR(f"Card '{options['card']}' not found"))
                return
        else:
            # Get cards with abilities
            cards = Card.objects.filter(
                Q(card_data__abilities__isnull=False) |
                Q(card_data__triggered_abilities__isnull=False) |
                Q(card_data__activated_abilities__isnull=False) |
                Q(card_data__keywords__isnull=False) |
                Q(card_data__hasHaste=True) |
                Q(card_data__hasProwess=True)
            )

        total_cards = cards.count()
        normalized_count = 0
        skipped_count = 0

        self.stdout.write(f"\nNormalizing {total_cards} cards...\n")

        for card in cards:
            original_data = card.card_data.copy()

            # Normalize abilities
            normalized_data = normalize_card_abilities(card.card_data, convert_legacy=True)

            # Check if anything changed
            original_abilities = original_data.get('abilities', original_data)
            normalized_abilities = normalized_data.get('abilities', {})

            # Simple comparison (could be more sophisticated)
            if json.dumps(original_abilities, sort_keys=True) == json.dumps(normalized_abilities, sort_keys=True):
                skipped_count += 1
                if options['verbose']:
                    self.stdout.write(f"⏭️  {card.name} - No changes needed")
                continue

            # Show what will be changed
            self.stdout.write(f"\n{'🔧' if not options['dry_run'] else '👁️ '} {self.style.WARNING(card.name)}")

            if options['verbose']:
                self.stdout.write("   BEFORE:")
                self.stdout.write(f"   {json.dumps(original_abilities, indent=2)}")
                self.stdout.write("\n   AFTER:")
                self.stdout.write(f"   {json.dumps(normalized_abilities, indent=2)}")

            # Validate the normalized version
            result = validate_card_abilities(normalized_data)
            if not result.is_valid:
                self.stdout.write(self.style.ERROR("   ⚠️  Normalized version has validation errors:"))
                for error in result.errors:
                    self.stdout.write(f"     • {error.path}: {error.message}")
            elif result.has_warnings:
                self.stdout.write(self.style.WARNING("   ⚠️  Normalized version has warnings:"))
                for warning in result.warnings:
                    self.stdout.write(f"     • {warning.path}: {warning.message}")

            # Save changes
            if not options['dry_run']:
                card.card_data = normalized_data
                card.save()
                normalized_count += 1
                self.stdout.write(self.style.SUCCESS("   ✅ Saved"))
            else:
                normalized_count += 1

        # Summary
        self.stdout.write("\n" + "=" * 60)
        if options['dry_run']:
            self.stdout.write(self.style.WARNING(f"\n👁️  DRY RUN - No changes were saved"))
        self.stdout.write(self.style.SUCCESS(f"\n✅ Cards normalized: {normalized_count}"))
        self.stdout.write(f"⏭️  Cards skipped (already normalized): {skipped_count}")
        self.stdout.write(f"📊 Total: {total_cards}\n")

        if options['dry_run'] and normalized_count > 0:
            self.stdout.write(self.style.WARNING("\nRun without --dry-run to save changes\n"))
