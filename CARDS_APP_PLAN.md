# Cards App Architecture Plan

**Created:** 2026-02-11
**Status:** Planning Phase
**Goal:** Create centralized card database that serves both drafting and puzzle systems

---

## Current Problems

### 1. **Fragmented Card Data**
- Drafting app: Basic Card model (name, mana cost, color, type)
- Puzzle system: Full card data embedded in JSON game states
- **No single source of truth**

### 2. **Hard-coded Game States**
- Puzzles duplicate full card definitions in every game state
- Changes to a card require updating every puzzle that uses it
- No card versioning or consistency

### 3. **No Card Management**
- Can't easily add new cards
- No import from external sources (Scryfall)
- No validation of card data

### 4. **Frontend Issues**
- No caching of card data
- Re-fetches same cards repeatedly
- No offline capability

---

## Solution Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │  Card Cache (IndexedDB/LocalStorage)               │     │
│  │  - Stores fetched cards                            │     │
│  │  - TTL-based invalidation                          │     │
│  │  - Reduces API calls                               │     │
│  └────────────────────────────────────────────────────┘     │
│           ▲                                                  │
└───────────┼──────────────────────────────────────────────────┘
            │ REST API
            │ GET /api/cards/{id}/
            │ GET /api/cards/bulk/?ids=1,2,3
            ▼
┌─────────────────────────────────────────────────────────────┐
│                        BACKEND                               │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   CARDS APP  │◄───┤ DRAFTING APP │    │  PUZZLES APP │  │
│  │              │    │              │    │              │  │
│  │  Card Model  │    │  References  │    │  References  │  │
│  │  (JSONField) │    │  Card by ID  │    │  Card by ID  │  │
│  │              │    │              │    │              │  │
│  │  - Abilities │    └──────────────┘    └──────────────┘  │
│  │  - Stats     │                                           │
│  │  - Oracle    │                                           │
│  └──────────────┘                                           │
│         ▲                                                    │
│         │                                                    │
│  ┌──────┴───────────────┐                                   │
│  │ Management Commands  │                                   │
│  │ - import_from_scryfall│                                  │
│  │ - validate_cards      │                                  │
│  └──────────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Cards App Foundation

### 1.1 Create Cards App

```bash
python manage.py startapp cards
```

**File Structure:**
```
cards/
├── __init__.py
├── models.py           # Card, CardSet, CardPrinting models
├── serializers.py      # DRF serializers
├── views.py            # API views
├── urls.py             # URL routing
├── admin.py            # Django admin config
├── validators.py       # Card data validation
├── management/
│   └── commands/
│       ├── import_from_scryfall.py
│       ├── validate_cards.py
│       └── seed_sample_cards.py
└── tests/
    ├── test_models.py
    ├── test_api.py
    └── test_validators.py
```

### 1.2 Card Model Design

