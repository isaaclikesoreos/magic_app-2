# MTG Puzzle System & Game Engine Overview

## System Architecture

### Backend (Django)

**Models** (`puzzles/models.py`):
- `Puzzle`: Stores puzzle metadata (title, description, difficulty, solution_text, created_by)
- `PuzzleState`: Stores the game state JSON for each puzzle (one-to-one with Puzzle)

**API Endpoints** (`puzzles/views.py`):
- `GET /api/puzzles/` - List all published puzzles (filterable by difficulty)
- `GET /api/puzzles/{id}/` - Get puzzle with game state
- `POST /api/puzzles/` - Create new puzzle (authenticated)
- `GET /api/puzzles/{id}/reveal_solution/` - Get solution text

**Sample Data**: 5 pre-built puzzles in `puzzles/management/commands/load_sample_puzzles.py`

### Frontend (React)

**Game Engine** (`frontend/src/context/PuzzleContext.jsx`):
- Central state management for all game logic
- Phase management system
- Combat system
- Spell casting and targeting
- Mana management
- Damage resolution

**Components** (`frontend/src/components/puzzle/`):
- `GameBoard.jsx` - Main game container
- `PlayerArea.jsx` - Player/opponent area with battlefield, hand, graveyard
- `PuzzleCard.jsx` - Interactive card component with targeting/combat
- `BattlefieldZone.jsx` - Battlefield display
- `HandZone.jsx` - Hand display
- `GraveyardZone.jsx` - Graveyard display
- `LifeTotal.jsx` - Life counter with targeting
- `ManaPool.jsx` - Mana pool display
- `PhaseIndicator.jsx` - Turn phase indicator
- `TargetingArrow.jsx` - Visual targeting arrow

**Pages**:
- `/puzzles` - Puzzle list with difficulty filters
- `/puzzles/{id}` - Puzzle viewer with interactive game board

---

## Game State Structure

```json
{
  "players": {
    "you": {
      "life": 20,
      "mana_pool": { "R": 1, "G": 2, "W": 0, "U": 0, "B": 0, "C": 0 },
      "library_count": 30,
      "hand": [/* Card objects */],
      "battlefield": [/* Permanent objects */],
      "graveyard": [/* Card objects */],
      "exile": [/* Card objects */]
    },
    "opponent": {
      "life": 20,
      "mana_pool": {},
      "library_count": 25,
      "hand_count": 5,  // Opponent hand is hidden
      "battlefield": [/* Permanent objects */],
      "graveyard": [/* Card objects */],
      "exile": [/* Card objects */]
    }
  },
  "turn_phase": "main1",
  "active_player": "you"
}
```

### Card Object Structure

```json
{
  "card_id": "unique-id",
  "name": "Card Name",
  "mana_cost": "{1}{R}",
  "type_line": "Creature - Type",
  "oracle_text": "Card text",
  "power": "2",
  "toughness": "2",
  "tapped": false,
  "summoning_sick": false,
  "counters": { "+1/+1": 0 },
  "attacking": false,
  "prowessBonus": 0  // Temporary until-end-of-turn bonus
}
```

---

## Current Game Mechanics Implemented

### ✅ Core Systems

1. **Phase Management**
   - Main Phase 1
   - Begin Combat
   - Declare Attackers
   - Combat Damage
   - End Combat
   - Main Phase 2
   - End Step

2. **Mana System**
   - Mana pool with colored mana (WUBRG + Colorless)
   - Mana cost parsing from `{1}{R}` format
   - Generic mana payment (any color can pay generic costs)
   - Automatic mana spending when casting spells

3. **Spell Casting**
   - Click card in hand to begin casting
   - Visual targeting arrow from card to target
   - Target validation based on oracle text parsing
   - Mana cost checking before casting
   - Spells move to graveyard after resolving

4. **Targeting System**
   - Parses oracle text for valid targets:
     - "any target" → players, creatures, planeswalkers
     - "target player" / "target opponent" → players only
     - "target creature" → creatures only
   - Visual indicators for valid targets (red border/ring)
   - Click target to complete spell cast
   - Right-click or ESC to cancel

5. **Combat System**
   - Declare attackers phase with visual indicators
   - Creatures with orange "!" can attack
   - Click creatures to toggle as attackers
   - "Confirm Attack" button to finalize
   - Automatic tapping of attacking creatures
   - Damage calculation with P/T modifiers
   - No blockers implemented (all damage goes through)
   - Victory detection when opponent reaches 0 life

6. **Damage Resolution**
   - Direct damage spells (parse oracle text for "deals X damage")
   - Player damage (reduces life total)
   - Creature damage (destroys if damage >= toughness)
   - Combat damage (attacking creatures deal power to opponent)

