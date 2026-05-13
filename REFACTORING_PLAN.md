# MTG Game Engine Refactoring Plan

**Created**: 2026-02-08
**Goal**: Transform hard-coded game engine into extensible, data-driven system
**Current State**: 71% hard-coded (~2,630 lines)
**Target State**: <20% hard-coded, card abilities defined in data

---

## Phase 1: Foundation (Do First - Enables Everything Else)

### 1.1 Extract Effect Handlers

**Current Problem**: 650-line switch statement in `applyStackItemEffect()`

**Solution**: Create effect handler registry

**New File Structure**:
```
frontend/src/
  engine/
    effects/
      index.js              # Effect registry
      damage.js             # damage, damage_divided, damage_per_nonbasic_lands
      lifegain.js           # gain_life, drain_life, gain_life_equal_toughness
      draw.js               # draw_cards, each_player_draws
      buff.js               # buff_creature, buff_self, prowess_trigger
      counters.js           # add_counter_to_self, add_counter_to_source
      mana.js               # add_mana, altar_add_mana
      battlefield.js        # enter_battlefield, enter_battlefield_permanent, create_token
      destruction.js        # destroy_land, sacrifice_self, wildfire
      misc.js               # channel_activate, opponent_loses_life
    utils/
      powerToughness.js     # Centralized P/T calculation
      manaCost.js           # Centralized mana parsing
```

**Before** (PuzzleContext.jsx lines 81-736):
```javascript
const applyStackItemEffect = useCallback((stackItem, currentState) => {
  const newState = JSON.parse(JSON.stringify(currentState));
  switch (stackItem.effect.type) {
    case 'damage': { /* 40 lines */ }
    case 'buff_creature': { /* 40 lines */ }
    // ... 25+ more cases
  }
  return newState;
}, [addLog]);
```

**After**:
```javascript
// engine/effects/index.js
import { applyDamage, applyDamageDivided } from './damage';
import { applyGainLife, applyDrainLife } from './lifegain';
// ... etc

export const effectHandlers = {
  'damage': applyDamage,
  'damage_divided': applyDamageDivided,
  'drain_life': applyDrainLife,
  'gain_life': applyGainLife,
  'gain_life_equal_toughness': applyGainLifeEqualToughness,
  'buff_creature': applyBuffCreature,
  'draw_cards': applyDrawCards,
  'add_mana': applyAddMana,
  'enter_battlefield': applyEnterBattlefield,
  'create_token': applyCreateToken,
  // ... register all effect types
};

export const applyEffect = (stackItem, gameState, helpers) => {
  const handler = effectHandlers[stackItem.effect.type];
  if (!handler) {
    helpers.addLog(`Unknown effect type: ${stackItem.effect.type}`);
    return gameState;
  }
  return handler(stackItem, gameState, helpers);
};
```

```javascript
// engine/effects/damage.js
import { calculateCreatureToughness } from '../utils/powerToughness';

export const applyDamage = (stackItem, gameState, { addLog }) => {
  const newState = JSON.parse(JSON.stringify(gameState));
  const { amount } = stackItem.effect;
  const targetData = stackItem.targeting_data;

  if (targetData?.targetType === 'player') {
    const targetPlayer = newState.players[targetData.targetData];
    targetPlayer.life -= amount;
    addLog(`${stackItem.source.name} deals ${amount} damage to ${targetData.targetData}.`);
  } else if (targetData?.targetType === 'creature') {
    // ... creature damage logic
  }

  return newState;
};

export const applyDamageDivided = (stackItem, gameState, { addLog }) => {
  // ... divided damage logic
};
```

```javascript
// PuzzleContext.jsx - simplified
import { applyEffect } from './engine/effects';

const applyStackItemEffect = useCallback((stackItem, currentState) => {
  return applyEffect(stackItem, currentState, { addLog });
}, [addLog]);
```

