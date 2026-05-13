import { createTriggerStackItem, matchesTriggerEvent, getTriggerSource, getTriggerCondition } from './helpers';
import { GameState, StackItem, PlayerKey } from '@/types';

interface PhaseEventData {
  player: PlayerKey; // the active player whose phase it is
}

/**
 * Detect upkeep triggers — fires when a player's upkeep begins.
 * Matches ability event: 'upkeep' or 'beginning_of_upkeep'.
 * Supports source: 'self' (controller's upkeep only) or no source (any upkeep).
 */
export const detectUpkeepTriggers = (
  eventData: PhaseEventData,
  gameState: GameState
): StackItem[] => {
  const { player } = eventData;
  const triggers: StackItem[] = [];

  (['you', 'opponent'] as PlayerKey[]).forEach(controllerKey => {
    const controller = gameState.players[controllerKey];
    controller.battlefield?.forEach(permanent => {
      if (!permanent.triggered_abilities) return;

      permanent.triggered_abilities.forEach(ability => {
        const matchesUpkeep =
          matchesTriggerEvent(ability, 'upkeep') ||
          matchesTriggerEvent(ability, 'beginning_of_upkeep');
        if (!matchesUpkeep) return;

        // source: 'self' means "your upkeep" (controller's upkeep)
        const source = getTriggerSource(ability);
        if (source === 'self' && player !== controllerKey) return;
        // source: 'opponent' means opponent's upkeep
        if (source === 'opponent' && player === controllerKey) return;

        triggers.push(createTriggerStackItem('upkeep', permanent, ability, controllerKey));
      });
    });
  });

  return triggers;
};

/**
 * Detect end step triggers — fires when a player's end step begins.
 * Matches ability event: 'end_step' or 'beginning_of_end_step'.
 */
export const detectEndStepTriggers = (
  eventData: PhaseEventData,
  gameState: GameState
): StackItem[] => {
  const { player } = eventData;
  const triggers: StackItem[] = [];

  (['you', 'opponent'] as PlayerKey[]).forEach(controllerKey => {
    const controller = gameState.players[controllerKey];
    controller.battlefield?.forEach(permanent => {
      if (!permanent.triggered_abilities) return;

      permanent.triggered_abilities.forEach(ability => {
        const matchesEndStep =
          matchesTriggerEvent(ability, 'end_step') ||
          matchesTriggerEvent(ability, 'beginning_of_end_step');
        if (!matchesEndStep) return;

        const source = getTriggerSource(ability);
        if (source === 'self' && player !== controllerKey) return;
        if (source === 'opponent' && player === controllerKey) return;

        triggers.push(createTriggerStackItem('end-step', permanent, ability, controllerKey));
      });
    });
  });

  return triggers;
};

/**
 * Detect draw step triggers — fires when a player's draw step begins.
 * Matches ability event: 'draw_step' or 'beginning_of_draw'.
 * Supports condition: 'source_is_tapped' — only fires if the source permanent is tapped.
 */
export const detectDrawStepTriggers = (
  eventData: PhaseEventData,
  gameState: GameState
): StackItem[] => {
  const { player } = eventData;
  const triggers: StackItem[] = [];

  (['you', 'opponent'] as PlayerKey[]).forEach(controllerKey => {
    const controller = gameState.players[controllerKey];
    controller.battlefield?.forEach(permanent => {
      if (!permanent.triggered_abilities) return;

      permanent.triggered_abilities.forEach(ability => {
        const matchesDrawStep =
          matchesTriggerEvent(ability, 'draw_step') ||
          matchesTriggerEvent(ability, 'beginning_of_draw');
        if (!matchesDrawStep) return;

        const source = getTriggerSource(ability);
        if (source === 'self' && player !== controllerKey) return;
        if (source === 'opponent' && player === controllerKey) return;

        // Check condition: source_is_tapped — only fire if the permanent is tapped
        const condition = getTriggerCondition(ability);
        if (condition?.type === 'source_is_tapped' && !permanent.tapped) return;

        triggers.push(createTriggerStackItem('draw-step', permanent, ability, controllerKey));
      });
    });
  });

  return triggers;
};