```python
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator

class Card(models.Model):
    """
    Central card model - single source of truth for all card data.
    Used by both drafting and puzzle systems.
    """

    # === BASIC IDENTIFICATION ===
    id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255, db_index=True)

    # Scryfall integration (optional)
    scryfall_id = models.UUIDField(null=True, blank=True, unique=True)
    scryfall_uri = models.URLField(null=True, blank=True)

    # === CARD CHARACTERISTICS ===
    mana_cost = models.CharField(max_length=50, null=True, blank=True)
    cmc = models.IntegerField(
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Converted Mana Cost"
    )
    type_line = models.CharField(max_length=255, db_index=True)
    oracle_text = models.TextField(blank=True)

    # Colors (stored as string for easy filtering: "W", "WU", "WUB", etc.)
    colors = models.CharField(
        max_length=5,
        blank=True,
        db_index=True,
        help_text="WUBRG color identity"
    )
    color_identity = models.CharField(
        max_length=5,
        blank=True,
        help_text="Commander color identity"
    )

    # Creature stats
    power = models.CharField(max_length=10, null=True, blank=True)
    toughness = models.CharField(max_length=10, null=True, blank=True)

    # Loyalty (for planeswalkers)
    loyalty = models.IntegerField(null=True, blank=True)

    # === GAME DATA (JSON) ===
    card_data = models.JSONField(
        default=dict,
        help_text="Complete card data: abilities, keywords, special mechanics"
    )
    # Example card_data structure:
    # {
    #   "keywords": ["flying", "lifelink"],
    #   "triggered_abilities": [...],
    #   "activated_abilities": [...],
    #   "static_abilities": [...],
    #   "special_flags": {
    #     "hasHaste": true,  # For backward compat during migration
    #     "hasProwess": true
    #   }
    # }

    # === METADATA ===
    rarity = models.CharField(
        max_length=20,
        choices=[
            ('common', 'Common'),
            ('uncommon', 'Uncommon'),
            ('rare', 'Rare'),
            ('mythic', 'Mythic Rare'),
            ('special', 'Special'),
        ],
        default='common',
        db_index=True
    )

    # Set/printing info (optional - for draft boosters)
    set_code = models.CharField(max_length=10, null=True, blank=True, db_index=True)
    collector_number = models.CharField(max_length=10, null=True, blank=True)

    # Card legality
    is_legal_vintage = models.BooleanField(default=True)
    is_legal_legacy = models.BooleanField(default=True)
    is_legal_modern = models.BooleanField(default=True)
    is_legal_standard = models.BooleanField(default=False)

    # Data validation
    is_validated = models.BooleanField(
        default=False,
        help_text="Has card_data been validated against schema?"
    )
    validation_errors = models.JSONField(
        null=True,
        blank=True,
        help_text="Validation errors if any"
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['colors']),
            models.Index(fields=['type_line']),
            models.Index(fields=['cmc']),
            models.Index(fields=['rarity']),
        ]

    def __str__(self):
        return f"{self.name} ({self.mana_cost or 'no cost'})"

    def get_abilities(self):
        """Extract all abilities from card_data"""
        return {
            'keywords': self.card_data.get('keywords', []),
            'triggered': self.card_data.get('triggered_abilities', []),
            'activated': self.card_data.get('activated_abilities', []),
            'static': self.card_data.get('static_abilities', []),
        }

    def validate_card_data(self):
        """Validate card_data against ability schema"""
        from .validators import CardDataValidator
        validator = CardDataValidator()
        is_valid, errors = validator.validate(self.card_data)
        self.is_validated = is_valid
        self.validation_errors = errors if errors else None
        return is_valid


class CardImage(models.Model):
    """
    Card images - supports multiple versions/printings
    """
    card = models.ForeignKey(Card, on_delete=models.CASCADE, related_name='images')
    image_url = models.URLField(max_length=500)
    image_type = models.CharField(
        max_length=20,
        choices=[
            ('normal', 'Normal'),
            ('large', 'Large'),
            ('art_crop', 'Art Crop'),
            ('border_crop', 'Border Crop'),
        ],
        default='normal'
    )
    is_primary = models.BooleanField(default=False)

    class Meta:
        unique_together = ('card', 'image_type', 'image_url')

    def __str__(self):
        return f"{self.card.name} - {self.image_type}"


class CardSet(models.Model):
    """
    MTG Set information (optional - for organizing cards)
    """
    code = models.CharField(max_length=10, unique=True, primary_key=True)
    name = models.CharField(max_length=255)
    release_date = models.DateField(null=True, blank=True)
    set_type = models.CharField(max_length=50)  # expansion, core, masters, etc.

    def __str__(self):
        return f"{self.code.upper()} - {self.name}"
```

---

## Phase 2: Update Related Apps

### 2.1 Update Drafting App

**Remove redundant Card model:**
```python
# OLD drafting/models.py - REMOVE THIS
class Card(models.Model):
    name = models.CharField(max_length=255)
    # ...

# NEW - Just import from cards app
from cards.models import Card
```

**Update relationships:**
```python
from cards.models import Card

class CubeCard(models.Model):
    cube = models.ForeignKey(Cube, on_delete=models.CASCADE)
    card = models.ForeignKey(Card, on_delete=models.CASCADE)  # Now references cards.Card
    # ... rest stays the same
```

### 2.2 Update Puzzles App

**Current Puzzle Model:**
```python
class PuzzleState(models.Model):
    puzzle = models.OneToOneField(Puzzle, on_delete=models.CASCADE)
    game_state = models.JSONField()  # HUGE embedded card data
```

**New Puzzle Model:**
```python
class PuzzleState(models.Model):
    puzzle = models.OneToOneField(Puzzle, on_delete=models.CASCADE)
    game_state = models.JSONField()  # NOW: just references card IDs

    # NEW: Track which cards are used in this puzzle
    required_cards = models.ManyToManyField(
        Card,
        related_name='used_in_puzzles',
        help_text="Cards needed to play this puzzle"
    )
```

