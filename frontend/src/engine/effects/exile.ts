import { removeAttachedAuras } from '../replacement';
import { GameState, StackItem, Permanent, PlayerKey } from '@/types';

interface EffectHelpers {
  addLog: (message: string) => void;
}

/**
 * Exile all cards in both graveyards (Rest in Peace ETB effect).
 */
export const applyExileAllGraveyards = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const player = newState.players.you;
  const opponent = newState.players.opponent;

  const youCount = (player.graveyard || []).length;
  const oppCount = (opponent.graveyard || []).length;

  player.exile = [...(player.exile || []), ...(player.graveyard || [])];
  player.graveyard = [];

  opponent.exile = [...(opponent.exile || []), ...(opponent.graveyard || [])];
  opponent.graveyard = [];

  const total = youCount + oppCount;
  if (total > 0) {
    addLog(`${stackItem.source.name} — exiled ${total} card(s) from all graveyards.`);
  } else {
    addLog(`${stackItem.source.name} — all graveyards were already empty.`);
  }

  return newState;
};

/**
 * Flicker — exile target permanent, immediately return to battlefield under owner's control.
 * Tokens cease to exist in exile and are not returned.
 */
export const applyFlicker = (
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

  const target = targetData as Permanent;
  const controller = (targetData.owner || 'you') as PlayerKey;
  const ownerKey = ((target as any).cardOwner || controller) as PlayerKey;

  // Find and remove from controller's battlefield
  const controllerPlayer = newState.players[controller];
  const onBf = (controllerPlayer.battlefield || []).find(c => c.instance_id === target.instance_id);
  if (!onBf) {
    addLog(`${stackItem.source.name} fizzles — target no longer on battlefield.`);
    return newState;
  }

  controllerPlayer.battlefield = controllerPlayer.battlefield.filter(c => c.instance_id !== target.instance_id);
  removeAttachedAuras(newState, target.instance_id);

  // Track leaving for LTB triggers (exile is NOT death)
  const leavingArr = newState._leavingPermanents = newState._leavingPermanents || [];
  leavingArr.push({ permanent: onBf, owner: controller });

  // Tokens cease to exist in exile
  if ((onBf as any).isToken) {
    addLog(`${onBf.name} is exiled and ceases to exist.`);
    return newState;
  }

  // Return to battlefield under owner's control with fresh state
  // Strip transient flags (_dashed, etc.) — this is a new permanent instance
  const isCreature = (onBf.type_line || '').toLowerCase().includes('creature');
  const { _dashed, ...cleanBf } = onBf as any;
  const returned: Permanent = {
    ...cleanBf,
    tapped: false,
    summoning_sick: isCreature,
    counters: {} as Record<string, number>,
    attacking: false,
    cardOwner: ownerKey,
  };
  const ownerPlayer = newState.players[ownerKey];
  ownerPlayer.battlefield.push(returned);

  addLog(`${onBf.name} is exiled and immediately returns to the battlefield.`);

  // Track for ETB triggers
  const flickeredArr = newState._flickeredPermanents = newState._flickeredPermanents || [];
  flickeredArr.push({ permanent: returned, owner: ownerKey });

  return newState;
};

/**
 * Exile target permanent until end of turn — returns at beginning of next end step.
 * Tokens cease to exist in exile and are not returned.
 */
export const applyExileUntilEndStep = (
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

  const target = targetData as Permanent;
  const controller = (targetData.owner || 'you') as PlayerKey;
  const ownerKey = ((target as any).cardOwner || controller) as PlayerKey;

  // Find and remove from controller's battlefield
  const controllerPlayer = newState.players[controller];
  const onBf = (controllerPlayer.battlefield || []).find(c => c.instance_id === target.instance_id);
  if (!onBf) {
    addLog(`${stackItem.source.name} fizzles — target no longer on battlefield.`);
    return newState;
  }

  controllerPlayer.battlefield = controllerPlayer.battlefield.filter(c => c.instance_id !== target.instance_id);
  removeAttachedAuras(newState, target.instance_id);

  // Track leaving for LTB triggers
  const leavingArr = newState._leavingPermanents = newState._leavingPermanents || [];
  leavingArr.push({ permanent: onBf, owner: controller });

  // Tokens cease to exist in exile
  if ((onBf as any).isToken) {
    addLog(`${onBf.name} is exiled and ceases to exist.`);
    return newState;
  }

  // Add to exile zone
  const ownerPlayer = newState.players[ownerKey];
  ownerPlayer.exile = ownerPlayer.exile || [];
  ownerPlayer.exile.push(onBf);

  // Schedule return at end step
  newState.pendingEndStepReturns = newState.pendingEndStepReturns || [];
  newState.pendingEndStepReturns.push({ permanent: onBf, owner: ownerKey });

  addLog(`${onBf.name} is exiled. It will return at the beginning of the next end step.`);

  return newState;
};

