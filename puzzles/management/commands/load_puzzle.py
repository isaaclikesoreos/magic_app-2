from django.core.management.base import BaseCommand, CommandError
from puzzles.models import Puzzle, PuzzleState
from puzzles.puzzle_data import PUZZLE_REGISTRY


class Command(BaseCommand):
    help = 'Load or update a single puzzle by name. Use --list to see available puzzles.'

    def add_arguments(self, parser):
        parser.add_argument(
            'puzzle_name',
            nargs='?',
            type=str,
            help='Puzzle slug (e.g. bolt_the_bird, storm_off). Use --list to see all.',
        )
        parser.add_argument(
            '--list',
            action='store_true',
            help='List all available puzzle names',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Delete and recreate the puzzle if it already exists',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would happen without making changes',
        )

    def handle(self, *args, **options):
        if options['list']:
            self.stdout.write(self.style.SUCCESS('Available puzzles:'))
            for slug, data in PUZZLE_REGISTRY.items():
                existing = Puzzle.objects.filter(title=data['title']).exists()
                status = self.style.SUCCESS('loaded') if existing else self.style.WARNING('not loaded')
                self.stdout.write(f'  {slug:<30s} "{data["title"]}" [{data["difficulty"]}] ({status})')
            return

        puzzle_name = options['puzzle_name']
        if not puzzle_name:
            raise CommandError('Provide a puzzle name or use --list to see available puzzles.')

        if puzzle_name not in PUZZLE_REGISTRY:
            raise CommandError(
                f'Unknown puzzle "{puzzle_name}". Use --list to see available puzzles.'
            )

        puzzle_data = PUZZLE_REGISTRY[puzzle_name]
        title = puzzle_data['title']
        game_state = puzzle_data['game_state']

        existing = Puzzle.objects.filter(title=title).first()

        if options['dry_run']:
            if existing:
                if options['force']:
                    self.stdout.write(f'Would delete and recreate: "{title}"')
                else:
                    self.stdout.write(f'Would skip (already exists): "{title}" — use --force to replace')
            else:
                self.stdout.write(f'Would create: "{title}"')
            return

        if existing:
            if not options['force']:
                self.stdout.write(self.style.WARNING(
                    f'"{title}" already exists (ID: {existing.id}). Use --force to replace it.'
                ))
                return

            existing.delete()
            self.stdout.write(f'Deleted existing puzzle: "{title}"')

        puzzle = Puzzle.objects.create(
            title=title,
            description=puzzle_data['description'],
            difficulty=puzzle_data['difficulty'],
            solution_text=puzzle_data['solution_text'],
            is_published=puzzle_data['is_published'],
        )
        PuzzleState.objects.create(puzzle=puzzle, state_json=game_state)

        self.stdout.write(self.style.SUCCESS(
            f'Created puzzle: "{title}" (ID: {puzzle.id})'
        ))
