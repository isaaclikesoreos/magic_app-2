import { pushToGraveyardOrExile, removeAttachedAuras } from '../replacement';
import { calculateCMC } from '../utils/manaCost';
import { GameState, StackItem, Card, Permanent, PlayerKey } from '@/types';


interface EffectHelpers {
  addLog: (message: string) => void;
}

interface TokenDef {
  name: string;
  type_line?: string;
  power: number;
  toughness: number;
  keywords?: string[];
  activated_abilities?: any[];
  triggered_abilities?: any[];
}

/**
 * Creature enters the battlefield.
 */
export const applyEnterBattlefield = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const creatureCard = stackItem.effect.creature as Card;
  const creatureOwner = (stackItem.effect.owner || 'you') as PlayerKey;
  const targetPlayer = newState.players[creatureOwner];
  const enteringCounters = stackItem.effect.enteringCounters || 0;

  const wasDashed = stackItem.wasDashed || false;
  const creatureOnBattlefield = {
    ...creatureCard,
    tapped: false,
    summoning_sick: wasDashed ? false : true, // Dash grants haste
    counters: {} as Record<string, number>,
    cardOwner: (creatureCard as any).cardOwner || creatureOwner,
    ...(wasDashed ? { _dashed: true } : {}),
  };

  if (enteringCounters > 0) {
    creatureOnBattlefield.counters['+1/+1'] = enteringCounters;
    addLog(`${creatureCard.name} enters with ${enteringCounters} +1/+1 counter${enteringCounters > 1 ? 's' : ''}.`);
  }

  // Ravenous: if X ≥ 5, draw a card as it enters (not a trigger)
  const isRavenous = (creatureCard.oracle_text || '').toLowerCase().includes('ravenous');
  const xValue = (creatureCard as any)._xValue as number | undefined;
  if (isRavenous && xValue !== undefined && xValue >= 5) {
    const library = targetPlayer.library || [];
    if (library.length > 0) {
      const drawn = library.shift()!;
      targetPlayer.hand = targetPlayer.hand || [];
      targetPlayer.hand.push(drawn);
      targetPlayer.library_count = library.length;
      addLog(`Ravenous — X is ${xValue} (≥ 5), you draw a card.`);
    } else {
      (targetPlayer as any).deckedOut = true;
      addLog(`Ravenous — X is ${xValue} (≥ 5), but library is empty!`);
    }
  }

  targetPlayer.battlefield = targetPlayer.battlefield || [];
  targetPlayer.battlefield.push(creatureOnBattlefield);
  addLog(`${creatureCard.name} enters the battlefield.`);

  return newState;
};

/**
 * Non-creature permanent (artifact/enchantment) enters the battlefield.
 */
export const applyEnterBattlefieldPermanent = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const permanentCard = stackItem.effect.permanent as Card;
  const permanentOwner = (stackItem.effect.owner || 'you') as PlayerKey;
  const targetPlayer = newState.players[permanentOwner];

  targetPlayer.battlefield = targetPlayer.battlefield || [];
  const impendingCounters = (permanentCard as any)._impendingCounters || 0;
  const isPW = (permanentCard.type_line || '').toLowerCase().includes('planeswalker');
  const startingLoyalty = isPW ? ((permanentCard as any).loyalty ?? 0) : undefined;
  const perm: any = {
    ...permanentCard,
    tapped: false,
    counters: impendingCounters > 0 ? { time: impendingCounters } : {},
    cardOwner: (permanentCard as any).cardOwner || permanentOwner,
    ...(isPW ? { loyalty: startingLoyalty } : {}),
  };
  targetPlayer.battlefield.push(perm);
  if (impendingCounters > 0) {
    addLog(`${permanentCard.name} enters the battlefield as an enchantment with ${impendingCounters} time counter${impendingCounters > 1 ? 's' : ''}.`);
  } else if (isPW) {
    addLog(`${permanentCard.name} enters the battlefield with ${startingLoyalty} loyalty.`);
  } else {
    addLog(`${permanentCard.name} enters the battlefield.`);
  }

  return newState;
};

/**
 * Create creature tokens.
 */
