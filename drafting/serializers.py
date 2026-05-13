# drafting/serializers.py
from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Cube, Card, Draft, CubeCard, DraftPlayer, DeckList, CustomUser, CardImage, CubeImage
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.tokens import RefreshToken
from django.conf import settings
from django.contrib.auth import get_user_model

class CustomUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = ['id', 'email', 'display_name', 'display_img']  # Include 'id'



class CardImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = CardImage
        fields = ["id", "image_url", "is_primary"]

class CubeImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = CubeImage
        fields = ["id", "image_url", "is_primary"]


class CardSerializer(serializers.ModelSerializer):
    images = CardImageSerializer(many=True, read_only=True)

    class Meta:
        model = Card
        fields = ["id", "name", "mana_cost", "color", "type_line", "images"]


# Lightweight serializer for list views - NO cards included
class CubeListSerializer(serializers.ModelSerializer):
    creator_name = serializers.CharField(source='creator.display_name', read_only=True)
    images = CubeImageSerializer(many=True, read_only=True)

    class Meta:
        model = Cube
        fields = ["id", "name", "creator_name", "card_count", "draft_count", "power_level", "tags", "description", "images"]


# Full serializer for detail views - includes all cards
class CubeSerializer(serializers.ModelSerializer):
    creator = CustomUserSerializer(read_only=True)
    creator_name = serializers.CharField(source='creator.display_name', read_only=True)
    images = CubeImageSerializer(many=True, read_only=True)
    cards = serializers.SerializerMethodField()

    class Meta:
        model = Cube
        fields = ["id", "name", "creator", "creator_name", "card_count", "draft_count", "power_level", "tags", "description", "images", "cards"]

    def get_cards(self, obj):
        cube_cards = CubeCard.objects.filter(cube=obj).select_related('card').prefetch_related('card__images')
        return CardSerializer([cc.card for cc in cube_cards], many=True).data


# Lightweight serializer for draft list views - minimal cube info, no cards
class DraftListSerializer(serializers.ModelSerializer):
    cube = CubeListSerializer(read_only=True)
    player_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Draft
        fields = ['id', 'cube', 'pack_count', 'cards_per_pack', 'player_count', 'active', 'status']


# Full serializer for draft detail views
class DraftSerializer(serializers.ModelSerializer):
    cube_id = serializers.PrimaryKeyRelatedField(queryset=Cube.objects.all(), source='cube', write_only=True)
    cube = CubeListSerializer(read_only=True)  # Still use lightweight - cards come from packs
    players = serializers.SerializerMethodField()

    class Meta:
        model = Draft
        fields = ['id', 'cube', 'cube_id', 'pack_count', 'cards_per_pack', 'player_count', 'active', 'players', 'status', 'current_pack', 'current_pick']

    def get_players(self, obj):
        from .models import DraftPlayer, DraftPick
        players = DraftPlayer.objects.filter(draft=obj).select_related('user').order_by('seat_position')

        # Get pick counts for each player
        result = []
        for p in players:
            pick_count = DraftPick.objects.filter(draft=obj, player=p).count()
            # Check if player has picked in current round
            has_picked_current = DraftPick.objects.filter(
                draft=obj,
                player=p,
                pack_number=obj.current_pack,
                pick_number=obj.current_pick
            ).exists() if obj.status == 'in_progress' else False

            result.append({
                'id': p.id,
                'user_id': p.user.id,
                'display_name': p.user.display_name or p.user.email,
                'email': p.user.email,
                'role': p.role,
                'seat_position': p.seat_position,
                'pick_count': pick_count,
                'has_picked': has_picked_current
            })
        return result



class CubeCardSerializer(serializers.ModelSerializer):
    cube = serializers.PrimaryKeyRelatedField(queryset=Cube.objects.all())
    card = serializers.PrimaryKeyRelatedField(queryset=Card.objects.all())

    class Meta:
        model = CubeCard
        fields = ['id', 'cube', 'card']

class DraftPlayerSerializer(serializers.ModelSerializer):
    draft = serializers.PrimaryKeyRelatedField(queryset=Draft.objects.all())
    user = CustomUserSerializer(read_only=True)
    user_id = serializers.PrimaryKeyRelatedField(queryset=get_user_model().objects.all(), source='user', write_only=True)

    class Meta:
        model = DraftPlayer
        fields = ['id', 'draft', 'user', 'user_id', 'role']

class DeckListSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(queryset=get_user_model().objects.all())
    draft = serializers.PrimaryKeyRelatedField(queryset=Draft.objects.all())
    card = serializers.PrimaryKeyRelatedField(queryset=Card.objects.all())

    class Meta:
        model = DeckList
        fields = ['id', 'user', 'draft', 'card']



class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    email = serializers.EmailField()

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['email'] = user.email
        return token

    def validate(self, attrs):
        email = attrs.get("email")
        password = attrs.get("password")

        try:
            user = CustomUser.objects.get(email=email)
        except CustomUser.DoesNotExist:
            raise AuthenticationFailed("User with this email does not exist.")

        if not user.check_password(password):
            raise AuthenticationFailed("Incorrect password.")

        attrs["username"] = user.email  # Set this to satisfy SimpleJWT's internal check
        return super().validate(attrs)
    


