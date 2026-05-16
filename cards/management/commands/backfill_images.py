from django.core.management.base import BaseCommand
from django.db import transaction

from cards.models import Card, CardImage
from drafting.models import Card as DraftingCard


class Command(BaseCommand):
    help = "Backfill cards.CardImage rows from drafting.CardImage by name match"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be backfilled without writing",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Also backfill cards that already have images (replaces existing rows)",
        )

    def handle(self, *args, **opts):
        dry_run = opts["dry_run"]
        force = opts["force"]

        if force:
            cards_to_fill = Card.objects.all()
        else:
            cards_to_fill = Card.objects.filter(images__isnull=True).distinct()

        filled = 0
        skipped_no_match = 0
        new_rows = 0

        for card in cards_to_fill:
            drafting_card = DraftingCard.objects.filter(name=card.name).first()
            if not drafting_card:
                skipped_no_match += 1
                continue

            drafting_images = list(drafting_card.images.all())
            if not drafting_images:
                skipped_no_match += 1
                continue

            if dry_run:
                self.stdout.write(
                    f"  [dry] would copy {len(drafting_images)} images for #{card.id} {card.name}"
                )
                filled += 1
                new_rows += len(drafting_images)
                continue

            with transaction.atomic():
                if force:
                    CardImage.objects.filter(card=card).delete()
                # Drafting CardImage URLs encode image_type in the path
                # (e.g. /small/, /normal/, /large/, /png/, /art_crop/).
                stored_any = False
                for di in drafting_images:
                    image_type = self._infer_image_type(di.image_url)
                    if image_type is None:
                        continue
                    CardImage.objects.update_or_create(
                        card=card,
                        image_type=image_type,
                        defaults={
                            "image_url": di.image_url,
                            "is_primary": di.is_primary,
                        },
                    )
                    new_rows += 1
                    stored_any = True
            if stored_any:
                filled += 1
            else:
                skipped_no_match += 1

        action = "Would backfill" if dry_run else "Backfilled"
        self.stdout.write(self.style.SUCCESS(
            f"{action} {filled} card(s) with {new_rows} image row(s); "
            f"{skipped_no_match} card(s) had no name match or no images in drafting."
        ))

    @staticmethod
    def _infer_image_type(url: str):
        for t in ("small", "normal", "large", "png", "art_crop"):
            if f"/{t}/" in url:
                return t
        return None
