import requests
from django.core.management.base import BaseCommand
from cards.models import Card, CardImage


class Command(BaseCommand):
    help = 'Import a card from Scryfall (basic data only, abilities added manually)'

    def add_arguments(self, parser):
        parser.add_argument('card_name', type=str, help='Exact card name to import')

    def handle(self, *args, **options):
        card_name = options['card_name']

        # Fetch from Scryfall
        url = f'https://api.scryfall.com/cards/named?exact={card_name}'
        self.stdout.write(f'Fetching {card_name} from Scryfall...')

        try:
            response = requests.get(url)
            response.raise_for_status()
        except requests.RequestException as e:
            self.stdout.write(self.style.ERROR(f'Failed to fetch card: {e}'))
            return

        data = response.json()

        # Extract basic data (NOT abilities)
        colors = ''.join(data.get('colors', []))

        # Create or update card
        card, created = Card.objects.update_or_create(
            scryfall_id=data['id'],
            defaults={
                'name': data['name'],
                'mana_cost': data.get('mana_cost', ''),
                'cmc': int(data.get('cmc', 0)),
                'type_line': data.get('type_line', ''),
                'oracle_text': data.get('oracle_text', ''),
                'colors': colors,
                'power': data.get('power'),
                'toughness': data.get('toughness'),
                'rarity': data.get('rarity', 'common'),
                'set_code': data.get('set'),
                # card_data left empty for manual editing
                'card_data': {},
            }
        )

        # Import images
        if 'image_uris' in data:
            for img_type in ['small', 'normal', 'large', 'png', 'art_crop']:
                if img_type in data['image_uris']:
                    CardImage.objects.update_or_create(
                        card=card,
                        image_type=img_type,
                        defaults={'image_url': data['image_uris'][img_type]}
                    )

        status = 'Created' if created else 'Updated'
        self.stdout.write(self.style.SUCCESS(f'{status}: {card.name}'))
        self.stdout.write(self.style.WARNING(
            f'⚠️  Abilities NOT imported - edit card_data manually in admin'
        ))
        self.stdout.write(f'Admin URL: /admin/cards/card/{card.id}/change/')