/**
 * Exile target permanent until the source permanent leaves the battlefield.
 * (Banishing Light, Oblivion Ring, etc.)
 * Tokens cease to exist in exile and are not returned.
 */
export const applyExileUntilLeaves = (
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

  const target = targetData as Permanent;
  const controller = (targetData.owner || 'opponent') as PlayerKey;
  const ownerKey = ((target as any).cardOwner || controller) as PlayerKey;
  const sourceId = stackItem.source.instance_id;

  // Find and remove from controller's battlefield
  const controllerPlayer = newState.players[controller];
  const onBf = (controllerPlayer.battlefield || []).find(c => c.instance_id === target.instance_id);
  if (!onBf) {
    addLog(`${stackItem.source.name} fizzles — target no longer on battlefield.`);
    return newState;
  }

  controllerPlayer.battlefield = controllerPlayer.battlefield.filter(c => c.instance_id !== target.instance_id);
  removeAttachedAuras(newState, target.instance_id);

  // Track leaving for LTB triggers
  const leavingArr = newState._leavingPermanents = newState._leavingPermanents || [];
  leavingArr.push({ permanent: onBf, owner: controller });

  // Tokens cease to exist in exile
  if ((onBf as any).isToken) {
    addLog(`${onBf.name} is exiled and ceases to exist.`);
    return newState;
  }

  // Tag the exiled card with metadata
  (onBf as any).exileReason = 'until_leaves';
  (onBf as any).exiledByInstanceId = sourceId;

  // Add to owner's exile zone
  const ownerPlayer = newState.players[ownerKey];
  ownerPlayer.exile = ownerPlayer.exile || [];
  ownerPlayer.exile.push(onBf);

  // Register in exiledUnder map (keyed by the source permanent's instance_id)
  if (sourceId) {
    newState.exiledUnder = newState.exiledUnder || {};
    newState.exiledUnder[sourceId] = newState.exiledUnder[sourceId] || [];
    newState.exiledUnder[sourceId].push({ card: onBf, owner: ownerKey, exilerInstanceId: sourceId });
  }

  addLog(`${stackItem.source.name} exiles ${onBf.name} until it leaves the battlefield.`);

  return newState;
};

/**
 * Exile target nonland permanent "under" a source permanent (Oblivion Ring ETB).
 * Unlike exile_until_leaves (Banishing Light), this is just one half of a two-ability card.
 * The return is handled by a separate LTB triggered ability, NOT automatically.
 * This means if the source leaves before this resolves, the exile is permanent.
 */
export const applyExileUnder = (
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

  const target = targetData as Permanent;
  const controller = (targetData.owner || 'opponent') as PlayerKey;
  const ownerKey = ((target as any).cardOwner || controller) as PlayerKey;
  const sourceId = stackItem.source.instance_id;

  // Find and remove from controller's battlefield
  const controllerPlayer = newState.players[controller];
  const onBf = (controllerPlayer.battlefield || []).find(c => c.instance_id === target.instance_id);
  if (!onBf) {
    addLog(`${stackItem.source.name} fizzles — target no longer on battlefield.`);
    return newState;
  }

  controllerPlayer.battlefield = controllerPlayer.battlefield.filter(c => c.instance_id !== target.instance_id);
  removeAttachedAuras(newState, target.instance_id);

  // Track leaving for LTB triggers
  const leavingArr = newState._leavingPermanents = newState._leavingPermanents || [];
  leavingArr.push({ permanent: onBf, owner: controller });

  // Tokens cease to exist in exile
  if ((onBf as any).isToken) {
    addLog(`${onBf.name} is exiled and ceases to exist.`);
    return newState;
  }

  // Tag the exiled card
  (onBf as any).exileReason = 'under_permanent';
  (onBf as any).exiledByInstanceId = sourceId;

  // Add to owner's exile zone
  const ownerPlayer = newState.players[ownerKey];
  ownerPlayer.exile = ownerPlayer.exile || [];
  ownerPlayer.exile.push(onBf);

  // Register in exiledUnder map
  if (sourceId) {
    newState.exiledUnder = newState.exiledUnder || {};
    newState.exiledUnder[sourceId] = newState.exiledUnder[sourceId] || [];
    newState.exiledUnder[sourceId].push({ card: onBf, owner: ownerKey, exilerInstanceId: sourceId });
  }

  addLog(`${stackItem.source.name} exiles ${onBf.name}.`);

  return newState;
};