**Game State Format - Before:**
```json
{
  "players": {
    "you": {
      "hand": [
        {
          "card_id": "bolt-1",
          "name": "Lightning Bolt",
          "mana_cost": "{R}",
          "type_line": "Instant",
          "oracle_text": "...",
          "spell_effect": {"type": "damage", "amount": 3}
        }
      ]
    }
  }
}
```

**Game State Format - After:**
```json
{
  "players": {
    "you": {
      "hand": [
        {
          "instance_id": "bolt-1",
          "card_id": 428,
          "tapped": false,
          "counters": {}
        }
      ]
    }
  }
}
```

Frontend fetches card data separately and merges with game state.

---

## Phase 3: API Design

### 3.1 Card Endpoints

```python
# cards/views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

class CardViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Card.objects.all()
    serializer_class = CardSerializer

    @action(detail=False, methods=['post'])
    def bulk_fetch(self, request):
        """
        Fetch multiple cards by ID
        POST /api/cards/bulk/
        Body: {"card_ids": [1, 2, 3, 428]}
        """
        card_ids = request.data.get('card_ids', [])
        cards = Card.objects.filter(id__in=card_ids)
        serializer = self.get_serializer(cards, many=True)
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

        serializer = self.get_serializer(cards[:50], many=True)
        return Response(serializer.data)
```

### 3.2 Serializers

```python
# cards/serializers.py
from rest_framework import serializers
from .models import Card, CardImage

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
            'oracle_text', 'colors', 'color_identity',
            'power', 'toughness', 'loyalty',
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
        fields = ['id', 'name', 'mana_cost', 'type_line', 'colors']
```

### 3.3 URL Configuration

```python
# cards/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CardViewSet

router = DefaultRouter()
router.register(r'cards', CardViewSet)

urlpatterns = [
    path('', include(router.urls)),
]

# mtg_drafting/urls.py - Add to main urls
urlpatterns = [
    path('api/', include('cards.urls')),
    # ... existing patterns
]
```

---

## Phase 4: Frontend Card Cache

### 4.1 Card Service

```javascript
// frontend/src/services/cardService.js
class CardCache {
  constructor() {
    this.cache = new Map();
    this.ttl = 30 * 60 * 1000; // 30 minutes
  }

  set(cardId, cardData) {
    this.cache.set(cardId, {
      data: cardData,
      timestamp: Date.now()
    });
  }

  get(cardId) {
    const entry = this.cache.get(cardId);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(cardId);
      return null;
    }

    return entry.data;
  }

  has(cardId) {
    return this.get(cardId) !== null;
  }

  clear() {
    this.cache.clear();
  }
}

const cardCache = new CardCache();

export const cardService = {
  /**
   * Fetch a single card by ID
   */
  async fetchCard(cardId) {
    // Check cache first
    const cached = cardCache.get(cardId);
    if (cached) return cached;

    // Fetch from API
    const response = await fetch(`/api/cards/${cardId}/`);
    if (!response.ok) throw new Error('Card not found');

    const card = await response.json();
    cardCache.set(cardId, card);
    return card;
  },

  /**
   * Fetch multiple cards in bulk
   */
  async fetchCards(cardIds) {
    // Filter out cached cards
    const uncachedIds = cardIds.filter(id => !cardCache.has(id));

    // Return cached if all are cached
    if (uncachedIds.length === 0) {
      return cardIds.map(id => cardCache.get(id));
    }

    // Bulk fetch uncached
    const response = await fetch('/api/cards/bulk/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_ids: uncachedIds })
    });

    const cards = await response.json();

    // Cache the fetched cards
    cards.forEach(card => cardCache.set(card.id, card));

    // Return all cards (cached + fetched)
    return cardIds.map(id => cardCache.get(id));
  },

  /**
   * Search for cards
   */
  async searchCards(query, filters = {}) {
    const params = new URLSearchParams({
      q: query,
      ...filters
    });

    const response = await fetch(`/api/cards/search/?${params}`);
    return response.json();
  },

  /**
   * Preload cards for a puzzle
   */
  async preloadPuzzleCards(gameState) {
    const cardIds = new Set();

    // Extract all card IDs from game state
    Object.values(gameState.players || {}).forEach(player => {
      ['hand', 'battlefield', 'graveyard', 'exile'].forEach(zone => {
        (player[zone] || []).forEach(card => {
          if (card.card_id) cardIds.add(card.card_id);
        });
      });
    });

    // Bulk fetch
    return this.fetchCards(Array.from(cardIds));
  }
};
```

### 4.2 Updated Puzzle Context

