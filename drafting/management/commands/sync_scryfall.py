"""
Django management command to sync card database with Scryfall.
Usage: python manage.py sync_scryfall
"""
from django.core.management.base import BaseCommand
from drafting.models import Card, CardImage
import requests
import sys


class Command(BaseCommand):
    help = 'Sync card database with Scryfall bulk data'

    def add_arguments(self, parser):
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='Limit number of cards to process (0 = no limit, for testing use something like 1000)',
        )

    def handle(self, *args, **options):
        limit = options['limit']

        self.stdout.write(self.style.NOTICE('Starting Scryfall sync...'))

        try:
            # Fetch Scryfall bulk data metadata
            self.stdout.write('Fetching bulk data metadata from Scryfall...')
            metadata_response = requests.get("https://api.scryfall.com/bulk-data")
            metadata_response.raise_for_status()
            bulk_data = metadata_response.json()

            # Find the default_cards dataset
            default_cards_data = next(
                item for item in bulk_data["data"] if item["type"] == "default_cards"
            )
            download_url = default_cards_data["download_uri"]

            self.stdout.write(f'Downloading card data from: {download_url}')
            self.stdout.write(self.style.WARNING('This may take a few minutes...'))

            # Stream the download to handle large file
            card_data_response = requests.get(download_url, stream=True)
            card_data_response.raise_for_status()

            # Get total size for progress
            total_size = int(card_data_response.headers.get('content-length', 0))
            self.stdout.write(f'Download size: {total_size / (1024*1024):.1f} MB')

            # Download with progress
            chunks = []
            downloaded = 0
            for chunk in card_data_response.iter_content(chunk_size=8192):
                chunks.append(chunk)
                downloaded += len(chunk)
                if total_size > 0:
                    percent = (downloaded / total_size) * 100
                    sys.stdout.write(f'\rDownloading: {percent:.1f}%')
                    sys.stdout.flush()

            self.stdout.write('')  # Newline after progress
            self.stdout.write('Parsing JSON data...')

            import json
            scryfall_data = json.loads(b''.join(chunks))

            total_cards = len(scryfall_data)
            self.stdout.write(f'Found {total_cards} cards in Scryfall data')

            if limit > 0:
                scryfall_data = scryfall_data[:limit]
                self.stdout.write(f'Processing first {limit} cards only (--limit flag)')

            # Process card data
            self.stdout.write('Processing cards...')
            cards_processed = 0
            cards_created = 0
            images_created = 0

            for i, card_data in enumerate(scryfall_data):
                name = card_data.get("name", "").strip()
                if not name:
                    continue

                mana_cost = card_data.get("mana_cost", "")
                type_line = card_data.get("type_line", "")
                colors = ",".join(card_data.get("colors", []))
                image_urls = card_data.get("image_uris", {})

                # Update or create the card
                card, created = Card.objects.update_or_create(
                    name=name,
                    defaults={
                        "mana_cost": mana_cost,
                        "color": colors,
                        "type_line": type_line,
                    },
                )

                if created:
                    cards_created += 1

                # Store images for the card
                for size, url in image_urls.items():
                    _, img_created = CardImage.objects.update_or_create(
                        card=card,
                        image_url=url,
                        defaults={"is_primary": size == "normal"},
                    )
                    if img_created:
                        images_created += 1

                cards_processed += 1

                # Progress update every 1000 cards
                if cards_processed % 1000 == 0:
                    self.stdout.write(f'Processed {cards_processed}/{len(scryfall_data)} cards...')

            self.stdout.write('')
            self.stdout.write(self.style.SUCCESS(
                f'Sync complete! Processed {cards_processed} cards, '
                f'created {cards_created} new cards, {images_created} new images.'
            ))

        except requests.exceptions.RequestException as e:
            self.stdout.write(self.style.ERROR(f'Network error: {e}'))
            return

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error: {e}'))
            raise