/**
 * Return card(s) exiled under the source permanent (Oblivion Ring LTB).
 * This is a triggered ability that goes on the stack when the source leaves.
 */
export const applyReturnExiledUnder = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const sourceId = stackItem.source.instance_id;

  if (!sourceId) {
    addLog(`${stackItem.source.name} leaves — no source id.`);
    return newState;
  }

  const exiledUnderMap = newState.exiledUnder || {};
  const exiledCards = exiledUnderMap[sourceId];

  if (!exiledCards || exiledCards.length === 0) {
    addLog(`${stackItem.source.name} leaves — nothing was exiled under it.`);
    return newState;
  }

  exiledCards.forEach(({ card, owner }: { card: any; owner: PlayerKey }) => {
    // Remove from exile
    const ownerPlayer = newState.players[owner];
    ownerPlayer.exile = (ownerPlayer.exile || []).filter(
      (c: any) => c.instance_id !== card.instance_id
    );
    // Return to battlefield under owner's control with fresh state
    const isCreature = (card.type_line || '').toLowerCase().includes('creature');
    const { exileReason, exiledByInstanceId, _dashed, ...cleanCard } = card as any;
    const returned: Permanent = {
      ...cleanCard,
      tapped: false,
      summoning_sick: isCreature,
      counters: {} as Record<string, number>,
      attacking: false,
    };
    ownerPlayer.battlefield.push(returned);
    addLog(`${card.name} returns to the battlefield under its owner's control.`);

    // Track for ETB triggers
    const flickeredArr = newState._flickeredPermanents = newState._flickeredPermanents || [];
    flickeredArr.push({ permanent: returned, owner });
  });

  delete exiledUnderMap[sourceId];

  return newState;
};

/**
 * Impulse draw — exile top N cards of your library.
 * You may play them until the specified duration expires.
 * (Reckless Impulse, Light Up the Stage, etc.)
 */
export const applyImpulseDraw = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const amount = stackItem.effect.amount || 2;
  const duration = (stackItem.effect as any).duration || 'until_end_of_next_turn';
  const casterKey = ((stackItem.source as any).owner || 'you') as PlayerKey;
  const player = newState.players[casterKey];

  const currentTurn = newState.turnNumber || 1;
  const expiresAt = duration === 'until_end_of_next_turn' ? currentTurn + 1 : currentTurn;

  const cardsToExile = player.library.splice(0, amount);
  player.library_count = player.library.length;

  if (cardsToExile.length === 0) {
    addLog(`${stackItem.source.name} — no cards in library to exile.`);
    return newState;
  }

  newState.impulsedCards = newState.impulsedCards || [];

  cardsToExile.forEach(card => {
    (card as any).exileReason = 'impulse_draw';
    player.exile = player.exile || [];
    player.exile.push(card);
    newState.impulsedCards!.push({ card, owner: casterKey, expiresAtTurnEnd: expiresAt });
  });

  const names = cardsToExile.map(c => c.name).join(', ');
  const turnStr = duration === 'until_end_of_next_turn' ? 'until the end of your next turn' : 'until end of turn';
  addLog(`${stackItem.source.name} — exiled ${cardsToExile.length} card(s): ${names}. You may play them ${turnStr}.`);

  return newState;
};

