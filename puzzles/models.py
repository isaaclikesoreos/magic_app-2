from django.db import models
from django.conf import settings


class Puzzle(models.Model):
    DIFFICULTY_CHOICES = [
        ('easy', 'Easy'),
        ('medium', 'Medium'),
        ('hard', 'Hard'),
        ('expert', 'Expert'),
    ]

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    difficulty = models.CharField(max_length=20, choices=DIFFICULTY_CHOICES)
    solution_text = models.TextField()  # Text explanation of the solution
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_puzzles'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    is_published = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class PuzzleState(models.Model):
    puzzle = models.OneToOneField(
        Puzzle,
        on_delete=models.CASCADE,
        related_name='game_state'
    )
    state_json = models.JSONField()  # Game state with card IDs only

    # Track which cards/tokens are needed for this puzzle
    # Allows bulk fetching on puzzle load
    required_cards = models.ManyToManyField(
        'cards.Card',
        blank=True,
        related_name='used_in_puzzles',
        help_text='Cards referenced in this puzzle state'
    )
    required_tokens = models.ManyToManyField(
        'cards.Token',
        blank=True,
        related_name='used_in_puzzles',
        help_text='Tokens referenced in this puzzle state'
    )

    def __str__(self):
        return f"State for {self.puzzle.title}"