**Implementation Steps**:
1. Create `engine/effects/` directory structure
2. Create `engine/utils/powerToughness.js` with centralized calculation
3. Extract `damage` effects first (simplest, most used)
4. Extract `lifegain` effects
5. Extract remaining effects one category at a time
6. Replace switch statement with registry lookup
7. Test each puzzle after each extraction

**Estimated Effort**: 3-4 sessions

---

### 1.2 Create Trigger Registry

**Current Problem**: Separate functions for each trigger type, called from multiple places

**Current Functions**:
- `checkForETBTriggers()` - 84 lines
- `checkForDeathTriggers()` - 63 lines
- `checkForLifeGainTriggers()` - 34 lines
- `checkForSacrificeTriggers()` - 39 lines
- `checkForProwessTriggers()` - 25 lines
- `checkForSpellCastCMCTriggers()` - 52 lines
- `checkForLandGraveyardTriggers()` - 35 lines
- `checkForPermanentLeavesTriggers()` - 40 lines

**New File Structure**:
```
frontend/src/
  engine/
    triggers/
      index.js              # Trigger registry and dispatcher
      etb.js                # enters_battlefield, creature_enters_battlefield
      death.js              # dies, another_creature_dies, leaves_battlefield
      lifegain.js           # life_gain triggers
      combat.js             # on_attack, on_block, combat_damage
      spellcast.js          # spell_cast, second_spell_each_turn, cmc_triggers
      sacrifice.js          # sacrifice_creature triggers
      zones.js              # land_enters_graveyard, permanent_leaves
```

**After**:
```javascript
// engine/triggers/index.js
import { detectEtbTriggers, detectCreatureEtbTriggers } from './etb';
import { detectDeathTriggers, detectLeavesBattlefieldTriggers } from './death';
import { detectLifeGainTriggers } from './lifegain';
// ... etc

// Map of event types to trigger detectors
export const triggerDetectors = {
  'creature_entered': [detectEtbTriggers, detectCreatureEtbTriggers],
  'permanent_entered': [detectEtbTriggers],
  'creature_died': [detectDeathTriggers, detectLeavesBattlefieldTriggers],
  'permanent_left': [detectLeavesBattlefieldTriggers],
  'life_gained': [detectLifeGainTriggers],
  'creature_attacked': [detectAttackTriggers],
  'spell_cast': [detectSpellCastTriggers, detectSecondSpellTriggers],
  'creature_sacrificed': [detectSacrificeTriggers],
};

/**
 * Check for all triggers caused by an event
 * @param {string} eventType - Type of event that occurred
 * @param {object} eventData - Data about the event (creature, amount, etc.)
 * @param {object} gameState - Current game state
 * @returns {Array} - Stack items to add for triggered abilities
 */
export const checkTriggersForEvent = (eventType, eventData, gameState) => {
  const detectors = triggerDetectors[eventType] || [];
  const triggers = [];

  detectors.forEach(detector => {
    const detected = detector(eventData, gameState);
    triggers.push(...detected);
  });

  // Sort by timestamp/priority if needed
  return triggers.reverse(); // For proper LIFO ordering
};
```

```javascript
// engine/triggers/etb.js
/**
 * Detect ETB triggers for a creature that just entered
 * @param {object} eventData - { creature, wasEvoked, owner }
 * @param {object} gameState - Current game state
 */
export const detectEtbTriggers = (eventData, gameState) => {
  const { creature, wasEvoked, owner } = eventData;
  const triggers = [];

  // Check creature's own ETB triggers
  if (creature.triggered_abilities) {
    creature.triggered_abilities.forEach(ability => {
      if (ability.trigger === 'enters_the_battlefield' ||
          ability.trigger === 'enters_battlefield') {
        triggers.push(createTriggerStackItem(creature, ability, owner));
      }
    });
  }

  return triggers;
};

export const detectCreatureEtbTriggers = (eventData, gameState) => {
  const { creature, owner } = eventData;
  const triggers = [];

  // Check OTHER permanents for "creature enters" triggers
  const player = gameState.players[owner];
  player.battlefield?.forEach(permanent => {
    if (permanent.card_id === creature.card_id) return; // Skip self

    permanent.triggered_abilities?.forEach(ability => {
      if (ability.trigger === 'creature_enters_battlefield') {
        triggers.push(createTriggerStackItem(permanent, ability, owner));
      }
    });
  });

  return triggers;
};

// Helper to create consistent stack items
const createTriggerStackItem = (source, ability, owner) => ({
  id: `trigger-${source.card_id}-${Date.now()}-${Math.random()}`,
  type: 'triggered_ability',
  source: {
    card_id: source.card_id,
    name: source.name,
    owner: owner
  },
  effect: ability.effect,
  requires_input: ability.requires_input || false,
  targeting_data: null,
  resolved: false,
  timestamp: Date.now()
});
```