/**
 * Helper: compute a creature's effective power on the battlefield,
 * accounting for counters, prowess, and buff effects.
 */
function getEffectivePower(permanent: Permanent, gameState: GameState): number {
  let power = parseInt(String(permanent.power || '0'), 10);
  const p = permanent as any;
  if (p.counters?.['+1/+1']) power += p.counters['+1/+1'];
  if (p.counters?.['-1/-1']) power -= p.counters['-1/-1'];
  if (p.prowessBonus) power += p.prowessBonus;
  if (p.buffPower) power += p.buffPower;
  // Aura/equipment buffs
  const allBF = [
    ...(gameState.players.you.battlefield || []),
    ...(gameState.players.opponent.battlefield || []),
  ];
  allBF.forEach((bf: any) => {
    if (bf.isAura && bf.attachedTo?.instance_id === permanent.instance_id) {
      (bf.static_abilities || []).forEach((sa: any) => {
        if (sa.effect?.type === 'buff_enchanted') power += sa.effect.power || 0;
      });
    }
    if (bf.equippedTo?.instance_id === permanent.instance_id) {
      (bf.static_abilities || []).forEach((sa: any) => {
        if (sa.effect?.type === 'buff_equipped') power += sa.effect.power || 0;
      });
    }
  });
  return Math.max(0, power);
}

/**
 * Exile target creature. Its controller gains life equal to its power.
 * (Swords to Plowshares, Path to Exile variant)
 */
export const applyExileTargetCreature = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const targetData = stackItem.targeting_data?.targetData;
  const targetOwner = (targetData?.owner || stackItem.targeting_data?.targetOwner || 'opponent') as PlayerKey;

  if (!targetData) {
    addLog(`${stackItem.source.name} fizzles — no target.`);
    return newState;
  }

  const targetPlayer = newState.players[targetOwner];
  const targetId = targetData.instance_id || targetData.card_id;
  const permanent = targetPlayer.battlefield.find(
    (c: any) => (c.instance_id || c.card_id) === targetId
  );

  if (!permanent) {
    addLog(`${stackItem.source.name} fizzles — target no longer on battlefield.`);
    return newState;
  }

  // Calculate power before removal (use original gameState for accurate buffs)
  const creaturePower = getEffectivePower(permanent, gameState);

  // Remove from battlefield
  targetPlayer.battlefield = targetPlayer.battlefield.filter(
    (c: any) => (c.instance_id || c.card_id) !== targetId
  );
  removeAttachedAuras(newState, targetId);

  // Move to exile (true exile — no exileReason tag, stays permanently)
  const ownerKey = ((permanent as any).cardOwner || targetOwner) as PlayerKey;
  const ownerPlayer = newState.players[ownerKey];
  ownerPlayer.exile = ownerPlayer.exile || [];
  ownerPlayer.exile.push(permanent);

  // Track leaving for LTB triggers (exile is NOT death — no _dyingCreatures)
  newState._leavingPermanents = newState._leavingPermanents || [];
  newState._leavingPermanents.push({ permanent, owner: targetOwner });

  addLog(`${stackItem.source.name} exiles ${permanent.name}.`);

  // Controller gains life equal to creature's power
  if ((stackItem.effect as any).controllerGainsLife && creaturePower > 0) {
    targetPlayer.life += creaturePower;
    addLog(`${permanent.name}'s controller gains ${creaturePower} life.`);
  }

  return newState;
};

/**
 * Exile this card from its owner's graveyard. Used by Bridge from Below when
 * an opponent's creature dies — Bridge moves itself from graveyard to exile.
 */
export const applyExileSelfFromGraveyard = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const sourceId = (stackItem.source as any)?.instance_id;
  if (!sourceId) return newState;

  for (const playerKey of ['you', 'opponent'] as PlayerKey[]) {
    const player = newState.players[playerKey];
    const gy = player.graveyard || [];
    const idx = gy.findIndex((c: any) => c.instance_id === sourceId);
    if (idx >= 0) {
      const [card] = gy.splice(idx, 1);
      player.exile = player.exile || [];
      player.exile.push(card);
      addLog(`${(stackItem.source as any).name} is exiled from the graveyard.`);
      return newState;
    }
  }
  return newState;
};
