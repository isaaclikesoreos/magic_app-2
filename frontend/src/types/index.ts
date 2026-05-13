/**
 * Central Type Exports
 * Import types from this file throughout the application
 *
 * Usage:
 *   import { Card, GameState, StackItem } from '@/types';
 */

// Export everything from all type files
export * from './abilities';
export * from './cards';
export * from './gameState';
export * from './stack';

// Re-export commonly used types for convenience
export type {
  // Cards
  Card,
  Permanent,
  Token,
  Role,
} from './cards';

export type {
  // Abilities
  Effect,
  EffectType,
  TriggerEvent,
  TriggeredAbility,
  ActivatedAbility,
  StaticAbility,
  Trigger,
  Condition,
  Cost,
  ManaCost,
} from './abilities';

export type {
  // Game State
  GameState,
  Player,
  PlayerKey,
  ManaPool,
  TurnPhase,
  Zone,
} from './gameState';

export type {
  // Stack
  StackItem,
  StackItemType,
  StackItemSource,
  TargetingData,
} from './stack';