**Usage in PuzzleContext.jsx**:
```javascript
import { checkTriggersForEvent } from './engine/triggers';

// In resolveTopOfStack, after creature enters:
const newTriggers = checkTriggersForEvent('creature_entered', {
  creature: creatureCard,
  wasEvoked: stackItem.wasEvoked,
  owner: 'you'
}, newState);

newTriggers.forEach(trigger => addToStack(trigger));
```

**Implementation Steps**:
1. Create `engine/triggers/` directory structure
2. Create helper function for stack item creation
3. Extract ETB triggers first (most common)
4. Extract death triggers
5. Extract remaining trigger types
6. Create unified `checkTriggersForEvent()` dispatcher
7. Replace all individual `checkFor*Triggers()` calls with dispatcher
8. Test all puzzles

**Estimated Effort**: 2-3 sessions

---

### 1.3 Unify Stack Resolution

**Current Problem**: `resolveTopOfStack()` and `resolveOneStackItem()` are 450 lines of nearly identical code

**Solution**: Extract common logic into shared function

**Before**:
```javascript
const resolveTopOfStack = useCallback(() => {
  // 230 lines of resolution logic
  // Post-resolution trigger checking
  // Special case handling
}, [dependencies]);

const resolveOneStackItem = useCallback(() => {
  // 220 lines of SAME resolution logic (copy-pasted)
  // Same post-resolution trigger checking
  // Same special case handling
}, [dependencies]);
```

**After**:
```javascript
// Core resolution logic - used by both functions
const _resolveStackItem = useCallback((stackItem, gameState) => {
  // Apply effect
  const newState = applyEffect(stackItem, gameState, { addLog });

  // Check for triggers based on effect type
  const triggersToAdd = [];

  if (stackItem.effect.type === 'enter_battlefield') {
    triggersToAdd.push(...checkTriggersForEvent('creature_entered', {
      creature: stackItem.effect.creature,
      wasEvoked: stackItem.wasEvoked,
      owner: stackItem.effect.owner
    }, newState));
  }

  // ... other post-resolution trigger checks

  return { newState, triggersToAdd };
}, [applyEffect, addLog]);

// Public function for single resolution
const resolveTopOfStack = useCallback(() => {
  if (stack.length === 0) return;

  const topItem = stack[stack.length - 1];
  if (topItem.requires_input && !topItem.targeting_data) {
    addLog('Waiting for target selection...');
    return;
  }

  // Remove from stack
  setStack(prev => prev.slice(0, -1));

  // Resolve
  const { newState, triggersToAdd } = _resolveStackItem(topItem, gameState);
  setGameState(newState);

  // Add triggers
  triggersToAdd.forEach(trigger => addToStack(trigger));

  addLog(`${topItem.source.name} resolves.`);
}, [stack, gameState, _resolveStackItem, addToStack, addLog]);

// Same for resolveOneStackItem - just calls _resolveStackItem
const resolveOneStackItem = useCallback(() => {
  // Same structure, returns boolean for batch resolution
}, [stack, gameState, _resolveStackItem, addToStack, addLog]);
```

