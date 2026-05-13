from rest_framework import serializers
from .models import Card, CardImage, Token


class CardImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = CardImage
        fields = ['image_url', 'image_type', 'is_primary']


class CardSerializer(serializers.ModelSerializer):
    images = CardImageSerializer(many=True, read_only=True)
    abilities = serializers.SerializerMethodField()

    class Meta:
        model = Card
        fields = [
            'id', 'name', 'mana_cost', 'cmc', 'type_line',
            'oracle_text', 'colors',
            'power', 'toughness',
            'card_data', 'abilities',
            'rarity', 'set_code',
            'images'
        ]

    def get_abilities(self, obj):
        return obj.get_abilities()


class CardMinimalSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for lists/searches
    """
    class Meta:
        model = Card
        fields = ['id', 'name', 'mana_cost', 'type_line', 'colors', 'power', 'toughness']


class TokenSerializer(serializers.ModelSerializer):
    abilities = serializers.SerializerMethodField()

    class Meta:
        model = Token
        fields = [
            'id', 'name', 'type_line', 'colors',
            'power', 'toughness',
            'token_data', 'abilities',
            'created_by'
        ]

    def get_abilities(self, obj):
        return obj.get_abilities()


class TokenMinimalSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for lists
    """
    class Meta:
        model = Token
        fields = ['id', 'name', 'type_line', 'colors', 'power', 'toughness']
