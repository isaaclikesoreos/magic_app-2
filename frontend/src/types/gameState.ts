/**
 * Game State Types
 * Represents the complete game state
 */

import { Card, Permanent } from './cards';

// Turn Phase
export type TurnPhase =
  | 'upkeep'
  | 'draw'
  | 'main1'
  | 'combat_begin'
  | 'combat_attackers'
  | 'combat_blockers'
  | 'combat_damage'
  | 'combat_end'
  | 'main2'
  | 'end';

// Mana Pool
export interface ManaPool {
  W: number;
  U: number;
  B: number;
  R: number;
  G: number;
  C: number;
  [key: string]: number; // Allow string indexing for dynamic mana color access
}

// Player State
export interface Player {
  life: number;
  mana_pool: ManaPool;
  library_count: number;
  library: Card[];
  hand: Card[];
  battlefield: Permanent[];
  graveyard: Card[];
  exile: Card[];

  // For opponent (hidden hand)
  hand_count?: number;

  // Game over conditions
  deckedOut?: boolean;

  // Hexproof granted by static abilities (e.g. Leyline of Sanctity).
  // Prevents the player from being the target of opponent's spells/abilities.
  // Their own spells/abilities can still target them.
  hexproof?: boolean;
}

// Complete Game State
export interface GameState {
  players: {
    you: Player;
    opponent: Player;
  };
  turn_phase: TurnPhase;
  active_player: 'you' | 'opponent';

  // Internal flags (used by game engine during effect resolution)
  _lifeGained?: number;
  _dyingCreatures?: Array<{ creature: Permanent; owner: PlayerKey }>;
  _leavingPermanents?: Array<{ permanent: Permanent; owner: PlayerKey }>;
  // Permanents sacrificed during effect resolution (e.g., opponent_sacrifice).
  // Drives permanent_sacrificed / creature_sacrificed trigger dispatch in
  // resolveStack. Cleared after dispatch.
  _sacrificedPermanents?: Array<{ permanent: Permanent; owner: PlayerKey }>;
  _leavingRoles?: Array<{ role: any; owner: PlayerKey; attachedTo: string }>;
  _destroyedLand?: { land: Permanent; owner: PlayerKey };
  _sacrificedLands?: Array<{ land: Permanent; owner: PlayerKey }>;
  _deadCreatures?: Array<{ creature: Permanent; owner: PlayerKey }>;
  _pendingManaColorSelection?: { stackItemId: string; sourceCard: any };
  _channelActivated?: boolean;
  _fizzled?: boolean;
  _youCardsDrawn?: number;
  _opponentCardsDrawn?: number;
  // Running totals across the turn (used to enforce limit_opponent_draws statics
  // like Narset, Parter of Veils). Reset at the start of each new turn.
  _youCardsDrawnThisTurn?: number;
  _opponentCardsDrawnThisTurn?: number;

  // Revolt: true once any permanent you controlled has left the battlefield
  // this turn. Reset at the start of each new turn. Read by Fatal Push and
  // future revolt cards during target validation.
  _yourPermanentLeftThisTurn?: boolean;

  // Delayed returns (Flickerwisp, etc.)
  pendingEndStepReturns?: Array<{ permanent: Permanent; owner: PlayerKey }>;
  _flickeredPermanents?: Array<{ permanent: Permanent; owner: PlayerKey }>;

  // Cards exiled under permanents (Banishing Light, Oblivion Ring, etc.)
  // Key: instance_id of the exiling permanent. Value: array of exiled cards + owner info.
  exiledUnder?: Record<string, Array<{ card: Card; owner: PlayerKey; exilerInstanceId: string }>>;

  // Cards exiled face-up that can be played (impulse draw — Reckless Impulse, etc.)
  // Plotted cards (Outlaws of Thunder Junction) share this array but with the
  // `plotted` flag — they never expire and gate cast on `castableFromTurn`.
  impulsedCards?: Array<{
    card: Card;
    owner: PlayerKey;
    expiresAtTurnEnd: number;
    plotted?: boolean;
    castableFromTurn?: number;
  }>;

  // Turn counter (used for impulse draw expiration)
  turnNumber?: number;

  // Cards exiled with suspend (time counters removed each upkeep)
  suspendedCards?: Array<{ card: Card; owner: PlayerKey; timeCounters: number }>;

  // Puzzle metadata (optional)
  puzzle_id?: number;
  initial_state?: GameState;
}

// Helper type for player keys
export type PlayerKey = 'you' | 'opponent';

// Helper type for zone keys
export type Zone = 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'library';
