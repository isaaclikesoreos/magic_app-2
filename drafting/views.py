# drafting/views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth.models import User
from django.views.decorators.cache import cache_page
from django.utils.decorators import method_decorator
from .models import Cube, Card, Draft, CubeCard, DraftPlayer, DeckList, CardImage, CubeImage, DraftPack, DraftPick
from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import (
    CubeSerializer, CubeListSerializer, CardSerializer, DraftSerializer, DraftListSerializer,
    CubeCardSerializer, DraftPlayerSerializer, DeckListSerializer, EmailTokenObtainPairSerializer, CustomUser, CustomUserSerializer,
)
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
import requests
import logging
import random
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync


class CubeViewSet(viewsets.ModelViewSet):
    queryset = Cube.objects.all().select_related('creator').prefetch_related('images')
    serializer_class = CubeSerializer

    def get_serializer_class(self):
        # Use lightweight serializer for list views (no cards included)
        if self.action in ['list', 'popular_cubes']:
            return CubeListSerializer
        return CubeSerializer

    # Cache cube list for 2 minutes
    @method_decorator(cache_page(60 * 2))
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='popular')
    def popular_cubes(self, request):
        popular_cubes = Cube.objects.order_by('-draft_count')[:10]
        serializer = self.get_serializer(popular_cubes, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='set-cover-image', permission_classes=[IsAuthenticated])
    def set_cover_image(self, request, pk=None):
        cube = self.get_object()
        user = request.user

        # Check if user is the cube creator
        if cube.creator != user:
            return Response({"error": "Only the cube creator can change the cover image"}, status=status.HTTP_403_FORBIDDEN)

        image_url = request.data.get('image_url')
        if not image_url:
            return Response({"error": "image_url is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Set all existing images to non-primary
        CubeImage.objects.filter(cube=cube).update(is_primary=False)

        # Create or update the primary image
        cube_image, created = CubeImage.objects.update_or_create(
            cube=cube,
            image_url=image_url,
            defaults={'is_primary': True}
        )

        serializer = self.get_serializer(cube)
        return Response(serializer.data)

class CardViewSet(viewsets.ModelViewSet):
    queryset = Card.objects.all().prefetch_related('images')
    serializer_class = CardSerializer

    # Cache card list for 10 minutes (cards don't change often)
    @method_decorator(cache_page(60 * 10))
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

from rest_framework.permissions import AllowAny, IsAuthenticatedOrReadOnly

class DraftViewSet(viewsets.ModelViewSet):
    queryset = Draft.objects.all().select_related('cube', 'cube__creator').prefetch_related('cube__images')
    serializer_class = DraftSerializer

    def get_serializer_class(self):
        # Use lightweight serializer for list views
        if self.action in ['list', 'active_lobbies']:
            return DraftListSerializer
        return DraftSerializer

    def get_permissions(self):
        # Allow anyone to view drafts, but require auth for modifications
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAuthenticated()]

    @action(detail=False, methods=['post'], url_path='create-lobby', permission_classes=[IsAuthenticated])
    def create_lobby(self, request):
        user = request.user
        data = request.data

        cube_id = data.get("cube_id")
        pack_count = data.get("pack_count", 3)
        cards_per_pack = data.get("cards_per_pack", 15)

        try:
            cube = Cube.objects.get(id=cube_id)
            draft = Draft.objects.create(
                cube=cube,
                pack_count=pack_count,
                cards_per_pack=cards_per_pack,
                player_count=1,  # Default to 1 since the creator joins
                active=True,
            )

            # Add the creator as the first player in the draft
            DraftPlayer.objects.create(draft=draft, user=user, role="creator")

            # WebSocket notification
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                "lobbies",
                {
                    "type": "lobby.update",
                    "event": "create",
                    "draft_id": draft.id,
                    "cube_name": cube.name,
                    "creator": user.display_name,
                },
            )

            return Response(
                {"message": "Lobby created successfully!", "draft_id": draft.id},
                status=status.HTTP_201_CREATED,
            )

        except Cube.DoesNotExist:
            return Response({"error": "Cube not found"}, status=status.HTTP_400_BAD_REQUEST)
        
    @action(detail=False, methods=['get'], url_path='active-lobbies')
    def active_lobbies(self, request):
        drafts = Draft.objects.filter(active=True)
        serializer = self.get_serializer(drafts, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='join', permission_classes=[IsAuthenticated])
    def join_draft(self, request, pk=None):
        draft = self.get_object()
        user = request.user

        # Check if user is already in this draft
        if DraftPlayer.objects.filter(draft=draft, user=user).exists():
            serializer = self.get_serializer(draft)
            return Response(serializer.data)

        # Don't allow new players to join an in-progress or completed draft
        if draft.status != 'waiting':
            return Response(
                {"error": "Cannot join a draft that has already started"},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Add user to the draft
        DraftPlayer.objects.create(draft=draft, user=user, role="player")

        # Update player count
        draft.player_count = DraftPlayer.objects.filter(draft=draft).count()
        draft.save()

        # WebSocket notification
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"draft_{draft.id}",
            {
                "type": "draft.update",
                "event": "player_joined",
                "user_id": user.id,
                "display_name": user.display_name or user.email,
            },
        )

        serializer = self.get_serializer(draft)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='leave', permission_classes=[IsAuthenticated])
    def leave_draft(self, request, pk=None):
        draft = self.get_object()
        user = request.user

        # Don't allow leaving an in-progress or completed draft
        if draft.status != 'waiting':
            return Response({"message": "Cannot leave a draft that has already started"})

        try:
            player = DraftPlayer.objects.get(draft=draft, user=user)
            was_creator = player.role == "creator"
            player.delete()

            # Update player count
            remaining_players = DraftPlayer.objects.filter(draft=draft)
            draft.player_count = remaining_players.count()

            # If creator left and there are remaining players, assign new creator
            if was_creator and remaining_players.exists():
                new_creator = remaining_players.order_by('?').first()
                new_creator.role = "creator"
                new_creator.save()

            # If no players left, deactivate the draft
            if draft.player_count == 0:
                draft.active = False

            draft.save()

            # WebSocket notification
            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"draft_{draft.id}",
                {
                    "type": "draft.update",
                    "event": "player_left",
                    "user_id": user.id,
                    "new_creator_id": new_creator.user.id if was_creator and remaining_players.exists() else None,
                },
            )

            return Response({"message": "Left draft successfully"})

        except DraftPlayer.DoesNotExist:
            return Response({"error": "You are not in this draft"}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='start', permission_classes=[IsAuthenticated])
    def start_draft(self, request, pk=None):
        draft = self.get_object()
        user = request.user

        # Check if user is the creator
        try:
            player = DraftPlayer.objects.get(draft=draft, user=user)
            if player.role != "creator":
                return Response({"error": "Only the creator can start the draft"}, status=status.HTTP_403_FORBIDDEN)
        except DraftPlayer.DoesNotExist:
            return Response({"error": "You are not in this draft"}, status=status.HTTP_400_BAD_REQUEST)

        # Check minimum players
        if draft.player_count < 2:
            return Response({"error": "Need at least 2 players to start"}, status=status.HTTP_400_BAD_REQUEST)

        # Check if already started
        if draft.status != 'waiting':
            return Response({"error": "Draft has already started"}, status=status.HTTP_400_BAD_REQUEST)

        # Assign seat positions to players
        players = list(DraftPlayer.objects.filter(draft=draft))
        random.shuffle(players)
        for i, p in enumerate(players):
            p.seat_position = i
            p.save()

        # Get all cards from the cube
        cube_cards = list(CubeCard.objects.filter(cube=draft.cube).select_related('card'))
        all_cards = [cc.card for cc in cube_cards]
        random.shuffle(all_cards)

        # Calculate total cards needed
        total_cards_needed = draft.player_count * draft.pack_count * draft.cards_per_pack
        if len(all_cards) < total_cards_needed:
            return Response({
                "error": f"Not enough cards in cube. Need {total_cards_needed}, have {len(all_cards)}"
            }, status=status.HTTP_400_BAD_REQUEST)

        # Generate packs for each player for each round
        card_index = 0
        for pack_num in range(1, draft.pack_count + 1):
            for player in players:
                pack = DraftPack.objects.create(
                    draft=draft,
                    pack_number=pack_num,
                    original_player=player,
                    current_player=player
                )
                # Add cards to the pack
                pack_cards = all_cards[card_index:card_index + draft.cards_per_pack]
                pack.cards.set(pack_cards)
                card_index += draft.cards_per_pack

        # Mark draft as started
        draft.status = 'in_progress'
        draft.current_pack = 1
        draft.current_pick = 1
        draft.save()

        # Increment cube's draft count
        draft.cube.draft_count += 1
        draft.cube.save()

        # WebSocket notification
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"draft_{draft.id}",
            {
                "type": "draft.update",
                "event": "draft_started",
            },
        )

        serializer = self.get_serializer(draft)
        return Response({"message": "Draft started!", "draft": serializer.data})

    @action(detail=True, methods=['get'], url_path='my-pack', permission_classes=[IsAuthenticated])
    def get_my_pack(self, request, pk=None):
        """Get the current pack for the requesting player"""
        draft = self.get_object()
        user = request.user

        try:
            player = DraftPlayer.objects.get(draft=draft, user=user)
        except DraftPlayer.DoesNotExist:
            return Response({"error": "You are not in this draft"}, status=status.HTTP_400_BAD_REQUEST)

        if draft.status != 'in_progress':
            return Response({"error": "Draft is not in progress"}, status=status.HTTP_400_BAD_REQUEST)

        # Get the pack currently assigned to this player for the current round
        try:
            pack = DraftPack.objects.get(
                draft=draft,
                pack_number=draft.current_pack,
                current_player=player
            )
            cards = pack.cards.all()
            cards_data = CardSerializer(cards, many=True).data
            return Response({
                "pack_number": draft.current_pack,
                "pick_number": draft.current_pick,
                "cards": cards_data,
                "cards_remaining": len(cards_data)
            })
        except DraftPack.DoesNotExist:
            return Response({
                "pack_number": draft.current_pack,
                "pick_number": draft.current_pick,
                "cards": [],
                "cards_remaining": 0,
                "waiting": True,
                "message": "Waiting for pack to be passed to you"
            })

    @action(detail=True, methods=['post'], url_path='pick', permission_classes=[IsAuthenticated])
    def pick_card(self, request, pk=None):
        """Pick a card from the current pack"""
        draft = self.get_object()
        user = request.user
        card_id = request.data.get('card_id')

        if not card_id:
            return Response({"error": "card_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            player = DraftPlayer.objects.get(draft=draft, user=user)
        except DraftPlayer.DoesNotExist:
            return Response({"error": "You are not in this draft"}, status=status.HTTP_400_BAD_REQUEST)

        if draft.status != 'in_progress':
            return Response({"error": "Draft is not in progress"}, status=status.HTTP_400_BAD_REQUEST)

        # Get the pack currently assigned to this player
        try:
            pack = DraftPack.objects.get(
                draft=draft,
                pack_number=draft.current_pack,
                current_player=player
            )
        except DraftPack.DoesNotExist:
            return Response({"error": "You don't have a pack to pick from"}, status=status.HTTP_400_BAD_REQUEST)

        # Check if card is in the pack
        try:
            card = pack.cards.get(id=card_id)
        except Card.DoesNotExist:
            return Response({"error": "Card is not in your pack"}, status=status.HTTP_400_BAD_REQUEST)

        # Check if player already picked this round
        existing_pick = DraftPick.objects.filter(
            draft=draft,
            player=player,
            pack_number=draft.current_pack,
            pick_number=draft.current_pick
        ).exists()
        if existing_pick:
            return Response({"error": "You already picked this round"}, status=status.HTTP_400_BAD_REQUEST)

        # Record the pick
        DraftPick.objects.create(
            draft=draft,
            player=player,
            card=card,
            pack_number=draft.current_pack,
            pick_number=draft.current_pick
        )

        # Remove card from pack
        pack.cards.remove(card)

        # Check if all players have picked
        players = DraftPlayer.objects.filter(draft=draft)
        picks_this_round = DraftPick.objects.filter(
            draft=draft,
            pack_number=draft.current_pack,
            pick_number=draft.current_pick
        ).count()

        if picks_this_round >= players.count():
            # All players picked - pass packs and advance
            self._pass_packs(draft, players)

        serializer = self.get_serializer(draft)
        return Response({
            "message": f"Picked {card.name}",
            "draft": serializer.data
        })

    def _pass_packs(self, draft, players):
        """Pass all packs to the next player and advance the draft state"""
        player_count = players.count()

        # Determine pass direction: odd packs go left (increasing seat), even go right
        pass_left = (draft.current_pack % 2 == 1)

        # Get all packs for current round
        packs = DraftPack.objects.filter(draft=draft, pack_number=draft.current_pack)

        # Create a mapping of seat position to player
        seat_to_player = {p.seat_position: p for p in players}

        # Pass each pack
        for pack in packs:
            current_seat = pack.current_player.seat_position
            if pass_left:
                new_seat = (current_seat + 1) % player_count
            else:
                new_seat = (current_seat - 1) % player_count
            pack.current_player = seat_to_player[new_seat]
            pack.save()

        # Advance pick number
        draft.current_pick += 1

        # Check if pack is exhausted (all cards picked from this round)
        if draft.current_pick > draft.cards_per_pack:
            # Move to next pack
            draft.current_pack += 1
            draft.current_pick = 1

            # Check if draft is complete
            if draft.current_pack > draft.pack_count:
                draft.status = 'completed'
                draft.active = False

        draft.save()

        # WebSocket notification
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"draft_{draft.id}",
            {
                "type": "draft.update",
                "event": "packs_passed",
                "current_pack": draft.current_pack,
                "current_pick": draft.current_pick,
            },
        )

    @action(detail=True, methods=['get'], url_path='my-picks', permission_classes=[IsAuthenticated])
    def get_my_picks(self, request, pk=None):
        """Get all cards the player has picked so far"""
        draft = self.get_object()
        user = request.user

        try:
            player = DraftPlayer.objects.get(draft=draft, user=user)
        except DraftPlayer.DoesNotExist:
            return Response({"error": "You are not in this draft"}, status=status.HTTP_400_BAD_REQUEST)

        picks = DraftPick.objects.filter(draft=draft, player=player).select_related('card')
        cards = [pick.card for pick in picks]
        cards_data = CardSerializer(cards, many=True).data

        return Response({
            "picks": cards_data,
            "total": len(cards_data)
        })

class DeckListViewSet(viewsets.ModelViewSet):
    queryset = DeckList.objects.all()
    serializer_class = DeckListSerializer



class CustomUserViewSet(viewsets.ModelViewSet):
    queryset = CustomUser.objects.all()
    serializer_class = CustomUserSerializer

    def get_permissions(self):
        # Allow unauthenticated users to register (create)
        if self.action == 'create':
            return []
        return [IsAuthenticated()]

    def create(self, request):
        email = request.data.get('email')
        password = request.data.get('password')

        if not email or not password:
            return Response(
                {"error": "Email and password are required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        if CustomUser.objects.filter(email=email).exists():
            return Response(
                {"email": ["A user with this email already exists."]},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = CustomUser.objects.create_user(email=email, password=password)
        serializer = self.get_serializer(user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='details')
    def user_details(self, request, pk=None):
        user = self.get_object()  # Fetch user by primary key
        cubes = Cube.objects.filter(creator=user).prefetch_related('images')
        cubes_serializer = CubeListSerializer(cubes, many=True)  # Use lightweight serializer
        user_serializer = self.get_serializer(user)
        return Response({
            "user": user_serializer.data,
            "cubes": cubes_serializer.data,
        })

class EmailTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer

    

class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        serializer = CustomUserSerializer(user)
        return Response(serializer.data)
    
class CubeUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        data = request.data

        # Required fields
        cube_name = data.get("name")
        card_list = data.get("card_list")

        # Optional fields
        description = data.get("description", "")
        power_level = data.get("power_level", "")
        tags = data.get("tags", "")

        if not cube_name or not card_list:
            return Response(
                {"error": "Cube name and card list are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Create Cube
        cube = Cube.objects.create(
            name=cube_name,
            creator=user,
            description=description,
            power_level=power_level,
            tags=tags,
            card_count=len(card_list.splitlines()),  # Count cards
        )

        card_images = []
        import re

        # Process cards
        for line in card_list.splitlines():
            line = line.strip()
            if not line:
                continue  # Skip empty lines

            name = None
            count = 1  # Default quantity

            # Try different formats:
            # Format 1: "1 Card Name" or "4 Lightning Bolt"
            match = re.match(r'^(\d+)\s+(.+)$', line)
            if match:
                count = int(match.group(1))
                name = match.group(2).strip()
            else:
                # Format 2: "1x Card Name" or "4x Lightning Bolt"
                match = re.match(r'^(\d+)x\s+(.+)$', line, re.IGNORECASE)
                if match:
                    count = int(match.group(1))
                    name = match.group(2).strip()
                else:
                    # Format 3: Just the card name (assume quantity 1)
                    name = line.strip()

            if not name:
                continue  # Skip if we couldn't parse a name

            # Fetch or create the card
            card, _ = Card.objects.get_or_create(
                name=name,
                defaults={"mana_cost": None, "color": None, "type_line": None},
            )

            # Fetch images from existing CardImage model
            images = CardImage.objects.filter(card=card)
            if images.exists():
                card_images.extend(images)

            # Create CubeCard relationship (use get_or_create to handle duplicates)
            CubeCard.objects.get_or_create(cube=cube, card=card)

        # Assign a random image from the card images to the Cube
        if card_images:
            chosen_image = random.choice(card_images)
            CubeImage.objects.create(
                cube=cube, image_url=chosen_image.image_url, is_primary=True
            )

        # Serialize and return the created cube (use lightweight serializer)
        serializer = CubeListSerializer(cube)
        return Response(serializer.data, status=status.HTTP_201_CREATED)



class UpdateCardDatabaseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logger = logging.getLogger(__name__)

        try:
            # Fetch Scryfall bulk data
            logger.info("Fetching bulk data metadata from Scryfall...")
            metadata_response = requests.get("https://api.scryfall.com/bulk-data")
            metadata_response.raise_for_status()
            bulk_data = metadata_response.json()

            default_cards_data = next(
                item for item in bulk_data["data"] if item["type"] == "default_cards"
            )
            download_url = default_cards_data["download_uri"]

            logger.info("Fetching card data from Scryfall...")
            card_data_response = requests.get(download_url)
            card_data_response.raise_for_status()
            scryfall_data = card_data_response.json()

            # Process card data
            logger.info("Processing card data...")
            for card_data in scryfall_data:
                name = card_data.get("name", "").strip()
                mana_cost = card_data.get("mana_cost", "")
                type_line = card_data.get("type_line", "")
                colors = ",".join(card_data.get("colors", []))
                image_urls = card_data.get("image_uris", {})

                # Update or create the card
                card, _ = Card.objects.update_or_create(
                    name=name,
                    defaults={
                        "mana_cost": mana_cost,
                        "color": colors,
                        "type_line": type_line,
                    },
                )

                # Store multiple images for the card
                for size, url in image_urls.items():
                    CardImage.objects.update_or_create(
                        card=card,
                        image_url=url,
                        defaults={"is_primary": size == "normal"},
                    )

            logger.info("Card database updated successfully!")
            return Response({"message": "Card database updated successfully!"}, status=status.HTTP_200_OK)

        except requests.exceptions.RequestException as e:
            logger.error(f"Network error during Scryfall fetch: {e}")
            return Response({"error": f"Network error: {e}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        except Exception as e:
            logger.exception("An error occurred while updating the card database.")
            return Response({"error": f"Failed to update card database: {e}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