export const applyCreateToken = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const token = stackItem.effect.token as TokenDef;
  const rawCount = stackItem.effect.count;
  const countFrom = (stackItem.effect as any).count_from;

  let tokenCount: number;
  if (countFrom?.type === 'dying_counter') {
    // Read counter count from triggerContext.dyingCounters captured at death
    const counterType = countFrom.counter_type || '+1/+1';
    const dyingCounters = (stackItem as any).triggerContext?.dyingCounters || {};
    tokenCount = dyingCounters[counterType] || 0;
  } else if (rawCount === 'x' || rawCount === 'X') {
    tokenCount = stackItem.effect.xValue ?? 0;
  } else {
    tokenCount = rawCount || 1;
  }
  const tokenOwner = (stackItem.effect.owner || 'you') as PlayerKey;
  const targetPlayer = newState.players[tokenOwner];

  targetPlayer.battlefield = targetPlayer.battlefield || [];
  for (let i = 0; i < tokenCount; i++) {
    const uniqueId = `token-${token.name}-${Date.now()}-${i}-${Math.random()}`;
    // Derive colors from token type_line or explicit colors field
    const tokenColors: string[] = (token as any).colors || [];
    const tokenCard: Record<string, any> = {
      card_id: uniqueId,
      instance_id: uniqueId,
      name: token.name,
      type_line: token.type_line || 'Creature Token',
      power: String(token.power),
      toughness: String(token.toughness),
      keywords: token.keywords || [],
      colors: tokenColors,
      isToken: true,
      tapped: false,
      summoning_sick: true,
      counters: {},
      cardOwner: tokenOwner,
    };
    if (token.activated_abilities && token.activated_abilities.length > 0) {
      tokenCard.activated_abilities = token.activated_abilities;
    }
    if (token.triggered_abilities && token.triggered_abilities.length > 0) {
      tokenCard.triggered_abilities = token.triggered_abilities;
    }
    targetPlayer.battlefield.push(tokenCard as any);
    const isCreatureToken = (token.type_line || '').toLowerCase().includes('creature');
    if (isCreatureToken) {
      addLog(`Created a ${token.power}/${token.toughness} ${token.name} token.`);
    } else {
      addLog(`Created a ${token.name} token.`);
    }
  }

  return newState;
};

/**
 * Reanimate a creature from a player's graveyard — moves it to the battlefield.
 * Supports: cross-graveyard targeting (target_graveyard: 'any'),
 *           life loss equal to CMC (life_loss_equal_cmc),
 *           attach self as aura (attach_self_as_aura for Animate Dead).
 * ETB triggers are fired by resolveStack after this effect runs.
 */
export const applyReanimateCreature = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const creature = (stackItem.targeting_data?.targetData || stackItem.effect.creature) as Card & { owner?: PlayerKey };

  if (!creature) {
    addLog('Reanimate: no target creature found');
    return newState;
  }

  // Which graveyard the creature is in (from targeting data)
  const graveyardOwner = (creature.owner || (stackItem.effect as any).owner || 'you') as PlayerKey;
  // Creature always goes to the caster's battlefield
  const casterOwner = ((stackItem.source as any)?.owner || 'you') as PlayerKey;

  // Remove from source graveyard
  const matchId = (creature as any).instance_id || creature.card_id;
  const sourcePlayer = newState.players[graveyardOwner];
  sourcePlayer.graveyard = (sourcePlayer.graveyard || []).filter(
    c => ((c as any).instance_id || c.card_id) !== matchId
  );

  // Put onto caster's battlefield — fresh state, with summoning sickness.
  // cardOwner tracks the TRUE owner (whose graveyard it came from) and never
  // changes, even though `owner` (controller/side-of-board) switches to caster.
  // Strip transient flags (_dashed, etc.) — this is a new permanent instance.
  const { _dashed, ...cleanCreature } = creature as any;
  const permanent = {
    ...cleanCreature,
    owner: casterOwner,
    cardOwner: (creature as any).cardOwner || graveyardOwner,
    tapped: false,
    summoning_sick: true,
    attacking: false,
    counters: {},
  };
  const casterPlayer = newState.players[casterOwner];
  casterPlayer.battlefield = casterPlayer.battlefield || [];
  casterPlayer.battlefield.push(permanent as any);

  addLog(`${creature.name} returns from the graveyard to the battlefield.`);

  // Life loss equal to CMC (Reanimate)
  if (stackItem.effect.life_loss_equal_cmc) {
    const cmc = calculateCMC((creature as any).mana_cost);
    if (cmc > 0) {
      casterPlayer.life -= cmc;
      addLog(`You lose ${cmc} life (${creature.name}'s mana value). Life: ${casterPlayer.life}`);
    }
  }

  // Attach self as aura (Animate Dead)
  if (stackItem.effect.attach_self_as_aura && stackItem.source) {
    const auraCard = stackItem.source as any;
    const auraInstanceId = auraCard.instance_id;
    const attachmentData = { instance_id: (permanent as any).instance_id || matchId, owner: casterOwner };

    // Check if the aura is already on the battlefield (entered as a permanent before trigger)
    const existingIdx = casterPlayer.battlefield.findIndex(
      (c: any) => c.instance_id === auraInstanceId
    );

    if (existingIdx !== -1) {
      // Update existing permanent to be an aura
      const existing = casterPlayer.battlefield[existingIdx] as any;
      existing.isAura = true;
      existing.attachedTo = attachmentData;
    } else {
      // Place new aura (fallback for direct reanimate path)
      const auraOnBattlefield = {
        ...auraCard,
        tapped: false,
        isAura: true,
        attachedTo: attachmentData,
        counters: {},
      };
      casterPlayer.battlefield.push(auraOnBattlefield as any);
    }
    addLog(`${auraCard.name} enchants ${creature.name}.`);
  }

  return newState;
};