**Implementation Steps**:
1. Identify all shared logic between the two functions
2. Extract `_resolveStackItem()` helper
3. Refactor `resolveTopOfStack()` to use helper
4. Refactor `resolveOneStackItem()` to use helper
5. Test all puzzles

**Estimated Effort**: 1-2 sessions

---

### 1.4 Centralize Utility Functions

**Current Problem**: Power/toughness calculation repeated 6+ times, mana parsing repeated 5+ times

**New Files**:
```javascript
// engine/utils/powerToughness.js
/**
 * Calculate a creature's current power
 */
export const calculatePower = (creature) => {
  let power = parseInt(creature.power || 0);

  // +1/+1 counters
  if (creature.counters?.['+1/+1']) {
    power += creature.counters['+1/+1'];
  }

  // Buff effects
  if (creature.buffPower) {
    power += creature.buffPower;
  }

  // Prowess bonus
  if (creature.prowessBonus) {
    power += creature.prowessBonus;
  }

  // Role bonuses
  if (creature.attachedRoles) {
    creature.attachedRoles.forEach(role => {
      if (role.power) power += role.power;
    });
  }

  return power;
};

/**
 * Calculate a creature's current toughness
 */
export const calculateToughness = (creature) => {
  let toughness = parseInt(creature.toughness || 0);

  if (creature.counters?.['+1/+1']) {
    toughness += creature.counters['+1/+1'];
  }
  if (creature.buffToughness) {
    toughness += creature.buffToughness;
  }
  if (creature.prowessBonus) {
    toughness += creature.prowessBonus;
  }
  if (creature.attachedRoles) {
    creature.attachedRoles.forEach(role => {
      if (role.toughness) toughness += role.toughness;
    });
  }

  return toughness;
};

/**
 * Check if damage is lethal to a creature
 */
export const isLethalDamage = (creature, damage) => {
  return damage >= calculateToughness(creature);
};
```

```javascript
// engine/utils/manaCost.js
/**
 * Parse a mana cost string into structured format
 * @param {string} manaCost - e.g., "{2}{R}{R}" or "{X}{X}"
 * @returns {object} - { colored: {W:0,U:0,B:0,R:2,G:0}, generic: 2, xCount: 0 }
 */
export const parseManaCost = (manaCost) => {
  const cost = manaCost || '';

  return {
    colored: {
      W: (cost.match(/{W}/g) || []).length,
      U: (cost.match(/{U}/g) || []).length,
      B: (cost.match(/{B}/g) || []).length,
      R: (cost.match(/{R}/g) || []).length,
      G: (cost.match(/{G}/g) || []).length,
    },
    generic: parseInt(cost.match(/{(\d+)}/)?.[1] || '0'),
    xCount: (cost.match(/{X}/g) || []).length,
  };
};

/**
 * Calculate total mana needed
 */
export const getTotalManaCost = (parsedCost, xValue = 0) => {
  const coloredTotal = Object.values(parsedCost.colored).reduce((a, b) => a + b, 0);
  const xTotal = parsedCost.xCount * xValue;
  return coloredTotal + parsedCost.generic + xTotal;
};

/**
 * Check if player can afford a cost
 */
export const canAffordCost = (parsedCost, manaPool, xValue = 0, costReduction = 0) => {
  const available = { ...manaPool };
  const availableTotal = Object.values(available).reduce((a, b) => a + b, 0);

  // Check colored requirements
  for (const [color, needed] of Object.entries(parsedCost.colored)) {
    if ((available[color] || 0) < needed) {
      return false;
    }
  }

  // Check total for generic + X
  const genericNeeded = Math.max(0, parsedCost.generic + (parsedCost.xCount * xValue) - costReduction);
  const coloredTotal = Object.values(parsedCost.colored).reduce((a, b) => a + b, 0);

  return availableTotal >= coloredTotal + genericNeeded;
};

/**
 * Spend mana from pool, returns new pool state
 */
export const spendMana = (manaPool, parsedCost, xValue = 0, costReduction = 0) => {
  const newPool = { ...manaPool };

  // Spend colored mana
  for (const [color, needed] of Object.entries(parsedCost.colored)) {
    newPool[color] = (newPool[color] || 0) - needed;
  }

  // Spend generic (prioritize colorless, then any color)
  let genericToSpend = Math.max(0, parsedCost.generic + (parsedCost.xCount * xValue) - costReduction);
  for (const col of ['C', 'W', 'U', 'B', 'R', 'G']) {
    if (genericToSpend <= 0) break;
    const available = newPool[col] || 0;
    const toSpend = Math.min(available, genericToSpend);
    newPool[col] = available - toSpend;
    genericToSpend -= toSpend;
  }

  return newPool;
};
```