```javascript
// frontend/src/context/PuzzleContext.jsx
import { cardService } from '../services/cardService';

export const PuzzleProvider = ({ children, initialGameState, puzzleId }) => {
  const [gameState, setGameState] = useState(initialGameState);
  const [cardData, setCardData] = useState({});  // Card ID -> full card data
  const [loading, setLoading] = useState(true);

  // Load card data when puzzle loads
  useEffect(() => {
    async function loadCards() {
      setLoading(true);
      try {
        const cards = await cardService.preloadPuzzleCards(initialGameState);
        const cardMap = {};
        cards.forEach(card => {
          cardMap[card.id] = card;
        });
        setCardData(cardMap);
      } catch (error) {
        console.error('Failed to load cards:', error);
      } finally {
        setLoading(false);
      }
    }

    loadCards();
  }, [puzzleId]);

  // Helper to get full card data
  const getCard = useCallback((cardId) => {
    return cardData[cardId];
  }, [cardData]);

  // Helper to merge instance data with card data
  const getCardInstance = useCallback((instance) => {
    const card = getCard(instance.card_id);
    return {
      ...card,
      instance_id: instance.instance_id,
      tapped: instance.tapped,
      counters: instance.counters,
      // ... other instance-specific state
    };
  }, [getCard]);

  // ... rest of context
};
```

---

## Phase 5: Management Commands

### 5.1 Import from Scryfall

```python
# cards/management/commands/import_from_scryfall.py
import requests
from django.core.management.base import BaseCommand
from cards.models import Card, CardImage

class Command(BaseCommand):
    help = 'Import cards from Scryfall API'

    def add_arguments(self, parser):
        parser.add_argument('--set', type=str, help='Set code to import')
        parser.add_argument('--name', type=str, help='Card name to import')
        parser.add_argument('--all', action='store_true', help='Import all cards (WARNING: slow)')

    def handle(self, *args, **options):
        if options['name']:
            self.import_card_by_name(options['name'])
        elif options['set']:
            self.import_set(options['set'])
        elif options['all']:
            self.stdout.write(self.style.WARNING('Importing all cards... this will take a while'))
            self.import_all_cards()

    def import_card_by_name(self, name):
        url = f'https://api.scryfall.com/cards/named?exact={name}'
        response = requests.get(url)

        if response.status_code != 200:
            self.stdout.write(self.style.ERROR(f'Card not found: {name}'))
            return

        data = response.json()
        card = self.create_card_from_scryfall(data)
        self.stdout.write(self.style.SUCCESS(f'Imported: {card.name}'))

    def create_card_from_scryfall(self, data):
        # Map Scryfall data to our model
        card_data = {
            'keywords': data.get('keywords', []),
            'triggered_abilities': [],  # Would need parsing
            'activated_abilities': [],
            'static_abilities': []
        }

        card, created = Card.objects.update_or_create(
            scryfall_id=data['id'],
            defaults={
                'name': data['name'],
                'mana_cost': data.get('mana_cost', ''),
                'cmc': data.get('cmc', 0),
                'type_line': data.get('type_line', ''),
                'oracle_text': data.get('oracle_text', ''),
                'colors': ''.join(data.get('colors', [])),
                'color_identity': ''.join(data.get('color_identity', [])),
                'power': data.get('power'),
                'toughness': data.get('toughness'),
                'loyalty': data.get('loyalty'),
                'rarity': data.get('rarity', 'common'),
                'set_code': data.get('set'),
                'collector_number': data.get('collector_number'),
                'card_data': card_data,
                'scryfall_uri': data.get('scryfall_uri'),
            }
        )

        # Import images
        if 'image_uris' in data:
            for img_type, url in data['image_uris'].items():
                CardImage.objects.update_or_create(
                    card=card,
                    image_type=img_type,
                    image_url=url
                )

        return card
```

### 5.2 Seed Sample Cards

