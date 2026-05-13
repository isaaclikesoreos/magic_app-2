# MTG Ability Schema v1.0

**Last Updated:** 2026-02-11
**Status:** Draft

## Overview

This document defines the standardized schema for all Magic: The Gathering card abilities in the puzzle system. The schema is designed to be:

- **Machine-readable**: Can be parsed and validated programmatically
- **Backward compatible**: Supports both old and new formats during migration
- **Extensible**: Easy to add new ability types without code changes
- **Type-safe**: Ready for TypeScript conversion

---

## Ability Categories

MTG has four main categories of abilities:

1. **Keyword Abilities** - Shorthand for common mechanics (Flying, Trample, Haste)
2. **Static Abilities** - Continuous effects that are always active
3. **Triggered Abilities** - Activate when specific events occur
4. **Activated Abilities** - Can be used by paying a cost

---

## Schema Definitions

### 1. Keyword Abilities

**Format:** Array of keyword strings

```javascript
{
  "keywords": ["flying", "trample", "haste", "vigilance", "lifelink", "deathtouch"]
}
```

**Supported Keywords:**
- **Evasion**: `flying`, `menace`, `unblockable`
- **Combat**: `first_strike`, `double_strike`, `trample`, `vigilance`, `reach`
- **Damage**: `lifelink`, `deathtouch`
- **Protection**: `hexproof`, `ward`, `indestructible`
- **Speed**: `haste`, `flash`
- **Blocking**: `defender`
- **Evergreen**: All standard keywords from MTG

**Legacy Support:**
```javascript
// Old format (still supported)
{
  "hasHaste": true,
  "hasProwess": true
}

// Converted to new format internally:
{
  "keywords": ["haste"],
  "triggered_abilities": [{ /* prowess trigger */ }]
}
```

---

### 2. Static Abilities

**Definition:** Continuous effects that modify game state while the permanent is on the battlefield.

```typescript
interface StaticAbility {
  type: "static";
  effect: {
    type: string;           // Effect type identifier
    target?: string;        // Who/what is affected
    condition?: Condition;  // When the effect is active
    [key: string]: any;     // Effect-specific parameters
  };
  duration?: "permanent" | "until_end_of_turn" | "while_on_battlefield";
  layer?: number;           // For complex interaction resolution
}
```

**Examples:**

```javascript
// Simple stat buff
{
  "type": "static",
  "effect": {
    "type": "grant_stats",
    "target": "self",
    "power": 2,
    "toughness": 2
  }
}

// Conditional buff
{
  "type": "static",
  "effect": {
    "type": "grant_stats",
    "target": "self",
    "power": 1,
    "toughness": 1
  },
  "condition": {
    "type": "has_card_type",
    "card_type": "artifact",
    "zone": "battlefield",
    "controller": "self"
  }
}

// Grant keyword to others
{
  "type": "static",
  "effect": {
    "type": "grant_keyword",
    "keyword": "flying",
    "target": "all_creatures_you_control"
  }
}
```

---

### 3. Triggered Abilities

**Definition:** Abilities that trigger when a specific event occurs.

```typescript
interface TriggeredAbility {
  type: "triggered";
  trigger: {
    event: string;          // Event that causes the trigger
    condition?: Condition;  // Additional conditions to check
    source?: string;        // What caused the event (self, any, other)
  };
  effect: Effect;           // What happens when triggered
  requires_input?: boolean; // Does it need player input (targets, choices)?
  optional?: boolean;       // Can the controller choose not to use it?
}
```

**Trigger Events:**
- **Zone changes**: `enters_battlefield`, `leaves_battlefield`, `dies`, `etb`
- **Combat**: `on_attack`, `on_block`, `deals_combat_damage`, `attacks_or_blocks`
- **Spells**: `spell_cast`, `noncreature_spell_cast`, `second_spell_this_turn`
- **Counters**: `counter_added`, `counter_removed`
- **Life**: `life_gained`, `life_lost`, `damage_dealt`
- **Sacrifice**: `creature_sacrificed`, `permanent_sacrificed`
- **Phases**: `upkeep`, `end_step`, `beginning_of_combat`

**Examples:**