**Implementation Steps**:
1. Create `engine/utils/` directory
2. Create `powerToughness.js` with functions
3. Create `manaCost.js` with functions
4. Find all P/T calculations in PuzzleContext.jsx and replace
5. Find all mana parsing and replace
6. Test all puzzles

**Estimated Effort**: 1 session

---

## Phase 2: Extensibility

### 2.1 Standardize Ability Format

**Goal**: Machine-readable ability definitions that work without code changes

**Current Format** (inconsistent):
```javascript
// Some cards use this:
triggered_abilities: [{
  trigger: "enters_the_battlefield",
  effect: { type: "gain_life", amount: 1 }
}]

// Others use this:
activated_abilities: [{
  cost: "{T}, Sacrifice a creature:",
  description: "Add one mana of any color",
  effect: { type: "altar_add_mana" },
  requires_sacrifice: true
}]
```

**New Format** (standardized):
```javascript
// Triggered ability
{
  type: "triggered",
  trigger: {
    event: "creature_enters_battlefield",
    condition: null,  // Optional: { type: "controller_owns", value: true }
    excludeSelf: false
  },
  effect: {
    type: "gain_life",
    amount: 1,
    target: "controller"
  }
}

// Activated ability
{
  type: "activated",
  cost: {
    mana: { generic: 0, colored: {} },
    tap: false,
    sacrifice: { type: "creature", count: 1 },
    other: []
  },
  effect: {
    type: "add_mana",
    amount: 1,
    color: "any"  // Player chooses
  },
  timing: "instant"  // or "sorcery"
}

// Static ability
{
  type: "static",
  effect: {
    type: "grant_keyword",
    keyword: "trample",
    target: "self"
  },
  condition: null  // Optional: only active when condition met
}
```

**Implementation Steps**:
1. Document new ability format schema
2. Create ability parser/validator
3. Update card data to new format (can be gradual)
4. Update effect handlers to read new format
5. Test with updated puzzles

**Estimated Effort**: 2-3 sessions

---

### 2.2 Create Land Mana Registry

**Current Problem**: Hard-coded dual land names in `getLandManaAbilities()`

**Solution**: Data-driven land definitions

```javascript
// engine/data/lands.js
export const landManaAbilities = {
  // Basic lands
  'forest': [{ mana: 'G', label: '{G}' }],
  'island': [{ mana: 'U', label: '{U}' }],
  'mountain': [{ mana: 'R', label: '{R}' }],
  'plains': [{ mana: 'W', label: '{W}' }],
  'swamp': [{ mana: 'B', label: '{B}' }],

  // Original dual lands
  'badlands': [{ mana: 'B', label: '{B}' }, { mana: 'R', label: '{R}' }],
  'bayou': [{ mana: 'B', label: '{B}' }, { mana: 'G', label: '{G}' }],
  'plateau': [{ mana: 'R', label: '{R}' }, { mana: 'W', label: '{W}' }],
  'savannah': [{ mana: 'G', label: '{G}' }, { mana: 'W', label: '{W}' }],
  'scrubland': [{ mana: 'W', label: '{W}' }, { mana: 'B', label: '{B}' }],
  'taiga': [{ mana: 'R', label: '{R}' }, { mana: 'G', label: '{G}' }],
  'tropical island': [{ mana: 'G', label: '{G}' }, { mana: 'U', label: '{U}' }],
  'tundra': [{ mana: 'U', label: '{U}' }, { mana: 'W', label: '{W}' }],
  'underground sea': [{ mana: 'U', label: '{U}' }, { mana: 'B', label: '{B}' }],
  'volcanic island': [{ mana: 'U', label: '{U}' }, { mana: 'R', label: '{R}' }],

  // Shock lands
  'blood crypt': [{ mana: 'B', label: '{B}' }, { mana: 'R', label: '{R}' }],
  'breeding pool': [{ mana: 'G', label: '{G}' }, { mana: 'U', label: '{U}' }],
  // ... etc

  // Fetch lands (special handling)
  'flooded strand': [{ type: 'fetch', colors: ['W', 'U'] }],
  // ... etc
};

export const getLandMana = (landName) => {
  return landManaAbilities[landName.toLowerCase()] || [];
};
```

