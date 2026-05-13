import { removeAttachedAuras } from '../replacement';
import { GameState, StackItem, Permanent, PlayerKey } from '@/types';

interface EffectHelpers {
  addLog: (message: string) => void;
}

/**
 * Return target creature to its owner's hand (Unsummon).
 * Uses cardOwner for owner-based routing — a reanimated creature
 * goes back to its original owner's hand, not the controller's.
 */
export const applyReturnToHand = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;

  // Handle overloaded bounce — return each nonland permanent you don't control to its owner's hand
  if ((stackItem as any).wasOverloaded) {
    const opponent = newState.players.opponent;
    const toReturn = [...(opponent.battlefield || [])].filter((c: any) => {
      const tl = (c.type_line || '').toLowerCase();
      return !tl.includes('land');
    });
    const returned: string[] = [];
    for (const perm of toReturn) {
      opponent.battlefield = opponent.battlefield.filter((c: any) => c.instance_id !== perm.instance_id);
      removeAttachedAuras(newState, perm.instance_id);
      const ownerKey = ((perm as any).cardOwner || 'opponent') as PlayerKey;
      const ownerPlayer = newState.players[ownerKey];
      ownerPlayer.hand = ownerPlayer.hand || [];
      ownerPlayer.hand.push(perm);
      returned.push(perm.name);
      newState._leavingPermanents = newState._leavingPermanents || [];
      newState._leavingPermanents.push({ permanent: perm, owner: 'opponent' });
    }
    if (returned.length > 0) {
      addLog(`${stackItem.source.name} (overloaded) returns ${returned.join(', ')} to their owner's hand.`);
    } else {
      addLog(`${stackItem.source.name} (overloaded) — no nonland permanents to return.`);
    }
    return newState;
  }

  const targetData = stackItem.targeting_data?.targetData;

  if (!targetData) {
    addLog(`${stackItem.source.name} fizzles — no target.`);
    return newState;
  }

  const targetCreature = targetData as Permanent;
  const controller = (targetData.owner || 'opponent') as PlayerKey;
  const ownerKey = ((targetCreature as any).cardOwner || controller) as PlayerKey;

  // Remove from controller's battlefield
  const controllerPlayer = newState.players[controller];
  controllerPlayer.battlefield = (controllerPlayer.battlefield || []).filter(
    c => c.instance_id !== targetCreature.instance_id
  );

  // Remove any attached auras (they go to their owner's graveyard)
  removeAttachedAuras(newState, targetCreature.instance_id);

  // Return to owner's hand
  const ownerPlayer = newState.players[ownerKey];
  ownerPlayer.hand = ownerPlayer.hand || [];
  ownerPlayer.hand.push(targetCreature);

  const ownerLabel = ownerKey === controller ? '' : ` (owner: ${ownerKey})`;
  addLog(`${stackItem.source.name} returns ${targetCreature.name} to ${ownerKey === 'you' ? 'your' : "opponent's"} hand${ownerLabel}.`);

  // Track leaving permanent for LTB triggers (but NOT death — bounce doesn't kill)
  newState._leavingPermanents = newState._leavingPermanents || [];
  newState._leavingPermanents.push({ permanent: targetCreature, owner: controller });

  return newState;
};

/**
 * Put target creature into its owner's library second from the top (Oust).
 * Its controller gains life (amount from effect.controller_gains_life).
 */
export const applyPutIntoLibrary = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const targetData = stackItem.targeting_data?.targetData;

  if (!targetData) {
    addLog(`${stackItem.source.name} fizzles — no target.`);
    return newState;
  }

  const targetCreature = targetData as Permanent;
  const controller = (targetData.owner || 'opponent') as PlayerKey;
  const ownerKey = ((targetCreature as any).cardOwner || controller) as PlayerKey;

  // Remove from controller's battlefield
  const controllerPlayer = newState.players[controller];
  controllerPlayer.battlefield = (controllerPlayer.battlefield || []).filter(
    c => c.instance_id !== targetCreature.instance_id
  );

  // Remove any attached auras
  removeAttachedAuras(newState, targetCreature.instance_id);

  // Put into owner's library second from the top
  const ownerPlayer = newState.players[ownerKey];
  ownerPlayer.library = ownerPlayer.library || [];
  if (ownerPlayer.library.length === 0) {
    ownerPlayer.library.push(targetCreature);
  } else {
    ownerPlayer.library.splice(1, 0, targetCreature);
  }
  ownerPlayer.library_count = ownerPlayer.library.length;

  addLog(`${stackItem.source.name} puts ${targetCreature.name} into ${ownerKey === 'you' ? 'your' : "opponent's"} library second from the top.`);

  // Controller gains life
  const lifeGain = stackItem.effect.controller_gains_life || 0;
  if (lifeGain > 0) {
    controllerPlayer.life += lifeGain;
    const controllerLabel = controller === 'you' ? 'You' : 'Opponent';
    addLog(`${controllerLabel} gains ${lifeGain} life. (${controllerLabel}: ${controllerPlayer.life})`);
  }

  // Track leaving permanent for LTB triggers (but NOT death — tuck doesn't kill)
  newState._leavingPermanents = newState._leavingPermanents || [];
  newState._leavingPermanents.push({ permanent: targetCreature, owner: controller });

  return newState;
};

/**
 * Return target creature card from a graveyard to its owner's hand.
 * Used by Kolaghan's Command and similar effects.
 */
export const applyReturnFromGraveyardToHand = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const targetData = stackItem.targeting_data?.targetData;

  if (!targetData) {
    addLog(`${stackItem.source.name} fizzles — no target.`);
    return newState;
  }

  const graveyardOwner = (targetData.owner || 'you') as PlayerKey;
  const matchId = (targetData as any).instance_id || targetData.card_id;
  const player = newState.players[graveyardOwner];
  const card = (player.graveyard || []).find(
    (c: any) => ((c as any).instance_id || c.card_id) === matchId
  );

  if (!card) {
    addLog(`Target no longer in graveyard — fizzled.`);
    return newState;
  }

  player.graveyard = (player.graveyard || []).filter(
    (c: any) => ((c as any).instance_id || c.card_id) !== matchId
  );
  player.hand = player.hand || [];
  player.hand.push(card);
  addLog(`${card.name} returned from graveyard to ${graveyardOwner === 'you' ? 'your' : "opponent's"} hand.`);

  return newState;
};