```javascript
// Simple ETB trigger
{
  "type": "triggered",
  "trigger": {
    "event": "enters_battlefield",
    "source": "self"
  },
  "effect": {
    "type": "gain_life",
    "amount": 1
  }
}

// ETB with targeting
{
  "type": "triggered",
  "trigger": {
    "event": "enters_battlefield",
    "source": "self"
  },
  "effect": {
    "type": "damage",
    "amount": 3,
    "valid_targets": ["creature", "planeswalker"]
  },
  "requires_input": true
}

// Conditional trigger (Prowess)
{
  "type": "triggered",
  "trigger": {
    "event": "spell_cast",
    "condition": {
      "type": "spell_is_noncreature",
      "caster": "controller"
    }
  },
  "effect": {
    "type": "buff_until_eot",
    "target": "self",
    "power": 1,
    "toughness": 1
  }
}

// Attack trigger (Inferno Titan)
{
  "type": "triggered",
  "trigger": {
    "event": "on_attack",
    "source": "self"
  },
  "effect": {
    "type": "damage_divided",
    "amount": 3,
    "targets": { "min": 1, "max": 3 },
    "valid_targets": ["creature", "player", "planeswalker"]
  },
  "requires_input": true
}

// Leaves battlefield trigger (Thragtusk)
{
  "type": "triggered",
  "trigger": {
    "event": "leaves_battlefield",
    "source": "self"
  },
  "effect": {
    "type": "create_token",
    "token": {
      "name": "Beast Token",
      "power": 3,
      "toughness": 3,
      "type_line": "Creature - Beast",
      "colors": ["G"]
    },
    "count": 1
  }
}

// Sacrifice trigger (Fleshtaker)
{
  "type": "triggered",
  "trigger": {
    "event": "creature_sacrificed",
    "source": "other",
    "condition": {
      "type": "controller_owns",
      "value": true
    }
  },
  "effect": {
    "type": "gain_life_and_scry",
    "life_amount": 1,
    "scry_amount": 1
  }
}
```

---

### 4. Activated Abilities

**Definition:** Abilities that can be activated by paying a cost.

```typescript
interface ActivatedAbility {
  type: "activated";
  cost: {
    mana?: ManaCost;        // Mana cost to activate
    tap?: boolean;          // Requires tapping
    untap?: boolean;        // Requires untapping
    sacrifice?: SacrificeCost;  // Sacrifice cost
    discard?: DiscardCost;  // Discard cards
    pay_life?: number;      // Life payment
    remove_counters?: CounterCost;  // Remove counters
    other?: string;         // Other costs (textual)
  };
  effect: Effect;           // What happens when activated
  timing?: "instant" | "sorcery" | "any";  // When it can be activated
  requires_target?: boolean;  // Does it need a target?
  usable_while_tapped?: boolean;  // Can use while tapped?
}
```

**Cost Formats:**

```typescript
interface ManaCost {
  generic?: number;         // Colorless/generic mana
  colored?: {              // Colored mana
    W?: number;
    U?: number;
    B?: number;
    R?: number;
    G?: number;
  };
  X?: number;              // X cost (user chooses)
  hybrid?: Array<{         // Hybrid mana
    colors: string[];
    count: number;
  }>;
}

interface SacrificeCost {
  type: string;            // "creature", "artifact", "land", "permanent"
  count: number;           // How many
  condition?: Condition;   // Additional restrictions
  self?: boolean;          // Sacrifice this permanent
}
```

**Examples:**

```javascript
// Simple mana ability
{
  "type": "activated",
  "cost": {
    "mana": { "colored": { "R": 1 } }
  },
  "effect": {
    "type": "buff_until_eot",
    "target": "self",
    "power": 1,
    "toughness": 0
  },
  "timing": "instant"
}

// Sacrifice for effect (Phyrexian Altar)
{
  "type": "activated",
  "cost": {
    "sacrifice": {
      "type": "creature",
      "count": 1
    }
  },
  "effect": {
    "type": "add_mana",
    "amount": 1,
    "color": "any"  // Player chooses
  },
  "timing": "instant"
}

// Tap ability with target (Goblin Bombardment)
{
  "type": "activated",
  "cost": {
    "sacrifice": {
      "type": "creature",
      "count": 1
    }
  },
  "effect": {
    "type": "damage",
    "amount": 1,
    "valid_targets": ["any"]
  },
  "timing": "instant",
  "requires_target": true
}

// Complex cost (Wasteland)
{
  "type": "activated",
  "cost": {
    "tap": true,
    "sacrifice": {
      "type": "permanent",
      "self": true,
      "count": 1
    }
  },
  "effect": {
    "type": "destroy",
    "valid_targets": ["nonbasic_land"]
  },
  "timing": "instant",
  "requires_target": true
}

// Mana + sacrifice (Cartel Aristocrat)
{
  "type": "activated",
  "cost": {
    "mana": { "generic": 1 },
    "sacrifice": {
      "type": "creature",
      "count": 1
    }
  },
  "effect": {
    "type": "gain_life_equal_toughness",
    "target": "controller"
  },
  "timing": "instant"
}
```

---

## Effect Types

Common effect types across all ability categories:

### Damage
```javascript
{ type: "damage", amount: 3, target: "any" }
{ type: "damage_divided", amount: 3, targets: { min: 1, max: 3 } }
{ type: "damage_per_X", base: "nonbasic_lands_opponent_controls" }
```

