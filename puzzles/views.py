from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, IsAuthenticatedOrReadOnly, AllowAny
from django.db.models import Q
from .models import Puzzle, PuzzleState
from .serializers import (
    PuzzleListSerializer,
    PuzzleDetailSerializer,
    PuzzleSolutionSerializer,
    PuzzleCreateSerializer
)


class PuzzleViewSet(viewsets.ModelViewSet):
    """
    ViewSet for puzzles.
    - list: Returns all published puzzles (or all for staff)
    - retrieve: Returns puzzle with game state
    - create: Creates new puzzle (authenticated users)
    - reveal_solution: Returns solution text
    """
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_queryset(self):
        queryset = Puzzle.objects.select_related('game_state', 'created_by')

        # Filter by difficulty if provided
        difficulty = self.request.query_params.get('difficulty')
        if difficulty:
            queryset = queryset.filter(difficulty=difficulty)

        # Non-staff users only see published puzzles
        if not self.request.user.is_staff:
            queryset = queryset.filter(is_published=True)

        return queryset

    def get_serializer_class(self):
        if self.action == 'list':
            return PuzzleListSerializer
        elif self.action == 'create':
            return PuzzleCreateSerializer
        elif self.action == 'reveal_solution':
            return PuzzleSolutionSerializer
        return PuzzleDetailSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['get'], permission_classes=[AllowAny])
    def reveal_solution(self, request, pk=None):
        """Get the solution text for a puzzle"""
        puzzle = self.get_object()
        serializer = PuzzleSolutionSerializer(puzzle)
        return Response(serializer.data)
