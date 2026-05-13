from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from .models import Card, Token
from .serializers import CardSerializer, CardMinimalSerializer, TokenSerializer, TokenMinimalSerializer


class CardViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for cards
    - List all cards
    - Retrieve single card
    - Bulk fetch multiple cards
    - Search cards
    """
    queryset = Card.objects.all()
    serializer_class = CardSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_serializer_class(self):
        """Use minimal serializer for list view"""
        if self.action == 'list':
            return CardMinimalSerializer
        return CardSerializer

    @action(detail=False, methods=['post'])
    def bulk_fetch(self, request):
        """
        Fetch multiple cards by ID
        POST /api/cards/bulk/
        Body: {"card_ids": [1, 2, 3]}
        """
        card_ids = request.data.get('card_ids', [])
        if not card_ids:
            return Response(
                {'error': 'card_ids is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        cards = Card.objects.filter(id__in=card_ids)
        serializer = CardSerializer(cards, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def search(self, request):
        """
        Search cards by name, type, color, etc.
        GET /api/cards/search/?q=lightning&color=R&type=instant
        """
        query = request.query_params.get('q', '')
        color = request.query_params.get('color', '')
        card_type = request.query_params.get('type', '')

        cards = Card.objects.all()

        if query:
            cards = cards.filter(name__icontains=query)
        if color:
            cards = cards.filter(colors__contains=color)
        if card_type:
            cards = cards.filter(type_line__icontains=card_type)

        # Limit results
        cards = cards[:50]

        serializer = CardMinimalSerializer(cards, many=True)
        return Response(serializer.data)


class TokenViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for tokens
    - List all tokens
    - Retrieve single token
    - Bulk fetch multiple tokens
    """
    queryset = Token.objects.all()
    serializer_class = TokenSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]

    def get_serializer_class(self):
        """Use minimal serializer for list view"""
        if self.action == 'list':
            return TokenMinimalSerializer
        return TokenSerializer

    @action(detail=False, methods=['post'])
    def bulk_fetch(self, request):
        """
        Fetch multiple tokens by ID
        POST /api/tokens/bulk_fetch/
        Body: {"token_ids": [1, 2, 3]}
        """
        token_ids = request.data.get('token_ids', [])
        if not token_ids:
            return Response(
                {'error': 'token_ids is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        tokens = Token.objects.filter(id__in=token_ids)
        serializer = TokenSerializer(tokens, many=True)
        return Response(serializer.data)
