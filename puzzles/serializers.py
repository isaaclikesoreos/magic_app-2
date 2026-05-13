from rest_framework import serializers
from .models import Puzzle, PuzzleState


class PuzzleStateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PuzzleState
        fields = ['state_json']


class PuzzleListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list view - no game state or solution"""
    created_by_name = serializers.CharField(
        source='created_by.display_name',
        read_only=True,
        default=None
    )

    class Meta:
        model = Puzzle
        fields = ['id', 'title', 'description', 'difficulty', 'created_by_name', 'created_at', 'is_published']


class PuzzleDetailSerializer(serializers.ModelSerializer):
    """Full serializer with game state but solution hidden by default"""
    created_by_name = serializers.CharField(
        source='created_by.display_name',
        read_only=True,
        default=None
    )
    game_state = serializers.SerializerMethodField()

    class Meta:
        model = Puzzle
        fields = ['id', 'title', 'description', 'difficulty', 'created_by_name', 'created_at', 'is_published', 'game_state']

    def get_game_state(self, obj):
        if hasattr(obj, 'game_state'):
            return obj.game_state.state_json
        return None


class PuzzleSolutionSerializer(serializers.ModelSerializer):
    """Serializer for revealing solution"""
    class Meta:
        model = Puzzle
        fields = ['id', 'solution_text']


class PuzzleCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating puzzles with game state"""
    game_state = serializers.JSONField(write_only=True)

    class Meta:
        model = Puzzle
        fields = ['id', 'title', 'description', 'difficulty', 'solution_text', 'is_published', 'game_state']

    def create(self, validated_data):
        game_state_data = validated_data.pop('game_state')
        puzzle = Puzzle.objects.create(**validated_data)
        PuzzleState.objects.create(puzzle=puzzle, state_json=game_state_data)
        return puzzle