**Estimated Effort**: 1 session

---

### 2.3 Role Token Registry

**Current Problem**: Hard-coded role definitions in effect handler

```javascript
// engine/data/roles.js
export const roleDefinitions = {
  'Monster': {
    power: 1,
    toughness: 1,
    keywords: ['trample']
  },
  'Royal': {
    power: 1,
    toughness: 1,
    keywords: ['ward']
  },
  'Sorcerer': {
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [{
      type: 'triggered',
      trigger: { event: 'spell_cast', condition: { type: 'noncreature' } },
      effect: { type: 'scry', amount: 1 }
    }]
  },
  'Cursed': {
    power: -1,
    toughness: -1,
    keywords: [],
    owner: 'opponent'  // Applied to opponent's creature
  },
  'Wicked': {
    power: 1,
    toughness: 1,
    keywords: [],
    abilities: [{
      type: 'triggered',
      trigger: { event: 'source_dies' },
      effect: { type: 'drain_life', amount: 1 }
    }]
  },
  'Young Hero': {
    power: 0,
    toughness: 0,
    keywords: [],
    abilities: [{
      type: 'triggered',
      trigger: { event: 'attacks', condition: { type: 'base_power_2_or_less' } },
      effect: { type: 'add_counter', counter: '+1/+1', amount: 1 }
    }]
  }
};
```

**Estimated Effort**: 0.5 sessions

---

## Phase 3: Polish & Testing

### 3.1 Add TypeScript Interfaces

Create type definitions for all major structures:

```typescript
// types/card.ts
interface Card {
  card_id: string;
  name: string;
  mana_cost: string;
  type_line: string;
  power?: string;
  toughness?: string;
  oracle_text?: string;
  colors?: Color[];
  triggered_abilities?: TriggeredAbility[];
  activated_abilities?: ActivatedAbility[];
}

interface TriggeredAbility {
  trigger: TriggerEvent;
  effect: Effect;
  condition?: Condition;
  excludeSelf?: boolean;
  requires_input?: boolean;
}

interface Effect {
  type: EffectType;
  amount?: number;
  target?: TargetType;
  // ... effect-specific fields
}

type EffectType =
  | 'damage'
  | 'gain_life'
  | 'draw_cards'
  | 'add_mana'
  | 'buff_creature'
  | 'create_token'
  // ... all effect types
;

type TriggerEvent =
  | 'enters_battlefield'
  | 'creature_enters_battlefield'
  | 'dies'
  | 'life_gain'
  // ... all trigger types
;
```

**Estimated Effort**: 2 sessions

---

### 3.2 Create Test Suite