/**
 * Sacrifice the creature attached to an aura that left the battlefield (Animate Dead).
 */
export const applySacrificeAttached = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const auraSource = stackItem.source as any;
  const attachedTo = auraSource?.attachedTo;

  if (!attachedTo) {
    addLog('Sacrifice attached: no attached creature found.');
    return newState;
  }

  const creatureOwner = (attachedTo.owner || 'you') as PlayerKey;
  const targetPlayer = newState.players[creatureOwner];
  const creature = targetPlayer.battlefield?.find(
    (c: any) => c.instance_id === attachedTo.instance_id
  );

  if (!creature) {
    addLog('Sacrifice attached: enchanted creature already left the battlefield.');
    return newState;
  }

  // Remove creature from battlefield
  targetPlayer.battlefield = targetPlayer.battlefield.filter(
    (c: any) => c.instance_id !== attachedTo.instance_id
  );

  // Remove any other auras attached to the creature
  removeAttachedAuras(newState, attachedTo.instance_id);

  // Put creature into graveyard
  pushToGraveyardOrExile(newState, targetPlayer, creature);
  addLog(`${creature.name} is sacrificed (${auraSource.name} left the battlefield).`);

  // Track dying creature for death triggers
  newState._dyingCreatures = newState._dyingCreatures || [];
  newState._dyingCreatures.push({ creature, owner: creatureOwner });
  newState._leavingPermanents = newState._leavingPermanents || [];
  newState._leavingPermanents.push({ permanent: creature, owner: creatureOwner });

  return newState;
};

/**
 * Attach an Aura to a target permanent already on the battlefield.
 * Fizzle handling (target gone) is done in resolveStack before this is called.
 */
export const applyAttachAura = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const auraCard = stackItem.source;
  const targetData = stackItem.targeting_data?.targetData;
  const targetOwner = ((targetData as any)?.owner || 'you') as PlayerKey;
  const targetPermanent = newState.players[targetOwner]?.battlefield?.find(
    (c: any) => c.instance_id === (targetData as any)?.instance_id
  );

  if (!targetPermanent) {
    addLog(`${(auraCard as any).name} has no valid target — fizzled.`);
    return newState;
  }

  const auraOwner = ((auraCard as any).owner || 'you') as PlayerKey;
  const auraOnBattlefield = {
    ...(auraCard as any),
    tapped: false,
    isAura: true,
    attachedTo: { instance_id: targetPermanent.instance_id, owner: targetOwner },
    counters: {}
  };

  newState.players[auraOwner].battlefield = newState.players[auraOwner].battlefield || [];
  newState.players[auraOwner].battlefield.push(auraOnBattlefield as any);
  addLog(`${(auraCard as any).name} enchants ${targetPermanent.name}.`);

  return newState;
};

/**
 * Yawgmoth's Will — until end of turn, the caster may play cards from their graveyard.
 * The exile replacement (cards that would go to graveyard go to exile instead) is set
 * AFTER this spell card itself lands in the graveyard — handled in resolveStack.
 */
export const applyYawgmothsWill = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const owner = ((stackItem.source as any).owner || 'you') as PlayerKey;
  (newState.players[owner] as any).canPlayFromGraveyard = true;
  addLog(`${(stackItem.source as any).name}: Until end of turn, you may play cards from your graveyard.`);
  return newState;
};

