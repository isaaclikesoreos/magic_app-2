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


class CubeSerializer(serializers.ModelSerializer):
    creator = CustomUserSerializer(read_only=True)
    images = CubeImageSerializer(many=True, read_only=True)

    class Meta:
        model = Cube
        fields = ["id", "name", "creator", "card_count", "draft_count", "power_level", "tags", "description", "images"]

class CardSerializer(serializers.ModelSerializer):
    images = CardImageSerializer(many=True, read_only=True)

    class Meta:
        model = Card
        fields = ["id", "name", "mana_cost", "color", "type_line", "images"]


class DraftSerializer(serializers.ModelSerializer):
    cube_id = serializers.PrimaryKeyRelatedField(queryset=Cube.objects.all(), source='cube', write_only=True)
    cube = CubeSerializer(read_only=True)

    class Meta:
        model = Draft
        fields = ['id', 'cube', 'cube_id', 'pack_count', 'cards_per_pack', 'player_count', 'active']



class CubeCardSerializer(serializers.ModelSerializer):
    cube = serializers.PrimaryKeyRelatedField(queryset=Cube.objects.all())
    card = serializers.PrimaryKeyRelatedField(queryset=Card.objects.all())

    class Meta:
        model = CubeCard
        fields = ['id', 'cube', 'card']

class DraftPlayerSerializer(serializers.ModelSerializer):
    draft = serializers.PrimaryKeyRelatedField(queryset=Draft.objects.all())
    user = serializers.PrimaryKeyRelatedField(queryset=get_user_model().objects.all())
    class Meta:
        model = DraftPlayer
        fields = ['id', 'draft', 'user', 'role']

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
    