### Life Gain/Loss
```javascript
{ type: "gain_life", amount: 2 }
{ type: "gain_life_equal_toughness", source: "sacrificed_creature" }
{ type: "drain_life", amount: 1, target: "opponent" }
{ type: "gain_life_and_scry", life_amount: 1, scry_amount: 1 }
```

### Card Draw
```javascript
{ type: "draw_cards", amount: 1 }
{ type: "each_player_draws", amount: 1 }
{ type: "scry", amount: 1 }
```

### Buffs
```javascript
{ type: "buff_until_eot", target: "self", power: 2, toughness: 2 }
{ type: "buff_creature", target: "any_creature", power: 1, toughness: 1 }
{ type: "grant_keyword_until_eot", keyword: "trample", target: "self" }
```

### Counters
```javascript
{ type: "add_counter", counter_type: "+1/+1", amount: 1, target: "self" }
{ type: "remove_counter", counter_type: "+1/+1", amount: 1 }
```

### Mana
```javascript
{ type: "add_mana", color: "R", amount: 1 }
{ type: "add_mana", color: "any", amount: 1 }  // Player chooses
{ type: "add_mana_combo", colors: ["R", "G"], amount: 1 }
```

### Battlefield
```javascript
{ type: "create_token", token: {...}, count: 1 }
{ type: "destroy", valid_targets: ["creature"] }
{ type: "sacrifice", target: "self" }
{ type: "return_to_hand", target: "self" }
```

### Roles & Auras
```javascript
{
  type: "attach_role",
  role: "Monster",
  target: "any_creature",
  grants_keyword: "trample"
}
```

---

## Conditions

Conditions can be used in triggers and static abilities:

```typescript
interface Condition {
  type: string;             // Condition type
  [key: string]: any;       // Condition-specific parameters
}
```

**Common Conditions:**

```javascript
// Card type check
{ type: "has_card_type", card_type: "artifact", zone: "battlefield" }

// Controller check
{ type: "controller_owns", value: true }

// Power/toughness check
{ type: "power_greater_than", value: 2 }
{ type: "base_power_2_or_less" }

// Count check
{ type: "permanent_count", card_type: "creature", comparison: ">=", value: 3 }

// Spell check
{ type: "spell_is_noncreature", caster: "controller" }
```

---

## Migration Guide

### Old Format → New Format

**Keywords:**
```javascript
// OLD
{ "hasHaste": true, "hasProwess": true }

// NEW
{
  "keywords": ["haste"],
  "triggered_abilities": [{
    "type": "triggered",
    "trigger": { "event": "noncreature_spell_cast" },
    "effect": { "type": "buff_until_eot", "power": 1, "toughness": 1 }
  }]
}
```

**Triggered Abilities:**
```javascript
// OLD
{
  "triggered_abilities": [{
    "trigger": "enters_the_battlefield",
    "effect": { "type": "gain_life", "amount": 1 }
  }]
}

// NEW (minimal change - add type)
{
  "triggered_abilities": [{
    "type": "triggered",
    "trigger": {
      "event": "enters_battlefield",
      "source": "self"
    },
    "effect": { "type": "gain_life", "amount": 1 }
  }]
}
```

**Activated Abilities:**
```javascript
// OLD
{
  "activated_abilities": [{
    "cost": "{2}{U}",
    "description": "Each player draws a card",
    "effect": { "type": "each_player_draws", "amount": 1 }
  }]
}

// NEW
{
  "activated_abilities": [{
    "type": "activated",
    "cost": {
      "mana": { "generic": 2, "colored": { "U": 1 } }
    },
    "effect": { "type": "each_player_draws", "amount": 1 },
    "timing": "instant"
  }]
}
```

---

## Parser Behavior

The ability parser (`engine/abilities/parser.js`) will:

1. **Auto-detect** format version based on structure
2. **Convert** old formats to new format internally
3. **Validate** against schema
4. **Normalize** to standardized structure
5. **Report** any validation errors

**Usage:**
```javascript
import { parseAbilities, validateCard } from './engine/abilities';

const card = { /* card data */ };
const parsed = parseAbilities(card);
const validation = validateCard(card);

if (!validation.valid) {
  console.error('Card validation failed:', validation.errors);
}
```

---

## Implementation Checklist

- [x] Define comprehensive schema
- [ ] Document all ability types and examples
- [ ] Create parser for old → new conversion
- [ ] Create validator
- [ ] Add builder utilities
- [ ] Update effect handlers to read new format
- [ ] Migrate sample puzzles (gradual, backward compatible)
- [ ] Add schema tests

---

## Future Enhancements

- TypeScript type definitions
- JSON Schema for external validation
- Card builder UI
- Scryfall import tool
- Ability text generator (data → English text)