/**
 * Sacrifice self (evoke sacrifice trigger).
 */
export const applySacrificeSelf = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  // The source of the trigger IS the creature being sacrificed.
  // Use instance_id (unique per permanent) rather than card_id (shared by copies).
  const instanceId = stackItem.source?.instance_id;
  const creatureOwner = ((stackItem.source as any)?.owner || stackItem.effect.owner || 'you') as PlayerKey;
  const targetPlayer = newState.players[creatureOwner];

  const creature = instanceId
    ? targetPlayer.battlefield?.find((c: Permanent) => c.instance_id === instanceId)
    : undefined;

  if (creature) {
    targetPlayer.battlefield = targetPlayer.battlefield.filter((c: Permanent) => c.instance_id !== instanceId);
    removeAttachedAuras(newState, instanceId!);
    pushToGraveyardOrExile(newState, targetPlayer, creature);
    addLog(`${creature.name} is sacrificed due to evoke.`);
    // Track for death trigger dispatch in resolveStack
    newState._dyingCreatures = newState._dyingCreatures || [];
    newState._dyingCreatures.push({ creature, owner: creatureOwner });
    newState._leavingPermanents = newState._leavingPermanents || [];
    newState._leavingPermanents.push({ permanent: creature, owner: creatureOwner });
  } else {
    addLog(`Evoke sacrifice: could not find creature with instance_id ${instanceId} on battlefield.`);
  }

  return newState;
};

/**
 * Equip — attach an equipment artifact to a target creature you control.
 * If the equipment was already attached to another creature, it moves.
 */
export const applyEquip = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const equipmentSource = stackItem.source as any;
  const targetData = stackItem.targeting_data?.targetData;
  const targetInstanceId = (targetData as any)?.instance_id;

  // Find the equipment on the battlefield
  const equipment = newState.players.you.battlefield.find(
    (c: any) => c.instance_id === equipmentSource.instance_id
  );
  if (!equipment) {
    addLog(`${equipmentSource.name} is no longer on the battlefield.`);
    return newState;
  }

  // Find the target creature
  const targetCreature = newState.players.you.battlefield.find(
    (c: any) => c.instance_id === targetInstanceId
  );
  if (!targetCreature) {
    addLog(`Target creature is no longer on the battlefield — equip fizzles.`);
    return newState;
  }

  // Attach equipment
  (equipment as any).equippedTo = {
    instance_id: targetInstanceId,
    owner: 'you'
  };
  addLog(`${equipmentSource.name} is now equipped to ${targetCreature.name}.`);

  return newState;
};

/**
 * Attach the source equipment to the creature that triggered this ability
 * (e.g. Thornbite Staff: "Whenever a Shaman creature enters, you may attach
 * this Equipment to it"). Reads the triggering creature from triggerContext.
 */
export const applyAttachSelfToTriggeringCreature = (
  stackItem: StackItem,
  gameState: GameState,
  { addLog }: EffectHelpers
): GameState => {
  const newState = JSON.parse(JSON.stringify(gameState)) as GameState;
  const equipmentSource = stackItem.source as any;
  const triggering = (stackItem as any).triggerContext?.triggeringCreature;
  const triggeringOwner = ((stackItem as any).triggerContext?.triggeringCreatureOwner || 'you') as PlayerKey;

  if (!triggering?.instance_id) {
    addLog(`${equipmentSource.name}: no triggering creature to attach to.`);
    return newState;
  }

  // Equipment lives on its controller's battlefield (could be either side)
  const equipOwner = (equipmentSource.owner || 'you') as PlayerKey;
  const equipment = newState.players[equipOwner].battlefield.find(
    (c: any) => c.instance_id === equipmentSource.instance_id
  );
  if (!equipment) {
    addLog(`${equipmentSource.name} is no longer on the battlefield.`);
    return newState;
  }

  // Confirm the triggering creature is still on the battlefield
  const targetCreature = newState.players[triggeringOwner].battlefield.find(
    (c: any) => c.instance_id === triggering.instance_id
  );
  if (!targetCreature) {
    addLog(`${triggering.name} is no longer on the battlefield — auto-attach fizzles.`);
    return newState;
  }

  (equipment as any).equippedTo = {
    instance_id: triggering.instance_id,
    owner: triggeringOwner,
  };
  addLog(`${equipmentSource.name} attaches itself to ${targetCreature.name}.`);

  return newState;
};
