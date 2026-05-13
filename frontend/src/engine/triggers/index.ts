/**
 * Unified trigger detection system.
 * Provides both individual detectors and a unified dispatcher.
 */
import { detectETBTriggers, detectTokenETBTriggers } from './etb';
import { detectDeathTriggers, detectPermanentLeavesTriggers } from './death';
import { detectLifeGainTriggers } from './lifegain';
import { detectAttackTriggers } from './combat';
import { detectSpellCastCMCTriggers, detectSpellCountTriggers, detectSecondSpellTriggers, detectNoncreatureSpellCastTriggers, detectExtortTriggers, detectMagecraftTriggers, detectOpusTriggers } from './spellcast';
import { detectSacrificeTriggers, detectPermanentSacrificeTriggers } from './sacrifice';
import { detectLandGraveyardTriggers } from './zones';
import { detectCardDrawnTriggers } from './draw';
import { detectUpkeepTriggers, detectEndStepTriggers, detectDrawStepTriggers } from './phase';
import { GameState, StackItem } from '@/types';

// Re-export individual detectors for backward compatibility
export {
  detectETBTriggers,
  detectTokenETBTriggers,
  detectDeathTriggers,
  detectPermanentLeavesTriggers,
  detectLifeGainTriggers,
  detectAttackTriggers,
  detectSpellCastCMCTriggers,
  detectSpellCountTriggers,
  detectSecondSpellTriggers,
  detectNoncreatureSpellCastTriggers,
  detectExtortTriggers,
  detectMagecraftTriggers,
  detectOpusTriggers,
  detectSacrificeTriggers,
  detectPermanentSacrificeTriggers,
  detectLandGraveyardTriggers,
  detectCardDrawnTriggers,
  detectUpkeepTriggers,
  detectEndStepTriggers,
  detectDrawStepTriggers,
};

// Type for trigger detector functions
type TriggerDetector = (eventData: any, gameState: GameState) => StackItem[];

/**
 * Map of event types to their trigger detector functions.
 * Each event type can have multiple detectors that run in sequence.
 */
const triggerDetectors: Record<string, TriggerDetector[]> = {
  'creature_entered': [detectETBTriggers],
  'token_entered': [detectTokenETBTriggers],
  'creature_died': [detectDeathTriggers],
  'permanent_left': [detectPermanentLeavesTriggers],
  'life_gained': [detectLifeGainTriggers],
  'creature_attacked': [detectAttackTriggers],
  'spell_cast_cmc': [detectSpellCastCMCTriggers],
  'second_spell': [detectSpellCountTriggers],
  'spell_cast_count': [detectSpellCountTriggers],
  'noncreature_spell_cast': [detectNoncreatureSpellCastTriggers],
  'any_spell_cast': [detectExtortTriggers],
  'instant_sorcery_cast_or_copy': [detectMagecraftTriggers],
  'instant_sorcery_cast': [detectOpusTriggers],
  'creature_sacrificed': [detectSacrificeTriggers],
  'permanent_sacrificed': [detectPermanentSacrificeTriggers],
  'land_to_graveyard': [detectLandGraveyardTriggers],
  'card_drawn': [detectCardDrawnTriggers],
  'upkeep':   [detectUpkeepTriggers],
  'end_step': [detectEndStepTriggers],
  'draw_step': [detectDrawStepTriggers],
};

/**
 * Unified trigger dispatcher.
 * Checks for all triggers caused by a specific event.
 *
 * @param eventType - Type of event ('creature_entered', 'creature_died', etc.)
 * @param eventData - Data about the event (creature, amount, owner, etc.)
 * @param gameState - Current game state
 * @returns Array of stack items for triggered abilities
 *
 * @example
 * // Creature entering battlefield
 * const triggers = checkTriggersForEvent('creature_entered', {
 *   creature: creatureCard,
 *   wasEvoked: false
 * }, gameState);
 *
 * @example
 * // Life gain
 * const triggers = checkTriggersForEvent('life_gained', {
 *   amount: 3
 * }, gameState);
 */
export const checkTriggersForEvent = (eventType: string, eventData: any, gameState: GameState): StackItem[] => {
  const detectors = triggerDetectors[eventType];

  if (!detectors || detectors.length === 0) {
    console.warn(`No trigger detectors registered for event type: ${eventType}`);
    return [];
  }

  const triggers: StackItem[] = [];

  // Run all detectors for this event type
  detectors.forEach(detector => {
    try {
      const detected = detector(eventData, gameState);
      if (Array.isArray(detected)) {
        triggers.push(...detected);
      }
    } catch (error) {
      console.error(`Error in trigger detector for ${eventType}:`, error);
    }
  });

  return triggers;
};

/**
 * Helper to generate appropriate log messages for different trigger types.
 *
 * @param eventType - Type of event
 * @param trigger - The trigger stack item
 * @param eventData - Original event data
 * @returns Log message or null for no message
 */
export const getDefaultTriggerLogMessage = (eventType: string, trigger: StackItem, eventData: any): string | null => {
  const sourceName = trigger.source?.name || 'Unknown';

  switch (eventType) {
    case 'creature_entered':
    case 'token_entered':
      return null; // ETB triggers typically don't need extra logging

    case 'creature_died':
      if (trigger.effect?.type === 'create_token') {
        return `${sourceName}'s leaves-battlefield ability triggered!`;
      }
      return `${sourceName}'s ability triggered from ${eventData.creature?.name || 'creature'} dying!`;

    case 'permanent_left':
      return `${sourceName} triggers from ${eventData.permanent?.name || 'permanent'} leaving the battlefield!`;

    case 'life_gained':
      return null; // Life gain triggers don't typically need logging

    case 'creature_attacked':
      return `${sourceName} triggers from attacking!`;

    case 'spell_cast_cmc':
      return `${sourceName} triggers from ${eventData.spellCard?.name || 'spell'} being cast!`;

    case 'second_spell':
    case 'spell_cast_count':
      return `${sourceName} triggers from spell cast this turn!`;

    case 'any_spell_cast':
      return `${sourceName}'s extort triggers!`;

    case 'instant_sorcery_cast_or_copy':
      return `${sourceName}'s magecraft triggers!`;

    case 'instant_sorcery_cast':
      return `${sourceName}'s opus triggers!`;

    case 'creature_sacrificed':
      return `${sourceName} triggers from sacrificing ${eventData.creature?.name || 'creature'}!`;

    case 'land_to_graveyard':
      return `${sourceName} triggers from ${eventData.land?.name || 'land'} going to graveyard!`;

    case 'card_drawn':
      return `${sourceName}'s ability triggered from card draw!`;

    case 'upkeep':
      return `${sourceName} triggers at the beginning of upkeep!`;

    case 'end_step':
      return `${sourceName} triggers at the beginning of the end step!`;

    case 'draw_step':
      return `${sourceName} triggers at the beginning of the draw step!`;

    default:
      return `${sourceName} triggers!`;
  }
};
