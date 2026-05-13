/**
 * Replacement effect system.
 * Checks active static abilities on permanents that replace where cards go.
 */
import { GameState, Player, PlayerKey } from '@/types';

/**
 * Returns true if any permanent on either battlefield has a
 * "replace_graveyard_with_exile" static ability active (e.g. Rest in Peace).
 */
export const hasReplaceGraveyardWithExile = (state: GameState): boolean => {
  const allPermanents = [
    ...(state.players.you.battlefield || []),
    ...(state.players.opponent.battlefield || []),
  ];
  return allPermanents.some(p => {
    const statics: any[] = (p as any).static_abilities || [];
    return statics.some((a: any) => a.effect?.type === 'replace_graveyard_with_exile');
  });
};

/**
 * Push a card to the correct zone — graveyard normally, exile if a
 * replacement effect is active.  Mutates `player` in-place (call after
 * JSON.parse(JSON.stringify(...)) deep-clone).
 *
 * Owner-based routing: if `card.cardOwner` is set, the card goes to that
 * player's graveyard/exile instead of the `player` parameter's.  This
 * implements the MTG rule that cards always go to their *owner's* zones,
 * not their controller's.
 */
export const pushToGraveyardOrExile = (state: GameState, player: Player, card: any): void => {
  const ownerKey = card.cardOwner as PlayerKey | undefined;
  const targetPlayer = (ownerKey && state.players[ownerKey]) ? state.players[ownerKey] : player;

  if (hasReplaceGraveyardWithExile(state) || (targetPlayer as any).graveyardGoesToExile) {
    targetPlayer.exile = targetPlayer.exile || [];
    targetPlayer.exile.push(card);
  } else {
    targetPlayer.graveyard = targetPlayer.graveyard || [];
    targetPlayer.graveyard.push(card);
  }
};

/**
 * Parse the madness cost from a card's oracle text.
 * Returns the cost string (e.g. "{1}{R}") or null if the card has no madness.
 */
export const getMadnessCost = (card: any): string | null => {
  const text = card?.oracle_text || '';
  const match = text.match(/Madness\s+((?:\{[^}]+\})+)/i);
  return match ? match[1] : null;
};

/**
 * Parse the miracle cost from a card's oracle text.
 * Returns the cost string (e.g. "{R}") or null if the card has no miracle.
 */
export const getMiracleCost = (card: any): string | null => {
  const text = card?.oracle_text || '';
  const match = text.match(/Miracle\s+((?:\{[^}]+\})+)/i);
  return match ? match[1] : null;
};

/**
 * Parse the ninjutsu cost from a card's oracle text.
 * Returns the cost string (e.g. "{3}{B}") or null if the card has no ninjutsu.
 */
export const getNinjutsuCost = (card: any): string | null => {
  const text = card?.oracle_text || '';
  const match = text.match(/Ninjutsu\s+((?:\{[^}]+\})+)/i);
  return match ? match[1] : null;
};

/**
 * Perform a discard: remove card from player.hand and route it to the correct zone.
 * If the card has madness, it goes to exile with a _madnessPending flag and
 * the caller is expected to enqueue a madness cast prompt. Otherwise the card
 * goes to graveyard (or exile if Rest in Peace etc. is active).
 * Mutates state in-place (call after deep-clone). Returns the madness cost
 * if one was triggered, else null.
 */
export const performDiscard = (state: GameState, player: Player, card: any): string | null => {
  player.hand = (player.hand || []).filter((c: any) => c.instance_id !== card.instance_id);
  const madnessCost = getMadnessCost(card);
  if (madnessCost) {
    player.exile = player.exile || [];
    player.exile.push({ ...card, _madnessPending: true, _madnessCost: madnessCost });
    return madnessCost;
  }
  pushToGraveyardOrExile(state, player, card);
  return null;
};

/**
 * When a permanent leaves the battlefield, any Auras attached to it
 * also go to the graveyard (state-based action).
 * Equipment attached to it becomes unattached (stays on battlefield).
 * Scans both players' battlefields for auras/equipment with matching attachedTo.
 * Mutates state in-place (call after deep-clone).
 */
export const removeAttachedAuras = (state: GameState, creatureInstanceId: string): void => {
  (['you', 'opponent'] as const).forEach(pk => {
    const player = state.players[pk];
    // Auras go to graveyard
    const attachedAuras = (player.battlefield || []).filter(
      (c: any) => c.isAura && c.attachedTo?.instance_id === creatureInstanceId
    );
    if (attachedAuras.length > 0) {
      player.battlefield = player.battlefield.filter(
        (c: any) => !(c.isAura && c.attachedTo?.instance_id === creatureInstanceId)
      );
      attachedAuras.forEach(aura => {
        pushToGraveyardOrExile(state, player, aura);
        // Track for LTB triggers (e.g. Animate Dead)
        (state as any)._leavingPermanents = (state as any)._leavingPermanents || [];
        (state as any)._leavingPermanents.push({ permanent: aura, owner: pk });
      });
    }
    // Equipment becomes unattached (stays on battlefield)
    (player.battlefield || []).forEach((c: any) => {
      if (c.equippedTo?.instance_id === creatureInstanceId) {
        delete c.equippedTo;
      }
    });
  });
};
