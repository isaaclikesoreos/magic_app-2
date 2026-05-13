/**
 * Generic count selectors — compute a number from game state at resolution time.
 *
 * Used by effects that scale with game state (e.g. Rite of Flame's "+R for each
 * card named Rite of Flame in each graveyard"). Add new selector types here as
 * cards demand; consumers only need to call resolveCount.
 */

import { GameState, PlayerKey, Zone } from '@/types';

export type CountControllers = 'all' | 'you' | 'opponents';

export type CountSelector =
  | {
      type: 'cards_with_name';
      name: string;
      zones: Zone[];
      controllers: CountControllers;
    };
// Future: 'permanents_with_type', 'cards_in_zone', 'spells_cast_this_turn', ...

const ownersToScan = (controllers: CountControllers, sourceOwner: PlayerKey): PlayerKey[] => {
  switch (controllers) {
    case 'all': return ['you', 'opponent'];
    case 'you': return [sourceOwner];
    case 'opponents': return [sourceOwner === 'you' ? 'opponent' : 'you'];
  }
};

const zoneCards = (state: GameState, owner: PlayerKey, zone: Zone) => {
  const player = state.players[owner];
  switch (zone) {
    case 'hand': return player.hand || [];
    case 'graveyard': return player.graveyard || [];
    case 'exile': return player.exile || [];
    case 'library': return player.library || [];
    case 'battlefield': return player.battlefield || [];
  }
};

export const resolveCount = (
  selector: CountSelector,
  gameState: GameState,
  sourceOwner: PlayerKey = 'you'
): number => {
  switch (selector.type) {
    case 'cards_with_name': {
      const target = selector.name.toLowerCase();
      let n = 0;
      for (const owner of ownersToScan(selector.controllers, sourceOwner)) {
        for (const zone of selector.zones) {
          for (const card of zoneCards(gameState, owner, zone)) {
            if ((card.name || '').toLowerCase() === target) n++;
          }
        }
      }
      return n;
    }
  }
};
