# TypeScript Migration Plan - Complete Gradual Migration

**Created:** 2026-02-12
**Target:** Migrate entire frontend from JavaScript to TypeScript
**Approach:** Gradual, bottom-up (utilities → engine → context → components)
**Timeline:** ~4 weeks part-time, ~2 weeks full-time

---

## Phase 0: Setup & Learning (Day 1-2)

### Setup TypeScript

```bash
# Install TypeScript and type definitions
cd frontend
npm install -D typescript @types/react @types/react-dom @types/node

# Create tsconfig.json (will provide full config below)
```

### Learning Resources (Start Here)

**Quick Start (1-2 hours):**
- [TypeScript in 5 Minutes](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html)
- [React TypeScript Cheatsheet](https://react-typescript-cheatsheet.netlify.app/)

**Key Concepts You Need:**
1. **Basic Types**: `string`, `number`, `boolean`, `array`, `object`
2. **Interfaces**: Define object shapes
3. **Type Aliases**: Define custom types
4. **Union Types**: `'you' | 'opponent'`
5. **Optional Fields**: `field?: string`
6. **Generics**: `Array<Card>` (you'll learn as you go)

**Don't Worry About:**
- Advanced generics
- Decorators
- Namespaces
- Complex type gymnastics

### Create tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting - Start Loose, Tighten Later */
    "strict": false,  // Start false, enable after migration
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,

    /* Path aliases */
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### Update vite.config

Rename `vite.config.js` → `vite.config.ts` (Vite auto-detects TypeScript)

**✅ Checkpoint:** Run `npm run dev` - should still work

---

## Phase 1: Type Definitions (Day 2-3)

### Create Type Definition Files

These are the foundation - everything else will import from here.

#### 1.1 Create `src/types/cards.ts`

```typescript
// Card and permanent types
export interface Card {
  card_id: number;
  instance_id: string;
  name: string;
  mana_cost: string;
  type_line: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  colors: string[];
  image_url?: string;
  is_token: boolean;

  // Runtime state (when on battlefield)
  tapped?: boolean;
  summoning_sick?: boolean;
  counters?: Record<string, number>;
  attacking?: boolean;
  blocking?: boolean;
  buffPower?: number;
  buffToughness?: number;
  prowessBonus?: number;
  attachedRoles?: Role[];

  // Abilities
  keywords?: string[];
  triggered_abilities?: TriggeredAbility[];
  activated_abilities?: ActivatedAbility[];
  static_abilities?: StaticAbility[];
  spell_effect?: Effect;
}

export type Permanent = Card;  // Alias for cards on battlefield

export interface Token {
  id: number;
  name: string;
  type_line: string;
  power: string;
  toughness: string;
  colors: string[];
  oracle_text?: string;
  keywords?: string[];
  triggered_abilities?: TriggeredAbility[];
}

export interface Role {
  type: 'Monster' | 'Royal' | 'Sorcerer' | 'Cursed' | 'Wicked' | 'Young Hero';
  id: string;
  power?: number;
  toughness?: number;
  keywords?: string[];
}
```

#### 1.2 Create `src/types/abilities.ts`

```typescript
// Ability types based on ABILITY_SCHEMA.md

export type TriggerEvent =
  | 'enters_battlefield'
  | 'etb'
  | 'leaves_battlefield'
  | 'dies'
  | 'creature_enters_battlefield'
  | 'creature_died'
  | 'another_creature_dies'
  | 'life_gained'
  | 'on_attack'
  | 'on_block'
  | 'deals_combat_damage'
  | 'noncreature_spell_cast'
  | 'spell_cast'
  | 'second_spell_this_turn'
  | 'creature_sacrificed'
  | 'sacrifice_creature'
  | 'permanent_sacrificed'
  | 'land_to_graveyard'
  | 'permanent_left'
  | 'upkeep'
  | 'end_step';

export type EffectType =
  | 'damage'
  | 'damage_divided'
  | 'damage_per_nonbasic_lands'
  | 'deal_damage_to_controller'
  | 'damage_to_caster'
  | 'gain_life'
  | 'gain_life_equal_toughness'
  | 'drain_life'
  | 'gain_life_and_scry'
  | 'opponent_loses_life'
  | 'draw_cards'
  | 'each_player_draws'
  | 'scry'
  | 'buff_until_eot'
  | 'buff_creature'
  | 'buff_self'
  | 'prowess_trigger'
  | 'add_counter'
  | 'add_counter_to_self'
  | 'add_counter_to_source'
  | 'remove_counter'
  | 'add_mana'
  | 'altar_add_mana'
  | 'channel_activate'
  | 'enter_battlefield'
  | 'enter_battlefield_permanent'
  | 'create_token'
  | 'destroy'
  | 'sacrifice'
  | 'sacrifice_self'
  | 'return_to_hand'
  | 'destroy_land'
  | 'wildfire'
  | 'attach_role'
  | 'create_role';

export interface Effect {
  type: EffectType;
  amount?: number;
  target?: string;
  valid_targets?: string[];
  counter_type?: string;
  counterType?: string;  // Legacy support
  [key: string]: any;  // Allow other effect-specific fields
}

export interface Trigger {
  event: TriggerEvent;
  source?: 'self' | 'other' | 'any' | 'controller';
  condition?: Condition;
}

export interface Condition {
  type: string;
  [key: string]: any;
}

export interface TriggeredAbility {
  type?: 'triggered';
  trigger: Trigger | string;  // string for legacy support
  effect: Effect;
  requires_input?: boolean;
  optional?: boolean;
}

export interface ActivatedAbility {
  type?: 'activated';
  cost: Cost | string;  // string for legacy mana costs
  effect: Effect;
  timing?: 'instant' | 'sorcery' | 'any';
  requires_target?: boolean;
  description?: string;
}

export interface StaticAbility {
  type?: 'static';
  effect: Effect;
  condition?: Condition;
  duration?: 'permanent' | 'until_end_of_turn' | 'while_on_battlefield';
}

export interface Cost {
  mana?: ManaCost;
  tap?: boolean;
  untap?: boolean;
  sacrifice?: SacrificeCost;
  discard?: DiscardCost;
  pay_life?: number;
  remove_counters?: Record<string, number>;
}

export interface ManaCost {
  generic?: number;
  colored?: {
    W?: number;
    U?: number;
    B?: number;
    R?: number;
    G?: number;
    C?: number;
  };
  X?: number;
}

export interface SacrificeCost {
  type: string;
  count: number;
  self?: boolean;
  condition?: Condition;
}

export interface DiscardCost {
  count: number;
  condition?: Condition;
}
```

#### 1.3 Create `src/types/gameState.ts`

```typescript
import { Card, Permanent } from './cards';

export type TurnPhase =
  | 'main1'
  | 'begin_combat'
  | 'declare_attackers'
  | 'combat_damage'
  | 'end_combat'
  | 'main2'
  | 'end_step';

export interface ManaPool {
  W: number;
  U: number;
  B: number;
  R: number;
  G: number;
  C: number;
}

export interface Player {
  life: number;
  mana_pool: ManaPool;
  library_count: number;
  hand: Card[];
  battlefield: Permanent[];
  graveyard: Card[];
  exile: Card[];
  hand_count?: number;  // For opponent (hidden hand)
  deckedOut?: boolean;
}

export interface GameState {
  players: {
    you: Player;
    opponent: Player;
  };
  turn_phase: TurnPhase;
  active_player: 'you' | 'opponent';
  _lifeGained?: number;  // Internal flag
}
```

#### 1.4 Create `src/types/stack.ts`

```typescript
import { Effect } from './abilities';

export type StackItemType =
  | 'spell'
  | 'triggered_ability'
  | 'activated_ability';

export interface StackItemSource {
  instance_id?: string;
  card_id?: number;
  name: string;
  owner: 'you' | 'opponent';
}

export interface TargetingData {
  targetType: 'player' | 'creature' | 'permanent' | 'land';
  targetData: any;
}

export interface StackItem {
  id: string;
  type: StackItemType;
  source: StackItemSource;
  effect: Effect;
  requires_input: boolean;
  targeting_data: TargetingData | null;
  resolved: boolean;
  timestamp: number;
  wasEvoked?: boolean;
}
```

#### 1.5 Create `src/types/index.ts` (Barrel Export)

```typescript
// Central export point for all types
export * from './abilities';
export * from './cards';
export * from './gameState';
export * from './stack';

// Re-export commonly used types
export type { Card, Permanent, Token } from './cards';
export type { GameState, Player, ManaPool } from './gameState';
export type { StackItem, StackItemSource } from './stack';
export type { Effect, EffectType, TriggeredAbility } from './abilities';
```

**✅ Checkpoint:** Types compile without errors

---

## Phase 2: Utilities (Day 3-4)

Convert utility files - these have no dependencies, good starter files.

### Files to Convert (in order):

#### 2.1 `src/engine/utils/powerToughness.js` → `.ts`

**Before:**
```javascript
export const calculatePower = (creature) => {
  let power = parseInt(creature.power || 0);
  // ...
}
```

**After:**
```typescript
import { Permanent } from '@/types';

export const calculatePower = (creature: Permanent): number => {
  let power = parseInt(creature.power || '0');

  if (creature.counters?.['+1/+1']) {
    power += creature.counters['+1/+1'];
  }
  if (creature.buffPower) {
    power += creature.buffPower;
  }
  if (creature.prowessBonus) {
    power += creature.prowessBonus;
  }
  if (creature.attachedRoles) {
    creature.attachedRoles.forEach(role => {
      if (role.power) power += role.power;
    });
  }

  return power;
};
```

#### 2.2 `src/engine/utils/cardHydration.js` → `.ts`

Add types for function parameters and return values:

```typescript
import { Card, Token, GameState } from '@/types';

export async function hydrateGameState(rawState: GameState): Promise<GameState> {
  // Implementation with types
}

export function hydrateCard(instanceData: Partial<Card>, cardDef: Card): Card {
  // ...
}
```

#### 2.3 `src/services/cardService.js` → `.ts`

```typescript
import { Card, Token } from '@/types';

class CardService {
  private cardCache: Map<number, Card> = new Map();
  private tokenCache: Map<number, Token> = new Map();

  async getCard(cardId: number): Promise<Card | null> {
    // ...
  }

  async getCards(cardIds: number[]): Promise<Card[]> {
    // ...
  }
}
```

**✅ Checkpoint:** Utilities compile, run tests if you have them

---

## Phase 3: Engine Effects (Day 4-6)

Convert effect handlers one at a time.

### Files to Convert:

#### 3.1 `src/engine/effects/counters.js` → `.ts`

```typescript
import { StackItem, GameState } from '@/types';

interface EffectHelpers {
  addLog: (message: string) => void;
}

export const applyAddCounterToSelf = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;

  const counterType = stackItem.effect.counter_type ||
                      stackItem.effect.counterType ||
                      '+1/+1';
  const counterAmount = stackItem.effect.amount || 1;
  const sourceInstanceId = stackItem.source.instance_id;

  const sourcePermanent = player.battlefield?.find(
    c => c.instance_id === sourceInstanceId
  );

  if (sourcePermanent) {
    sourcePermanent.counters = sourcePermanent.counters || {};
    sourcePermanent.counters[counterType] =
      (sourcePermanent.counters[counterType] || 0) + counterAmount;
    addLog(`${sourcePermanent.name} gets ${counterAmount} ${counterType} counter(s).`);
  }

  return newState;
};
```

#### 3.2 Convert These in Order:
- ✅ `counters.ts`
- `lifegain.ts`
- `damage.ts`
- `draw.ts`
- `buff.ts`
- `mana.ts`
- `battlefield.ts`
- `destruction.ts`

#### 3.3 `src/engine/effects/index.js` → `.ts`

```typescript
import { StackItem, GameState } from '@/types';
import { applyDamage, applyDamageDivided } from './damage';
// ... other imports

interface EffectHelpers {
  addLog: (message: string) => void;
}

type EffectHandler = (
  stackItem: StackItem,
  gameState: GameState,
  helpers: EffectHelpers
) => GameState;

export const effectHandlers: Record<string, EffectHandler> = {
  'damage': applyDamage,
  'damage_divided': applyDamageDivided,
  // ... all handlers
};
```

**✅ Checkpoint:** Effects compile, test in-game

---

## Phase 4: Engine Triggers (Day 6-8)

### Files to Convert:

#### 4.1 `src/engine/triggers/helpers.js` → `.ts`

```typescript
import { StackItem, StackItemSource, Effect, TriggeredAbility } from '@/types';
import { Permanent } from '@/types/cards';

export const createTriggerStackItem = (
  idPrefix: string,
  source: Permanent,
  ability: TriggeredAbility,
  owner: 'you' | 'opponent',
  overrides: Partial<StackItem> = {}
): StackItem => ({
  id: `${idPrefix}-${source.card_id}-${Date.now()}-${Math.random()}`,
  type: 'triggered_ability',
  source: {
    instance_id: source.instance_id,
    card_id: source.card_id,
    name: source.name,
    owner: owner
  },
  effect: ability.effect,
  requires_input: ability.effect?.type === 'damage_divided' || false,
  targeting_data: null,
  resolved: false,
  timestamp: Date.now(),
  ...overrides,
});
```

#### 4.2 Convert Trigger Detectors:
- ✅ `helpers.ts`
- `etb.ts`
- `death.ts`
- `lifegain.ts`
- `combat.ts`
- `spellcast.ts`
- `sacrifice.ts`
- `zones.ts`

#### 4.3 `src/engine/triggers/index.js` → `.ts`

```typescript
import { StackItem, GameState } from '@/types';

type TriggerDetector = (eventData: any, gameState: GameState) => StackItem[];

const triggerDetectors: Record<string, TriggerDetector[]> = {
  'creature_entered': [detectETBTriggers],
  'life_gained': [detectLifeGainTriggers],
  // ... all triggers
};

export const checkTriggersForEvent = (
  eventType: string,
  eventData: any,
  gameState: GameState
): StackItem[] => {
  // ...
};
```

**✅ Checkpoint:** Triggers compile, test trigger-heavy puzzles

---

## Phase 5: Context (Day 8-10)

This is the big one - PuzzleContext is complex.

### 5.1 `src/context/PuzzleContext.jsx` → `.tsx`

**Strategy:** Add types incrementally, use `any` for complex parts initially

```typescript
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode
} from 'react';
import { GameState, StackItem, Card, Permanent, ManaPool } from '@/types';

interface PuzzleContextType {
  // Game state
  gameState: GameState | null;
  setGameState: React.Dispatch<React.SetStateAction<GameState | null>>;

  // Stack
  stack: StackItem[];
  addToStack: (item: StackItem) => void;

  // Actions
  playCardFromHand: (card: Card) => void;
  tapLandForMana: (land: Permanent) => void;
  castSpellOnTarget: (spellCard: Card, target: any) => void;
  resolveTopOfStack: () => void;

  // Game state
  gameLog: string[];
  isHydrating: boolean;

  // ... all other context values
}

const PuzzleContext = createContext<PuzzleContextType | null>(null);

export const PuzzleProvider: React.FC<{
  children: ReactNode;
  initialGameState: GameState;
  puzzleId: number;
}> = ({ children, initialGameState, puzzleId }) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [stack, setStack] = useState<StackItem[]>([]);

  // ... rest of implementation

  const value: PuzzleContextType = {
    gameState,
    setGameState,
    stack,
    addToStack,
    // ... all other values
  };

  return (
    <PuzzleContext.Provider value={value}>
      {children}
    </PuzzleContext.Provider>
  );
};

export const usePuzzle = (): PuzzleContextType => {
  const context = useContext(PuzzleContext);
  if (!context) {
    throw new Error('usePuzzle must be used within PuzzleProvider');
  }
  return context;
};
```

**Tips for PuzzleContext:**
1. Start by typing the context interface
2. Add types to state variables
3. Add types to function parameters
4. Use `any` temporarily for complex logic
5. Refine `any` types later

**✅ Checkpoint:** Context compiles, game loads and plays

---

## Phase 6: Components (Day 10-14)

Convert React components from `.jsx` → `.tsx`

### Strategy: Bottom-up (leaf components first)

#### 6.1 Leaf Components (No children components)

```typescript
// PuzzleCard.tsx
import React from 'react';
import { Card as CardType, Permanent } from '@/types';

interface PuzzleCardProps {
  card: CardType | Permanent;
  zone: 'hand' | 'battlefield' | 'graveyard' | 'exile';
  onClick?: (card: CardType | Permanent) => void;
  isTarget?: boolean;
  canPlay?: boolean;
  // ... other props
}

export const PuzzleCard: React.FC<PuzzleCardProps> = ({
  card,
  zone,
  onClick,
  isTarget = false,
  canPlay = false,
}) => {
  // ... component implementation

  return (
    <div className={/* ... */}>
      {/* ... */}
    </div>
  );
};
```

**Convert in Order:**
1. ✅ `PuzzleCard.tsx`
2. `LifeTotal.tsx`
3. `ManaPool.tsx`
4. `PhaseIndicator.tsx`
5. `TargetingArrow.tsx`

#### 6.2 Zone Components

```typescript
// BattlefieldZone.tsx
import React from 'react';
import { Permanent } from '@/types';
import { PuzzleCard } from './PuzzleCard';

interface BattlefieldZoneProps {
  permanents: Permanent[];
  onCardClick?: (card: Permanent) => void;
  canAttack?: boolean;
  attackingIds?: string[];
}

export const BattlefieldZone: React.FC<BattlefieldZoneProps> = ({
  permanents,
  onCardClick,
  canAttack = false,
  attackingIds = [],
}) => {
  return (
    <div className="battlefield">
      {permanents.map(permanent => (
        <PuzzleCard
          key={permanent.instance_id}
          card={permanent}
          zone="battlefield"
          onClick={onCardClick}
        />
      ))}
    </div>
  );
};
```

**Convert:**
1. ✅ `BattlefieldZone.tsx`
2. `HandZone.tsx`
3. `GraveyardZone.tsx`
4. `LibraryZone.tsx`

#### 6.3 Container Components

```typescript
// PlayerArea.tsx
import React from 'react';
import { Player } from '@/types';
import { BattlefieldZone } from './BattlefieldZone';
import { HandZone } from './HandZone';
// ... other imports

interface PlayerAreaProps {
  player: Player;
  isOpponent: boolean;
  // ... other props
}

export const PlayerArea: React.FC<PlayerAreaProps> = ({
  player,
  isOpponent,
}) => {
  // ...
};
```

**Convert:**
1. `PlayerArea.tsx`
2. `GameBoard.tsx`
3. `PuzzleInfo.tsx`

#### 6.4 Page Components

**Convert:**
1. `pages/PuzzleViewer.tsx`
2. `pages/Puzzles.tsx`
3. `pages/Home.tsx`
4. `App.tsx`

**✅ Checkpoint:** All components compile, full game playable

---

## Phase 7: Final Cleanup (Day 14-15)

### 7.1 Enable Strict Mode

Update `tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,  // Enable strict mode
    "noUnusedLocals": true,
    "noUnusedParameters": true,
  }
}
```

This will show new errors - fix them one file at a time.

### 7.2 Replace `any` Types

Search for `: any` and replace with proper types:
```typescript
// Before
const handleClick = (data: any) => { }

// After
interface ClickData {
  target: string;
  value: number;
}
const handleClick = (data: ClickData) => { }
```

### 7.3 Add Missing Types

Check for implicit `any`:
```typescript
// Before (implicit any)
const items = gameState.players.you.battlefield.map(card => ({
  id: card.instance_id,
  name: card.name
}));

// After (explicit type)
interface CardSummary {
  id: string;
  name: string;
}

const items: CardSummary[] = gameState.players.you.battlefield.map(card => ({
  id: card.instance_id,
  name: card.name
}));
```

### 7.4 Delete Old Files

After conversion, delete `.js` and `.jsx` files:
```bash
# Make sure TypeScript versions work first!
find src -name "*.js" -o -name "*.jsx" | xargs rm
```

**✅ Final Checkpoint:** Everything compiles with strict mode, game fully playable

---

## Common Patterns & Examples

### Pattern 1: React Component Props

```typescript
// Always define props interface
interface MyComponentProps {
  title: string;
  count: number;
  onSave?: () => void;  // Optional
  items: string[];
  player: Player;
}

const MyComponent: React.FC<MyComponentProps> = ({
  title,
  count,
  onSave,
  items,
  player
}) => {
  // TypeScript knows all prop types
};
```

### Pattern 2: State with Types

```typescript
// Define state type explicitly
const [gameState, setGameState] = useState<GameState | null>(null);
const [stack, setStack] = useState<StackItem[]>([]);
const [mana, setMana] = useState<ManaPool>({
  W: 0, U: 0, B: 0, R: 0, G: 0, C: 0
});
```

### Pattern 3: Event Handlers

```typescript
// React event types
const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
  // ...
};

const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
  // ...
};
```

### Pattern 4: useCallback with Types

```typescript
const playCard = useCallback((card: Card): void => {
  // Implementation
}, [dependencies]);
```

### Pattern 5: JSON.parse with Type Assertion

```typescript
// Cast after JSON.parse
const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
```

### Pattern 6: Array Methods

```typescript
// TypeScript infers types from array
const creatures: Permanent[] = gameState.players.you.battlefield;

const powers = creatures.map(c => calculatePower(c));  // number[]
const names = creatures.map(c => c.name);  // string[]
const tapped = creatures.filter(c => c.tapped);  // Permanent[]
```

---

## Complete File Checklist

### Phase 2: Utilities (5 files)
- [ ] `src/engine/utils/powerToughness.ts`
- [ ] `src/engine/utils/cardHydration.ts`
- [ ] `src/engine/data/lands.ts`
- [ ] `src/services/cardService.ts`
- [ ] `src/services/api.ts`

### Phase 3: Effects (9 files)
- [ ] `src/engine/effects/counters.ts`
- [ ] `src/engine/effects/lifegain.ts`
- [ ] `src/engine/effects/damage.ts`
- [ ] `src/engine/effects/draw.ts`
- [ ] `src/engine/effects/buff.ts`
- [ ] `src/engine/effects/mana.ts`
- [ ] `src/engine/effects/battlefield.ts`
- [ ] `src/engine/effects/destruction.ts`
- [ ] `src/engine/effects/index.ts`

### Phase 4: Triggers (9 files)
- [ ] `src/engine/triggers/helpers.ts`
- [ ] `src/engine/triggers/etb.ts`
- [ ] `src/engine/triggers/death.ts`
- [ ] `src/engine/triggers/lifegain.ts`
- [ ] `src/engine/triggers/combat.ts`
- [ ] `src/engine/triggers/spellcast.ts`
- [ ] `src/engine/triggers/sacrifice.ts`
- [ ] `src/engine/triggers/zones.ts`
- [ ] `src/engine/triggers/index.ts`

### Phase 5: Context (1 file - but big!)
- [ ] `src/context/PuzzleContext.tsx`

### Phase 6: Components (~20 files)

**Leaf Components:**
- [ ] `src/components/puzzle/PuzzleCard.tsx`
- [ ] `src/components/puzzle/LifeTotal.tsx`
- [ ] `src/components/puzzle/ManaPool.tsx`
- [ ] `src/components/puzzle/PhaseIndicator.tsx`
- [ ] `src/components/puzzle/TargetingArrow.tsx`
- [ ] `src/components/puzzle/BallistaControls.tsx`

**Zone Components:**
- [ ] `src/components/puzzle/BattlefieldZone.tsx`
- [ ] `src/components/puzzle/HandZone.tsx`
- [ ] `src/components/puzzle/GraveyardZone.tsx`
- [ ] `src/components/puzzle/LibraryZone.tsx`
- [ ] `src/components/puzzle/StackDisplay.tsx`

**Containers:**
- [ ] `src/components/puzzle/PlayerArea.tsx`
- [ ] `src/components/puzzle/GameBoard.tsx`
- [ ] `src/components/puzzle/PuzzleInfo.tsx`
- [ ] `src/components/puzzle/GameLog.tsx`

**Pages:**
- [ ] `src/pages/PuzzleViewer.tsx`
- [ ] `src/pages/Puzzles.tsx`
- [ ] `src/pages/Home.tsx`
- [ ] `src/pages/Login.tsx`
- [ ] `src/pages/Signup.tsx`

**App:**
- [ ] `src/App.tsx`
- [ ] `src/main.tsx`

**Total:** ~50 files to convert

---

## Time Estimates

| Phase | Files | Time (Part-time) | Time (Full-time) |
|-------|-------|------------------|------------------|
| 0. Setup | - | 2 hours | 2 hours |
| 1. Types | 5 | 4 hours | 2 hours |
| 2. Utilities | 5 | 4 hours | 2 hours |
| 3. Effects | 9 | 8 hours | 4 hours |
| 4. Triggers | 9 | 8 hours | 4 hours |
| 5. Context | 1 | 8 hours | 4 hours |
| 6. Components | 20 | 16 hours | 8 hours |
| 7. Cleanup | - | 4 hours | 2 hours |
| **Total** | **~50** | **~54 hours (3-4 weeks)** | **~28 hours (1-2 weeks)** |

---

## Testing Strategy

After each phase:
1. **Compile check**: `npm run dev` should work
2. **Load a puzzle**: Navigate to puzzle viewer
3. **Play test**: Cast spells, attack, trigger abilities
4. **Check console**: No new TypeScript errors

**Key Test Scenarios:**
- Load puzzle with various card types
- Cast creatures from hand
- Tap lands for mana
- Cast spells with targets
- Attack with creatures
- Resolve triggered abilities (ETB, life gain, death)
- Check counter display (Pridemate)
- View stack
- Check game log

---

## Troubleshooting

### "Cannot find module" errors
```bash
# Make sure path aliases work
"paths": {
  "@/*": ["src/*"]
}

# Import like:
import { Card } from '@/types';
```

### "Type X is not assignable to type Y"
```typescript
// Use type assertion when you know better than TS
const card = data as Card;

// Or provide more specific type
const cards: Card[] = [];
```

### "Property doesn't exist on type"
```typescript
// Add to interface or use optional chaining
permanent.counters?.['+1/+1']

// Or add index signature
interface Counters {
  [key: string]: number;
}
```

### "Implicit any" errors
```typescript
// Add explicit types
function doThing(param: SomeType): ReturnType {
  // ...
}
```

---

## Success Criteria

✅ All `.js` and `.jsx` files converted to `.ts` and `.tsx`
✅ Zero TypeScript compilation errors
✅ Strict mode enabled
✅ No `any` types (or minimal, documented)
✅ All puzzles load and play correctly
✅ No regression in functionality
✅ Better IDE autocomplete and error detection

---

## Quick Reference

**Converting a file:**
1. Rename `.js` → `.ts` or `.jsx` → `.tsx`
2. Add imports for types: `import { Card, GameState } from '@/types';`
3. Add types to function parameters
4. Add types to return values
5. Add types to state variables
6. Fix any TypeScript errors
7. Test the feature

**When stuck:**
- Use `any` temporarily, refine later
- Check similar files for patterns
- Look at type definitions in `src/types/`
- TypeScript error messages are usually helpful!

---

Ready to start? Let's begin with Phase 0 setup!