```python
# cards/management/commands/seed_sample_cards.py
from django.core.management.base import BaseCommand
from cards.models import Card

SAMPLE_CARDS = [
    {
        'name': 'Lightning Bolt',
        'mana_cost': '{R}',
        'cmc': 1,
        'type_line': 'Instant',
        'oracle_text': 'Lightning Bolt deals 3 damage to any target.',
        'colors': 'R',
        'rarity': 'common',
        'card_data': {
            'keywords': [],
            'spell_effect': {'type': 'damage', 'amount': 3}
        }
    },
    {
        'name': 'Essence Warden',
        'mana_cost': '{G}',
        'cmc': 1,
        'type_line': 'Creature — Elf Shaman',
        'oracle_text': 'Whenever another creature enters the battlefield, you gain 1 life.',
        'colors': 'G',
        'power': '1',
        'toughness': '1',
        'rarity': 'common',
        'card_data': {
            'keywords': [],
            'triggered_abilities': [{
                'type': 'triggered',
                'trigger': {
                    'event': 'creature_enters_battlefield',
                    'source': 'other'
                },
                'effect': {
                    'type': 'gain_life',
                    'amount': 1
                }
            }]
        }
    },
    # ... more sample cards
]

class Command(BaseCommand):
    def handle(self, *args, **options):
        for card_data in SAMPLE_CARDS:
            card, created = Card.objects.update_or_create(
                name=card_data['name'],
                defaults=card_data
            )
            status = 'Created' if created else 'Updated'
            self.stdout.write(f'{status}: {card.name}')
```

---

## Phase 6: Migration Strategy

### 6.1 Data Migration Steps

1. **Create cards app and run initial migration**
   ```bash
   python manage.py startapp cards
   python manage.py makemigrations cards
   python manage.py migrate cards
   ```

2. **Seed sample cards**
   ```bash
   python manage.py seed_sample_cards
   ```

3. **Update drafting app**
   - Remove old Card model
   - Update ForeignKeys to reference cards.Card
   - Create migration

4. **Migrate existing puzzle data**
   - Extract unique cards from all puzzles
   - Create Card entries
   - Update puzzle game states to reference card IDs
   - Add to PuzzleState.required_cards

5. **Update frontend**
   - Add cardService
   - Update PuzzleContext to load cards
   - Update components to use merged card data

---

## Phase 7: Implementation Checklist

### Backend
- [ ] Create cards app
- [ ] Define Card model with JSONField
- [ ] Create CardImage model
- [ ] Create CardSet model (optional)
- [ ] Add validators for card_data
- [ ] Create serializers
- [ ] Create API views (CRUD + bulk fetch)
- [ ] Add URL routing
- [ ] Update Django admin
- [ ] Create import_from_scryfall command
- [ ] Create seed_sample_cards command
- [ ] Create validate_cards command
- [ ] Write tests

### Drafting Integration
- [ ] Remove old Card model from drafting
- [ ] Update imports to use cards.Card
- [ ] Update admin to reference cards app
- [ ] Create data migration
- [ ] Test draft creation/picking

### Puzzles Integration
- [ ] Add required_cards ManyToMany to PuzzleState
- [ ] Create migration script to extract cards from game states
- [ ] Update game state format (remove embedded card data)
- [ ] Update load_sample_puzzles to reference cards
- [ ] Update puzzle API to include required_cards list

### Frontend
- [ ] Create cardService with caching
- [ ] Update PuzzleContext to load cards on mount
- [ ] Add getCard/getCardInstance helpers
- [ ] Update all components to use merged data
- [ ] Add loading states for card fetch
- [ ] Add error handling for missing cards
- [ ] Test all puzzles still work

### Admin & Tools
- [ ] Enhanced Django admin for cards
  - Inline editing of abilities
  - JSON editor widget
  - Validation on save
- [ ] Card search interface
- [ ] Bulk import UI
- [ ] Card preview in admin

---

## Success Criteria

✅ **Single source of truth** - All card data in cards.Card model
✅ **No duplication** - Puzzles reference cards by ID, not embed data
✅ **Frontend caching** - Cards fetched once and cached
✅ **Extensible** - Easy to add new cards via admin or Scryfall
✅ **Validated** - Card data follows ability schema
✅ **Performant** - Bulk fetch reduces API calls
✅ **Maintainable** - Changes to cards auto-propagate to all puzzles

---

## Timeline Estimate

- **Phase 1** (Cards App): 3-4 hours
- **Phase 2** (Update Apps): 2-3 hours
- **Phase 3** (API): 2 hours
- **Phase 4** (Frontend Cache): 2-3 hours
- **Phase 5** (Commands): 2 hours
- **Phase 6** (Migration): 3-4 hours
- **Phase 7** (Testing): 2-3 hours

**Total: 16-22 hours of focused work**

Can be broken into smaller sessions.

---

## Next Steps

1. **Review this plan** - Does it match your vision?
2. **Prioritize phases** - What to build first?
3. **Start with Phase 1** - Create cards app foundation
4. **Iterate** - Build incrementally, test frequently

Ready to start building when you are! 🚀