7. **Permanent States**
   - Tapped/untapped (visual 90° rotation)
   - Summoning sickness (yellow border, can't attack)
   - Attacking (red border, sword icon overlay)
   - +1/+1 counters (green badge)
   - Haste keyword (bypasses summoning sickness)

8. **Triggered Abilities**
   - **Prowess**: "Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn"
     - Automatically triggers when casting instants/sorceries
     - Blue "P" badge indicator
     - Temporary bonus displayed in P/T (green text)
   - **ETB triggers on attack**: Inferno Titan style (in sample puzzles)

### 🚧 Limitations & Not Implemented

- No blockers/blocking phase
- No stack or priority system
- No instant-speed interaction during opponent's turn
- No planeswalkers as cards (only as targets)
- No enchantments/artifacts with continuous effects (besides static keywords)
- No activated abilities (except for keyword abilities)
- No mana abilities on lands (mana pre-defined in pool)
- No upkeep/draw steps
- No end-of-turn cleanup
- Limited oracle text parsing (only damage + prowess + haste)
- No sacrifice costs (except hard-coded in Shard Volley example)
- No card drawing
- No life gain

---

## UI/UX Features

### Visual Feedback

- **Card States**:
  - Gray border: Normal
  - Yellow border: Summoning sick
  - Green hover: Can cast from hand
  - Purple border: Selected for casting
  - Red border: Valid target
  - Orange hover: Can declare as attacker
  - Red sword icon: Currently attacking
  - Rotated 90°: Tapped

- **Indicators**:
  - Green badge: +1/+1 counters
  - Blue "P" badge: Prowess active
  - Orange "!": Can attack
  - Red ⚔: Attacking or combat zone

- **Banners**:
  - Green animated "VICTORY!": Opponent defeated
  - Red "Defeat": Player defeated
  - Purple: Targeting mode active
  - Orange: Declaring attackers mode

### Interactions

- **Casting Spells**:
  1. Click card in hand
  2. Purple border appears, targeting arrow shown
  3. Click valid target (highlighted in red)
  4. Spell resolves, card moves to graveyard

- **Attacking**:
  1. Advance to "Declare Attackers" phase
  2. Orange banner appears
  3. Click creatures with "!" to toggle attacking
  4. Click "Confirm Attack" button
  5. Creatures tap, damage resolves automatically

- **Game Log**: Bottom of screen shows recent actions

### Tooltips

Hover over cards to see full card information:
- Card name & mana cost
- Type line
- Oracle text
- Power/Toughness
- Current status (tapped, summoning sick, etc.)

---

## Sample Puzzles

### 1. "Bolt the Bird" (Easy)
- Opponent at 3 life, no blockers
- You have Lightning Bolt in hand, {R} available
- **Solution**: Cast Lightning Bolt targeting opponent

### 2. "Alpha Strike" (Easy)
- Opponent at 4 life, no blockers
- You have two 2/2 Bears on battlefield
- **Solution**: Declare both as attackers (4 damage total)

### 3. "Swiftspear Prowess" (Easy)
- Opponent at 5 life
- You have Monastery Swiftspear (1/2 Haste, Prowess) and Lightning Bolt
- **Solution**: Cast Bolt at opponent (3 damage, Swiftspear becomes 2/3), attack with Swiftspear (2 damage)

### 4. "Inferno Titan Rampage" (Medium)
- Opponent at 7 life with 0/4 Wall of Omens blocker
- You have Inferno Titan (6/6 with attack trigger)
- **Solution**: Attack with Titan, trigger deals 2 to Wall and 1 to opponent (kills Wall), Titan connects for 6

### 5. "Burn Them Out" (Hard)
- Opponent at 10 life
- You have 4 burn spells in hand
- **Solution**: Calculate exact lethal with all spells

---

## File Structure

```
puzzles/
├── models.py                    # Database models
├── views.py                     # API endpoints
├── serializers.py               # DRF serializers
├── urls.py                      # URL routing
├── admin.py                     # Django admin config
└── management/
    └── commands/
        └── load_sample_puzzles.py  # Sample data

frontend/src/
├── pages/
│   ├── Puzzles.jsx              # Puzzle list page
│   └── PuzzleViewer.jsx         # Puzzle viewer page
├── context/
│   └── PuzzleContext.jsx        # Game engine & state management
└── components/puzzle/
    ├── GameBoard.jsx            # Main game container
    ├── PlayerArea.jsx           # Player zone
    ├── PuzzleCard.jsx           # Interactive card
    ├── BattlefieldZone.jsx      # Battlefield display
    ├── HandZone.jsx             # Hand display
    ├── GraveyardZone.jsx        # Graveyard display
    ├── LifeTotal.jsx            # Life counter
    ├── ManaPool.jsx             # Mana display
    ├── PhaseIndicator.jsx       # Phase indicator
    ├── TargetingArrow.jsx       # Targeting visual
    ├── PuzzleInfo.jsx           # Puzzle info sidebar
    └── index.js                 # Component exports
```

---

## Development Notes

### Adding New Mechanics

To add new game mechanics:

1. **Update PuzzleContext.jsx**:
   - Add new state variables
   - Create handler functions
   - Update `castSpellOnTarget` for new spell types
   - Update phase advancement if needed

2. **Update Card Object Structure**:
   - Add new properties to card objects in game state
   - Update sample puzzles with new properties

3. **Update PuzzleCard.jsx**:
   - Add visual indicators for new states
   - Add interaction handlers

4. **Update Oracle Text Parsing**:
   - Add regex patterns in `getValidTargetTypes` or `castSpellOnTarget`
   - Handle new keywords/abilities

### Creating New Puzzles

Use the Django management command:
```bash
python manage.py load_sample_puzzles
python manage.py load_sample_puzzles --force  # Recreate existing
```

Or create via API:
```javascript
POST /api/puzzles/
{
  "title": "Puzzle Title",
  "description": "Puzzle description",
  "difficulty": "easy",
  "solution_text": "Solution explanation",
  "is_published": true,
  "game_state": { /* game state JSON */ }
}
```

---

**Last Updated**: 2026-01-28