```javascript
// tests/effects/damage.test.js
describe('Damage Effect', () => {
  it('should deal damage to opponent', () => {
    const gameState = createTestState({ opponentLife: 20 });
    const stackItem = createDamageStackItem({ amount: 3, target: 'opponent' });

    const newState = applyDamage(stackItem, gameState, mockHelpers);

    expect(newState.players.opponent.life).toBe(17);
  });

  it('should kill creature when damage >= toughness', () => {
    // ... test creature death
  });
});

// tests/triggers/etb.test.js
describe('ETB Triggers', () => {
  it('should trigger Essence Warden on creature ETB', () => {
    const gameState = createTestState({
      battlefield: [createCard('Essence Warden', { triggered_abilities: [...] })]
    });

    const triggers = detectCreatureEtbTriggers(
      { creature: createCard('Bear'), owner: 'you' },
      gameState
    );

    expect(triggers).toHaveLength(1);
    expect(triggers[0].effect.type).toBe('gain_life');
  });
});
```

**Estimated Effort**: 2-3 sessions

---

## Implementation Order

### Session 1: Utilities
- [ ] Create `engine/` directory structure
- [ ] Implement `engine/utils/powerToughness.js`
- [ ] Implement `engine/utils/manaCost.js`
- [ ] Replace all P/T calculations in PuzzleContext
- [ ] Replace all mana parsing in PuzzleContext
- [ ] Test all puzzles

### Session 2-3: Effect Handlers
- [ ] Create `engine/effects/` structure
- [ ] Extract damage effects
- [ ] Extract lifegain effects
- [ ] Extract draw effects
- [ ] Extract buff effects
- [ ] Extract counter effects
- [ ] Extract mana effects
- [ ] Extract battlefield effects (ETB, tokens)
- [ ] Create effect registry
- [ ] Replace switch statement
- [ ] Test all puzzles

### Session 4-5: Trigger System
- [ ] Create `engine/triggers/` structure
- [ ] Extract ETB triggers
- [ ] Extract death triggers
- [ ] Extract lifegain triggers
- [ ] Extract combat triggers
- [ ] Extract spell cast triggers
- [ ] Create trigger dispatcher
- [ ] Replace all `checkFor*Triggers()` calls
- [ ] Test all puzzles

### Session 6: Stack Unification
- [ ] Extract `_resolveStackItem()` helper
- [ ] Refactor `resolveTopOfStack()`
- [ ] Refactor `resolveOneStackItem()`
- [ ] Test all puzzles

### Session 7: Data Registries
- [ ] Create `engine/data/lands.js`
- [ ] Create `engine/data/roles.js`
- [ ] Update land mana ability lookup
- [ ] Update role application
- [ ] Test all puzzles

### Session 8+: Polish
- [ ] Add TypeScript interfaces
- [ ] Create test suite
- [ ] Documentation

---

## Success Metrics

After refactoring is complete:

1. **Adding new effect type**: Create new file in `effects/`, register in index - NO core code changes
2. **Adding new trigger type**: Create detector in `triggers/`, register in index - NO core code changes
3. **Adding new land**: Add entry to `lands.js` - NO code changes
4. **Adding new role**: Add entry to `roles.js` - NO code changes
5. **PuzzleContext.jsx size**: Reduced from ~3,700 lines to ~1,500 lines
6. **Hard-coded percentage**: Reduced from 71% to <20%

---

## Files Changed Summary

**New Files**:
```
frontend/src/engine/
  effects/
    index.js
    damage.js
    lifegain.js
    draw.js
    buff.js
    counters.js
    mana.js
    battlefield.js
    destruction.js
    misc.js
  triggers/
    index.js
    etb.js
    death.js
    lifegain.js
    combat.js
    spellcast.js
    sacrifice.js
    zones.js
  utils/
    powerToughness.js
    manaCost.js
  data/
    lands.js
    roles.js
```

**Modified Files**:
```
frontend/src/context/PuzzleContext.jsx  (major refactor - 70% reduction)
```

---

## Notes for Tomorrow

1. **Start with utilities** (Session 1) - lowest risk, immediate value
2. **Test after each extraction** - don't batch too many changes
3. **Keep old code commented** until tests pass, then delete
4. **Puzzles are the test suite** - run all puzzles after each change
5. **Git commit after each working state** - easy rollback if needed

The goal is small, incremental changes that each leave the system working.
